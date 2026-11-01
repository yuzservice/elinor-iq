from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response

from apps.accounts.models import User
from apps.customers.models import Customer

from . import agent, forms, lists, logs, reports, tasks
from .models import (
    JOB_RUNNING,
    CallEscalation,
    CallList,
    CallProgram,
    CallProgramAgent,
    CallSettings,
    CallTag,
    CallTask,
    CustomerCallStatus,
)
from .permissions import IsCallManager, IsCallUser, is_call_manager

COLOR_FALLBACK = "#34d399"


def _bad(message, code=status.HTTP_400_BAD_REQUEST):
    return Response({"detail": message}, status=code)


# --- Settings and tags -------------------------------------------------------------------------


def _settings_payload(row):
    return {"buy_window_days": row.buy_window_days, "default_gap_days": row.default_gap_days, "note_min_chars": row.note_min_chars}


@api_view(["GET", "PUT"])
@permission_classes([IsCallManager])
def settings_view(request):
    row = CallSettings.load()
    if request.method == "PUT":
        for key in ("buy_window_days", "default_gap_days", "note_min_chars"):
            if key in request.data:
                try:
                    value = int(request.data[key])
                except (TypeError, ValueError):
                    return _bad("مقدار باید عدد باشد.")
                if value < 0:
                    return _bad("مقدار نمی‌تواند منفی باشد.")
                setattr(row, key, value)
        row.save()
    return Response(_settings_payload(row))


def _tag_payload(tag):
    return {
        "id": tag.id,
        "title": tag.title,
        "color": tag.color,
        "needs_action": tag.needs_action,
        "open_until_purchase": tag.open_until_purchase,
        "is_active": tag.is_active,
    }


def _apply_tag(tag, data):
    for key in ("title", "color"):
        if key in data:
            setattr(tag, key, str(data[key]).strip())
    for key in ("needs_action", "open_until_purchase", "is_active"):
        if key in data:
            setattr(tag, key, bool(data[key]))


@api_view(["GET", "POST"])
@permission_classes([IsCallUser])
def tags_view(request):
    if request.method == "GET":
        return Response({"results": [_tag_payload(tag) for tag in CallTag.objects.all()]})
    if not is_call_manager(request.user):
        return _bad("این بخش فقط برای مدیران است.", status.HTTP_403_FORBIDDEN)
    tag = CallTag(color=COLOR_FALLBACK)
    _apply_tag(tag, request.data)
    if not tag.title:
        return _bad("عنوان برچسب لازم است.")
    tag.save()
    return Response(_tag_payload(tag), status=status.HTTP_201_CREATED)


@api_view(["PATCH"])
@permission_classes([IsCallManager])
def tag_detail(request, tag_id):
    tag = get_object_or_404(CallTag, pk=tag_id)
    _apply_tag(tag, request.data)
    if not tag.title:
        return _bad("عنوان برچسب لازم است.")
    tag.save()
    return Response(_tag_payload(tag))


@api_view(["GET"])
@permission_classes([IsCallManager])
def agents_view(request):
    rows = get_user_model().objects.filter(role=User.ROLE_SALES_AGENT, is_active=True).order_by("username")
    return Response({"results": [{"id": user.id, "username": user.username} for user in rows.only("id", "username")]})


# --- Lists -------------------------------------------------------------------------------------


def _list_payload(row):
    return {
        "id": row.id,
        "name": row.name,
        "kind": row.kind,
        "source": row.source,
        "filter_params": row.filter_params,
        "customer_count": row.customer_count,
        "job_status": row.job_status,
        "created_at": row.created_at,
    }


@api_view(["GET", "POST"])
@permission_classes([IsCallManager])
def lists_view(request):
    if request.method == "GET":
        rows = CallList.objects.all()[:50]
        return Response({"results": [_list_payload(row) for row in rows]})
    name = (request.data.get("name") or "").strip()
    if not name:
        return _bad("نام لیست لازم است.")
    source_ids = request.data.get("customer_ids")
    if source_ids is not None:
        if not isinstance(source_ids, list) or not source_ids:
            return _bad("مشتری‌ای انتخاب نشده است.")
        ids = list(Customer.objects.filter(source_id__in=source_ids[:5000]).values_list("pk", flat=True))
        kind, source, filter_params = CallList.KIND_FIXED, CallList.SOURCE_MANUAL, None
    else:
        ids = None
        kind = request.data.get("kind")
        if kind not in (CallList.KIND_FIXED, CallList.KIND_DYNAMIC):
            return _bad("نوع لیست نامعتبر است.")
        filter_params = request.data.get("filter_params")
        if not isinstance(filter_params, dict):
            return _bad("فیلترها نامعتبر است.")
        source = CallList.SOURCE_FILTERS
    # List and draft program are saved together; a draft creates no tasks.
    program = None
    with transaction.atomic():
        row = lists.new_list(request.user, name, kind, source, filter_params)
        if request.data.get("create_program"):
            program = CallProgram.objects.create(name=name, list=row, created_by=request.user)
    lists.start_fill(row, ids)
    return Response({**_list_payload(row), "program_id": program.pk if program else None}, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsCallManager])
def list_detail(request, list_id):
    return Response(_list_payload(get_object_or_404(CallList, pk=list_id)))


@api_view(["POST"])
@permission_classes([IsCallManager])
@parser_classes([MultiPartParser])
def list_excel(request):
    """dry_run=1 returns the counts shown before saving; without it the list is created."""
    upload = request.FILES.get("file")
    if upload is None:
        return _bad("فایلی انتخاب نشده است.")
    if upload.size > lists.MAX_UPLOAD_BYTES:
        return _bad("حجم فایل زیاد است.")
    try:
        mobiles = lists.parse_mobiles(upload.name, upload.read())
    except ValueError as exc:
        return _bad(str(exc))
    matched, unknown = lists.match_mobiles(mobiles)
    summary = {"total": len(mobiles), "matched": len(matched), "unknown": len(unknown), "unknown_sample": unknown[:20]}
    if request.data.get("dry_run") in ("1", "true"):
        return Response(summary)
    name = (request.data.get("name") or "").strip()
    if not name:
        return _bad("نام لیست لازم است.")
    if not matched:
        return _bad("هیچ شماره‌ای با مشتریان تطبیق نداشت.")
    row = lists.create_list(request.user, name, CallList.KIND_FIXED, CallList.SOURCE_EXCEL, customer_ids=matched)
    return Response({**summary, "list": _list_payload(row)}, status=status.HTTP_201_CREATED)


# --- Programs ----------------------------------------------------------------------------------


def _program_payload(program):
    published = next((form for form in program.forms.all() if form.status == "published"), None)
    return {
        "id": program.id,
        "name": program.name,
        "status": program.status,
        "share_mode": program.share_mode,
        "list": _list_payload(program.list) if program.list_id else None,
        "agents": [
            {"user_id": agent.user_id, "username": agent.user.username, "share_percent": agent.share_percent}
            for agent in program.agents.all()
        ],
        "published_version": published.version if published else None,
        "form_summary": _form_summary(published.schema) if published else None,
        "job": {"status": program.job_status, "done": program.job_done, "total": program.job_total},
    }


def _form_summary(schema):
    outcomes = schema.get("outcomes") or []
    return {"outcomes": len(outcomes), "fields": sum(len(outcome.get("fields") or []) for outcome in outcomes)}


def _programs():
    return CallProgram.objects.select_related("list").prefetch_related("agents__user", "forms")


@api_view(["GET", "POST"])
@permission_classes([IsCallManager])
def programs_view(request):
    if request.method == "GET":
        return Response({"results": [_program_payload(row) for row in _programs()[:50]]})
    name = (request.data.get("name") or "").strip()
    if not name:
        return _bad("نام برنامه لازم است.")
    program = CallProgram.objects.create(name=name, created_by=request.user)
    return Response(_program_payload(_programs().get(pk=program.pk)), status=status.HTTP_201_CREATED)


@api_view(["GET", "PATCH"])
@permission_classes([IsCallManager])
def program_detail(request, program_id):
    program = get_object_or_404(_programs(), pk=program_id)
    if request.method == "GET":
        return Response(_program_payload(program))
    data = request.data
    with transaction.atomic():
        if "name" in data:
            name = (data.get("name") or "").strip()
            if not name:
                return _bad("نام برنامه لازم است.")
            program.name = name
        if "list_id" in data:
            program.list = get_object_or_404(CallList, pk=data["list_id"]) if data["list_id"] else None
        if "share_mode" in data:
            if data["share_mode"] not in (CallProgram.SHARE_EQUAL, CallProgram.SHARE_CUSTOM):
                return _bad("نوع تقسیم نامعتبر است.")
            program.share_mode = data["share_mode"]
        program.save()
        if "agents" in data:
            rows = data["agents"]
            valid = set(
                get_user_model().objects.filter(role=User.ROLE_SALES_AGENT, is_active=True, pk__in=[row.get("user_id") for row in rows]).values_list("pk", flat=True)
            )
            program.agents.all().delete()
            CallProgramAgent.objects.bulk_create(
                [
                    CallProgramAgent(program=program, user_id=row["user_id"], share_percent=max(0, int(row.get("share_percent") or 0)))
                    for row in rows
                    if row.get("user_id") in valid
                ]
            )
    return Response(_program_payload(_programs().get(pk=program.pk)))


@api_view(["GET"])
@permission_classes([IsCallManager])
def program_preview(request, program_id):
    program = get_object_or_404(CallProgram.objects.select_related("list"), pk=program_id)
    if program.list_id is None:
        return _bad("لیستی انتخاب نشده است.")
    return Response(lists.preview_counts(program.list))


@api_view(["POST"])
@permission_classes([IsCallManager])
def program_activate(request, program_id):
    program = get_object_or_404(_programs(), pk=program_id)
    if program.list_id is None:
        return _bad("یک لیست انتخاب کنید.")
    if program.list.job_status == JOB_RUNNING:
        return _bad("لیست هنوز در حال ساخت است.", status.HTTP_409_CONFLICT)
    agents = list(program.agents.all())
    if not agents:
        return _bad("دست‌کم یک کارمند لازم است.")
    if program.share_mode == CallProgram.SHARE_CUSTOM and sum(agent.share_percent for agent in agents) != 100:
        return _bad("جمع سهم کارمندان باید ۱۰۰ درصد باشد.")
    if forms.published_form(program) is None:
        return _bad("فرم این برنامه هنوز منتشر نشده است.")
    if not tasks.start_activation(program):
        return _bad("ساخت کارها در حال انجام است.", status.HTTP_409_CONFLICT)
    return Response(_program_payload(_programs().get(pk=program.pk)), status=status.HTTP_202_ACCEPTED)


@api_view(["POST"])
@permission_classes([IsCallManager])
def program_status(request, program_id):
    """pause / resume / end. Paused tasks stay open but hidden from agents."""
    program = get_object_or_404(CallProgram, pk=program_id)
    action = request.data.get("action")
    if action == "pause" and program.status == CallProgram.STATUS_ACTIVE:
        CallProgram.objects.filter(pk=program.pk).update(status=CallProgram.STATUS_PAUSED)
    elif action == "resume" and program.status == CallProgram.STATUS_PAUSED:
        CallProgram.objects.filter(pk=program.pk).update(status=CallProgram.STATUS_ACTIVE)
    elif action == "end" and program.status != CallProgram.STATUS_ENDED:
        tasks.end_program(program)
    else:
        return _bad("این تغییر وضعیت ممکن نیست.", status.HTTP_409_CONFLICT)
    return Response(_program_payload(_programs().get(pk=program.pk)))


# --- Forms -------------------------------------------------------------------------------------


def _form_payload(row):
    return {"id": row.id, "version": row.version, "status": row.status, "schema": row.schema, "published_at": row.published_at} if row else None


@api_view(["GET", "PUT"])
@permission_classes([IsCallManager])
def program_form(request, program_id):
    program = get_object_or_404(CallProgram, pk=program_id)
    if request.method == "PUT":
        try:
            return Response(_form_payload(forms.save_draft(program, request.data.get("schema"))))
        except forms.FormError as exc:
            return _bad(str(exc))
    used_outcomes, used_options = forms.used_ids(program)
    return Response(
        {
            "draft": _form_payload(forms.draft_form(program)),
            "published": _form_payload(forms.published_form(program)),
            "used_outcome_ids": sorted(used_outcomes),
            "used_option_ids": sorted(used_options),
        }
    )


@api_view(["POST"])
@permission_classes([IsCallManager])
def program_form_publish(request, program_id):
    program = get_object_or_404(CallProgram, pk=program_id)
    try:
        return Response(_form_payload(forms.publish(program)))
    except forms.FormError as exc:
        return _bad(str(exc))


# --- Agent work list and logs -------------------------------------------------------------------


def _positive(value, default, cap=None):
    try:
        number = int(value)
    except (TypeError, ValueError):
        return default
    number = default if number < 1 else number
    return min(number, cap) if cap else number


@api_view(["GET"])
@permission_classes([IsCallUser])
def task_list(request):
    params = request.query_params
    if params.get("tag") and not str(params["tag"]).isdigit():
        return _bad("برچسب نامعتبر است.")
    if params.get("program") and not str(params["program"]).isdigit():
        return _bad("برنامه نامعتبر است.")
    page = _positive(params.get("page"), 1)
    per_page = _positive(params.get("per_page"), 20, cap=50)
    qs = agent.task_queryset(request.user, params)
    total = qs.count()
    rows = (
        qs.select_related("customer", "program")
        .only(
            "due_at", "attempt", "last_outcome_title", "customer_value", "is_priority", "status", "source",
            "customer__source_id", "customer__first_name", "customer__last_name", "customer__mobile", "customer__tier_code",
            "program__name",
        )[(page - 1) * per_page : page * per_page]
    )
    return Response({"results": agent.task_rows(rows), "total": total, "page": page, "per_page": per_page})


@api_view(["GET"])
@permission_classes([IsCallUser])
def task_counts(request):
    return Response({**agent.tab_counts(request.user), **agent.task_filters(request.user)})


@api_view(["GET"])
@permission_classes([IsCallUser])
def task_detail(request, task_id):
    task = get_object_or_404(
        CallTask.objects.select_related("customer", "program"), pk=task_id, assignee=request.user
    )
    return Response(agent.task_detail_payload(task, request.user))


@api_view(["POST"])
@permission_classes([IsCallUser])
def task_save_log(request, task_id):
    data = request.data
    try:
        log, effect = logs.save_log(task_id, request.user, data.get("outcome_id"), data.get("answers"), data.get("note"))
    except logs.LogError as exc:
        return Response({"detail": str(exc), "errors": exc.errors}, status=exc.code)
    return Response({"log_id": log.id, **effect}, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsCallUser])
def task_bulk(request):
    """Postpone or star the agent's own open tasks. One UPDATE; the UI selects at most a page."""
    ids = request.data.get("ids")
    if not isinstance(ids, list) or not ids:
        return _bad("موردی انتخاب نشده است.")
    tasks_qs = CallTask.objects.filter(pk__in=ids[:200], assignee=request.user, status=CallTask.STATUS_OPEN)
    action = request.data.get("action")
    if action == "postpone":
        days = _positive(request.data.get("days"), 1, cap=365)
        updated = tasks_qs.update(due_at=timezone.now() + timedelta(days=days))
    elif action == "priority":
        updated = tasks_qs.update(is_priority=bool(request.data.get("value")))
    else:
        return _bad("عملیات نامعتبر است.")
    cache.delete(logs.counts_cache_key(request.user.pk))
    return Response({"updated": updated})


@api_view(["PATCH"])
@permission_classes([IsCallUser])
def log_detail(request, log_id):
    try:
        log = logs.update_log(log_id, request.user, request.data.get("answers"), request.data.get("note"))
    except logs.LogError as exc:
        return Response({"detail": str(exc), "errors": exc.errors}, status=exc.code)
    return Response({"id": log.id, "answers": log.answers, "note": log.note})


@api_view(["GET"])
def customer_calls(request, source_id):
    """Customer 360 «تماس‌ها» tab and badges. Agents only for customers with a task assigned to them."""
    customer = get_object_or_404(Customer.objects.only("pk"), source_id=source_id)
    if request.user.role == User.ROLE_SALES_AGENT and not CallTask.objects.filter(assignee=request.user, customer=customer).exists():
        return _bad("به این مشتری دسترسی ندارید.", status.HTTP_403_FORBIDDEN)
    page = _positive(request.query_params.get("page"), 1)
    per_page = _positive(request.query_params.get("per_page"), 20, cap=50)
    state = CustomerCallStatus.objects.filter(customer=customer).first()
    qs = agent.customer_logs(customer.pk)
    return Response(
        {
            "status": {
                "do_not_call": state.do_not_call,
                "next_call_allowed_at": state.next_call_allowed_at,
                "last_outcome_title": state.last_outcome_title,
                "last_call_at": state.last_call_at,
            }
            if state
            else None,
            "results": [agent.log_payload(log, request.user) for log in qs[(page - 1) * per_page : page * per_page]],
            "total": qs.count(),
            "page": page,
            "per_page": per_page,
        }
    )


# --- Reports -----------------------------------------------------------------------------------


def _program_param(request):
    raw = request.query_params.get("program")
    if not raw:
        return None
    return int(raw) if str(raw).isdigit() else -1


@api_view(["GET"])
@permission_classes([IsCallManager])
def report_sales(request):
    return Response(reports.sales_report(_program_param(request)))


@api_view(["GET"])
@permission_classes([IsCallManager])
def report_escalations(request):
    return Response({"results": reports.escalations(_program_param(request))})


@api_view(["GET"])
@permission_classes([IsCallManager])
def report_customers(request):
    page = _positive(request.query_params.get("page"), 1)
    per_page = _positive(request.query_params.get("per_page"), 20, cap=50)
    return Response(reports.customer_results(_program_param(request), page, per_page))


@api_view(["GET"])
@permission_classes([IsCallManager])
def report_answers(request):
    program_id = _program_param(request)
    if not program_id:
        return _bad("یک برنامه انتخاب کنید.")
    return Response(reports.answers_report(program_id))


@api_view(["GET"])
@permission_classes([IsCallManager])
def report_team(request):
    return Response(reports.team_report(_program_param(request)))


@api_view(["POST"])
@permission_classes([IsCallManager])
def escalation_close(request, escalation_id):
    updated = CallEscalation.objects.filter(pk=escalation_id, status=CallEscalation.STATUS_OPEN).update(
        status=CallEscalation.STATUS_CLOSED, closed_by=request.user, closed_at=timezone.now()
    )
    if not updated:
        return _bad("این مورد باز نیست.", status.HTTP_409_CONFLICT)
    return Response({"ok": True})
