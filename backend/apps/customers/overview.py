"""Customers page overview: 4 metrics x 8 lenses, compare window, sparklines, tiers.

Definitions: docs/business-rules/customer-overview-metrics.md. Every purchase comes from
apps.sales.semantics; internal accounts are excluded everywhere.
"""

from datetime import date, datetime, time, timedelta

import jdatetime
from django.core.cache import cache
from django.db import connection, transaction
from django.db.models import BooleanField, Count, ExpressionWrapper, F, Q, Sum, Value
from django.utils import timezone

from apps.core.dates import format_jalali_date
from apps.customers.models import Customer, CustomerTierHistory, TierRuleSet
from apps.customers.operators import exclude_operator_sales, operator_customer_ids
from apps.customers.tier_rules import CHANNEL_LABELS, active_rule_set, default_rules, tier_lists
from apps.customers.tiers import _signed_line_sql
from apps.sales.models import PosSaleItem, SalesLine
from apps.sales.semantics import (
    pos_refund_sales,
    qualifying_online_gateway_payments,
    qualifying_online_orders,
    qualifying_pos_sales,
)

PERIODS = ("30", "month", "90", "365")
COMPARES = ("prev", "yoy")
LENSES = ("total", "site", "sari", "gorgan", "capri", "shopino", "snappay", "digipay")
ONLINE_DATA_START = date(2022, 1, 12)
POS_DATA_START = date(2025, 5, 31)
# A lens that mixes POS has no full history before POS data starts.
LENS_DATA_START = {
    lens: ONLINE_DATA_START if lens in ("site", "shopino") else POS_DATA_START for lens in LENSES
}
CACHE_SECONDS = 15 * 60

_LENS_SQL = {
    "total": "TRUE",
    "site": "line = 'ONLINE'",
    "sari": f"line = '{SalesLine.SARI}'",
    "gorgan": f"line = '{SalesLine.GORGAN}'",
    "capri": f"line = '{SalesLine.CAPRI}'",
    "shopino": "shopino",
    "snappay": "snappay",
    "digipay": "digipay",
}


def parse_overview_params(params):
    period = params.get("period") or "30"
    compare = params.get("compare") or "prev"
    if period not in PERIODS or compare not in COMPARES:
        return None
    return period, compare


# --- Windows (local dates, end inclusive) ------------------------------------


def _jalali_month_start(day, back=0):
    j = jdatetime.date.fromgregorian(date=day)
    index = j.year * 12 + (j.month - 1) - back
    return jdatetime.date(index // 12, index % 12 + 1, 1).togregorian()


def _year_back(day):
    j = jdatetime.date.fromgregorian(date=day)
    try:
        return jdatetime.date(j.year - 1, j.month, j.day).togregorian()
    except ValueError:  # Esfand 30 in a non-leap year
        return jdatetime.date(j.year - 1, j.month, j.day - 1).togregorian()


def period_window(period, today):
    if period == "month":
        return _jalali_month_start(today), today
    return today - timedelta(days=int(period) - 1), today


def compare_window(window, compare):
    start, end = window
    if compare == "yoy":
        return _year_back(start), _year_back(end)
    length = (end - start).days + 1
    return start - timedelta(days=length), start - timedelta(days=1)


def spark_windows(period, today):
    """12 buckets, oldest first."""
    if period in ("30", "90"):
        days = int(period)
        return [
            (today - timedelta(days=days * (12 - i) - 1), today - timedelta(days=days * (11 - i)))
            for i in range(12)
        ]
    buckets = []
    for back in range(11, -1, -1):
        start = _jalali_month_start(today, back)
        end = min(today, _jalali_month_start(today, back - 1) - timedelta(days=1))
        buckets.append((start, end))
    return buckets


def _aware(day):
    return timezone.make_aware(datetime.combine(day, time.min), timezone.get_current_timezone())


# --- Events (one row per qualifying invoice, plus POS refund headers for net amount) ----


def _flag(q):
    return ExpressionWrapper(q, output_field=BooleanField())


def _events_sql():
    def gateway(name):
        return _flag(Q(pk__in=qualifying_online_gateway_payments(name).values("invoice__order_id")))

    def compiled(qs, *columns):
        return qs.order_by().values(*columns).query.sql_with_params()

    online = exclude_operator_sales(qualifying_online_orders().filter(customer_id__isnull=False)).annotate(
        cid=F("customer_id"),
        at=F("created_at"),
        amt=F("total_amount"),
        inv=Value(True),
        line=Value(SalesLine.ONLINE),
        shopino=F("is_shopino"),
        snappay=gateway("snapppay"),
        digipay=gateway("digipay"),
    )

    def pos(qs, invoice):
        return exclude_operator_sales(qs.filter(customer_id__isnull=False)).annotate(
            sid=F("pk"),
            cid=F("customer_id"),
            at=F("created_at"),
            inv=Value(invoice),
            line=F("sales_line"),
            shopino=Value(False),
            snappay=_flag(Q(snappay_cashier_amount__gt=0)) if invoice else Value(False),
            digipay=_flag(Q(digipay_cashier_amount__gt=0)) if invoice else Value(False),
        )

    # Net POS amount per sale, signed exactly like the tier facts (refund lines negative).
    amounts = PosSaleItem.objects.filter(deleted_at__isnull=True).values("pos_sale_id").annotate(total=Sum(_signed_line_sql()))
    amounts_sql, amounts_params = compiled(amounts, "pos_sale_id", "total")
    online_sql, params = compiled(online, "cid", "at", "amt", "inv", "line", "shopino", "snappay", "digipay")
    selects = [f"SELECT cid, at, amt, inv, line, shopino, snappay, digipay FROM ({online_sql}) part"]
    params = list(params)
    for qs, invoice in ((qualifying_pos_sales(), True), (pos_refund_sales().filter(is_cancelled=False), False)):
        pos_sql, pos_params = compiled(pos(qs, invoice), "sid", "cid", "at", "inv", "line", "shopino", "snappay", "digipay")
        selects.append(
            "SELECT cid, at, COALESCE(pa.total, 0) AS amt, inv, line, shopino, snappay, digipay "
            f"FROM ({pos_sql}) part LEFT JOIN pos_amounts pa ON pa.pos_sale_id = part.sid"
        )
        params.extend(pos_params)
    return f"pos_amounts AS ({amounts_sql}), e AS ({' UNION ALL '.join(selects)})", list(amounts_params) + params


def _aggregate(windows):
    """{window index: {lens: {...}}} for every lens, one query. windows = [current, compare, *contiguous buckets]."""
    events_sql, params = _events_sql()
    tz = timezone.get_current_timezone_name()
    values_sql = ", ".join("(%s, %s::timestamptz, %s::timestamptz)" for _ in windows)
    bounds = [(_aware(start), _aware(end + timedelta(days=1))) for start, end in windows]
    window_params = [value for i, (ws, we) in enumerate(bounds) for value in (i, ws, we)]
    per_customer, activity, firsts, lens_firsts = [], [], [], []
    for lens, cond in _LENS_SQL.items():
        # Per (window, customer) first, so the outer counts need no COUNT(DISTINCT).
        per_customer += [
            f"COUNT(*) FILTER (WHERE ew.inv AND {cond}) AS inv_{lens}",
            f"SUM(ew.amt) FILTER (WHERE {cond}) AS amt_{lens}",
        ]
        activity += [
            f"COUNT(*) FILTER (WHERE cw.inv_{lens} > 0) AS active_{lens}",
            f"SUM(cw.inv_{lens}) AS invoices_{lens}",
            f"SUM(cw.amt_{lens}) AS amount_{lens}",
            f"COUNT(*) FILTER (WHERE cw.inv_{lens} > 0 AND f.first_any < w.ws) AS repeat_{lens}",
        ]
        firsts.append(f"MIN(at) FILTER (WHERE inv AND {cond}) AS first_{lens}")
        lens_firsts.append(
            f"SELECT '{lens}' AS lens, (first_{lens} AT TIME ZONE %s)::date AS day, COUNT(*) AS n "
            f"FROM f WHERE first_{lens} IS NOT NULL GROUP BY 2"
        )
    sql = f"""
        WITH {events_sql},
        w(idx, ws, we) AS (VALUES {values_sql}),
        f AS (SELECT cid, MIN(at) FILTER (WHERE inv) AS first_any, {", ".join(firsts)} FROM e GROUP BY cid),
        -- Window 0 = current, 1 = compare, 2.. = contiguous sparkline buckets (width_bucket, no range join).
        ew AS (
            SELECT 0 AS idx, e.* FROM e WHERE e.at >= %s AND e.at < %s
            UNION ALL SELECT 1, e.* FROM e WHERE e.at >= %s AND e.at < %s
            UNION ALL SELECT width_bucket(e.at, %s::timestamptz[]) + 1, e.* FROM e WHERE e.at >= %s AND e.at < %s
        ),
        cw AS (
            SELECT ew.idx, ew.cid, {", ".join(per_customer)}
            FROM ew
            GROUP BY ew.idx, ew.cid
        ),
        act AS (
            SELECT cw.idx, {", ".join(activity)}
            FROM cw JOIN w ON w.idx = cw.idx JOIN f ON f.cid = cw.cid
            GROUP BY cw.idx
        ),
        hist AS ({" UNION ALL ".join(lens_firsts)})
        SELECT (SELECT json_agg(act) FROM act), (SELECT json_agg(hist) FROM hist)
    """
    with transaction.atomic(), connection.cursor() as cursor:
        cursor.execute("SET LOCAL jit = off")  # JIT compile time exceeds its gain on this one-off plan
        spark = bounds[2:]
        edges = [ws for ws, _ in spark] + [spark[-1][1]]
        ew_params = [*bounds[0], *bounds[1], edges, edges[0], edges[-1]]
        cursor.execute(sql, params + window_params + ew_params + [tz] * len(LENSES))
        act_rows, hist_rows = cursor.fetchone()
    by_window = {row["idx"]: row for row in act_rows or []}
    first_days = {}
    for row in hist_rows or []:
        first_days.setdefault(row["lens"], []).append((date.fromisoformat(row["day"]), row["n"]))
    result = {}
    for i, (start, end) in enumerate(windows):
        row = by_window.get(i, {})
        result[i] = {}
        for lens in LENSES:
            days = first_days.get(lens, [])
            result[i][lens] = {
                "customers": sum(n for day, n in days if day <= end),
                "new": sum(n for day, n in days if start <= day <= end),
                **{key: int(row.get(f"{key}_{lens}") or 0) for key in ("active", "invoices", "amount", "repeat")},
            }
    return result


# --- Metrics -------------------------------------------------------------------


def _covered(lens, window):
    return window[0] >= LENS_DATA_START[lens]


def _metrics(raw, lens, window):
    if not _covered(lens, window):
        return {"customers": None, "new": None, "active": None, "basket": None, "repeat": None}
    row = raw[lens]
    active = row["active"]
    return {
        "customers": row["customers"],
        "new": row["new"],
        "active": active,
        "basket": int(round(row["amount"] / row["invoices"])) if row["invoices"] else None,
        "repeat": round(row["repeat"] / active * 100, 1) if active else None,
    }


def _pct_change(current, previous):
    if current is None or previous in (None, 0):
        return None
    return round((current - previous) / previous * 100, 1)


def _pp_change(current, previous):
    if current is None or previous is None:
        return None
    return round(current - previous, 1)


def _lens_payload(raw, compare_raw, lens, window, cmp_window):
    current = _metrics(raw, lens, window)
    previous = _metrics(compare_raw, lens, cmp_window)
    return {
        "customers": {"value": current["customers"], "new": current["new"]},
        "active": {"value": current["active"], "delta": _pct_change(current["active"], previous["active"])},
        "basket": {"value": current["basket"], "delta": _pct_change(current["basket"], previous["basket"])},
        "repeat": {"value": current["repeat"], "delta": _pp_change(current["repeat"], previous["repeat"])},
    }


# --- Tiers --------------------------------------------------------------------


def _tier_payload(window):
    rule_set = active_rule_set()
    rules = rule_set.rules if rule_set else default_rules()
    excluded = operator_customer_ids()
    counts = dict(
        Customer.objects.filter(tier_code__isnull=False)
        .exclude(pk__in=excluded)
        .values_list("tier_code")
        .annotate(n=Count("id"))
    )
    start, end = _aware(window[0]), _aware(window[1] + timedelta(days=1))
    history = CustomerTierHistory.objects.filter(changed_at__gte=start, changed_at__lt=end).exclude(customer_id__in=excluded)
    entries = dict(history.filter(tier_code__isnull=False).values_list("tier_code").annotate(n=Count("id")))
    exits = dict(history.filter(previous_tier_code__isnull=False).values_list("previous_tier_code").annotate(n=Count("id")))
    panels = []
    for channel, tiers in tier_lists(rules):
        panels.append(
            {
                "channel": channel,
                "title": CHANNEL_LABELS.get(channel, "همه"),
                "tiers": [
                    {
                        "code": tier["code"],
                        "title": tier["title"],
                        "count": int(counts.get(tier["code"], 0)),
                        "net": int(entries.get(tier["code"], 0)) - int(exits.get(tier["code"], 0)),
                    }
                    for tier in tiers
                    if tier.get("enabled")
                ],
            }
        )
    rules_changed = TierRuleSet.objects.filter(activated_at__gte=start, activated_at__lt=end).exists()
    return {"panels": panels, "rules_changed": rules_changed}


def _insights(lenses, tiers):
    deltas = [(lens, lenses[lens]["active"]["delta"]) for lens in LENSES[1:] if lenses[lens]["active"]["delta"] is not None]
    best = max(deltas, key=lambda item: item[1]) if deltas else None
    worst = min(deltas, key=lambda item: item[1]) if deltas else None
    rows = [tier for panel in tiers["panels"] for tier in panel["tiers"] if tier["net"] > 0]
    top_tier = max(rows, key=lambda tier: tier["net"]) if rows else None
    return {
        "best_active": {"lens": best[0], "delta": best[1]} if best else None,
        "worst_active": {"lens": worst[0], "delta": worst[1]} if worst else None,
        "top_tier": {"code": top_tier["code"], "title": top_tier["title"], "net": top_tier["net"]} if top_tier else None,
    }


# --- Payload ------------------------------------------------------------------


def _window_meta(window):
    return {
        "start": window[0].isoformat(),
        "end": window[1].isoformat(),
        "start_jalali": format_jalali_date(window[0]),
        "end_jalali": format_jalali_date(window[1]),
    }


def overview_payload(period, compare, today=None):
    today = today or timezone.localdate()
    key = f"customers-overview:{period}:{compare}:{today.isoformat()}"
    cached = cache.get(key)
    if cached is not None:
        return cached
    window = period_window(period, today)
    cmp_window = compare_window(window, compare)
    buckets = spark_windows(period, today)
    raw = _aggregate([window, cmp_window, *buckets])
    lenses = {lens: _lens_payload(raw[0], raw[1], lens, window, cmp_window) for lens in LENSES}
    for lens in LENSES:
        series = [_metrics(raw[i + 2], lens, bucket) for i, bucket in enumerate(buckets)]
        lenses[lens]["spark"] = {metric: [point[metric] for point in series] for metric in ("customers", "active", "basket", "repeat")}
    tiers = _tier_payload(window)
    payload = {
        "period": period,
        "compare": compare,
        "window": _window_meta(window),
        "compare_window": _window_meta(cmp_window),
        "lenses": lenses,
        "tiers": tiers,
        "insights": _insights(lenses, tiers),
    }
    cache.set(key, payload, CACHE_SECONDS)
    return payload
