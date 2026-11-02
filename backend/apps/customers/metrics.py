"""CustomerMetrics refresh: one set-based statement over the qualifying purchases of apps.sales.semantics."""

from django.db import connection, transaction
from django.db.models import F

from apps.customers.overview import _events_sql
from apps.sales.semantics import qualifying_online_items, qualifying_online_orders, qualifying_pos_items, qualifying_pos_sales


def _compiled(qs, *columns):
    return qs.order_by().values(*columns).query.sql_with_params()


def refresh_customer_metrics():
    """Idempotent; every customer gets a row, internal accounts too (list queries exclude those). Returns rows written."""
    events_sql, params = _events_sql(include_internal=True)
    item_columns = ("cid", "size", "category")
    online_items, online_params = _compiled(
        qualifying_online_items().filter(order__customer_id__isnull=False).annotate(cid=F("order__customer_id"), size=F("variant__size"), category=F("product__categories__title")),
        *item_columns,
    )
    pos_items, pos_params = _compiled(
        qualifying_pos_items().filter(pos_sale__customer_id__isnull=False).annotate(cid=F("pos_sale__customer_id"), size=F("variant__size"), category=F("product__categories__title")),
        *item_columns,
    )
    discount_online, discount_online_params = _compiled(qualifying_online_orders().filter(discount_amount__gt=0, customer_id__isnull=False), "customer_id")
    discount_pos, discount_pos_params = _compiled(qualifying_pos_sales().filter(discount_amount__gt=0, customer_id__isnull=False), "customer_id")
    sql = f"""
        WITH {events_sql},
        agg AS (
            SELECT cid,
                   COUNT(*) FILTER (WHERE inv) AS invoices,
                   SUM(amt) AS amount,
                   MIN(at) FILTER (WHERE inv) AS first_at,
                   MAX(at) FILTER (WHERE inv) AS last_at,
                   COUNT(*) FILTER (WHERE inv AND line = 'ONLINE') AS online,
                   COUNT(*) FILTER (WHERE inv AND line <> 'ONLINE') AS pos,
                   ARRAY_AGG(DISTINCT line) FILTER (WHERE inv) AS lines,
                   BOOL_OR(inv AND snappay) AS snappay, BOOL_OR(inv AND digipay) AS digipay, BOOL_OR(inv AND shopino) AS shopino
            FROM e GROUP BY cid
        ),
        items AS (
            SELECT cid,
                   ARRAY_AGG(DISTINCT UPPER(TRIM(size))) FILTER (WHERE TRIM(size) <> '') AS sizes,
                   ARRAY_AGG(DISTINCT category) FILTER (WHERE category IS NOT NULL) AS categories
            FROM (SELECT cid, size, category FROM ({online_items}) oi UNION ALL SELECT cid, size, category FROM ({pos_items}) pi) i
            GROUP BY cid
        ),
        discounted AS (SELECT customer_id AS cid FROM ({discount_online}) d1 UNION SELECT customer_id FROM ({discount_pos}) d2),
        places AS (
            SELECT cid, ARRAY_AGG(DISTINCT place) AS cities FROM (
                SELECT ca.customer_id AS cid, TRIM(COALESCE(NULLIF(ca.city_name, ''), ci.name)) AS place
                FROM customer_addresses ca LEFT JOIN cities ci ON ci.id = ca.city_id
                WHERE ca.deleted_at IS NULL
                UNION ALL
                SELECT customer_id, TRIM(receiver_city) FROM orders WHERE customer_id IS NOT NULL
            ) p WHERE place <> '' GROUP BY cid
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
                   END AS channel,
                   COALESCE(a.lines, '{{}}')::varchar[] AS lines,
                   ARRAY_REMOVE(ARRAY[
                       CASE WHEN a.snappay THEN 'snappay' END,
                       CASE WHEN a.digipay THEN 'digipay' END,
                       CASE WHEN a.shopino THEN 'shopino' END
                   ], NULL)::varchar[] AS payments,
                   d.cid IS NOT NULL AS has_discount,
                   COALESCE(i.sizes, '{{}}')::varchar[] AS sizes,
                   COALESCE(i.categories, '{{}}')::varchar[] AS categories,
                   COALESCE(p.cities, '{{}}')::varchar[] AS cities
            FROM customers c
            LEFT JOIN agg a ON a.cid = c.id
            LEFT JOIN items i ON i.cid = c.id
            LEFT JOIN discounted d ON d.cid = c.id
            LEFT JOIN places p ON p.cid = c.id
        )
        INSERT INTO customer_metrics (customer_id, invoice_count, total_amount, avg_basket, first_purchase_at, last_purchase_at,
                                      channel, lines, payments, has_discount, sizes, categories, cities, refreshed_at)
        SELECT customer_id, invoice_count, total_amount, avg_basket, first_at, last_at,
               channel, lines, payments, has_discount, sizes, categories, cities, now() FROM computed
        ON CONFLICT (customer_id) DO UPDATE SET
            invoice_count = EXCLUDED.invoice_count, total_amount = EXCLUDED.total_amount, avg_basket = EXCLUDED.avg_basket,
            first_purchase_at = EXCLUDED.first_purchase_at, last_purchase_at = EXCLUDED.last_purchase_at,
            channel = EXCLUDED.channel, lines = EXCLUDED.lines, payments = EXCLUDED.payments, has_discount = EXCLUDED.has_discount,
            sizes = EXCLUDED.sizes, categories = EXCLUDED.categories, cities = EXCLUDED.cities, refreshed_at = EXCLUDED.refreshed_at
        WHERE (customer_metrics.invoice_count, customer_metrics.total_amount, customer_metrics.avg_basket,
               customer_metrics.first_purchase_at, customer_metrics.last_purchase_at, customer_metrics.channel,
               customer_metrics.lines, customer_metrics.payments, customer_metrics.has_discount,
               customer_metrics.sizes, customer_metrics.categories, customer_metrics.cities)
              IS DISTINCT FROM (EXCLUDED.invoice_count, EXCLUDED.total_amount, EXCLUDED.avg_basket,
                                EXCLUDED.first_purchase_at, EXCLUDED.last_purchase_at, EXCLUDED.channel,
                                EXCLUDED.lines, EXCLUDED.payments, EXCLUDED.has_discount,
                                EXCLUDED.sizes, EXCLUDED.categories, EXCLUDED.cities)
    """
    all_params = list(params) + list(online_params) + list(pos_params) + list(discount_online_params) + list(discount_pos_params)
    with transaction.atomic(), connection.cursor() as cursor:
        cursor.execute("SET LOCAL jit = off")
        cursor.execute(sql, all_params)
        return cursor.rowcount
