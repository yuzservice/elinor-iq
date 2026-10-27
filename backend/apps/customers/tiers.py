"""Exclusive customer tiers.

These rules belong to customer segmentation only. They do not change sales
qualifying purchases, sales reports, or POS exchange counting outside this module.
"""

from django.db.models import BigIntegerField, Count, DateTimeField, IntegerField, Max, Min, OuterRef, Subquery, Sum, Value
from django.db.models.expressions import RawSQL
from django.db.models.functions import Coalesce, Greatest, Least
from django.utils import timezone

from apps.customers.operators import operator_customer_ids
from apps.customers.tier_rules import (
    CHANNEL_LABELS,
    VERSION_1_RULES,
    active_rule_set,
    all_tiers,
    channel_case_sql,
    customer_channel,
    default_rules,
    is_channel_rules as _is_channel_rules,
    enabled_tiers,
    evaluate_tier,
    tier_case_sql,
)
from apps.sales.models import Order, PosSale, PosSaleItem

TIER_ONLINE_EXCLUDED_STATUSES = ("canceled", "failed", "wait_for_payment")
TIER_POS_SELL = "sell"
TIER_POS_EXCHANGE = "both"
TIER_POS_REFUND = "refund"

# Version-1 titles of the eight original tiers. Not the source of truth: titles
# come from rule versions (tier_title_map). Kept for callers and tests that need
# the original codes.
TIER_LABELS = {tier["code"]: tier["title"] for tier in VERSION_1_RULES["tiers"]}

# Serializes every tier write (full, by ids, activation) inside its transaction.
TIER_WRITE_LOCK_KEY = 7_412_031

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
        COALESCE(o.purchase_count, 0)::int AS online_count,
        COALESCE(s.purchase_count, 0)::int AS pos_count,
        CASE
            WHEN COALESCE(o.purchase_count, 0) + COALESCE(s.purchase_count, 0) <= 0 THEN NULL
            WHEN COALESCE(s.purchase_count, 0) >= COALESCE(o.purchase_count, 0) THEN 'pos'
            ELSE 'online'
        END AS channel,
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

def application_today():
    return timezone.localdate()


def tier_title_map():
    """code -> title. The active version wins, then the newest archived version containing the code."""
    from apps.customers.models import TierRuleSet

    try:
        rows = list(TierRuleSet.objects.exclude(status=TierRuleSet.STATUS_DRAFT).values_list("status", "version", "rules"))
    except RuntimeError:
        rows = [(TierRuleSet.STATUS_ACTIVE, 1, VERSION_1_RULES)]
    rows.sort(key=lambda row: (row[0] != TierRuleSet.STATUS_ACTIVE, -row[1]))
    titles = {}
    for _status, _version, rules in rows:
        for _channel, tier in all_tiers(rules):
            titles.setdefault(tier["code"], tier["title"])
    return titles


def tier_channel_label(channel):
    return CHANNEL_LABELS.get(channel) if channel else None


def tier_label(code, titles=None):
    """Title for a stored tier code; the code itself when no version knows it."""
    if not code:
        return None
    titles = tier_title_map() if titles is None else titles
    return titles.get(code, code)


def enabled_tier_codes(rules=None):
    """Codes a filter may use: enabled tiers of the active version, in priority order."""
    rules = rules if rules is not None else _rules_of(active_rule_set())
    return [tier["code"] for tier in enabled_tiers(rules)]


def tier_code_for(purchase_count, days_since_last_purchase, lifetime_purchase_amount, rules=None, channel=None):
    """First matching tier wins. Zero qualifying purchases stay unassigned.

    Without `rules`, the active rule set is used (version 1 when none is stored).
    Channel rules need the customer's `channel` («online» / «pos»).
    """
    if rules is None:
        rules = _rules_of(active_rule_set())
    return evaluate_tier(rules, purchase_count, days_since_last_purchase, lifetime_purchase_amount, channel=channel)


def _rules_of(rule_set):
    return rule_set.rules if rule_set is not None else default_rules()


def _lock_tier_writes(cursor):
    cursor.execute("SELECT pg_advisory_xact_lock(%s)", [TIER_WRITE_LOCK_KEY])


def _reference(reference_date):
    return reference_date or application_today()


def _facts_sql():
    """Facts CTE without active internal accounts. Returns (sql, exclusion params, bound last)."""
    excluded = sorted(operator_customer_ids())
    sql = _FACTS_CTE.replace(
        "LEFT JOIN pos_amount p ON p.customer_id = c.id\n)",
        "LEFT JOIN pos_amount p ON p.customer_id = c.id\n    WHERE c.id <> ALL(%s::bigint[])\n)",
    )
    return sql, [excluded]


def _fact_params(reference_date):
    _sql, exclusion = _facts_sql()
    return [_reference(reference_date), timezone.get_current_timezone_name(), *exclusion]


def refresh_stored_tiers(customer_ids=None, reference_date=None, reason=None):
    """Write tier_code onto customers with the active rules.

    A full pass scans every customer once. A list of ids only rewrites those
    customers, which is what a sync uses after new sales. Every change also
    writes a CustomerTierHistory row in the same transaction.
    """
    from apps.customers.models import CustomerTierHistory

    if customer_ids is not None:
        return _refresh_tier_ids(customer_ids, reference_date, reason or CustomerTierHistory.REASON_SYNC)
    return _refresh_all_tiers(reference_date, reason or CustomerTierHistory.REASON_MANUAL)


def _refresh_all_tiers(reference_date, reason):
    from django.db import connection, transaction

    with transaction.atomic():
        with connection.cursor() as cursor:
            _lock_tier_writes(cursor)
        rule_set = active_rule_set()
        return write_all_tiers(_rules_of(rule_set), rule_set.pk if rule_set else None, reason, reference_date)


def write_all_tiers(rules, rule_set_id, reason, reference_date=None):
    """Rewrite every changed tier_code and its history. Caller holds the write lock in a transaction."""
    from django.db import connection

    facts_sql, _exclusion = _facts_sql()
    case_sql, case_params = tier_case_sql(rules)
    previous_titles = tier_title_map()
    new_titles = {**previous_titles, **{tier["code"]: tier["title"] for _channel, tier in all_tiers(rules)}}
    channel_sql = channel_case_sql(rules)
    previous_sql, previous_params = _titles_values(previous_titles)
    new_sql, new_params = _titles_values(new_titles)
    sql = f"""
        {facts_sql},
        evaluated AS (
            SELECT customer_id, previous_tier_code, previous_channel, channel, {case_sql} AS tier_code
            FROM (
                SELECT f.*, cur.tier_code AS previous_tier_code, cur.tier_channel AS previous_channel
                FROM facts f
                JOIN customers cur ON cur.id = f.customer_id
            ) current_facts
        ),
        scored AS (
            SELECT customer_id, previous_tier_code, previous_channel, tier_code,
                   CASE WHEN tier_code IS NULL THEN NULL ELSE {channel_sql} END AS tier_channel
            FROM evaluated
        ),
        changed AS (
            UPDATE customers AS c
            SET tier_code = scored.tier_code,
                tier_channel = scored.tier_channel,
                tier_refreshed_at = NOW()
            FROM scored
            WHERE c.id = scored.customer_id
              AND (c.tier_code IS DISTINCT FROM scored.tier_code OR c.tier_channel IS DISTINCT FROM scored.tier_channel)
            RETURNING c.id, scored.previous_tier_code, scored.previous_channel, c.tier_code, c.tier_channel
        )
        INSERT INTO customer_tier_history (
            customer_id, previous_tier_code, previous_tier_title, previous_channel, tier_code, tier_title, channel,
            rule_set_id, reason, changed_at
        )
        SELECT ch.id,
               ch.previous_tier_code,
               COALESCE(previous_titles.title, ch.previous_tier_code, ''),
               ch.previous_channel,
               ch.tier_code,
               COALESCE(new_titles.title, ch.tier_code, ''),
               ch.tier_channel,
               %s, %s, NOW()
        FROM changed ch
        LEFT JOIN ({previous_sql}) AS previous_titles(code, title) ON previous_titles.code = ch.previous_tier_code
        LEFT JOIN ({new_sql}) AS new_titles(code, title) ON new_titles.code = ch.tier_code
    """
    with connection.cursor() as cursor:
        cursor.execute(
            sql,
            _fact_params(reference_date) + case_params + [rule_set_id, reason] + previous_params + new_params,
        )
        updated = cursor.rowcount
    return updated + clear_operator_tiers(reason, rule_set_id, titles=previous_titles)


def _titles_values(titles):
    """A VALUES list of (code, title) as bound parameters; never empty."""
    pairs = list(titles.items()) or [("", "")]
    sql = "VALUES " + ", ".join(["(%s::text, %s::text)"] * len(pairs))
    return sql, [item for pair in pairs for item in pair]


def _refresh_tier_ids(customer_ids, reference_date, reason):
    from django.db import connection, transaction

    from apps.customers.models import Customer, CustomerTierHistory

    ids = list({int(pk) for pk in customer_ids if pk})
    if not ids:
        return 0
    updated = 0
    refreshed_at = timezone.now()
    with transaction.atomic():
        with connection.cursor() as cursor:
            _lock_tier_writes(cursor)
        rule_set = active_rule_set()
        rules = _rules_of(rule_set)
        titles = tier_title_map()
        for start in range(0, len(ids), 400):
            chunk = ids[start : start + 400]
            metrics = metrics_for_customers(chunk, reference_date, rules=rules, titles=titles)
            stored = {
                pk: (code, channel)
                for pk, code, channel in Customer.objects.filter(pk__in=chunk).values_list("pk", "tier_code", "tier_channel")
            }
            grouped = {}
            history = []
            for customer_id in chunk:
                if customer_id not in stored:
                    continue
                row = metrics.get(customer_id) or {}
                new = (row.get("tier_code"), row.get("tier_channel"))
                old = stored[customer_id]
                if old == new:
                    continue
                grouped.setdefault(new, []).append(customer_id)
                history.append(
                    CustomerTierHistory(
                        customer_id=customer_id,
                        previous_tier_code=old[0],
                        previous_tier_title=tier_label(old[0], titles) or "",
                        previous_channel=old[1],
                        tier_code=new[0],
                        tier_title=tier_label(new[0], titles) or "",
                        channel=new[1],
                        rule_set=rule_set,
                        reason=reason,
                        changed_at=refreshed_at,
                    )
                )
            for (code, channel), pks in grouped.items():
                updated += Customer.objects.filter(pk__in=pks).update(
                    tier_code=code, tier_channel=channel, tier_refreshed_at=refreshed_at
                )
            CustomerTierHistory.objects.bulk_create(history)
        return updated + clear_operator_tiers(reason, rule_set.pk if rule_set else None, titles=titles)


def clear_operator_tiers(reason=None, rule_set_id=None, titles=None):
    """Internal accounts stay out of every tier, including after a later sync."""
    from django.db import transaction

    from apps.customers.models import Customer, CustomerTierHistory

    ids = operator_customer_ids()
    if not ids:
        return 0
    now = timezone.now()
    with transaction.atomic():
        tiered = list(
            Customer.objects.filter(pk__in=ids)
            .exclude(tier_code__isnull=True, tier_channel__isnull=True)
            .select_for_update()
            .values_list("pk", "tier_code", "tier_channel")
        )
        if not tiered:
            return 0
        updated = Customer.objects.filter(pk__in=[pk for pk, _code, _channel in tiered]).update(
            tier_code=None, tier_channel=None, tier_refreshed_at=now
        )
        titles = tier_title_map() if titles is None else titles
        CustomerTierHistory.objects.bulk_create(
            CustomerTierHistory(
                customer_id=pk,
                previous_tier_code=code,
                previous_tier_title=tier_label(code, titles) or "",
                previous_channel=channel,
                tier_code=None,
                tier_title="",
                channel=None,
                rule_set_id=rule_set_id,
                reason=reason or CustomerTierHistory.REASON_MANUAL,
                changed_at=now,
            )
            for pk, code, channel in tiered
        )
    return updated


def filter_customers_by_tier(qs, tier_code, reference_date=None, rules=None):
    rules = rules or _rules_of(active_rule_set())
    if tier_code not in enabled_tier_codes(rules):
        return qs
    facts_sql, _exclusion = _facts_sql()
    case_sql, case_params = tier_case_sql(rules)
    sql = f"""
        {facts_sql}
        SELECT customer_id
        FROM (
            SELECT customer_id, {case_sql} AS tier_code
            FROM facts
        ) scored
        WHERE tier_code = %s
    """
    params = _fact_params(reference_date) + case_params + [tier_code]
    return qs.filter(pk__in=RawSQL(sql, params))


def tier_population_summary(reference_date=None, rules=None):
    """Server-side tier counts. One row per assigned tier, plus null."""
    from django.db import connection

    facts_sql, _exclusion = _facts_sql()
    case_sql, case_params = tier_case_sql(rules or _rules_of(active_rule_set()))
    sql = f"""
        {facts_sql}
        SELECT {case_sql} AS tier_code,
               COUNT(*)::int AS customers,
               COUNT(*) FILTER (WHERE purchase_count > 0)::int AS purchasing
        FROM facts
        GROUP BY 1
    """
    with connection.cursor() as cursor:
        cursor.execute(sql, _fact_params(reference_date) + case_params)
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


def tier_first_purchase_expression():
    first_online = Subquery(
        Order.objects.filter(customer_id=OuterRef("pk"))
        .exclude(status__in=TIER_ONLINE_EXCLUDED_STATUSES)
        .order_by("created_at")
        .values("created_at")[:1],
        output_field=DateTimeField(),
    )
    first_sell = Subquery(
        PosSale.objects.filter(
            customer_id=OuterRef("pk"),
            deleted_at__isnull=True,
            is_cancelled=False,
            type=TIER_POS_SELL,
        )
        .order_by("created_at")
        .values("created_at")[:1],
        output_field=DateTimeField(),
    )
    return Least(first_online, first_sell)


def tier_lifetime_amount_expression():
    online_sum = Subquery(
        Order.objects.filter(customer_id=OuterRef("pk"))
        .exclude(status__in=TIER_ONLINE_EXCLUDED_STATUSES)
        .values("customer_id")
        .annotate(total=Sum("total_amount"))
        .values("total"),
        output_field=BigIntegerField(),
    )
    pos_sum = Subquery(
        PosSaleItem.objects.filter(
            deleted_at__isnull=True,
            pos_sale__customer_id=OuterRef("pk"),
            pos_sale__deleted_at__isnull=True,
            pos_sale__is_cancelled=False,
            pos_sale__type__in=(TIER_POS_SELL, TIER_POS_EXCHANGE, TIER_POS_REFUND),
        )
        .values("pos_sale__customer_id")
        .annotate(total=Sum(_signed_line_sql()))
        .values("total"),
        output_field=BigIntegerField(),
    )
    return Coalesce(online_sum, Value(0), output_field=BigIntegerField()) + Coalesce(
        pos_sum, Value(0), output_field=BigIntegerField()
    )


def metrics_for_customers(customer_ids, reference_date=None, rules=None, titles=None):
    """Batch tier facts for a page of customers. No per-customer queries."""
    reference = _reference(reference_date)
    ids = list(customer_ids)
    if not ids:
        return {}
    if rules is None:
        rules = _rules_of(active_rule_set())
    if titles is None:
        titles = tier_title_map()

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
    operators = operator_customer_ids() & set(ids)
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
        online_count = int(online_row.get("purchase_count") or 0)
        pos_count = int(sell_row.get("purchase_count") or 0)
        channel = customer_channel(online_count, pos_count)
        code = None if customer_id in operators else tier_code_for(purchase_count, days, amount, rules, channel=channel)
        stored_channel = channel if code and _is_channel_rules(rules) else None
        payload[customer_id] = {
            "purchase_count": purchase_count,
            "first_purchase_at": first_at,
            "last_purchase_at": last_at,
            "days_since_last_purchase": days,
            "lifetime_purchase_amount": amount,
            "tier_code": code,
            "tier_label": tier_label(code, titles),
            "online_count": online_count,
            "pos_count": pos_count,
            "channel": channel,
            "tier_channel": stored_channel,
            "tier_channel_label": tier_channel_label(stored_channel),
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
    from django.db.models import F
    from django.db.models.functions import Coalesce as CoalesceFn

    return CoalesceFn(F("amount"), Value(0)) * CoalesceFn(F("quantity"), Value(0))


def _signed_line_sql():
    from django.db.models import Case, When

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
