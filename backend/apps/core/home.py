"""Home page summary: sales, invoices, basket and buyers for a period vs the previous equal period, today so far, branches,
daily trend, and rule-based «نیاز به توجه» items. Every figure comes from apps.sales.semantics:

- sales = online order value (`online_order_value_orders`, `Order.total_amount`) + in-store sold lines
  (`qualifying_pos_items`, amount × quantity); the two channels are only added up, never mixed.
- invoices = qualifying online orders + qualifying POS sales (as on the Sales page).
- buyers = distinct customers of those invoices, internal accounts excluded.

A comparison exists only when every included channel has history for the whole comparison window
(in-store from 2025-05-31); otherwise the change is None («—»). Rules: docs/business-rules/home-and-targets.md."""

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.db import connection
from django.db.models import BigIntegerField, Count, ExpressionWrapper, F, Sum
from django.db.models.functions import TruncDate, TruncHour
from django.utils import timezone

from apps.customers.operators import operator_customer_ids
from apps.sales.models import SalesLine
from apps.sales.semantics import online_order_value_orders, qualifying_online_orders, qualifying_pos_items, qualifying_pos_sales
from apps.sales.targets import LINES, POS_START

TEHRAN = ZoneInfo("Asia/Tehran")
PERIODS = {"7": 7, "30": 30, "90": 90}


def _day_start(day):
    return timezone.make_aware(datetime.combine(day, time.min))


def resolve_window(params, now=None):
    """(start, end, compare_start, compare_end, bucket) as aware datetimes, end exclusive. «امروز» is hourly."""
    now = timezone.localtime(now or timezone.now())
    today = now.date()
    period = params.get("period") or "30"
    if period == "today":
        start, end, bucket = _day_start(today), now, "hour"
    elif period == "custom" and params.get("from") and params.get("to"):
        a, b = sorted([date.fromisoformat(params["from"]), date.fromisoformat(params["to"])])
        b = min(b, today)
        start, end, bucket = _day_start(a), (now if b == today else _day_start(b + timedelta(days=1))), "day"
    else:
        days = PERIODS.get(period, 30)
        start, end, bucket = _day_start(today - timedelta(days=days - 1)), now, "day"
    span = end - start
    return start, end, start - span, start, bucket


def comparable(compare_start):
    """In-store history starts 2025-05-31; both channels are always included on the home page."""
    return timezone.localtime(compare_start).date() >= POS_START


def _trunc(field, bucket):
    return TruncHour(field, tzinfo=TEHRAN) if bucket == "hour" else TruncDate(field, tzinfo=TEHRAN)


def _key(value, bucket):
    if bucket == "hour":
        if timezone.is_naive(value):  # raw SQL gives the Tehran wall-clock hour
            value = timezone.make_aware(value, TEHRAN)
        return timezone.localtime(value).replace(minute=0, second=0, microsecond=0)
    return value


def _buckets(start, end, bucket):
    step = timedelta(hours=1) if bucket == "hour" else timedelta(days=1)
    current = timezone.localtime(start)
    keys = []
    while current < end:
        keys.append(current.replace(minute=0, second=0, microsecond=0) if bucket == "hour" else current.date())
        current += step
    return keys


def _window_facts(start, end, bucket):
    """Per bucket and line: sales and invoices; per bucket and in total: distinct buyers; new buyers in total."""
    line_amount = ExpressionWrapper(F("amount") * F("quantity"), output_field=BigIntegerField())
    sales, invoices = {}, {}
    for row in (online_order_value_orders().filter(created_at__gte=start, created_at__lt=end)
                .annotate(b=_trunc("created_at", bucket)).values("b").annotate(v=Sum("total_amount"))):
        sales[(_key(row["b"], bucket), SalesLine.ONLINE)] = int(row["v"] or 0)
    for row in (qualifying_online_orders().filter(created_at__gte=start, created_at__lt=end)
                .annotate(b=_trunc("created_at", bucket)).values("b").annotate(n=Count("id"))):
        invoices[(_key(row["b"], bucket), SalesLine.ONLINE)] = row["n"]
    for row in (qualifying_pos_items().filter(pos_sale__created_at__gte=start, pos_sale__created_at__lt=end)
                .annotate(b=_trunc("pos_sale__created_at", bucket)).values("b", "pos_sale__sales_line").annotate(v=Sum(line_amount))):
        sales[(_key(row["b"], bucket), row["pos_sale__sales_line"])] = int(row["v"] or 0)
    for row in (qualifying_pos_sales().filter(created_at__gte=start, created_at__lt=end)
                .annotate(b=_trunc("created_at", bucket)).values("b", "sales_line").annotate(n=Count("id"))):
        invoices[(_key(row["b"], bucket), row["sales_line"])] = row["n"]

    # Buyers: one statement over both channels so a customer who bought online and in store counts once.
    online_sql, online_params = (qualifying_online_orders().filter(created_at__gte=start, created_at__lt=end, customer_id__isnull=False)
                                 .annotate(b=_trunc("created_at", bucket), cid=F("customer_id")).order_by().values("b", "cid").query.sql_with_params())
    pos_sql, pos_params = (qualifying_pos_sales().filter(created_at__gte=start, created_at__lt=end, customer_id__isnull=False)
                           .annotate(b=_trunc("created_at", bucket), cid=F("customer_id")).order_by().values("b", "cid").query.sql_with_params())
    internal = list(operator_customer_ids()) or [0]
    with connection.cursor() as cursor:
        cursor.execute(
            f"""WITH x(b, cid) AS (({online_sql}) UNION ALL ({pos_sql})), y AS (SELECT * FROM x WHERE cid <> ALL(%s))
                SELECT 'bucket', b, COUNT(DISTINCT cid) FROM y GROUP BY b
                UNION ALL SELECT 'total', NULL, COUNT(DISTINCT cid) FROM y
                UNION ALL SELECT 'new', NULL, COUNT(DISTINCT y.cid) FROM y JOIN customer_metrics m ON m.customer_id = y.cid
                          WHERE m.first_purchase_at >= %s AND m.first_purchase_at < %s""",
            [*online_params, *pos_params, internal, start, end],
        )
        rows = cursor.fetchall()
    buyers, totals = {}, {"total": 0, "new": 0}
    for tag, b, n in rows:
        if tag == "bucket":
            buyers[_key(b, bucket)] = n
        else:
            totals[tag] = n
    total_buyers, new_buyers = totals["total"], totals["new"]
    return {"sales": sales, "invoices": invoices, "buyers": buyers, "total_buyers": total_buyers, "new_buyers": new_buyers}


def _sum(facts, kind, lines=LINES, keys=None):
    return sum(v for (b, line), v in facts[kind].items() if line in lines and (keys is None or b in keys))


def _pct(now_value, before, ok=True):
    return (now_value - before) * 100.0 / before if ok and before else None


def _series(facts, keys, kind):
    if kind == "buyers":
        return [facts["buyers"].get(k, 0) for k in keys]
    return [sum(v for (b, _), v in facts[kind].items() if b == k) for k in keys]


def last_sync():
    from apps.integrations.elinor.models import SyncRun

    ok = SyncRun.objects.filter(status=SyncRun.STATUS_SUCCESS).order_by("-finished_at").values_list("finished_at", flat=True).first()
    failed = (SyncRun.objects.filter(status=SyncRun.STATUS_FAILED).order_by("-started_at").values("started_at", "kind").first())
    if failed and ok and failed["started_at"] < ok:
        failed = None
    return {"last_success_at": ok, "failed": failed}


def summary(params, now=None):
    now = timezone.localtime(now or timezone.now())
    start, end, cstart, cend, bucket = resolve_window(params, now)
    ok = comparable(cstart)
    cur, prev = _window_facts(start, end, bucket), _window_facts(cstart, cend, bucket)
    keys, ckeys = _buckets(start, end, bucket), _buckets(cstart, cend, bucket)

    sales, prev_sales = _sum(cur, "sales"), _sum(prev, "sales")
    inv, prev_inv = _sum(cur, "invoices"), _sum(prev, "invoices")
    online_sales, online_inv = _sum(cur, "sales", [SalesLine.ONLINE]), _sum(cur, "invoices", [SalesLine.ONLINE])
    basket = sales / inv if inv else None
    prev_basket = prev_sales / prev_inv if prev_inv else None
    sales_series, inv_series = _series(cur, keys, "sales"), _series(cur, keys, "invoices")

    branches = []
    for line in LINES:
        amount, count = _sum(cur, "sales", [line]), _sum(cur, "invoices", [line])
        before = _sum(prev, "sales", [line])
        line_ok = ok or line == SalesLine.ONLINE
        branches.append({"line": line, "sales": amount, "invoices": count, "basket": amount / count if count else None,
                         "change": _pct(amount, before, line_ok)})
    best = max((b for b in branches if b["basket"]), key=lambda b: b["basket"], default=None)

    # Today so far vs the same weekday last week up to the same time; last hour.
    today0 = _day_start(now.date())
    t_cur, t_prev = _window_facts(today0, now, "hour"), _window_facts(today0 - timedelta(days=7), now - timedelta(days=7), "hour")
    last_hour = [k for k in _buckets(today0, now, "hour")]
    hour_ago = now - timedelta(hours=1)
    last_hour_sales = _last_hour_sales(hour_ago, now)
    today = {
        "sales": _sum(t_cur, "sales"), "invoices": _sum(t_cur, "invoices"), "buyers": t_cur["total_buyers"],
        "sales_change": _pct(_sum(t_cur, "sales"), _sum(t_prev, "sales")),
        "invoices_change": _pct(_sum(t_cur, "invoices"), _sum(t_prev, "invoices")),
        "buyers_change": _pct(t_cur["total_buyers"], t_prev["total_buyers"]),
        "last_hour_sales": last_hour_sales, "compare_day": (now - timedelta(days=7)).date(), "hours": len(last_hour),
    }

    return {
        "range": {"from": start, "to": end, "compare_from": cstart, "compare_to": cend, "bucket": bucket, "comparable": ok},
        "sync": last_sync(),
        "today": today,
        "trend": {
            "current": [{"at": k, "sales": v} for k, v in zip(keys, sales_series)],
            "compare": _series(prev, ckeys, "sales") if ok else [],
        },
        "branches": branches,
        "cards": {
            "sales": {"value": sales, "change": _pct(sales, prev_sales, ok), "online_share": online_sales / sales if sales else None,
                      "spark": sales_series},
            "invoices": {"value": inv, "change": _pct(inv, prev_inv, ok), "online": online_inv, "in_store": inv - online_inv,
                         "spark": inv_series},
            "basket": {"value": basket, "change": _pct(basket or 0, prev_basket or 0, ok) if basket and prev_basket else None,
                       "best_line": best["line"] if best else None, "best_value": best["basket"] if best else None,
                       "spark": [s / n if n else 0 for s, n in zip(sales_series, inv_series)]},
            "buyers": {"value": cur["total_buyers"], "change": _pct(cur["total_buyers"], prev["total_buyers"], ok),
                       "new_share": cur["new_buyers"] / cur["total_buyers"] if cur["total_buyers"] else None,
                       "spark": _series(cur, keys, "buyers")},
        },
    }


def _last_hour_sales(start, end):
    line_amount = ExpressionWrapper(F("amount") * F("quantity"), output_field=BigIntegerField())
    online = online_order_value_orders().filter(created_at__gte=start, created_at__lt=end).aggregate(v=Sum("total_amount"))["v"] or 0
    pos = qualifying_pos_items().filter(pos_sale__created_at__gte=start, pos_sale__created_at__lt=end).aggregate(v=Sum(line_amount))["v"] or 0
    return int(online) + int(pos)


# ---- «نیاز به توجه» -------------------------------------------------------------------------------------------------

MAX_ATTENTION = 5


def attention(user, now=None, targets=None):
    """Up to five rule-based items, each linking to its module; only items the user's role may open."""
    from apps.accounts.permissions import is_super_admin
    from apps.calls.permissions import is_call_manager
    from apps.sales.views import can_edit_targets

    now = timezone.localtime(now or timezone.now())
    items = []

    behind = [row for row in (targets or {}).get("lines", []) if row["status"] == "behind"]
    if behind:
        worst = min(behind, key=lambda row: row["gap"])
        items.append({"kind": "target", "lines": [row["line"] for row in behind], "worst": worst,
                      "required_daily": _line_required_daily(worst, targets), "avg_daily": worst["actual"] / targets["elapsed_days"],
                      "link": "/settings#targets" if can_edit_targets(user) else "/#home-targets"})

    from apps.products.models import ProductStatusChange

    fresh = list(ProductStatusChange.objects.filter(new_status="driver", day__gt=now.date() - timedelta(days=7))
                 .order_by("-day").values_list("product_id", flat=True).distinct()[:50])
    if fresh:
        from apps.products.models import Product

        titles = [t.split("|")[0].strip() for t in Product.objects.filter(pk__in=fresh[:3]).values_list("title", flat=True)]
        items.append({"kind": "drivers", "count": len(fresh), "names": titles, "link": "/products?status=driver"})

    if is_call_manager(user):
        from apps.calls.models import CallEscalation, CallTask

        overdue = CallTask.objects.filter(status=CallTask.STATUS_OPEN, due_at__lt=now).count()
        escalations = CallEscalation.objects.filter(status=CallEscalation.STATUS_OPEN).count()
        if overdue or escalations:
            items.append({"kind": "calls", "overdue": overdue, "escalations": escalations, "link": "/calls"})

    from apps.customers.list_query import customer_list_queryset

    since = (now.date() - timedelta(days=30)).isoformat()
    dropped = customer_list_queryset({"tier_change": "down", "tier_change_after": since}).count()
    if dropped:
        items.append({"kind": "tier_drop", "count": dropped, "since": since,
                      "link": f"/customers?tier_change=down&tier_change_after={since}"})

    if is_super_admin(user):
        failed = last_sync()["failed"]
        if failed:
            items.append({"kind": "sync_failed", "at": failed["started_at"], "sync_kind": failed["kind"], "link": "/settings"})
    return items[:MAX_ATTENTION]


def _line_required_daily(row, targets):
    remaining = targets["remaining_days"]
    return max(row["target"] - row["actual"], 0) / remaining if remaining > 0 else None
