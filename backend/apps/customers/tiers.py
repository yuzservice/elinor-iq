"""Exclusive customer tiers.

These rules belong to customer segmentation only. They do not change sales
qualifying purchases, sales reports, or POS exchange counting outside this module.
"""

from django.db.models import Count, IntegerField, Max, Min, OuterRef, Subquery, Sum
from django.db.models.expressions import RawSQL
from django.db.models.functions import Coalesce, Greatest
from django.utils import timezone

from apps.sales.models import Order, PosSale, PosSaleItem

TIER_ONLINE_EXCLUDED_STATUSES = ("canceled", "failed", "wait_for_payment")
TIER_POS_SELL = "sell"
TIER_POS_EXCHANGE = "both"
TIER_POS_REFUND = "refund"

TIER_LABELS = {
    "VIP": "VIP",
    "DIAMOND": "الماس",
    "GOLD_1": "طلایی سطح ۱",
    "GOLD_2": "طلایی سطح ۲",
    "SILVER": "نقره‌ای",
    "BRONZE_1": "برنزی سطح ۱",
    "BRONZE_2": "برنزی سطح ۲",
    "BRONZE_3": "برنزی سطح ۳",
}

VIP_AMOUNT = 10_000_000
DIAMOND_AMOUNT = 5_000_000
YEAR_DAYS = 365
SIX_MONTH_DAYS = 180

_FACTS_CTE = """
WITH online AS (
    SELECT customer_id,
           COUNT(*)::int AS purchase_count,
           MIN(created_at) AS first_at,
           MAX(created_at) AS last_at,
           COALESCE(SUM(total_amount), 0)::bigint AS amount
    FROM orders
    WHERE customer_id IS NOT NULL
      AND status NOT IN ('canceled', 'failed', 'wait_for_payment')
    GROUP BY customer_id
),
sells AS (
    SELECT customer_id,
           COUNT(*)::int AS purchase_count,
           MIN(created_at) AS first_at,
           MAX(created_at) AS last_at
    FROM pos_sales
    WHERE customer_id IS NOT NULL
      AND deleted_at IS NULL
      AND is_cancelled = FALSE
      AND type = 'sell'
    GROUP BY customer_id
),
pos_amount AS (
    SELECT s.customer_id,
           COALESCE(SUM(
               CASE
                   WHEN s.type = 'sell' THEN i.amount * i.quantity
                   WHEN s.type = 'both' AND i.type = 'sell' THEN i.amount * i.quantity
                   WHEN s.type = 'both' AND i.type = 'refund' THEN -(i.amount * i.quantity)
                   WHEN s.type = 'refund' AND i.type = 'refund' THEN -(i.amount * i.quantity)
                   ELSE 0
               END
           ), 0)::bigint AS amount
    FROM pos_sale_items i
    JOIN pos_sales s ON s.id = i.pos_sale_id
    WHERE i.deleted_at IS NULL
      AND s.deleted_at IS NULL
      AND s.is_cancelled = FALSE
      AND s.customer_id IS NOT NULL
      AND s.type IN ('sell', 'both', 'refund')
    GROUP BY s.customer_id
),
facts AS (
    SELECT
        c.id AS customer_id,
        (COALESCE(o.purchase_count, 0) + COALESCE(s.purchase_count, 0))::int AS purchase_count,
        CASE
            WHEN o.first_at IS NULL THEN s.first_at
            WHEN s.first_at IS NULL THEN o.first_at
            ELSE LEAST(o.first_at, s.first_at)
        END AS first_purchase_at,
        GREATEST(o.last_at, s.last_at) AS last_purchase_at,
        (COALESCE(o.amount, 0) + COALESCE(p.amount, 0))::bigint AS lifetime_purchase_amount,
        CASE
            WHEN GREATEST(o.last_at, s.last_at) IS NULL THEN NULL
            ELSE (%s::date - (GREATEST(o.last_at, s.last_at) AT TIME ZONE %s)::date)
        END AS days_since_last_purchase
    FROM customers c
    LEFT JOIN online o ON o.customer_id = c.id
    LEFT JOIN sells s ON s.customer_id = c.id
    LEFT JOIN pos_amount p ON p.customer_id = c.id
)
"""

_TIER_CASE = """
CASE
    WHEN purchase_count <= 0 OR days_since_last_purchase IS NULL THEN NULL
    WHEN purchase_count >= 4 AND days_since_last_purchase <= 45 AND lifetime_purchase_amount >= 10000000 THEN 'VIP'
    WHEN purchase_count >= 3 AND days_since_last_purchase <= 90 AND lifetime_purchase_amount >= 5000000 THEN 'DIAMOND'
    WHEN purchase_count >= 4 AND days_since_last_purchase >= 90 AND days_since_last_purchase <= 365 AND lifetime_purchase_amount >= 10000000 THEN 'GOLD_1'
    WHEN purchase_count >= 2 AND days_since_last_purchase <= 90 THEN 'GOLD_2'
    WHEN purchase_count >= 1 AND days_since_last_purchase >= 30 AND days_since_last_purchase <= 90 THEN 'SILVER'
    WHEN purchase_count >= 1 AND days_since_last_purchase <= 30 THEN 'BRONZE_1'
    WHEN days_since_last_purchase >= 90 AND days_since_last_purchase < 180 THEN 'BRONZE_2'
    WHEN days_since_last_purchase >= 180 THEN 'BRONZE_3'
    ELSE NULL
END
"""


def application_today():
    return timezone.localdate()


def tier_label(code):
    if not code:
        return None
    return TIER_LABELS.get(code)


def tier_code_for(purchase_count, days_since_last_purchase, lifetime_purchase_amount):
    """First matching tier wins. Zero qualifying purchases stay unassigned."""
    count = int(purchase_count or 0)
    amount = int(lifetime_purchase_amount or 0)
    if count <= 0 or days_since_last_purchase is None:
        return None
    days = int(days_since_last_purchase)
    if count >= 4 and days <= 45 and amount >= VIP_AMOUNT:
        return "VIP"
    if count >= 3 and days <= 90 and amount >= DIAMOND_AMOUNT:
        return "DIAMOND"
    if count >= 4 and 90 <= days <= YEAR_DAYS and amount >= VIP_AMOUNT:
        return "GOLD_1"
    if count >= 2 and days <= 90:
        return "GOLD_2"
    if count >= 1 and 30 <= days <= 90:
        return "SILVER"
    if count >= 1 and days <= 30:
        return "BRONZE_1"
    if 90 <= days < SIX_MONTH_DAYS:
        return "BRONZE_2"
    if days >= SIX_MONTH_DAYS:
        return "BRONZE_3"
    return None


def _reference(reference_date):
    return reference_date or application_today()


def _fact_params(reference_date):
    return [_reference(reference_date), timezone.get_current_timezone_name()]


def filter_customers_by_tier(qs, tier_code, reference_date=None):
    if tier_code not in TIER_LABELS:
        return qs
    sql = f"""
        {_FACTS_CTE}
        SELECT customer_id
        FROM (
            SELECT customer_id, {_TIER_CASE} AS tier_code
            FROM facts
        ) scored
        WHERE tier_code = %s
    """
    params = _fact_params(reference_date) + [tier_code]
    return qs.filter(pk__in=RawSQL(sql, params))


def tier_population_summary(reference_date=None):
    """Server-side tier counts. One row per assigned tier, plus null."""
    from django.db import connection

    sql = f"""
        {_FACTS_CTE}
        SELECT {_TIER_CASE} AS tier_code,
               COUNT(*)::int AS customers,
               COUNT(*) FILTER (WHERE purchase_count > 0)::int AS purchasing
        FROM facts
        GROUP BY 1
    """
    with connection.cursor() as cursor:
        cursor.execute(sql, _fact_params(reference_date))
        rows = cursor.fetchall()
    return [
        {"tier_code": code, "customers": customers, "purchasing": purchasing}
        for code, customers, purchasing in rows
    ]


def tier_purchase_count_expression():
    online = Subquery(
        Order.objects.filter(customer_id=OuterRef("pk"))
        .exclude(status__in=TIER_ONLINE_EXCLUDED_STATUSES)
        .values("customer_id")
        .annotate(c=Count("id"))
        .values("c"),
        output_field=IntegerField(),
    )
    sells = Subquery(
        PosSale.objects.filter(
            customer_id=OuterRef("pk"),
            deleted_at__isnull=True,
            is_cancelled=False,
            type=TIER_POS_SELL,
        )
        .values("customer_id")
        .annotate(c=Count("id"))
        .values("c"),
        output_field=IntegerField(),
    )
    return Coalesce(online, 0) + Coalesce(sells, 0)


def tier_last_purchase_expression():
    from django.db.models import DateTimeField

    last_online = Subquery(
        Order.objects.filter(customer_id=OuterRef("pk"))
        .exclude(status__in=TIER_ONLINE_EXCLUDED_STATUSES)
        .order_by("-created_at")
        .values("created_at")[:1],
        output_field=DateTimeField(),
    )
    last_sell = Subquery(
        PosSale.objects.filter(
            customer_id=OuterRef("pk"),
            deleted_at__isnull=True,
            is_cancelled=False,
            type=TIER_POS_SELL,
        )
        .order_by("-created_at")
        .values("created_at")[:1],
        output_field=DateTimeField(),
    )
    return Greatest(last_online, last_sell)


def metrics_for_customers(customer_ids, reference_date=None):
    """Batch tier facts for a page of customers. No per-customer queries."""
    reference = _reference(reference_date)
    ids = list(customer_ids)
    if not ids:
        return {}

    online = {
        row["customer_id"]: row
        for row in Order.objects.filter(customer_id__in=ids)
        .exclude(status__in=TIER_ONLINE_EXCLUDED_STATUSES)
        .values("customer_id")
        .annotate(
            purchase_count=Count("id"),
            first_at=Min("created_at"),
            last_at=Max("created_at"),
            amount=Sum("total_amount"),
        )
    }
    sells = {
        row["customer_id"]: row
        for row in PosSale.objects.filter(
            customer_id__in=ids,
            deleted_at__isnull=True,
            is_cancelled=False,
            type=TIER_POS_SELL,
        )
        .values("customer_id")
        .annotate(purchase_count=Count("id"), first_at=Min("created_at"), last_at=Max("created_at"))
    }
    pos_amounts = _pos_amounts(ids)
    payload = {}
    for customer_id in ids:
        online_row = online.get(customer_id) or {}
        sell_row = sells.get(customer_id) or {}
        purchase_count = int(online_row.get("purchase_count") or 0) + int(sell_row.get("purchase_count") or 0)
        last_at = _latest(online_row.get("last_at"), sell_row.get("last_at"))
        first_at = _earliest(online_row.get("first_at"), sell_row.get("first_at"))
        amount = int(online_row.get("amount") or 0) + int(pos_amounts.get(customer_id) or 0)
        days = None
        if last_at is not None:
            days = (reference - timezone.localtime(last_at).date()).days
        code = tier_code_for(purchase_count, days, amount)
        payload[customer_id] = {
            "purchase_count": purchase_count,
            "first_purchase_at": first_at,
            "last_purchase_at": last_at,
            "days_since_last_purchase": days,
            "lifetime_purchase_amount": amount,
            "tier_code": code,
            "tier_label": tier_label(code),
        }
    return payload


def _pos_amounts(customer_ids):
    signed = Sum(_signed_line_sql())
    rows = (
        PosSaleItem.objects.filter(
            deleted_at__isnull=True,
            pos_sale__customer_id__in=customer_ids,
            pos_sale__deleted_at__isnull=True,
            pos_sale__is_cancelled=False,
            pos_sale__type__in=(TIER_POS_SELL, TIER_POS_EXCHANGE, TIER_POS_REFUND),
        )
        .values("pos_sale__customer_id")
        .annotate(amount=signed)
    )
    return {row["pos_sale__customer_id"]: int(row["amount"] or 0) for row in rows}


def _line_total():
    from django.db.models import F, Value
    from django.db.models.functions import Coalesce as CoalesceFn

    return CoalesceFn(F("amount"), Value(0)) * CoalesceFn(F("quantity"), Value(0))


def _signed_line_sql():
    from django.db.models import BigIntegerField, Case, Value, When

    return Case(
        When(pos_sale__type=TIER_POS_SELL, then=_line_total()),
        When(pos_sale__type=TIER_POS_EXCHANGE, type=TIER_POS_SELL, then=_line_total()),
        When(pos_sale__type=TIER_POS_EXCHANGE, type=TIER_POS_REFUND, then=-_line_total()),
        When(pos_sale__type=TIER_POS_REFUND, type=TIER_POS_REFUND, then=-_line_total()),
        default=Value(0),
        output_field=BigIntegerField(),
    )


def _earliest(*values):
    present = [value for value in values if value is not None]
    return min(present) if present else None


def _latest(*values):
    present = [value for value in values if value is not None]
    return max(present) if present else None
