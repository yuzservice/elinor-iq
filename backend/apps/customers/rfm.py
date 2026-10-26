"""Customer RFM: a separate analytical layer, independent of loyalty tiers.

R = days since last purchase, F = purchase count, M = customer net purchase
(«خرید خالص مشتری»), all over the full history and taken from the tier facts
CTE in tiers.py (same purchase definitions, operator accounts excluded).
M is not sales revenue: never mix it into sales reports (apps/sales/semantics.py).

Thresholds are fixed constants and provisional until the distribution is reviewed.
"""

import logging
from datetime import datetime, time, timedelta

import jdatetime
from django.db import connection, transaction
from django.utils import timezone

from apps.customers.tiers import _facts_sql, _reference

logger = logging.getLogger(__name__)

# Score 5..2 lower bounds; anything below the last bound scores 1.
R_MAX_DAYS = ((5, 30), (4, 90), (3, 180), (2, 365))  # days <= bound (negative days score 5)
F_MIN_COUNT = ((5, 6), (4, 4), (3, 3), (2, 2))  # purchases >= bound
M_MIN_AMOUNT = ((5, 20_000_000), (4, 10_000_000), (3, 5_000_000), (2, 2_000_000))  # amount >= bound
HIGH_VALUE_MIN_M = 4
WINDOW_DAYS = 365

SEGMENTS = (
    ("champions", "قهرمانان", ((5, 5), (5, 4), (4, 5)), "قدردانی و دسترسی زودتر به کالکشن جدید"),
    ("loyal", "وفاداران", ((4, 4), (3, 4), (3, 5)), "حفظ رابطه با پیشنهاد شخصی"),
    ("potential", "وفادار بالقوه", ((5, 3), (5, 2), (4, 3), (4, 2)), "تشویق به خرید بعدی"),
    ("new", "تازه‌واردها", ((5, 1), (4, 1)), "خوش‌آمد و تشویق به خرید دوم"),
    ("attention", "نیازمند توجه", ((3, 3), (3, 2), (3, 1)), "یادآوری و معرفی کالای جدید"),
    ("at_risk", "در خطر", ((2, 4), (2, 3), (1, 4), (1, 3)), "تماس یا هدیه بازگشت"),
    ("cant_lose", "نباید از دست برود", ((2, 5), (1, 5)), "تماس شخصی مدیر فروشگاه"),
    ("hibernating", "خواب / از دست رفته", ((2, 2), (2, 1), (1, 2), (1, 1)), "کمپین فصلی کم‌هزینه"),
)
SEGMENT_ORDER = tuple(key for key, _label, _cells, _action in SEGMENTS)
SEGMENT_LABELS = {key: label for key, label, _cells, _action in SEGMENTS}
SEGMENT_ACTIONS = {key: action for key, _label, _cells, action in SEGMENTS}
SEGMENT_BY_CELL = {cell: key for key, _label, cells, _action in SEGMENTS for cell in cells}
AT_RISK_SEGMENTS = ("at_risk", "cant_lose")

AMOUNT_LABEL = "خرید خالص مشتری"
COVERAGE_NOTE = (
    "تاریخچه فروش حضوری از ۱۴۰۴/۰۳/۱۰ و فروش آنلاین از ۱۴۰۰/۱۰/۲۲ در دسترس است؛ "
    "تعداد خرید و خرید خالص مشتریانی که پیش از آن حضوری خرید کرده‌اند کمتر از واقعیت است."
)
EXCHANGE_NOTE = "خرید تعویضی در تعداد خرید شمرده نمی‌شود؛ اثر مبلغی آن در خرید خالص لحاظ می‌شود."
STATUS_CURSOR_KEY = "customer_rfm"

# Internal-account detection (flags only; a super admin confirms from Customer 360). Each fired signal adds 1.
INTERNAL_SIGNAL_THRESHOLDS = {
    "high_frequency_percentile": 0.995,  # purchase_count_12m at or above this percentile of purchasers
    "many_receivers": 5,  # distinct online receiver names other than the account holder
    "many_cities": 3,  # distinct online receiver cities
    "same_day_burst": 3,  # purchases on one local day (online + POS sell)
    "many_branches": 3,  # distinct POS sales lines
}
SUSPECTED_MIN_SCORE = 3
_FA_DIGITS = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")
SIGNAL_TEXTS = {
    "high_frequency": "{value} خرید در ۱۲ ماه (بالاتر از ۹۹٫۵٪ مشتریان)",
    "many_receivers": "{value} گیرنده‌ی مختلف",
    "many_cities": "ارسال به {value} شهر",
    "same_day_burst": "{value} خرید در یک روز",
    "many_branches": "خرید از {value} شعبه",
}


# --- Scoring ---------------------------------------------------------------------------------


def r_score(days):
    for score, bound in R_MAX_DAYS:
        if days <= bound:
            return score
    return 1


def f_score(count):
    for score, bound in F_MIN_COUNT:
        if count >= bound:
            return score
    return 1


def m_score(amount):
    for score, bound in M_MIN_AMOUNT:
        if amount >= bound:
            return score
    return 1


def segment_for(r, f):
    return SEGMENT_BY_CELL[(r, f)]


def _case(column, pairs, operator):
    whens = " ".join(f"WHEN {column} {operator} {int(bound)} THEN {int(score)}" for score, bound in pairs)
    return f"CASE {whens} ELSE 1 END"


R_SQL = _case("days_since_last_purchase", R_MAX_DAYS, "<=")
F_SQL = _case("purchase_count", F_MIN_COUNT, ">=")
M_SQL = _case("lifetime_purchase_amount", M_MIN_AMOUNT, ">=")
SEGMENT_SQL = "CASE " + " ".join(
    f"WHEN (r, f) IN ({', '.join(f'({int(r)}, {int(f)})' for r, f in cells)}) THEN '{key}'"
    for key, _label, cells, _action in SEGMENTS
) + " END"


def thresholds_payload():
    return {
        "r_max_days": [{"score": score, "max_days": bound} for score, bound in R_MAX_DAYS],
        "f_min_count": [{"score": score, "min_count": bound} for score, bound in F_MIN_COUNT],
        "m_min_amount": [{"score": score, "min_amount": bound} for score, bound in M_MIN_AMOUNT],
        "high_value_min_m": HIGH_VALUE_MIN_M,
        "window_days": WINDOW_DAYS,
    }


# --- Facts -----------------------------------------------------------------------------------

# Injections into the tier facts CTE (tiers._FACTS_CTE): 12-month columns and an optional as_of bound.
_ONLINE_SELECT = "           COALESCE(SUM(total_amount), 0)::bigint AS amount\n    FROM orders"
_ONLINE_WHERE = "      AND status NOT IN ('canceled', 'failed', 'wait_for_payment')\n    GROUP BY customer_id"
_SELLS_SELECT = "           MAX(created_at) AS last_at\n    FROM pos_sales"
_SELLS_WHERE = "      AND type = 'sell'\n    GROUP BY customer_id"
_POS_SELECT = "           ), 0)::bigint AS amount\n    FROM pos_sale_items i"
_POS_WHERE = "      AND s.type IN ('sell', 'both', 'refund')\n    GROUP BY s.customer_id"
_FACTS_SELECT = "        (COALESCE(o.amount, 0) + COALESCE(p.amount, 0))::bigint AS lifetime_purchase_amount,"
_POS_LINE = """CASE
                   WHEN s.type = 'sell' THEN i.amount * i.quantity
                   WHEN s.type = 'both' AND i.type = 'sell' THEN i.amount * i.quantity
                   WHEN s.type = 'both' AND i.type = 'refund' THEN -(i.amount * i.quantity)
                   WHEN s.type = 'refund' AND i.type = 'refund' THEN -(i.amount * i.quantity)
                   ELSE 0
               END"""


def _local_midnight(day):
    return timezone.make_aware(datetime.combine(day, time.min), timezone.get_current_timezone())


def rfm_facts_sql(as_of=None):
    """The tier facts CTE plus purchase_count_12m / amount_12m, optionally bounded at as_of.

    Without as_of the purchase set is identical to the tier facts (reference = today).
    With as_of, only purchases with local date <= as_of count and days are relative to as_of.
    Returns (sql, params).
    """
    sql, exclusion = _facts_sql()
    reference = _reference(as_of)
    window_start = _local_midnight(reference - timedelta(days=WINDOW_DAYS - 1))
    bound = _local_midnight(reference + timedelta(days=1)) if as_of else None

    def swap(text, anchor, new):
        if text.count(anchor) != 1:
            raise RuntimeError(f"RFM facts: the tier facts CTE changed; anchor not found exactly once: {anchor!r}")
        return text.replace(anchor, new)

    bound_online = "\n      AND created_at < %s" if bound else ""
    bound_pos = "\n      AND s.created_at < %s" if bound else ""
    sql = swap(
        sql,
        _ONLINE_SELECT,
        "           COALESCE(SUM(total_amount), 0)::bigint AS amount,\n"
        "           COUNT(*) FILTER (WHERE created_at >= %s)::int AS count_12m,\n"
        "           COALESCE(SUM(total_amount) FILTER (WHERE created_at >= %s), 0)::bigint AS amount_12m\n"
        "    FROM orders",
    )
    sql = swap(
        sql,
        _ONLINE_WHERE,
        f"      AND status NOT IN ('canceled', 'failed', 'wait_for_payment'){bound_online}\n    GROUP BY customer_id",
    )
    sql = swap(
        sql,
        _SELLS_SELECT,
        "           MAX(created_at) AS last_at,\n"
        "           COUNT(*) FILTER (WHERE created_at >= %s)::int AS count_12m\n"
        "    FROM pos_sales",
    )
    sql = swap(sql, _SELLS_WHERE, f"      AND type = 'sell'{bound_online}\n    GROUP BY customer_id")
    sql = swap(
        sql,
        _POS_SELECT,
        "           ), 0)::bigint AS amount,\n"
        f"           COALESCE(SUM({_POS_LINE}) FILTER (WHERE s.created_at >= %s), 0)::bigint AS amount_12m\n"
        "    FROM pos_sale_items i",
    )
    sql = swap(sql, _POS_WHERE, f"      AND s.type IN ('sell', 'both', 'refund'){bound_pos}\n    GROUP BY s.customer_id")
    sql = swap(
        sql,
        _FACTS_SELECT,
        _FACTS_SELECT
        + "\n        (COALESCE(o.count_12m, 0) + COALESCE(s.count_12m, 0))::int AS purchase_count_12m,"
        + "\n        (COALESCE(o.amount_12m, 0) + COALESCE(p.amount_12m, 0))::bigint AS amount_12m,",
    )

    bound_params = [bound] if bound else []
    params = [
        window_start,
        window_start,
        *bound_params,  # online
        window_start,
        *bound_params,  # sells
        window_start,
        *bound_params,  # pos_amount
        reference,
        timezone.get_current_timezone_name(),
        *exclusion,
    ]
    return sql, params


def _scored_sql(as_of=None):
    facts_sql, params = rfm_facts_sql(as_of)
    sql = f"""
        {facts_sql},
        scored AS (
            SELECT customer_id, purchase_count, days_since_last_purchase, lifetime_purchase_amount,
                   purchase_count_12m, amount_12m,
                   {R_SQL} AS r, {F_SQL} AS f, {M_SQL} AS m
            FROM facts
            WHERE purchase_count > 0 AND days_since_last_purchase IS NOT NULL
        )
    """
    return sql, params


# --- Refresh and snapshots -------------------------------------------------------------------


def refresh_rfm():
    """Upsert one customer_rfm row per purchasing, non-operator customer; drop the rest. Idempotent."""
    scored_sql, params = _scored_sql()
    run_at = timezone.now()
    with transaction.atomic(), connection.cursor() as cursor:
        cursor.execute(
            f"""
            {scored_sql}
            INSERT INTO customer_rfm (
                customer_id, r_score, f_score, m_score, segment, purchase_count, days_since_last_purchase,
                lifetime_amount, purchase_count_12m, amount_12m, internal_signal_score, internal_signals,
                first_purchase_at, second_purchase_at, avg_interval_days, is_overdue, computed_at
            )
            SELECT customer_id, r, f, m, {SEGMENT_SQL}, purchase_count, days_since_last_purchase,
                   lifetime_purchase_amount, purchase_count_12m, amount_12m, 0, '[]'::jsonb,
                   NULL, NULL, NULL, FALSE, %s
            FROM scored
            ON CONFLICT (customer_id) DO UPDATE SET
                r_score = EXCLUDED.r_score,
                f_score = EXCLUDED.f_score,
                m_score = EXCLUDED.m_score,
                segment = EXCLUDED.segment,
                purchase_count = EXCLUDED.purchase_count,
                days_since_last_purchase = EXCLUDED.days_since_last_purchase,
                lifetime_amount = EXCLUDED.lifetime_amount,
                purchase_count_12m = EXCLUDED.purchase_count_12m,
                amount_12m = EXCLUDED.amount_12m,
                computed_at = EXCLUDED.computed_at
            """,
            params + [run_at],
        )
        written = cursor.rowcount
        # Rows not touched above (no longer purchasing, or now an operator account).
        cursor.execute("DELETE FROM customer_rfm WHERE computed_at < %s", [run_at])
        _write_purchase_stats(cursor)
        _write_internal_signals(cursor)
    return written


# Purchase events on the RFM basis: qualifying online orders + POS sells (same as purchase_count).
_EVENTS_SQL = """
    SELECT o.customer_id, o.created_at FROM orders o
    WHERE o.customer_id IS NOT NULL AND o.status NOT IN ('canceled', 'failed', 'wait_for_payment')
    UNION ALL
    SELECT s.customer_id, s.created_at FROM pos_sales s
    WHERE s.customer_id IS NOT NULL AND s.deleted_at IS NULL AND s.is_cancelled = FALSE AND s.type = 'sell'
"""
OVERDUE_FACTOR = 1.5


def _write_purchase_stats(cursor):
    """First/second purchase, average interval and overdue flag for every customer_rfm row (window functions)."""
    cursor.execute(
        f"""
        WITH events AS (
            SELECT e.customer_id, e.created_at,
                   ROW_NUMBER() OVER (PARTITION BY e.customer_id ORDER BY e.created_at) AS n
            FROM ({_EVENTS_SQL}) e
            JOIN customer_rfm r ON r.customer_id = e.customer_id
        ),
        stats AS (
            SELECT customer_id,
                   MIN(created_at) AS first_at,
                   MAX(created_at) FILTER (WHERE n = 2) AS second_at,
                   MAX(created_at) AS last_at,
                   COUNT(*) AS purchases
            FROM events
            GROUP BY customer_id
        ),
        computed AS (
            SELECT customer_id, first_at, second_at,
                   CASE WHEN purchases >= 2 THEN
                       ((last_at AT TIME ZONE %s)::date - (first_at AT TIME ZONE %s)::date)::float / (purchases - 1)
                   END AS interval_days
            FROM stats
        )
        UPDATE customer_rfm r
        SET first_purchase_at = computed.first_at,
            second_purchase_at = computed.second_at,
            avg_interval_days = computed.interval_days,
            is_overdue = (
                r.purchase_count >= 2
                AND computed.interval_days > 0
                AND r.days_since_last_purchase > %s * computed.interval_days
            )
        FROM computed
        WHERE computed.customer_id = r.customer_id
        """,
        [timezone.get_current_timezone_name(), timezone.get_current_timezone_name(), OVERDUE_FACTOR],
    )


def _normalized(expression):
    """SQL to compare names: trim, collapse spaces, Arabic ي/ك as Persian ی/ک, case-insensitive."""
    return f"lower(regexp_replace(translate(btrim({expression}), 'يك', 'یک'), '\\s+', ' ', 'g'))"


def _write_internal_signals(cursor):
    """Score internal-account signals for every customer_rfm row (internal accounts have no row)."""
    t = INTERNAL_SIGNAL_THRESHOLDS
    receiver = _normalized(
        "COALESCE(NULLIF(btrim(COALESCE(o.receiver_first_name, '') || ' ' || COALESCE(o.receiver_last_name, '')), ''), o.receiver, '')"
    )
    holder = _normalized("COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')")
    city = _normalized("COALESCE(o.receiver_city, '')")
    cursor.execute(
        f"""
        WITH limits AS (
            SELECT percentile_cont(%s) WITHIN GROUP (ORDER BY purchase_count_12m) AS p_count FROM customer_rfm
        ),
        online AS (
            SELECT o.customer_id,
                   COUNT(DISTINCT {receiver}) FILTER (WHERE {receiver} <> '' AND {receiver} <> {holder}) AS receivers,
                   COUNT(DISTINCT {city}) FILTER (WHERE {city} <> '') AS cities
            FROM orders o
            JOIN customer_rfm r ON r.customer_id = o.customer_id
            JOIN customers c ON c.id = o.customer_id
            WHERE o.status NOT IN ('canceled', 'failed', 'wait_for_payment')
            GROUP BY o.customer_id
        ),
        days AS (
            SELECT customer_id, MAX(n) AS burst
            FROM (
                SELECT customer_id, (created_at AT TIME ZONE %s)::date AS day, COUNT(*) AS n
                FROM (
                    SELECT o.customer_id, o.created_at FROM orders o
                    JOIN customer_rfm r ON r.customer_id = o.customer_id
                    WHERE o.status NOT IN ('canceled', 'failed', 'wait_for_payment')
                    UNION ALL
                    SELECT s.customer_id, s.created_at FROM pos_sales s
                    JOIN customer_rfm r ON r.customer_id = s.customer_id
                    WHERE s.deleted_at IS NULL AND s.is_cancelled = FALSE AND s.type = 'sell'
                ) purchases
                GROUP BY 1, 2
            ) per_day
            GROUP BY customer_id
        ),
        branches AS (
            SELECT s.customer_id, COUNT(DISTINCT s.sales_line) AS lines
            FROM pos_sales s
            JOIN customer_rfm r ON r.customer_id = s.customer_id
            WHERE s.deleted_at IS NULL AND s.is_cancelled = FALSE AND s.type = 'sell' AND COALESCE(s.sales_line, '') <> ''
            GROUP BY s.customer_id
        ),
        fired AS (
            SELECT r.customer_id, v.key, v.value
            FROM customer_rfm r
            CROSS JOIN limits
            LEFT JOIN online ON online.customer_id = r.customer_id
            LEFT JOIN days ON days.customer_id = r.customer_id
            LEFT JOIN branches ON branches.customer_id = r.customer_id
            CROSS JOIN LATERAL (VALUES
                ('high_frequency', r.purchase_count_12m, r.purchase_count_12m > 0 AND r.purchase_count_12m >= limits.p_count),
                ('many_receivers', COALESCE(online.receivers, 0), COALESCE(online.receivers, 0) >= %s),
                ('many_cities', COALESCE(online.cities, 0), COALESCE(online.cities, 0) >= %s),
                ('same_day_burst', COALESCE(days.burst, 0), COALESCE(days.burst, 0) >= %s),
                ('many_branches', COALESCE(branches.lines, 0), COALESCE(branches.lines, 0) >= %s)
            ) AS v(key, value, hit)
            WHERE v.hit
        ),
        scored AS (
            SELECT customer_id, COUNT(*)::int AS score,
                   jsonb_agg(jsonb_build_object('key', key, 'value', value) ORDER BY key) AS signals
            FROM fired
            GROUP BY customer_id
        )
        UPDATE customer_rfm r
        SET internal_signal_score = COALESCE(scored.score, 0),
            internal_signals = COALESCE(scored.signals, '[]'::jsonb)
        FROM customer_rfm base
        LEFT JOIN scored ON scored.customer_id = base.customer_id
        WHERE base.customer_id = r.customer_id
          AND (r.internal_signal_score IS DISTINCT FROM COALESCE(scored.score, 0)
               OR r.internal_signals IS DISTINCT FROM COALESCE(scored.signals, '[]'::jsonb))
        """,
        [
            t["high_frequency_percentile"],
            timezone.get_current_timezone_name(),
            t["many_receivers"],
            t["many_cities"],
            t["same_day_burst"],
            t["many_branches"],
        ],
    )


def signal_texts(signals):
    return [
        {**signal, "text": SIGNAL_TEXTS.get(signal.get("key"), "{value}").format(value=str(signal.get("value")).translate(_FA_DIGITS))}
        for signal in signals or []
    ]


def internal_suspected(rfm, is_internal=False):
    return bool(rfm is not None and not is_internal and rfm.internal_signal_score >= SUSPECTED_MIN_SCORE)


def internal_signals_payload(customer):
    """{score, signals[]} for Customer 360 (super admins), or None without an RFM row."""
    from apps.customers.models import CustomerRfm

    rfm = CustomerRfm.objects.filter(customer=customer).only("internal_signal_score", "internal_signals").first()
    if rfm is None:
        return None
    return {
        "score": rfm.internal_signal_score,
        "suspected": rfm.internal_signal_score >= SUSPECTED_MIN_SCORE,
        "signals": signal_texts(rfm.internal_signals),
    }


def jalali_month_key(day):
    jalali = jdatetime.date.fromgregorian(date=day)
    return f"{jalali.year:04d}-{jalali.month:02d}"


def jalali_month_end(key):
    """Gregorian date of the last day of a Jalali month key such as "1405-08"."""
    year, month = (int(part) for part in key.split("-"))
    next_year, next_month = (year + 1, 1) if month == 12 else (year, month + 1)
    return jdatetime.date(next_year, next_month, 1).togregorian() - timedelta(days=1)


def previous_month_keys(today, months):
    """Keys of the `months` complete Jalali months before today's month, newest first."""
    keys = []
    jalali = jdatetime.date.fromgregorian(date=today)
    year, month = jalali.year, jalali.month
    for _ in range(months):
        year, month = (year - 1, 12) if month == 1 else (year, month - 1)
        keys.append(f"{year:04d}-{month:02d}")
    return keys


def write_snapshot(month_key, rebuild=False):
    """Write the snapshot of a Jalali month (as_of = its last day).

    Returns None for a month that exists, unless `rebuild` refills it in place (idempotent upsert).
    """
    from apps.customers.models import CustomerRfmSnapshot

    if not rebuild and CustomerRfmSnapshot.objects.filter(month=month_key).exists():
        return None
    scored_sql, params = _scored_sql(as_of=jalali_month_end(month_key))
    on_conflict = (
        """DO UPDATE SET r_score = EXCLUDED.r_score, f_score = EXCLUDED.f_score, m_score = EXCLUDED.m_score,
               segment = EXCLUDED.segment, purchase_count = EXCLUDED.purchase_count,
               purchase_count_12m = EXCLUDED.purchase_count_12m, amount_12m = EXCLUDED.amount_12m,
               lifetime_amount = EXCLUDED.lifetime_amount, days_since_last_purchase = EXCLUDED.days_since_last_purchase"""
        if rebuild
        else "DO NOTHING"
    )
    with transaction.atomic(), connection.cursor() as cursor:
        cursor.execute(
            f"""
            {scored_sql}
            INSERT INTO customer_rfm_snapshots (
                month, customer_id, r_score, f_score, m_score, segment, purchase_count, purchase_count_12m,
                amount_12m, lifetime_amount, days_since_last_purchase, created_at
            )
            SELECT %s, customer_id, r, f, m, {SEGMENT_SQL}, purchase_count, purchase_count_12m,
                   amount_12m, lifetime_purchase_amount, days_since_last_purchase, NOW()
            FROM scored
            ON CONFLICT (month, customer_id) {on_conflict}
            """,
            params + [month_key],
        )
        return cursor.rowcount


def refresh_rfm_daily(today=None):
    """Refresh RFM and, on the first run in a new Jalali month, snapshot the month that just ended.

    Called right after the tier refresh. Failures are logged and recorded, never raised.
    """
    from apps.integrations.elinor.models import SyncCursor

    today = today or timezone.localdate()
    status = {"computed_at": None, "error": "", "snapshot": None}
    try:
        status["rows"] = refresh_rfm()
        status["computed_at"] = timezone.now().isoformat()
        month = previous_month_keys(today, 1)[0]
        written = write_snapshot(month)
        status["snapshot"] = {"month": month, "written": written}
    except Exception as exc:
        logger.exception("Customer RFM refresh failed")
        status["error"] = str(exc)[:500] or exc.__class__.__name__
    cursor, _created = SyncCursor.objects.get_or_create(key=STATUS_CURSOR_KEY, defaults={"value": {}})
    value = dict(cursor.value or {})
    value.update({key: item for key, item in status.items() if item is not None})
    cursor.value = value
    cursor.save(update_fields=["value", "updated_at"])
    return not status["error"]


def backfill_snapshots(months=12, today=None, rebuild=False):
    """Snapshots for the last `months` complete Jalali months. Existing months are skipped unless `rebuild`."""
    today = today or timezone.localdate()
    return {key: write_snapshot(key, rebuild=rebuild) for key in reversed(previous_month_keys(today, months))}


# --- Read models -----------------------------------------------------------------------------


def segment_payload(segment):
    if not segment:
        return None
    return {"key": segment, "label": SEGMENT_LABELS.get(segment, segment), "action": SEGMENT_ACTIONS.get(segment, "")}


def row_payload(rfm):
    """Per-customer list fields; None when the customer has no RFM (no purchase or operator)."""
    if rfm is None:
        return {"rfm_segment": None, "rfm_segment_label": None, "r_score": None, "f_score": None, "m_score": None, "high_value": False}
    return {
        "rfm_segment": rfm.segment,
        "rfm_segment_label": SEGMENT_LABELS.get(rfm.segment, rfm.segment),
        "r_score": rfm.r_score,
        "f_score": rfm.f_score,
        "m_score": rfm.m_score,
        "high_value": rfm.m_score >= HIGH_VALUE_MIN_M,
    }


def customer_rfm_payload(customer):
    """RFM block for Customer 360, or None when the customer has no RFM row."""
    from apps.customers.models import CustomerRfm, CustomerRfmSnapshot

    rfm = CustomerRfm.objects.filter(customer=customer).first()
    if rfm is None:
        return None
    count = rfm.purchase_count
    interval = round(rfm.avg_interval_days, 1) if rfm.avg_interval_days is not None else None
    history = [
        {"month": row.month, "segment": row.segment, "label": SEGMENT_LABELS.get(row.segment, row.segment), "r_score": row.r_score, "f_score": row.f_score, "m_score": row.m_score}
        for row in CustomerRfmSnapshot.objects.filter(customer=customer).order_by("-month")[:12]
    ]
    return {
        "r_score": rfm.r_score,
        "f_score": rfm.f_score,
        "m_score": rfm.m_score,
        "high_value": rfm.m_score >= HIGH_VALUE_MIN_M,
        "segment": segment_payload(rfm.segment),
        "purchase_count": count,
        "days_since_last_purchase": rfm.days_since_last_purchase,
        "lifetime_amount": rfm.lifetime_amount,
        "purchase_count_12m": rfm.purchase_count_12m,
        "amount_12m": rfm.amount_12m,
        "avg_order_amount": round(rfm.lifetime_amount / count) if count else None,
        "avg_days_between_purchases": interval,
        "overdue": rfm.is_overdue,
        "days_late": _days_late(rfm),
        "first_purchase_at": rfm.first_purchase_at,
        "second_purchase_at": rfm.second_purchase_at,
        "history": list(reversed(history)),
        "computed_at": rfm.computed_at,
        "amount_label": AMOUNT_LABEL,
    }


def rfm_summary(params):
    """Kept for callers of Stage 1; the report lives in apps.customers.rfm_reports."""
    from apps.customers.rfm_reports import rfm_summary as build

    return build(params)


def _days_late(rfm):
    """Days past the customer's usual interval («روز تأخیر»); None without an interval."""
    if rfm.avg_interval_days is None:
        return None
    return round(rfm.days_since_last_purchase - rfm.avg_interval_days)


def _pct(part, whole):
    return round(100 * part / whole, 1) if whole else 0.0


def _round(value):
    return round(float(value), 1) if value is not None else None


def _internal_accounts_count():
    from apps.customers.models import InternalAccount

    return InternalAccount.objects.filter(is_active=True).count()
