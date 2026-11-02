"""CustomerMetrics refresh: one set-based statement over the qualifying purchases of apps.sales.semantics."""

from django.db import connection, transaction

from apps.customers.overview import _events_sql


def refresh_customer_metrics():
    """Idempotent; every customer gets a row, internal accounts too (list queries exclude those). Returns rows written."""
    events_sql, params = _events_sql(include_internal=True)
    sql = f"""
        WITH {events_sql},
        agg AS (
            SELECT cid,
                   COUNT(*) FILTER (WHERE inv) AS invoices,
                   SUM(amt) AS amount,
                   MIN(at) FILTER (WHERE inv) AS first_at,
                   MAX(at) FILTER (WHERE inv) AS last_at,
                   COUNT(*) FILTER (WHERE inv AND line = 'ONLINE') AS online,
                   COUNT(*) FILTER (WHERE inv AND line <> 'ONLINE') AS pos
            FROM e GROUP BY cid
        ),
        computed AS (
            SELECT c.id AS customer_id,
                   COALESCE(a.invoices, 0)::int AS invoice_count,
                   COALESCE(a.amount, 0)::bigint AS total_amount,
                   CASE WHEN COALESCE(a.invoices, 0) > 0 THEN ROUND(a.amount::numeric / a.invoices)::bigint END AS avg_basket,
                   a.first_at, a.last_at,
                   CASE
                       WHEN a.online > 0 AND a.pos > 0 THEN 'both'
                       WHEN a.online > 0 THEN 'online'
                       WHEN a.pos > 0 THEN 'physical'
                       ELSE 'none'
                   END AS channel
            FROM customers c LEFT JOIN agg a ON a.cid = c.id
        )
        INSERT INTO customer_metrics (customer_id, invoice_count, total_amount, avg_basket, first_purchase_at, last_purchase_at, channel, refreshed_at)
        SELECT customer_id, invoice_count, total_amount, avg_basket, first_at, last_at, channel, now() FROM computed
        ON CONFLICT (customer_id) DO UPDATE SET
            invoice_count = EXCLUDED.invoice_count, total_amount = EXCLUDED.total_amount, avg_basket = EXCLUDED.avg_basket,
            first_purchase_at = EXCLUDED.first_purchase_at, last_purchase_at = EXCLUDED.last_purchase_at,
            channel = EXCLUDED.channel, refreshed_at = EXCLUDED.refreshed_at
        WHERE (customer_metrics.invoice_count, customer_metrics.total_amount, customer_metrics.avg_basket,
               customer_metrics.first_purchase_at, customer_metrics.last_purchase_at, customer_metrics.channel)
              IS DISTINCT FROM (EXCLUDED.invoice_count, EXCLUDED.total_amount, EXCLUDED.avg_basket,
                                EXCLUDED.first_purchase_at, EXCLUDED.last_purchase_at, EXCLUDED.channel)
    """
    with transaction.atomic(), connection.cursor() as cursor:
        cursor.execute("SET LOCAL jit = off")
        cursor.execute(sql, params)
        return cursor.rowcount
