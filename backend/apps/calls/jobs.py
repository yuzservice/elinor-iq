"""Nightly work: attribute purchases to calls, close purchased tags, top up dynamic programs."""

import logging

from django.db import connection
from django.utils import timezone

from datetime import timedelta

from apps.customers.overview import _events_sql
from apps.integrations.elinor.models import SyncCursor

from .lists import list_customers
from .models import CallList, CallProgram, CallSettings
from .tasks import _claim, run_activation

logger = logging.getLogger(__name__)
CURSOR_KEY = "calls_daily"
MARGIN_DAYS = 2  # a log re-enters the job this long after its window closes, in case a night was missed


def attribution_sql(now):
    """(sql, params) of the upsert; separate so its plan can be inspected."""
    window = CallSettings.load().buy_window_days
    cutoff = now - timedelta(days=window + MARGIN_DAYS)
    events_sql, params = _events_sql()
    sql = f"""
        WITH {events_sql},
        l AS (
            SELECT id, customer_id, created_at,
                   LEAD(created_at) OVER (PARTITION BY customer_id ORDER BY created_at) AS next_at
            FROM call_logs
            WHERE connected AND created_at >= %s
        ),
        matched AS (
            SELECT l.id AS log_id, MIN(e.at) AS purchased_at, SUM(e.amt)::bigint AS amount, COUNT(*) AS n
            FROM l
            JOIN e ON e.cid = l.customer_id AND e.inv AND e.at > l.created_at
                  AND e.at <= l.created_at + (%s * interval '1 day')
                  AND e.at <= %s
                  AND (l.next_at IS NULL OR e.at <= l.next_at)
            GROUP BY l.id
        ),
        stale AS (
            DELETE FROM call_log_purchases
            WHERE log_id IN (SELECT id FROM l) AND log_id NOT IN (SELECT log_id FROM matched)
        )
        INSERT INTO call_log_purchases (log_id, purchased_at, amount, purchase_count)
        SELECT log_id, purchased_at, amount, n FROM matched
        ON CONFLICT (log_id) DO UPDATE
        SET purchased_at = EXCLUDED.purchased_at, amount = EXCLUDED.amount, purchase_count = EXCLUDED.purchase_count
    """
    return sql, list(params) + [cutoff, window, now]


def attribute_purchases(now=None):
    """Idempotent. Only logs inside the open window are recomputed; older rows are final.

    Each purchase goes to the latest connected call before it: a log's range ends at the customer's next connected call.
    """
    sql, params = attribution_sql(now or timezone.now())
    with connection.cursor() as cursor:
        cursor.execute(sql, params)
        cursor.execute(
            """
            UPDATE customer_call_tags t SET resolved_at = p.purchased_at
            FROM call_tags g, call_logs l, call_log_purchases p
            WHERE g.id = t.tag_id AND g.open_until_purchase AND t.resolved_at IS NULL
              AND l.customer_id = t.customer_id AND p.log_id = l.id AND p.purchased_at > t.tagged_at
            """
        )


def sync_dynamic_lists():
    """Active programs on dynamic lists get tasks for new matches only (NOT EXISTS in eligible_customers)."""
    for call_list in CallList.objects.filter(kind=CallList.KIND_DYNAMIC, programs__status=CallProgram.STATUS_ACTIVE).distinct():
        CallList.objects.filter(pk=call_list.pk).update(customer_count=list_customers(call_list).count())
    programs = CallProgram.objects.filter(status=CallProgram.STATUS_ACTIVE, list__kind=CallList.KIND_DYNAMIC).values_list("pk", flat=True)
    for program_id in programs:
        if _claim(program_id):
            run_activation(program_id, close_connection=False)


def run_daily(if_due=False):
    today = timezone.localdate().isoformat()
    cursor = SyncCursor.objects.filter(key=CURSOR_KEY).first()
    if if_due and cursor and (cursor.value or {}).get("last_date") == today:
        return "skipped"
    attribute_purchases()
    sync_dynamic_lists()
    SyncCursor.objects.update_or_create(key=CURSOR_KEY, defaults={"value": {"last_date": today}})
    return "done"
