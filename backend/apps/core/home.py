"""Home page summary for one range, comparison and branch filter: four cards, a branch table, the sales trend, and
rule-based «نیاز به توجه» items. Every figure comes from apps.sales.semantics:

- sales = online order value (`online_order_value_orders`, `Order.total_amount`) + in-store sold lines
  (`qualifying_pos_items`, amount × quantity); the two channels are only added up, never mixed.
- invoices = qualifying online orders + qualifying POS sales; items = sold units of their qualifying lines.
- buyers = distinct customers of those invoices, internal accounts excluded.

Comparison: «امروز» against the same weekday last week or the same Jalali day last year, each up to the same time of day;
other ranges against the previous equal range or the same Jalali range a year earlier. A change exists only when every
selected line has history for the whole comparison window (in-store from 2025-05-31); otherwise None («—»).
Rules: docs/business-rules/home-and-targets.md."""

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

import jdatetime
from django.db import connection
from django.db.models import BigIntegerField, Count, ExpressionWrapper, F, Sum
from django.db.models.functions import TruncDate, TruncHour
from django.utils import timezone

from apps.customers.operators import operator_customer_ids
from apps.sales.models import SalesLine
from apps.sales.semantics import online_order_value_orders, qualifying_online_items, qualifying_online_orders, qualifying_pos_items, qualifying_pos_sales
from apps.sales.targets import LINES, POS_START, month_days

TEHRAN = ZoneInfo("Asia/Tehran")
PERIODS = {"7": 7, "30": 30, "90": 90}
COMPARES = ("prev", "yoy", "none")
ONLINE_START = date(2022, 1, 12)


def _day_start(day):
    return timezone.make_aware(datetime.combine(day, time.min))


def parse_lines(raw):
    """«شعبه» filter: one sales line, or all four."""
    return [raw] if raw in LINES else list(LINES)


def shift_year(moment):
    """Same Jalali date and time of day one year earlier (Esfand 30 → 29 when the earlier year is shorter)."""
    local = timezone.localtime(moment)
    j = jdatetime.date.fromgregorian(date=local.date())
    day = min(j.day, month_days(j.year - 1, j.month))
    earlier = jdatetime.date(j.year - 1, j.month, day).togregorian()
    return timezone.make_aware(datetime.combine(earlier, local.time()))


def resolve_window(params, now=None):
    """(start, end, compare_start, compare_end, bucket, period, compare) as aware datetimes, end exclusive.
    compare_start/end are None for «بدون مقایسه». Raises ValueError for a bad custom date."""
    now = timezone.localtime(now or timezone.now())
    today = now.date()
    period = params.get("period") or "today"
    compare = params.get("compare") if params.get("compare") in COMPARES else "prev"
    if period == "custom" and params.get("from") and params.get("to"):
        a, b = sorted([date.fromisoformat(params["from"]), date.fromisoformat(params["to"])])
        b = min(b, today)
        start, end, bucket = _day_start(a), (now if b == today else _day_start(b + timedelta(days=1))), "day"
    elif period in PERIODS:
        start, end, bucket = _day_start(today - timedelta(days=PERIODS[period] - 1)), now, "day"
    else:
        period, start, end, bucket = "today", _day_start(today), now, "hour"
    if compare == "none":
        return start, end, None, None, bucket, period, compare
    if compare == "yoy":
        return start, end, shift_year(start), shift_year(end), bucket, period, compare
    if period == "today":  # same weekday last week, up to the same time of day
        return start, end, start - timedelta(days=7), end - timedelta(days=7), bucket, period, compare
    shift = timedelta(days=len(_days(start, end)))  # whole days, so day i compares with day i and today stops at the same time
    return start, end, start - shift, end - shift, bucket, period, compare


def comparable(lines, compare_start):
    if compare_start is None:
        return False
    first = POS_START if any(line != SalesLine.ONLINE for line in lines) else ONLINE_START
    return timezone.localtime(compare_start).date() >= first


def _trunc(field, bucket):
    return TruncHour(field, tzinfo=TEHRAN) if bucket == "hour" else TruncDate(field, tzinfo=TEHRAN)


def _key(value, bucket):
    """Bucket key: the hour of day (0..23) or the date."""
    if bucket == "hour":
        if timezone.is_naive(value):  # raw SQL gives the Tehran wall-clock hour
            value = timezone.make_aware(value, TEHRAN)
        return timezone.localtime(value).hour
    return value


def _days(start, end):
    first, last = timezone.localtime(start).date(), timezone.localtime(end - timedelta(microseconds=1)).date()
    return [first + timedelta(days=i) for i in range((last - first).days + 1)]


def _raw_facts(start, end, bucket, lines):
    """{(key, line): {sales, invoices, items}} and distinct/new buyers for start ≤ t < end, read from the sales tables."""
    out = {}

    def add(key, line, field, value):
        out.setdefault((_key(key, bucket), line), {"sales": 0, "invoices": 0, "items": 0})[field] += int(value or 0)

    line_amount = ExpressionWrapper(F("amount") * F("quantity"), output_field=BigIntegerField())
    pos_lines = [line for line in lines if line != SalesLine.ONLINE]
    if SalesLine.ONLINE in lines:
        window = {"created_at__gte": start, "created_at__lt": end}
        for row in online_order_value_orders().filter(**window).annotate(b=_trunc("created_at", bucket)).values("b").annotate(v=Sum("total_amount")):
            add(row["b"], SalesLine.ONLINE, "sales", row["v"])
        for row in qualifying_online_orders().filter(**window).annotate(b=_trunc("created_at", bucket)).values("b").annotate(n=Count("id")):
            add(row["b"], SalesLine.ONLINE, "invoices", row["n"])
        for row in (qualifying_online_items().filter(order__created_at__gte=start, order__created_at__lt=end)
                    .annotate(b=_trunc("order__created_at", bucket)).values("b").annotate(n=Sum("quantity"))):
            add(row["b"], SalesLine.ONLINE, "items", row["n"])
    if pos_lines:
        for row in (qualifying_pos_items().filter(pos_sale__created_at__gte=start, pos_sale__created_at__lt=end, pos_sale__sales_line__in=pos_lines)
                    .annotate(b=_trunc("pos_sale__created_at", bucket)).values("b", "pos_sale__sales_line").annotate(v=Sum(line_amount), n=Sum("quantity"))):
            add(row["b"], row["pos_sale__sales_line"], "sales", row["v"])
            add(row["b"], row["pos_sale__sales_line"], "items", row["n"])
        for row in (qualifying_pos_sales().filter(created_at__gte=start, created_at__lt=end, sales_line__in=pos_lines)
                    .annotate(b=_trunc("created_at", bucket)).values("b", "sales_line").annotate(n=Count("id"))):
            add(row["b"], row["sales_line"], "invoices", row["n"])
    return out


def _buyers(start, end, lines, split=None):
    """(distinct buyers, of whom new) across the selected lines; one customer who bought online and in store counts once.
    Days before `split` come from sales_daily_summary.buyer_ids; [split, end) from the sales tables."""
    parts, params, window_start = [], [], start
    if split and split > start:
        parts.append("SELECT unnest(buyer_ids) AS cid FROM sales_daily_summary WHERE day >= %s AND day < %s AND sales_line = ANY(%s)")
        params += [timezone.localtime(start).date(), timezone.localtime(split).date(), list(lines)]
        start = split
    if start >= end and parts:
        lines = []  # nothing live
    if SalesLine.ONLINE in lines:
        sql, p = (qualifying_online_orders().filter(created_at__gte=start, created_at__lt=end, customer_id__isnull=False)
                  .annotate(cid=F("customer_id")).order_by().values("cid").query.sql_with_params())
        parts.append(sql)
        params += p
    pos_lines = [line for line in lines if line != SalesLine.ONLINE]
    if pos_lines:
        sql, p = (qualifying_pos_sales().filter(created_at__gte=start, created_at__lt=end, customer_id__isnull=False, sales_line__in=pos_lines)
                  .annotate(cid=F("customer_id")).order_by().values("cid").query.sql_with_params())
        parts.append(sql)
        params += p
    union = " UNION ".join(f"({part})" for part in parts)
    with connection.cursor() as cursor:
        cursor.execute(
            f"""WITH y(cid) AS (SELECT DISTINCT u.cid FROM ({union}) u WHERE u.cid <> ALL(%s))
                SELECT (SELECT COUNT(*) FROM y),
                       (SELECT COUNT(*) FROM y JOIN customer_metrics m ON m.customer_id = y.cid
                        WHERE m.first_purchase_at >= %s AND m.first_purchase_at < %s)""",
            [*params, list(operator_customer_ids()) or [0], window_start, end],
        )
        total, new = cursor.fetchone()
    return total, new


def _summary_until():
    from apps.sales.models import SalesDailySummary

    return SalesDailySummary.objects.order_by("-day").values_list("day", flat=True).first()


def _split(start, end):
    """Where the stored days end: whole days covered by sales_daily_summary come first, the rest (days after the last
    nightly build, and a partial last day) is read live. Returns start when nothing stored applies."""
    covered = _summary_until()
    if covered is None:
        return start
    split = _day_start(covered + timedelta(days=1))
    local_end = timezone.localtime(end)
    last_whole = end if local_end.time() == time.min else _day_start(local_end.date())
    return max(start, min(split, last_whole))


def _stored_rows(start, split, lines):
    from apps.sales.models import SalesDailySummary

    rows = {}
    for r in SalesDailySummary.objects.filter(day__gte=timezone.localtime(start).date(), day__lt=timezone.localtime(split).date(), sales_line__in=lines):
        rows[(r.day, r.sales_line)] = {"sales": r.sales, "invoices": r.invoices, "items": r.items}
    return rows


def _facts(start, end, bucket, lines):
    """Closed whole days from sales_daily_summary (daily buckets only); everything else live from the sales tables."""
    split = _split(start, end) if bucket == "day" else start
    rows = _stored_rows(start, split, lines) if split > start else {}
    if split < end:
        for key, value in _raw_facts(split, end, bucket, lines).items():
            rows[key] = value
    return {"rows": rows, "buyers": _buyers(start, end, lines, split=split if split > start else None)}


def _total(facts, field, lines=None, keys=None):
    return sum(v[field] for (k, line), v in facts["rows"].items() if (lines is None or line in lines) and (keys is None or k in keys))


def _pct(now_value, before, ok=True):
    return (now_value - before) * 100.0 / before if ok and before else None


def summary(params, now=None):
    now = timezone.localtime(now or timezone.now())
    start, end, cstart, cend, bucket, period, compare = resolve_window(params, now)
    lines = parse_lines(params.get("line"))
    ok = comparable(lines, cstart)
    cur = _facts(start, end, bucket, lines)
    prev = _facts(cstart, cend, bucket, lines) if ok else None

    def card(field):
        value = _total(cur, field)
        return value, _pct(value, _total(prev, field), ok) if prev else None

    sales, sales_change = card("sales")
    invoices, invoices_change = card("invoices")
    items, _ = card("items")
    basket = sales / invoices if invoices else None
    prev_basket = (_total(prev, "sales") / _total(prev, "invoices")) if prev and _total(prev, "invoices") else None
    buyers, new_buyers = cur["buyers"]

    def row(selected):
        s, n = _total(cur, "sales", selected), _total(cur, "invoices", selected)
        before = _total(prev, "sales", selected) if prev else 0
        return {"sales": s, "invoices": n, "items": _total(cur, "items", selected), "basket": s / n if n else None,
                "change": _pct(s, before, ok) if prev else None}

    if bucket == "hour":
        keys = list(range(24))
        future = {h for h in keys if h > now.hour}
    else:
        keys = _days(start, end)
        future = set()
    ckeys = list(range(24)) if bucket == "hour" else (_days(cstart, cend) if prev else [])
    trend = []
    for index, key in enumerate(keys):
        point = {"key": key.isoformat() if hasattr(key, "isoformat") else key, "future": key in future,
                 "sales": None if key in future else _total(cur, "sales", keys=[key])}
        if prev and index < len(ckeys) and key not in future:
            point["compare"] = _total(prev, "sales", keys=[ckeys[index]])
        trend.append(point)

    return {
        "range": {"period": period, "from": start, "to": end, "bucket": bucket, "compare": compare,
                  "compare_from": cstart, "compare_to": cend, "comparable": ok, "lines": lines},
        "sync": last_sync(),
        "cards": {
            "sales": {"value": sales, "change": sales_change,
                      "online_share": (_total(cur, "sales", [SalesLine.ONLINE]) / sales) if sales and len(lines) > 1 else None},
            "invoices": {"value": invoices, "change": invoices_change, "items": items},
            "basket": {"value": basket, "change": _pct(basket, prev_basket, ok) if basket and prev_basket else None},
            "buyers": {"value": buyers, "change": _pct(buyers, prev["buyers"][0], ok) if prev else None,
                       "new_share": new_buyers / buyers if buyers else None},
        },
        "branches": [{"line": line, **row([line])} for line in lines],
        "total": row(lines) if len(lines) > 1 else None,
        "trend": trend,
    }


def last_sync():
    from apps.integrations.elinor.models import SyncRun

    ok = SyncRun.objects.filter(status=SyncRun.STATUS_SUCCESS).order_by("-finished_at").values_list("finished_at", flat=True).first()
    failed = (SyncRun.objects.filter(status=SyncRun.STATUS_FAILED).order_by("-started_at").values("started_at", "kind").first())
    if failed and ok and failed["started_at"] < ok:
        failed = None
    return {"last_success_at": ok, "failed": failed}


# ---- «نیاز به توجه» -------------------------------------------------------------------------------------------------

MAX_ATTENTION = 5


def top_tiers(n=None):
    """[(code, title)] of the top N enabled tiers of each channel of the active rule set, in rank order (never hard-coded)."""
    from django.conf import settings

    from apps.customers.tier_rules import active_rules, tier_lists

    n = settings.HOME_TIER_DROP_TOP_N if n is None else n
    out = []
    for _channel, tiers in tier_lists(active_rules()):
        out += [(tier["code"], tier.get("title") or tier["code"]) for tier in tiers if tier.get("enabled")][:n]
    return out


def attention_facts(now=None):
    """Role-independent counts behind «نیاز به توجه» (cached with the summary; roles are applied per request)."""
    from apps.calls.models import CallEscalation, CallTask
    from apps.customers.list_query import customer_list_queryset
    from apps.products.models import Product, ProductStatusChange

    now = timezone.localtime(now or timezone.now())
    fresh = list(ProductStatusChange.objects.filter(new_status="driver", day__gt=now.date() - timedelta(days=7))
                 .order_by("-day").values_list("product_id", flat=True).distinct()[:50])
    titles = [t.split("|")[0].strip() for t in Product.objects.filter(pk__in=fresh[:3]).values_list("title", flat=True)]
    since = (now.date() - timedelta(days=30)).isoformat()
    top = top_tiers()
    codes = ",".join(code for code, _ in top)
    drop_params = {"tier_change": "down", "tier_change_after": since, "tier_change_from": codes}
    return {
        "drivers": {"count": len(fresh), "names": titles},
        "calls": {"overdue": CallTask.objects.filter(status=CallTask.STATUS_OPEN, due_at__lt=now).count(),
                  "escalations": CallEscalation.objects.filter(status=CallEscalation.STATUS_OPEN).count()},
        "tier_drop": {"count": customer_list_queryset(drop_params).count() if codes else 0, "since": since,
                      "from": codes, "titles": [title for _, title in top]},
        "sync_failed": last_sync()["failed"],
    }


def attention(user, now=None, targets=None, facts=None):
    """Up to five rule-based items, each linking to its module; only items the user's role may open."""
    from apps.accounts.permissions import is_super_admin
    from apps.calls.permissions import is_call_manager
    from apps.sales.views import can_edit_targets

    facts = facts if facts is not None else attention_facts(now)
    items = []
    behind = [row for row in (targets or {}).get("lines", []) if row["status"] == "behind"]
    if behind:
        worst = min(behind, key=lambda row: row["gap"])
        items.append({"kind": "target", "lines": [row["line"] for row in behind], "worst": worst,
                      "required_daily": _line_required_daily(worst, targets), "avg_daily": worst["actual"] / targets["elapsed_days"],
                      "link": "/settings#targets" if can_edit_targets(user) else "/#home-targets"})
    if facts["drivers"]["count"]:
        items.append({"kind": "drivers", **facts["drivers"], "link": "/products?status=driver"})
    calls = facts["calls"]
    if is_call_manager(user) and (calls["overdue"] or calls["escalations"]):
        items.append({"kind": "calls", **calls, "link": "/calls"})
    drop = facts["tier_drop"]
    if drop["count"]:
        items.append({"kind": "tier_drop", **drop,
                      "link": f"/customers?tier_change=down&tier_change_after={drop['since']}&tier_change_from={drop['from']}"})
    failed = facts["sync_failed"]
    if is_super_admin(user) and failed:
        items.append({"kind": "sync_failed", "at": failed["started_at"], "sync_kind": failed["kind"], "link": "/settings"})
    return items[:MAX_ATTENTION]


def _line_required_daily(row, targets):
    remaining = targets["remaining_days"]
    return max(row["target"] - row["actual"], 0) / remaining if remaining > 0 else None
