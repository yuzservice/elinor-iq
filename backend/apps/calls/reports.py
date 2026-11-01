"""Manager reports. Aggregates only, on Call Center tables (no request-time joins to sales). Cached 15 min per (filters, day)."""

from django.core.cache import cache
from django.db.models import Avg, Count, Exists, OuterRef, Q, Sum
from django.utils import timezone

from apps.customers.presentation import display_name
from apps.customers.tiers import tier_label, tier_title_map

from .models import (
    CallAnswerFact,
    CallEscalation,
    CallFormVersion,
    CallLog,
    CallLogPurchase,
    CallProgram,
    CallSettings,
    CallTag,
    CallTask,
    CustomerCallStatus,
    CustomerCallTag,
)

CACHE_SECONDS = 15 * 60
CARD_ROWS = 5
RECENT_TEXT_LOGS = 100
RECENT_TEXTS = 5


def _cached(name, program_id, build):
    key = f"calls-report:{name}:{program_id or 'all'}:{timezone.localdate().isoformat()}"
    data = cache.get(key)
    if data is None:
        data = build(program_id)
        cache.set(key, data, CACHE_SECONDS)
    return data


def _scope(qs, program_id, field="program_id"):
    return qs.filter(**{field: program_id}) if program_id else qs


def _days_ago(moment, now):
    return max(0, (now - moment).days)


def _sales(program_id):
    now = timezone.now()
    calls = _scope(CallLog.objects.filter(connected=True), program_id).count()
    bought = _scope(CallLogPurchase.objects.all(), program_id, "log__program_id").aggregate(
        amount=Sum("amount"), buyers=Count("log__customer_id", distinct=True)
    )
    tasks = _scope(CallTask.objects.all(), program_id).aggregate(total=Count("pk"), open=Count("pk", filter=Q(status=CallTask.STATUS_OPEN)))
    cards = []
    for tag in CallTag.objects.filter(is_active=True, needs_action=True):
        rows = _scope(CustomerCallTag.objects.filter(tag=tag, resolved_at__isnull=True), program_id)
        cards.append(
            {
                "key": f"tag-{tag.pk}",
                "title": tag.title,
                "color": tag.color,
                "count": rows.count(),
                "rows": [
                    {"name": display_name(row.customer), "source_id": row.customer.source_id, "days": _days_ago(row.tagged_at, now)}
                    for row in rows.select_related("customer").order_by("-tagged_at")[:CARD_ROWS]
                ],
            }
        )
    overdue = _scope(CallTask.objects.filter(status=CallTask.STATUS_OPEN, source=CallTask.SOURCE_FOLLOWUP, due_at__lt=now), program_id)
    cards.append(
        {
            "key": "overdue-followups",
            "title": "پیگیری عقب‌افتاده",
            "color": None,
            "count": overdue.count(),
            "rows": [
                {"name": display_name(row.customer), "source_id": row.customer.source_id, "days": _days_ago(row.due_at, now), "agent": row.assignee.username}
                for row in overdue.select_related("customer", "assignee").order_by("due_at")[:CARD_ROWS]
            ],
        }
    )
    outcomes = (
        _scope(CallLog.objects.all(), program_id)
        .order_by()
        .values("program__name", "outcome_id", "outcome_title")
        .annotate(calls=Count("pk"), buyers=Count("customer_id", distinct=True, filter=Q(purchase__isnull=False)))
        .order_by("-calls")[:50]
    )
    return {
        "buy_window_days": CallSettings.load().buy_window_days,
        "kpis": {
            "sales": int(bought["amount"] or 0),
            "buyers": bought["buyers"],
            "connected_calls": calls,
            "tasks_total": tasks["total"],
            "tasks_open": tasks["open"],
        },
        "cards": cards,
        "outcomes": [
            {"program": row["program__name"], "title": row["outcome_title"], "calls": row["calls"], "buyers": row["buyers"]}
            for row in outcomes
        ],
    }


def sales_report(program_id=None):
    return _cached("sales", program_id, _sales)


def escalations(program_id=None, limit=50):
    """Live: the close action must show immediately."""
    rows = _scope(CallEscalation.objects.filter(status=CallEscalation.STATUS_OPEN), program_id, "log__program_id")
    return [
        {
            "id": row.id,
            "customer": display_name(row.customer),
            "source_id": row.customer.source_id,
            "outcome": row.log.outcome_title,
            "note": row.log.note[:200],
            "agent": row.log.agent.username,
            "created_at": row.log.created_at,
        }
        for row in rows.select_related("customer", "log__agent").order_by("-id")[:limit]
    ]


def customer_results(program_id, page, per_page):
    """Latest result per customer; history is fetched per customer when a row opens."""
    qs = CustomerCallStatus.objects.filter(last_call_at__isnull=False)
    if program_id:
        qs = qs.filter(Exists(CallLog.objects.filter(customer_id=OuterRef("customer_id"), program_id=program_id)))
    total = qs.count()
    rows = list(qs.select_related("customer").order_by("-last_call_at")[(page - 1) * per_page : page * per_page])
    agents = dict(
        CallLog.objects.filter(customer_id__in=[row.customer_id for row in rows])
        .order_by("customer_id", "-created_at")
        .distinct("customer_id")
        .values_list("customer_id", "agent__username")
    )
    titles = tier_title_map()
    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "results": [
            {
                "source_id": row.customer.source_id,
                "name": display_name(row.customer),
                "tier": tier_label(row.customer.tier_code, titles) if row.customer.tier_code else None,
                "result": row.last_outcome_title,
                "do_not_call": row.do_not_call,
                "agent": agents.get(row.customer_id),
                "last_call_at": row.last_call_at,
            }
            for row in rows
        ],
    }


def _field_map(program_id):
    """Field definitions across versions, newest first, so archived options keep their titles."""
    fields = {}
    versions = CallFormVersion.objects.filter(program_id=program_id).exclude(status=CallFormVersion.STATUS_DRAFT).order_by("-version")
    for version in versions.values_list("schema", flat=True):
        for outcome in version.get("outcomes") or []:
            for field in outcome.get("fields") or []:
                row = fields.setdefault(field["id"], {"id": field["id"], "type": field["type"], "title": field["title"], "outcome": outcome["title"], "options": {}})
                for option in field.get("options") or []:
                    row["options"].setdefault(option["id"], option["title"])
    return fields


def _answers(program_id):
    fields = _field_map(program_id)
    facts = CallAnswerFact.objects.filter(program_id=program_id).order_by()
    option_counts = {}
    for row in facts.filter(option_id__isnull=False).values("field_id", "option_id").annotate(n=Count("pk")):
        option_counts.setdefault(row["field_id"], {})[row["option_id"]] = row["n"]
    numeric = {
        row["field_id"]: row
        for row in facts.filter(number_value__isnull=False).values("field_id").annotate(n=Count("pk"), avg=Avg("number_value"), yes=Count("pk", filter=Q(number_value=1)))
    }
    ratings = {}
    rating_ids = [key for key, field in fields.items() if field["type"] == "rating"]
    for row in facts.filter(field_id__in=rating_ids, number_value__isnull=False).values("field_id", "number_value").annotate(n=Count("pk")):
        ratings.setdefault(row["field_id"], {})[int(row["number_value"])] = row["n"]
    text_ids = [key for key, field in fields.items() if field["type"] in ("text", "long_text")]
    texts = {}
    if text_ids:
        # Display only, bounded: the newest logs of this program via its index.
        for answers in CallLog.objects.filter(program_id=program_id).order_by("-created_at").values_list("answers", flat=True)[:RECENT_TEXT_LOGS]:
            for field_id in text_ids:
                entry = (answers or {}).get(field_id)
                if entry and len(texts.setdefault(field_id, [])) < RECENT_TEXTS:
                    texts[field_id].append(str(entry.get("value")))
    widgets = []
    for field_id, field in fields.items():
        kind = field["type"]
        widget = {"id": field_id, "type": kind, "title": field["title"], "outcome": field["outcome"], "count": 0, "avg": None, "bars": [], "texts": []}
        if kind in ("single", "multi"):
            counts = option_counts.get(field_id, {})
            widget["bars"] = [{"label": title, "value": counts.get(option_id, 0)} for option_id, title in field["options"].items()]
            widget["count"] = sum(counts.values())
        elif kind == "toggle":
            row = numeric.get(field_id)
            widget["count"] = row["n"] if row else 0
            widget["yes"] = row["yes"] if row else 0
        elif kind == "rating":
            counts = ratings.get(field_id, {})
            widget["bars"] = [{"label": str(rate), "value": counts.get(rate, 0)} for rate in range(1, 6)]
            row = numeric.get(field_id)
            widget["count"], widget["avg"] = (row["n"], round(float(row["avg"]), 1)) if row else (0, None)
        elif kind == "number":
            row = numeric.get(field_id)
            widget["count"], widget["avg"] = (row["n"], round(float(row["avg"]), 1)) if row else (0, None)
        elif kind in ("text", "long_text"):
            widget["texts"] = texts.get(field_id, [])
            widget["count"] = len(widget["texts"])
        else:
            continue
        widgets.append(widget)
    return {"widgets": widgets}


def answers_report(program_id):
    return _cached("answers", program_id, _answers)


def _team(program_id):
    now = timezone.now()
    logs = (
        _scope(CallLog.objects.all(), program_id)
        .order_by()
        .values("agent_id", "agent__username")
        .annotate(
            calls=Count("pk"),
            reached=Count("pk", filter=Q(connected=True)),
            buyers=Count("customer_id", distinct=True, filter=Q(purchase__isnull=False)),
            sales=Sum("purchase__amount"),
        )
    )
    overdue = dict(
        _scope(CallTask.objects.filter(status=CallTask.STATUS_OPEN, due_at__lt=now, program__status=CallProgram.STATUS_ACTIVE), program_id)
        .order_by()
        .values_list("assignee_id")
        .annotate(n=Count("pk"))
    )
    rows = [
        {
            "agent": row["agent__username"],
            "calls": row["calls"],
            "reached": row["reached"],
            "buyers": row["buyers"],
            "sales": int(row["sales"] or 0),
            "overdue": overdue.get(row["agent_id"], 0),
        }
        for row in logs
    ]
    return {"results": sorted(rows, key=lambda row: -row["calls"])}


def team_report(program_id=None):
    return _cached("team", program_id, _team)
