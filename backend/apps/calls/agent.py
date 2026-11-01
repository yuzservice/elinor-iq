"""Agent work list: server-side tabs, filters and pagination on the partial indexes."""

from datetime import datetime, time, timedelta

from django.core.cache import cache
from django.db.models import Count, Q, Sum
from django.utils import timezone

from apps.customers.presentation import display_name
from apps.customers.tiers import tier_label, tier_title_map

from .forms import published_form
from .logs import EDIT_WINDOW, counts_cache_key
from .models import CallLog, CallLogPurchase, CallProgram, CallSettings, CallTask

TABS = ("open", "overdue", "today", "future", "done")
COUNTS_TTL = 60
HISTORY_LIMIT = 20


def _day_bounds(now=None):
    local = timezone.localtime(now or timezone.now())
    start = timezone.make_aware(datetime.combine(local.date(), time.min), timezone.get_current_timezone())
    return start, start + timedelta(days=1)


def _open_tasks(user):
    return CallTask.objects.filter(assignee=user, status=CallTask.STATUS_OPEN, program__status=CallProgram.STATUS_ACTIVE)


def tab_counts(user):
    key = counts_cache_key(user.pk)
    cached = cache.get(key)
    if cached is not None:
        return cached
    start, end = _day_bounds()
    counts = _open_tasks(user).aggregate(
        open=Count("pk"),
        overdue=Count("pk", filter=Q(due_at__lt=start)),
        today=Count("pk", filter=Q(due_at__gte=start, due_at__lt=end)),
        future=Count("pk", filter=Q(due_at__gte=end)),
    )
    counts["done"] = CallTask.objects.filter(assignee=user).exclude(status=CallTask.STATUS_OPEN).count()
    month_start = start.replace(day=1)
    today_logs = CallLog.objects.filter(agent=user, created_at__gte=start).count()
    month = CallLog.objects.filter(agent=user, created_at__gte=month_start).aggregate(
        total=Count("pk"), connected=Count("pk", filter=Q(connected=True))
    )
    bought = CallLogPurchase.objects.filter(log__agent=user, purchased_at__gte=month_start).aggregate(total=Sum("amount"))["total"]
    counts["stats"] = {
        "today_calls": today_logs,
        "today_target": today_logs + counts["overdue"] + counts["today"],
        "month_calls": month["total"],
        "month_connected": month["connected"],
        "month_sales": int(bought or 0),
    }
    cache.set(key, counts, COUNTS_TTL)
    return counts


def task_queryset(user, params):
    tab = params.get("tab") or "open"
    if tab == "done":
        qs = CallTask.objects.filter(assignee=user).exclude(status=CallTask.STATUS_OPEN).order_by("-closed_at")
    else:
        qs = _open_tasks(user)
        start, end = _day_bounds()
        if tab == "overdue":
            qs = qs.filter(due_at__lt=start)
        elif tab == "today":
            qs = qs.filter(due_at__gte=start, due_at__lt=end)
        elif tab == "future":
            qs = qs.filter(due_at__gte=end)
        sort = params.get("sort") or "due"
        qs = qs.order_by(*{"value": ("-customer_value", "due_at"), "priority": ("-is_priority", "due_at")}.get(sort, ("due_at", "id")))
    if params.get("program"):
        qs = qs.filter(program_id=params["program"])
    if params.get("last"):
        qs = qs.filter(last_outcome_title=params["last"])
    if params.get("tag"):
        qs = qs.filter(last_tag_ids__contains=[int(params["tag"])])
    query = (params.get("q") or "").strip()
    if query:
        qs = qs.filter(
            Q(customer__mobile__contains=query) | Q(customer__first_name__icontains=query) | Q(customer__last_name__icontains=query)
        )
    return qs


def task_filters(user):
    """Program and last-result chips, from this agent's open tasks only."""
    tasks = _open_tasks(user)
    programs = tasks.order_by().values("program_id", "program__name").distinct()
    results = tasks.exclude(last_outcome_title="").order_by().values_list("last_outcome_title", flat=True).distinct()
    return {
        "programs": [{"id": row["program_id"], "name": row["program__name"]} for row in programs],
        "results": list(results),
    }


def task_rows(tasks):
    titles = tier_title_map()
    rows = []
    for task in tasks:
        customer = task.customer
        rows.append(
            {
                "id": task.id,
                "customer": {"source_id": customer.source_id, "name": display_name(customer), "tier": tier_label(customer.tier_code, titles) if customer.tier_code else None},
                "program": task.program.name,
                "due_at": task.due_at,
                "attempt": task.attempt,
                "last_outcome_title": task.last_outcome_title,
                "customer_value": task.customer_value,
                "is_priority": task.is_priority,
                "status": task.status,
                "source": task.source,
            }
        )
    return rows


def log_payload(log, user=None):
    return {
        "id": log.id,
        "created_at": log.created_at,
        "agent": log.agent.username,
        "program": log.program.name,
        "outcome_title": log.outcome_title,
        "connected": log.connected,
        "answers": log.answers,
        "note": log.note,
        "form_version": log.form_version.version,
        "editable": user is not None and log.agent_id == user.pk and timezone.now() - log.created_at <= EDIT_WINDOW,
    }


def customer_logs(customer_id):
    return (
        CallLog.objects.filter(customer_id=customer_id)
        .select_related("agent", "program", "form_version")
        .only(
            "created_at", "outcome_title", "connected", "answers", "note", "agent_id",
            "agent__username", "program__name", "form_version__version",
        )
        .order_by("-created_at")
    )


def task_detail_payload(task, user=None):
    customer = task.customer
    form = published_form(task.program)
    return {
        "id": task.id,
        "status": task.status,
        "attempt": task.attempt,
        "due_at": task.due_at,
        "is_priority": task.is_priority,
        "note_min_chars": CallSettings.load().note_min_chars,
        "program": {"id": task.program_id, "name": task.program.name},
        "customer": {
            "source_id": customer.source_id,
            "name": display_name(customer),
            "mobile": customer.mobile,
            "tier": tier_label(customer.tier_code) if customer.tier_code else None,
            "last_order_at": customer.last_order_at,
            "order_count": customer.order_count,
            "value": task.customer_value,
        },
        "form": {"version": form.version, "schema": form.schema} if form else None,
        "history": [log_payload(log, user) for log in customer_logs(task.customer_id)[:HISTORY_LIMIT]],
    }
