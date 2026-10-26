"""RFM report read models (Stage 1b): KPIs with monthly trend, segments, matrix, movement windows,
second-purchase funnel, reactivated customers and the call list.

Every figure is restricted to the filtered population (sales_line(s), payment_method) and excludes active
internal accounts. Amounts are «خرید خالص مشتری», never sales revenue.
"""

from contextlib import contextmanager
from datetime import timedelta
from functools import wraps

from django.db import connection, transaction
from django.db.models import Avg, Count, Max, Q, Sum
from django.utils import timezone

from apps.customers.rfm import (
    AMOUNT_LABEL,
    AT_RISK_SEGMENTS,
    COVERAGE_NOTE,
    EXCHANGE_NOTE,
    F_MIN_COUNT,
    HIGH_VALUE_MIN_M,
    R_MAX_DAYS,
    SEGMENT_ACTIONS,
    SEGMENT_LABELS,
    SEGMENTS,
    _EVENTS_SQL,
    _POS_LINE,
    _days_late,
    _internal_accounts_count,
    _pct,
    _round,
    previous_month_keys,
    jalali_month_end,
    segment_for,
    thresholds_payload,
)

# Fixed action priority for the segments table (most urgent first).
PRIORITY_ORDER = ("cant_lose", "at_risk", "new", "potential", "attention", "champions", "loyal", "hibernating")
# Segment value rank used by movement (high to low).
VALUE_RANK = ("champions", "loyal", "potential", "new", "attention", "cant_lose", "at_risk", "hibernating")
BUYERS_WINDOW_DAYS = 30
SECOND_PURCHASE_DAYS = 90
SECOND_PURCHASE_COHORT_DAYS = (90, 455)  # first purchase this many days before the reference date
FUNNEL_WINDOWS = (30, 60, 90, 180)
FUNNEL_COHORT_DAYS = 365
REACTIVATION_GAP_DAYS = 180
CALL_LIST_MAX_DAYS = 365
MOVEMENT_WINDOWS = (1, 3, 6, 12)
TREND_MONTHS = 12
POS_HISTORY_NOTE = "تاریخچه فروش حضوری از ۱۴۰۴/۰۳/۱۰ است؛ خرید دوم مشتریان حضوری پیش از آن دیده نمی‌شود."
JALALI_MONTHS = (
    "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
)
_FA = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")


def _fa(value):
    return str(value).translate(_FA)


@contextmanager
def _serial_queries():
    """Run the report's queries without parallel workers.

    With parallel plans some of these queries stall or fail with «could not resize shared memory segment»
    (the Postgres container has the 64 MB Docker /dev/shm default). Serial they finish in under a second.
    SET LOCAL applies to this transaction only.
    """
    with transaction.atomic():
        with connection.cursor() as cursor:
            cursor.execute("SET LOCAL max_parallel_workers_per_gather = 0")
        yield


def serial(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        with _serial_queries():
            return func(*args, **kwargs)

    return wrapper


# --- Population ------------------------------------------------------------------------------


POPULATION_TABLE = "rfm_report_population"


def population(params, materialize=False):
    """Customer ids (subquery) for the report filters, without active internal accounts.

    With `materialize` (inside a report transaction) the ids are computed once into a temporary table,
    so the report's many queries do not each re-run the list filters.
    """
    from django.db.models.expressions import RawSQL

    from apps.customers.list_query import customer_list_queryset
    from apps.customers.models import Customer
    from apps.customers.operators import exclude_operator_accounts

    keys = ("sales_line", "sales_lines", "sales_lines_mode", "payment_method")
    filters = {key: params.get(key) for key in keys if params.get(key)}
    if hasattr(params, "getlist") and params.getlist("sales_lines"):
        filters["sales_lines"] = ",".join(params.getlist("sales_lines"))
    customers = exclude_operator_accounts(customer_list_queryset(filters)).order_by().values("pk")
    if not materialize:
        return customers
    sql, sql_params = _sql_of(customers)
    with connection.cursor() as cursor:
        cursor.execute(f"DROP TABLE IF EXISTS {POPULATION_TABLE}")
        cursor.execute(f"CREATE TEMP TABLE {POPULATION_TABLE} ON COMMIT DROP AS {sql}", sql_params)
        cursor.execute(f"ALTER TABLE {POPULATION_TABLE} ADD PRIMARY KEY (id)")
        cursor.execute(f"ANALYZE {POPULATION_TABLE}")
    return Customer.objects.filter(pk__in=RawSQL(f"SELECT id FROM {POPULATION_TABLE}", [])).order_by().values("pk")


def _sql_of(queryset):
    sql, params = queryset.query.sql_with_params()
    return sql, list(params)


def _tz():
    return timezone.get_current_timezone_name()


def month_label(key):
    year, month = key.split("-")
    return f"{JALALI_MONTHS[int(month) - 1]} {_fa(int(year))}"


# --- Labels ----------------------------------------------------------------------------------


def axis_labels():
    """Persian range labels for R1..R5 and F1..F5, built from the threshold constants."""
    r_labels, previous = {}, None
    for score, bound in R_MAX_DAYS:  # 5 (smallest bound) .. 2
        r_labels[score] = f"تا {_fa(bound)} روز" if previous is None else f"{_fa(previous + 1)} تا {_fa(bound)} روز"
        previous = bound
    r_labels[1] = f"بیش از {_fa(previous)} روز"

    f_labels, upper = {}, None
    for score, bound in F_MIN_COUNT:  # 5 (largest bound) .. 2
        if upper is None:
            f_labels[score] = f"{_fa(bound)}+ خرید"
        elif upper - 1 == bound:
            f_labels[score] = f"{_fa(bound)} خرید"
        else:
            f_labels[score] = f"{_fa(bound)} تا {_fa(upper - 1)} خرید"
        upper = bound
    f_labels[1] = f"{_fa(1)} خرید" if upper == 2 else f"۱ تا {_fa(upper - 1)} خرید"
    return {
        "r": [{"score": score, "label": r_labels[score]} for score in (5, 4, 3, 2, 1)],
        "f": [{"score": score, "label": f_labels[score]} for score in (5, 4, 3, 2, 1)],
    }


# --- Summary ---------------------------------------------------------------------------------


@serial
def rfm_summary(params, today=None):
    from apps.customers.models import CustomerRfm, CustomerRfmSnapshot

    today = today or timezone.localdate()
    customers = population(params, materialize=True)
    rows = CustomerRfm.objects.filter(customer_id__in=customers)
    month_keys = list(reversed(previous_month_keys(today, TREND_MONTHS)))  # oldest first
    snapshots = CustomerRfmSnapshot.objects.filter(customer_id__in=customers, month__in=month_keys).exclude(
        customer__internal_account__is_active=True
    )

    totals = rows.aggregate(
        purchasing=Count("pk"),
        lifetime=Sum("lifetime_amount"),
        buyers_30d=Count("pk", filter=Q(days_since_last_purchase__lt=BUYERS_WINDOW_DAYS)),
        active_12m=Count("pk", filter=Q(purchase_count_12m__gt=0)),
        repeat_12m=Count("pk", filter=Q(purchase_count_12m__gte=2)),
        at_risk_value=Sum("lifetime_amount", filter=Q(segment__in=AT_RISK_SEGMENTS)),
        at_risk_count=Count("pk", filter=Q(segment__in=AT_RISK_SEGMENTS)),
        computed_at=Max("computed_at"),
    )
    purchasing = totals["purchasing"] or 0
    lifetime_total = totals["lifetime"] or 0
    active = totals["active_12m"] or 0

    monthly = {
        row["month"]: row
        for row in snapshots.values("month").annotate(
            buyers_30d=Count("pk", filter=Q(days_since_last_purchase__lt=BUYERS_WINDOW_DAYS)),
            active_12m=Count("pk", filter=Q(purchase_count_12m__gt=0)),
            repeat_12m=Count("pk", filter=Q(purchase_count_12m__gte=2)),
            value_at_risk=Sum("lifetime_amount", filter=Q(segment__in=AT_RISK_SEGMENTS)),
            filled=Count("pk", filter=Q(purchase_count__isnull=False)),
        )
    }
    second_now, cohort_now = second_purchase_rate(customers, today)
    second_trend = second_purchase_trend(customers, month_keys)
    purchases_30d = _purchases_in_window(customers, today)

    def series(key):
        # Months written before migration 0010 have no facts until `backfill_rfm_snapshots --rebuild`.
        return [
            (monthly[month][key] or 0) if month in monthly and monthly[month]["filled"] else None for month in month_keys
        ]

    kpis = {
        "buyers_30d": _kpi(
            totals["buyers_30d"] or 0,
            series("buyers_30d"),
            month_keys,
            secondary={"label": "خرید در ۳۰ روز", "value": purchases_30d},
        ),
        "active_customers_12m": _kpi(
            active,
            series("active_12m"),
            month_keys,
            secondary={"label": "نرخ خرید تکراری", "value": _pct(totals["repeat_12m"] or 0, active), "unit": "percent"},
        ),
        "second_purchase_90d": _kpi(
            second_now,
            second_trend,
            month_keys,
            unit="percent",
            secondary={"label": "اندازه کوهورت", "value": cohort_now},
        ),
        "value_at_risk": _kpi(
            totals["at_risk_value"] or 0,
            series("value_at_risk"),
            month_keys,
            unit="toman",
            secondary={"label": "مشتری در خطر", "value": totals["at_risk_count"] or 0},
        ),
    }

    by_segment = {
        row["segment"]: row
        for row in rows.values("segment").annotate(
            count=Count("pk"),
            lifetime_amount_sum=Sum("lifetime_amount"),
            amount_12m_sum=Sum("amount_12m"),
            avg_days_since_last=Avg("days_since_last_purchase"),
            avg_purchase_count=Avg("purchase_count"),
            high_value_count=Count("pk", filter=Q(m_score__gte=HIGH_VALUE_MIN_M)),
            overdue_count=Count("pk", filter=Q(is_overdue=True)),
        )
    }
    last_month = month_keys[-1]
    previous_counts = dict(
        snapshots.filter(month=last_month).values_list("segment").annotate(n=Count("pk")).order_by()
    )
    has_previous = bool(previous_counts)
    cells_by_segment = {key: [list(cell) for cell in cells] for key, _label, cells, _action in SEGMENTS}
    segments = []
    for rank, key in enumerate(PRIORITY_ORDER, start=1):
        row = by_segment.get(key) or {}
        count = row.get("count") or 0
        lifetime_sum = row.get("lifetime_amount_sum") or 0
        segments.append(
            {
                "key": key,
                "label": SEGMENT_LABELS[key],
                "action": SEGMENT_ACTIONS[key],
                "priority_rank": rank,
                "cells": cells_by_segment[key],
                "count": count,
                "pct_customers": _pct(count, purchasing),
                "lifetime_amount_sum": lifetime_sum,
                "pct_lifetime_amount": _pct(lifetime_sum, lifetime_total),
                "amount_12m_sum": row.get("amount_12m_sum") or 0,
                "avg_days_since_last": _round(row.get("avg_days_since_last")),
                "avg_purchase_count": _round(row.get("avg_purchase_count")),
                "high_value_count": row.get("high_value_count") or 0,
                "overdue_count": row.get("overdue_count") or 0,
                "delta_count_vs_previous_month": (count - previous_counts.get(key, 0)) if has_previous else None,
            }
        )

    labels = axis_labels()
    r_label = {item["score"]: item["label"] for item in labels["r"]}
    f_label = {item["score"]: item["label"] for item in labels["f"]}
    cells = {
        (row["r_score"], row["f_score"]): row
        for row in rows.values("r_score", "f_score").annotate(
            count=Count("pk"),
            lifetime_amount_sum=Sum("lifetime_amount"),
            amount_12m_sum=Sum("amount_12m"),
            high_value_count=Count("pk", filter=Q(m_score__gte=HIGH_VALUE_MIN_M)),
            avg_days_since_last=Avg("days_since_last_purchase"),
        )
    }
    matrix = []
    for r in (5, 4, 3, 2, 1):
        for f in (5, 4, 3, 2, 1):
            cell = cells.get((r, f)) or {}
            count = cell.get("count") or 0
            amount = cell.get("lifetime_amount_sum") or 0
            matrix.append(
                {
                    "r": r,
                    "f": f,
                    "segment": segment_for(r, f),
                    "segment_label": SEGMENT_LABELS[segment_for(r, f)],
                    "r_label": r_label[r],
                    "f_label": f_label[f],
                    "count": count,
                    "pct_customers": _pct(count, purchasing),
                    "lifetime_amount_sum": amount,
                    "pct_lifetime_amount": _pct(amount, lifetime_total),
                    "amount_12m_sum": cell.get("amount_12m_sum") or 0,
                    "high_value_count": cell.get("high_value_count") or 0,
                    "avg_days_since_last": _round(cell.get("avg_days_since_last")),
                }
            )

    return {
        "kpis": kpis,
        "counts": {
            "purchasing_customers": purchasing,
            "registered_without_purchase": max(customers.count() - purchasing, 0),
            "internal_accounts_excluded": _internal_accounts_count(),
        },
        "composition": [
            {
                "key": segment["key"],
                "label": segment["label"],
                "count": segment["count"],
                "pct_customers": segment["pct_customers"],
                "lifetime_amount_sum": segment["lifetime_amount_sum"],
                "pct_lifetime_amount": segment["pct_lifetime_amount"],
            }
            for segment in sorted(segments, key=lambda item: VALUE_RANK.index(item["key"]))
        ],
        "segments": segments,
        "matrix": matrix,
        "axis_labels": labels,
        "second_purchase_funnel": second_purchase_funnel(customers, today),
        "reactivated": reactivated(customers, today),
        "previous_month": {"key": last_month, "label": month_label(last_month)},
        "thresholds": thresholds_payload(),
        "computed_at": totals["computed_at"],
        "amount_label": AMOUNT_LABEL,
        "notes": [COVERAGE_NOTE, EXCHANGE_NOTE],
    }


def _kpi(value, trend, month_keys, unit="count", secondary=None):
    previous = trend[-1] if trend else None
    delta = None
    if previous not in (None, 0):
        delta = round(100 * (value - previous) / previous, 1)
    return {
        "value": value,
        "unit": unit,
        "previous": previous,
        "delta_pct": delta,
        "trend": [{"month": month, "label": month_label(month), "value": item} for month, item in zip(month_keys, trend)],
        "secondary": secondary,
    }


# --- Second purchase -------------------------------------------------------------------------


def _local_dates_sql(customers_sql):
    return f"""
        SELECT (first_purchase_at AT TIME ZONE %s)::date AS d1,
               (second_purchase_at AT TIME ZONE %s)::date AS d2
        FROM customer_rfm
        WHERE customer_id IN ({customers_sql})
    """


def second_purchase_rate(customers, reference):
    """% of customers whose first purchase was 90–455 days before `reference` with a second within 90 days."""
    customers_sql, customers_params = _sql_of(customers)
    low, high = SECOND_PURCHASE_COHORT_DAYS
    with connection.cursor() as cursor:
        cursor.execute(
            f"""
            SELECT COUNT(*) FILTER (WHERE d1 BETWEEN %s AND %s),
                   COUNT(*) FILTER (WHERE d1 BETWEEN %s AND %s AND d2 IS NOT NULL AND d2 - d1 <= %s)
            FROM ({_local_dates_sql(customers_sql)}) dates
            """,
            [
                reference - timedelta(days=high),
                reference - timedelta(days=low),
                reference - timedelta(days=high),
                reference - timedelta(days=low),
                SECOND_PURCHASE_DAYS,
                _tz(),
                _tz(),
                *customers_params,
            ],
        )
        cohort, reached = cursor.fetchone()
    return _pct(reached, cohort), cohort


def second_purchase_trend(customers, month_keys):
    """second_purchase_90d at the end of each Jalali month (from the stored first/second purchase dates)."""
    if not month_keys:
        return []
    customers_sql, customers_params = _sql_of(customers)
    low, high = SECOND_PURCHASE_COHORT_DAYS
    refs = [(key, jalali_month_end(key)) for key in month_keys]
    values = ", ".join(["(%s, %s::date)"] * len(refs))
    with connection.cursor() as cursor:
        cursor.execute(
            f"""
            SELECT refs.month,
                   COUNT(*) FILTER (WHERE d1 BETWEEN refs.ref - %s AND refs.ref - %s),
                   COUNT(*) FILTER (WHERE d1 BETWEEN refs.ref - %s AND refs.ref - %s AND d2 IS NOT NULL AND d2 - d1 <= %s)
            FROM (VALUES {values}) AS refs(month, ref)
            CROSS JOIN ({_local_dates_sql(customers_sql)}) dates
            GROUP BY refs.month
            """,
            [high, low, high, low, SECOND_PURCHASE_DAYS, *[item for pair in refs for item in pair], _tz(), _tz(), *customers_params],
        )
        by_month = {month: _pct(reached, cohort) if cohort else None for month, cohort, reached in cursor.fetchall()}
    return [by_month.get(key) for key in month_keys]


def second_purchase_funnel(customers, reference):
    """First-purchase cohort of the last 12 months: % with a second purchase within 30/60/90/180 days."""
    customers_sql, customers_params = _sql_of(customers)
    start = reference - timedelta(days=FUNNEL_COHORT_DAYS - 1)
    windows_sql = ", ".join(
        f"COUNT(*) FILTER (WHERE d1 <= %s), COUNT(*) FILTER (WHERE d1 <= %s AND d2 IS NOT NULL AND d2 - d1 <= {int(w)})"
        for w in FUNNEL_WINDOWS
    )
    window_params = [item for w in FUNNEL_WINDOWS for item in (reference - timedelta(days=w), reference - timedelta(days=w))]
    with connection.cursor() as cursor:
        cursor.execute(
            f"""
            SELECT COUNT(*), {windows_sql},
                   percentile_cont(0.5) WITHIN GROUP (ORDER BY d2 - d1) FILTER (WHERE d2 IS NOT NULL)
            FROM ({_local_dates_sql(customers_sql)}) dates
            WHERE d1 BETWEEN %s AND %s
            """,
            [*window_params, _tz(), _tz(), *customers_params, start, reference],
        )
        row = cursor.fetchone()
    cohort, median = row[0], row[-1]
    steps = []
    for index, window in enumerate(FUNNEL_WINDOWS):
        eligible, reached = row[1 + index * 2], row[2 + index * 2]
        steps.append({"days": window, "eligible": eligible, "reached": reached, "pct": _pct(reached, eligible)})
    median_days = round(float(median)) if median is not None else None
    return {
        "cohort": cohort,
        "steps": steps,
        "median_days_to_second": median_days,
        "guidance": (
            f"بهترین زمان پیام تشویق خرید دوم: حدود روز {_fa(median_days)}" if median_days is not None else None
        ),
        "note": POS_HISTORY_NOTE,
    }


# --- Reactivation and recent purchases ---------------------------------------------------------


def _purchases_in_window(customers, reference):
    customers_sql, customers_params = _sql_of(customers)
    with connection.cursor() as cursor:
        cursor.execute(
            f"""
            SELECT COUNT(*) FROM ({_EVENTS_SQL}) e
            WHERE e.customer_id IN ({customers_sql})
              AND (e.created_at AT TIME ZONE %s)::date BETWEEN %s AND %s
            """,
            [*customers_params, _tz(), reference - timedelta(days=BUYERS_WINDOW_DAYS - 1), reference],
        )
        return cursor.fetchone()[0]


def _reactivated_window(customers, as_of):
    """Customers whose latest purchase (as of `as_of`) is in its last 30 days, ≥ 180 days after the one before."""
    customers_sql, customers_params = _sql_of(customers)
    start = as_of - timedelta(days=BUYERS_WINDOW_DAYS - 1)
    with connection.cursor() as cursor:
        cursor.execute(
            f"""
            WITH days AS (
                SELECT DISTINCT e.customer_id, (e.created_at AT TIME ZONE %s)::date AS d
                FROM ({_EVENTS_SQL}) e
                WHERE e.customer_id IN ({customers_sql})
            ),
            ranked AS (
                SELECT customer_id, d,
                       LAG(d) OVER (PARTITION BY customer_id ORDER BY d) AS previous,
                       ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY d DESC) AS recent
                FROM days
                WHERE d <= %s
            )
            SELECT customer_id FROM ranked
            WHERE recent = 1 AND d >= %s AND previous IS NOT NULL AND d - previous >= %s
            """,
            [_tz(), *customers_params, as_of, start, REACTIVATION_GAP_DAYS],
        )
        ids = [row[0] for row in cursor.fetchall()]
        if not ids:
            return {"count": 0, "amount": 0}
        # Net purchase in the window: online orders + signed POS lines (same basis as M).
        cursor.execute(
            f"""
            SELECT COALESCE(SUM(amount), 0) FROM (
                SELECT o.total_amount::bigint AS amount FROM orders o
                WHERE o.customer_id = ANY(%s)
                  AND o.status NOT IN ('canceled', 'failed', 'wait_for_payment')
                  AND (o.created_at AT TIME ZONE %s)::date BETWEEN %s AND %s
                UNION ALL
                SELECT ({_POS_LINE})::bigint FROM pos_sale_items i
                JOIN pos_sales s ON s.id = i.pos_sale_id
                WHERE s.customer_id = ANY(%s)
                  AND i.deleted_at IS NULL AND s.deleted_at IS NULL AND s.is_cancelled = FALSE
                  AND s.type IN ('sell', 'both', 'refund')
                  AND (s.created_at AT TIME ZONE %s)::date BETWEEN %s AND %s
            ) amounts
            """,
            [ids, _tz(), start, as_of, ids, _tz(), start, as_of],
        )
        amount = cursor.fetchone()[0]
    return {"count": len(ids), "amount": int(amount or 0)}


def reactivated(customers, reference):
    current = _reactivated_window(customers, reference)
    previous = _reactivated_window(customers, reference - timedelta(days=BUYERS_WINDOW_DAYS))
    return {
        **current,
        "previous": previous,
        "delta_count": current["count"] - previous["count"],
        "gap_days": REACTIVATION_GAP_DAYS,
    }


# --- Movement --------------------------------------------------------------------------------


def _shift_month(key, months):
    year, month = (int(part) for part in key.split("-"))
    index = year * 12 + (month - 1) - months
    return f"{index // 12:04d}-{index % 12 + 1:02d}"


@serial
def rfm_movement(params, months=1):
    from apps.customers.models import CustomerRfmSnapshot

    if months not in MOVEMENT_WINDOWS:
        months = 1
    latest = CustomerRfmSnapshot.objects.order_by("-month").values_list("month", flat=True).first()
    if latest is None:
        return {"months": months, "movement": None, "reason": "هنوز عکس ماهانه‌ای ثبت نشده است."}
    start = _shift_month(latest, months)
    if not CustomerRfmSnapshot.objects.filter(month=start).exists():
        return {
            "months": months,
            "movement": None,
            "reason": f"عکس ماهانه {month_label(start)} موجود نیست؛ برای این بازه دست‌کم دو عکس با فاصله {_fa(months)} ماه لازم است.",
        }
    customers_sql, customers_params = _sql_of(population(params, materialize=True))
    with connection.cursor() as cursor:
        cursor.execute(
            f"""
            WITH pop AS ({customers_sql}),
            cur AS (
                SELECT s.customer_id, s.segment FROM customer_rfm_snapshots s
                WHERE s.month = %s AND s.customer_id IN (SELECT * FROM pop)
            ),
            prev AS (
                SELECT s.customer_id, s.segment FROM customer_rfm_snapshots s
                WHERE s.month = %s AND s.customer_id IN (SELECT * FROM pop)
            )
            SELECT prev.segment, cur.segment, COUNT(*)
            FROM cur FULL OUTER JOIN prev ON prev.customer_id = cur.customer_id
            GROUP BY 1, 2
            """,
            [*customers_params, latest, start],
        )
        pairs = cursor.fetchall()

    rank = {key: index for index, key in enumerate(VALUE_RANK)}
    stats = {key: {"start_count": 0, "end_count": 0, "stayed": 0, "improved": 0, "declined": 0, "entered": 0, "exited": 0} for key in VALUE_RANK}
    moves, new_purchasers = [], 0
    for before, after, count in pairs:
        if before is None:
            new_purchasers += count
        if before in stats:
            stats[before]["start_count"] += count
            if after == before:
                stats[before]["stayed"] += count
            else:
                stats[before]["exited"] += count
                if after in rank and rank[after] < rank[before]:
                    stats[before]["improved"] += count
                elif after in rank:
                    stats[before]["declined"] += count
        if after in stats:
            stats[after]["end_count"] += count
            if after != before:
                stats[after]["entered"] += count
        if before in SEGMENT_LABELS and after in SEGMENT_LABELS and before != after:
            moves.append(
                {"from": before, "from_label": SEGMENT_LABELS[before], "to": after, "to_label": SEGMENT_LABELS[after], "count": count}
            )
    moves.sort(key=lambda item: (-item["count"], rank[item["from"]], rank[item["to"]]))
    segments = [
        {
            "key": key,
            "label": SEGMENT_LABELS[key],
            **{name: value for name, value in stats[key].items()},
            "stayed_pct": _pct(stats[key]["stayed"], stats[key]["start_count"]),
            "net": stats[key]["end_count"] - stats[key]["start_count"],
        }
        for key in VALUE_RANK
    ]
    return {
        "months": months,
        "movement": {
            "month": latest,
            "month_label": month_label(latest),
            "start_month": start,
            "start_month_label": month_label(start),
            "moves": moves[:10],
            "segments": segments,
            "new_purchasers": new_purchasers,
        },
        "reason": None,
    }


# --- Call list -------------------------------------------------------------------------------

CALL_LIST_HEADERS = [
    "نام و نام خانوادگی",
    "موبایل",
    "سگمنت",
    "روز از آخرین خرید",
    "میانگین فاصله خرید (روز)",
    "روز تأخیر",
    "تعداد خرید",
    "خرید خالص (تومان)",
    "آخرین شعبه/کانال",
]


def call_list_queryset(params):
    from apps.customers.models import CustomerRfm

    rows = CustomerRfm.objects.filter(
        customer_id__in=population(params), is_overdue=True, days_since_last_purchase__lte=CALL_LIST_MAX_DAYS
    )
    segment = (params.get("segment") or "").strip()
    if segment in SEGMENT_LABELS:
        rows = rows.filter(segment=segment)
    return rows.select_related("customer").order_by("-lifetime_amount", "customer_id")


def _last_sales_lines(customer_ids):
    """Sales line of each customer's latest purchase (online order or POS sell)."""
    from apps.sales.models import SalesLine
    from apps.sales.semantics import SALES_LINE_LABELS

    if not customer_ids:
        return {}
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT DISTINCT ON (customer_id) customer_id, line FROM (
                SELECT customer_id, created_at, %s AS line FROM orders
                WHERE customer_id = ANY(%s) AND status NOT IN ('canceled', 'failed', 'wait_for_payment')
                UNION ALL
                SELECT customer_id, created_at, sales_line FROM pos_sales
                WHERE customer_id = ANY(%s) AND deleted_at IS NULL AND is_cancelled = FALSE AND type = 'sell'
            ) purchases
            ORDER BY customer_id, created_at DESC
            """,
            [SalesLine.ONLINE.value, list(customer_ids), list(customer_ids)],
        )
        return {customer_id: SALES_LINE_LABELS.get(line, line or "—") for customer_id, line in cursor.fetchall()}


def call_list_rows(rfm_rows):
    lines = _last_sales_lines([row.customer_id for row in rfm_rows])
    result = []
    for row in rfm_rows:
        customer = row.customer
        result.append(
            {
                "source_id": customer.source_id,
                "name": (customer.full_name or "").strip(),
                "mobile": customer.mobile or "",
                "segment": row.segment,
                "segment_label": SEGMENT_LABELS.get(row.segment, row.segment),
                "days_since_last_purchase": row.days_since_last_purchase,
                "avg_interval_days": round(row.avg_interval_days, 1) if row.avg_interval_days is not None else None,
                "days_late": _days_late(row),
                "purchase_count": row.purchase_count,
                "lifetime_amount": row.lifetime_amount,
                "last_sales_line": lines.get(row.customer_id, "—"),
            }
        )
    return result


@serial
def call_list_page(params, page=1, per_page=20):
    rows = call_list_queryset(params)
    total = rows.count()
    start = (page - 1) * per_page
    return {"page": page, "per_page": per_page, "total": total, "results": call_list_rows(list(rows[start : start + per_page]))}


def call_list_csv_cells(item):
    return [
        item["name"],
        item["mobile"],
        item["segment_label"],
        item["days_since_last_purchase"],
        item["avg_interval_days"] if item["avg_interval_days"] is not None else "",
        item["days_late"] if item["days_late"] is not None else "",
        item["purchase_count"],
        item["lifetime_amount"],
        item["last_sales_line"],
    ]
