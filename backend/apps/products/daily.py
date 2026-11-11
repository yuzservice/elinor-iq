"""Daily product summaries: set-based rebuilds of the tables in apps.products.models from apps.sales.semantics.

Every rebuild replaces its table inside one transaction, so a run is idempotent and readers keep the old rows until
commit. Rules and thresholds: docs/business-rules/products.md and settings.PRODUCTS_RULES."""

import logging
import time
from zoneinfo import ZoneInfo

from django.conf import settings
from django.db import connection, transaction
from django.db.models import BigIntegerField, Case, CharField, ExpressionWrapper, F, IntegerField, Value, When
from django.db.models.functions import TruncDate
from django.utils import timezone

from apps.customers.operators import exclude_operator_sales
from apps.integrations.elinor.models import SyncCursor
from apps.sales.semantics import pos_refund_items, qualifying_online_items, qualifying_pos_items

logger = logging.getLogger(__name__)
TEHRAN = ZoneInfo("Asia/Tehran")
CURSOR_KEY = "products_daily"
LINE_COLUMNS = ("d", "pid", "vid", "line", "bid", "sold", "returned", "amt", "disc")
BASKET_COLUMNS = ("d", "ch", "bid", "pid")


def _sql(qs, columns):
    return qs.order_by().values(*columns).query.sql_with_params()


def _online():
    qs = qualifying_online_items().filter(product_id__isnull=False)
    if settings.PRODUCTS_EXCLUDE_INTERNAL_SALES:
        qs = exclude_operator_sales(qs, "order__customer_id")
    return qs.annotate(d=TruncDate("order__created_at", tzinfo=TEHRAN), bid=F("order_id"))


def _pos(qs):
    qs = qs.filter(product_id__isnull=False)
    if settings.PRODUCTS_EXCLUDE_INTERNAL_SALES:
        qs = exclude_operator_sales(qs, "pos_sale__customer_id")
    return qs.annotate(d=TruncDate("pos_sale__created_at", tzinfo=TEHRAN), bid=F("pos_sale_id"))


def _line_parts():
    """Sold online lines, sold in-store lines and in-store returns as (sql, params) with LINE_COLUMNS."""
    amount = ExpressionWrapper(F("amount") * F("quantity"), output_field=BigIntegerField())
    refund = ExpressionWrapper(-F("amount") * F("quantity"), output_field=BigIntegerField())
    disc = Case(When(discount_amount__gt=0, then=F("quantity")), default=Value(0), output_field=IntegerField())
    zero = Value(0, output_field=IntegerField())
    online = _online().annotate(pid=F("product_id"), vid=F("variant_id"), line=Value("ONLINE", output_field=CharField()),
                                sold=F("quantity"), returned=zero, amt=amount, disc=disc)
    sold = _pos(qualifying_pos_items()).annotate(pid=F("product_id"), vid=F("variant_id"), line=F("pos_sale__sales_line"),
                                                sold=F("quantity"), returned=zero, amt=amount, disc=disc)
    returns = _pos(pos_refund_items()).annotate(pid=F("product_id"), vid=F("variant_id"), line=F("pos_sale__sales_line"),
                                               sold=zero, returned=F("quantity"), amt=refund, disc=zero)
    # A return is not an invoice that sold the product.
    returns = returns.annotate(nobid=Value(None, output_field=BigIntegerField()))
    parts = [_sql(online, LINE_COLUMNS), _sql(sold, LINE_COLUMNS), _sql(returns, ("d", "pid", "vid", "line", "nobid", "sold", "returned", "amt", "disc"))]
    return parts


def _union(parts):
    sql = " UNION ALL ".join(f"({part})" for part, _ in parts)
    params = [value for _, part_params in parts for value in part_params]
    return sql, params


def refresh_daily_sales():
    union, params = _union(_line_parts())
    with transaction.atomic(), connection.cursor() as cursor:
        cursor.execute("SET LOCAL jit = off")
        cursor.execute("DELETE FROM product_daily_sales")
        cursor.execute(
            f"""INSERT INTO product_daily_sales (day, product_id, variant_id, sales_line, units, net_units, revenue, discounted_units, invoice_count)
                SELECT x.d, x.pid, x.vid, x.line, SUM(x.sold), SUM(x.sold) - SUM(x.returned), SUM(x.amt), SUM(x.disc), COUNT(DISTINCT x.bid)
                FROM ({union}) AS x ({", ".join(LINE_COLUMNS)})
                GROUP BY x.d, x.pid, x.vid, x.line""",
            params,
        )
        return cursor.rowcount


PRIMARY_CATEGORY_SQL = """
    depth AS (
        SELECT id, 0 AS n FROM categories WHERE parent_id IS NULL
        UNION ALL SELECT c.id, depth.n + 1 FROM categories c JOIN depth ON c.parent_id = depth.id
    ),
    primary_cat AS (
        SELECT DISTINCT ON (pc.product_id) pc.product_id, pc.category_id
        FROM product_categories pc LEFT JOIN depth ON depth.id = pc.category_id
        ORDER BY pc.product_id, depth.n DESC NULLS LAST, pc.category_id
    )"""


def refresh_bundles():
    """Invoice (basket) counts per product and per primary category, and their pairs, per day and channel."""
    online = _online().annotate(ch=Value("online", output_field=CharField()), pid=F("product_id"))
    store = _pos(qualifying_pos_items()).annotate(ch=Value("store", output_field=CharField()), pid=F("product_id"))
    union, params = _union([_sql(online, BASKET_COLUMNS), _sql(store, BASKET_COLUMNS)])
    with transaction.atomic(), connection.cursor() as cursor:
        cursor.execute("SET LOCAL jit = off")
        cursor.execute(
            f"""CREATE TEMP TABLE basket_keys ON COMMIT DROP AS
                WITH RECURSIVE {PRIMARY_CATEGORY_SQL},
                lines AS (SELECT DISTINCT x.d, x.ch, x.bid, x.pid FROM ({union}) AS x ({", ".join(BASKET_COLUMNS)}))
                SELECT d, ch, bid, 'product'::text AS level, pid AS k FROM lines
                UNION ALL
                SELECT DISTINCT l.d, l.ch, l.bid, 'category', pc.category_id FROM lines l JOIN primary_cat pc ON pc.product_id = l.pid""",
            params,
        )
        cursor.execute("CREATE INDEX ON basket_keys (ch, level, bid)")
        cursor.execute("DELETE FROM product_basket_items_daily")
        cursor.execute(
            """INSERT INTO product_basket_items_daily (day, channel, level, key, baskets)
               SELECT d, ch, level, k, COUNT(*) FROM basket_keys GROUP BY d, ch, level, k
               UNION ALL
               SELECT d, ch, level, 0, COUNT(DISTINCT bid) FROM basket_keys GROUP BY d, ch, level"""
        )
        items = cursor.rowcount
        cursor.execute("DELETE FROM product_basket_pairs_daily")
        cursor.execute(
            """INSERT INTO product_basket_pairs_daily (day, channel, level, a, b, baskets)
               SELECT x.d, x.ch, x.level, x.k, y.k, COUNT(*)
               FROM basket_keys x JOIN basket_keys y ON y.ch = x.ch AND y.level = x.level AND y.bid = x.bid AND y.k > x.k
               GROUP BY x.d, x.ch, x.level, x.k, y.k"""
        )
        return {"basket_items": items, "basket_pairs": cursor.rowcount}


def refresh_metrics(as_of=None):
    """ProductMetrics as of `as_of` (default today, Tehran) from product_daily_sales and product_central_stock."""
    rules = settings.PRODUCTS_RULES
    # Stock off: no central stock, so no stock flags; statuses stay speed-only.
    params = {**rules, "d": as_of or timezone.localdate(), "stock_enabled": settings.PRODUCTS_STOCK_ENABLED}
    sql = f"""
    WITH RECURSIVE {PRIMARY_CATEGORY_SQL},
    s AS (
        SELECT product_id,
            MIN(day) FILTER (WHERE units > 0) AS first_day,
            MAX(day) FILTER (WHERE units > 0) AS last_day,
            COALESCE(SUM(units) FILTER (WHERE day > %(d)s::date - 7), 0) AS u7,
            COALESCE(SUM(units) FILTER (WHERE day > %(d)s::date - 14), 0) AS u14,
            COALESCE(SUM(units) FILTER (WHERE day > %(d)s::date - 28), 0) AS u28,
            COALESCE(SUM(revenue) FILTER (WHERE day > %(d)s::date - 7), 0) AS r7,
            COALESCE(SUM(revenue) FILTER (WHERE day > %(d)s::date - 14), 0) AS r14,
            COALESCE(SUM(revenue) FILTER (WHERE day > %(d)s::date - 28), 0) AS r28,
            COALESCE(SUM(net_units) FILTER (WHERE day > %(d)s::date - 7), 0) AS n7,
            COALESCE(SUM(net_units) FILTER (WHERE day > %(d)s::date - 14), 0) AS n14,
            COALESCE(SUM(net_units) FILTER (WHERE day > %(d)s::date - 28 AND day <= %(d)s::date - 14), 0) AS p14,
            COALESCE(SUM(net_units) FILTER (WHERE day > %(d)s::date - 28), 0) AS n28,
            COALESCE(SUM(net_units) FILTER (WHERE day > %(d)s::date - 35 AND day <= %(d)s::date - 7), 0) AS before7,
            COALESCE(SUM(units - discounted_units) FILTER (WHERE day > %(d)s::date - 28), 0) AS full28,
            COALESCE(SUM(units) FILTER (WHERE day > %(d)s::date - 90), 0) AS u90,
            COALESCE(SUM(discounted_units) FILTER (WHERE day > %(d)s::date - 90), 0) AS disc90,
            COALESCE(SUM(units - net_units) FILTER (WHERE day > %(d)s::date - 90), 0) AS ret90
        FROM product_daily_sales WHERE day <= %(d)s::date GROUP BY product_id
    ),
    first14 AS (
        SELECT p.product_id, SUM(p.units) AS u FROM product_daily_sales p JOIN s ON s.product_id = p.product_id
        WHERE p.day < s.first_day + 14 GROUP BY p.product_id
    ),
    by_line AS (
        SELECT product_id, jsonb_object_agg(sales_line, last_day) AS lines FROM (
            SELECT product_id, sales_line, MAX(day)::text AS last_day FROM product_daily_sales
            WHERE units > 0 AND day <= %(d)s::date GROUP BY product_id, sales_line) l
        GROUP BY product_id
    ),
    stock AS (SELECT product_id, SUM(GREATEST(balance, 0)) AS bal FROM product_central_stock
              WHERE %(stock_enabled)s GROUP BY product_id),
    base AS (
        SELECT s.*, pc.category_id, COALESCE(f.u, 0) AS first14, COALESCE(bl.lines, '{{}}'::jsonb) AS lines, st.bal,
            s.n28 / (GREATEST(LEAST(%(d)s::date - s.first_day + 1, 28), 7) / 7.0) AS speed,
            s.full28 / (GREATEST(LEAST(%(d)s::date - s.first_day + 1, 28), 7) / 7.0) AS full_speed,
            CASE WHEN s.p14 > 0 THEN (s.n14 - s.p14) * 100.0 / s.p14 END AS trend,
            (%(d)s::date - s.last_day) >= %(stale_days)s AS stale
        FROM s LEFT JOIN primary_cat pc ON pc.product_id = s.product_id LEFT JOIN first14 f ON f.product_id = s.product_id
        LEFT JOIN by_line bl ON bl.product_id = s.product_id LEFT JOIN stock st ON st.product_id = s.product_id
        WHERE s.first_day IS NOT NULL
    ),
    med AS (
        SELECT category_id, percentile_cont(0.5) WITHIN GROUP (ORDER BY speed) AS m FROM base WHERE NOT stale GROUP BY category_id
    ),
    ranked AS (
        SELECT b.*, m.m AS median,
            COUNT(*) OVER w AS n,
            cume_dist() OVER (PARTITION BY b.category_id, b.stale ORDER BY b.full_speed DESC) AS top_cd,
            cume_dist() OVER (PARTITION BY b.category_id, b.stale ORDER BY b.speed ASC) AS bottom_cd
        FROM base b LEFT JOIN med m ON m.category_id IS NOT DISTINCT FROM b.category_id
        WINDOW w AS (PARTITION BY b.category_id, b.stale)
    ),
    statused AS (
        SELECT r.*, CASE
            WHEN r.stale THEN 'stale'
            WHEN r.n >= %(min_category_size)s AND r.top_cd <= %(driver_top_share)s AND r.u28 >= %(driver_min_units)s THEN 'driver'
            WHEN r.trend >= %(growth_trend_pct)s THEN 'growth'
            WHEN r.n >= %(min_category_size)s AND r.bottom_cd <= %(slow_bottom_share)s THEN 'slow'
            ELSE 'normal' END AS status
        FROM ranked r
    )
    INSERT INTO product_metrics (product_id, category_id, as_of, first_sale_date, last_sale_date, last_sale_by_line,
        units_7, units_14, units_28, revenue_7, revenue_14, revenue_28, units_first14, weekly_speed, full_price_speed,
        category_median_speed, category_ratio, trend_pct, discount_share, return_rate, status, central_stock, stock_days, stock_flag)
    SELECT product_id, category_id, %(d)s::date, first_day, last_day, lines, u7, u14, u28, r7, r14, r28, first14, speed, full_speed,
        median, CASE WHEN median > 0 AND NOT stale THEN speed / median END, trend,
        CASE WHEN u90 > 0 THEN disc90::float / u90 END, CASE WHEN u90 > 0 THEN ret90::float / u90 END,
        status, bal, CASE WHEN speed > 0 AND bal IS NOT NULL THEN bal / (speed / 7.0) END,
        CASE
            WHEN bal = 0 AND before7 / 4.0 >= 1 AND n7 <= (before7 / 4.0) * (1 - %(out_drop_pct)s / 100.0) THEN 'out'
            WHEN status IN ('driver', 'growth') AND bal IS NOT NULL AND bal < %(lead_time_days)s * speed / 7.0 THEN 'charge'
            ELSE '' END
    FROM statused
    """
    with transaction.atomic(), connection.cursor() as cursor:
        cursor.execute("SET LOCAL jit = off")
        cursor.execute("DELETE FROM product_metrics")
        cursor.execute(sql, params)
        return cursor.rowcount


def run_daily(if_due=False):
    """Category sync, daily sales, bundles, then metrics. Runs after the customer tier/metrics pass in the scheduler."""
    from .categories import sync_from_payloads

    today = timezone.localdate().isoformat()
    cursor = SyncCursor.objects.filter(key=CURSOR_KEY).first()
    if if_due and cursor and (cursor.value or {}).get("last_date") == today:
        return {"skipped": True}
    report, started = {}, time.monotonic()
    for name, step in (("categories", sync_from_payloads), ("daily_sales", refresh_daily_sales), ("bundles", refresh_bundles), ("metrics", refresh_metrics)):
        t = time.monotonic()
        report[name] = step()
        report[f"{name}_s"] = round(time.monotonic() - t, 1)
    report["total_s"] = round(time.monotonic() - started, 1)
    SyncCursor.objects.update_or_create(key=CURSOR_KEY, defaults={"value": {"last_date": today, "report": report}})
    return report
