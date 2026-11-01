from django.contrib.auth import get_user_model
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response

from apps.accounts.models import User

from . import forms, lists, tasks
from .models import (
    JOB_RUNNING,
    CallList,
    CallProgram,
    CallProgramAgent,
    CallSettings,
    CallTag,
)
from .permissions import IsCallManager

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
@permission_classes([IsCallManager])
def tags_view(request):
    if request.method == "GET":
        return Response({"results": [_tag_payload(tag) for tag in CallTag.objects.all()]})
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
        from apps.customers.models import Customer

        ids = list(Customer.objects.filter(source_id__in=source_ids[:5000]).values_list("pk", flat=True))
        row = lists.create_list(request.user, name, CallList.KIND_FIXED, CallList.SOURCE_MANUAL, customer_ids=ids)
        return Response(_list_payload(row), status=status.HTTP_201_CREATED)
    kind = request.data.get("kind")
    if kind not in (CallList.KIND_FIXED, CallList.KIND_DYNAMIC):
        return _bad("نوع لیست نامعتبر است.")
    filter_params = request.data.get("filter_params")
    if not isinstance(filter_params, dict):
        return _bad("فیلترها نامعتبر است.")
    row = lists.create_list(request.user, name, kind, CallList.SOURCE_FILTERS, filter_params=filter_params)
    return Response(_list_payload(row), status=status.HTTP_201_CREATED)


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
