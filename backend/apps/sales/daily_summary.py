"""Nightly `sales_daily_summary`: closed days × sales line, one set-based statement from apps.sales.semantics.

Same definitions as the home page (apps/core/home.py): sales = online order value + in-store sold lines; invoices =
qualifying online orders + qualifying POS sales; items = their sold units; buyer_ids = customer ids of those invoices.
Rebuilt in full inside one transaction (readers keep the old rows until commit), so a run is idempotent and late
cancellations of old orders are always right. Today is never stored: the home page computes it live."""

from zoneinfo import ZoneInfo

from django.db import connection, transaction
from django.db.models import BigIntegerField, CharField, ExpressionWrapper, F, Value
from django.db.models.functions import TruncDate
from django.utils import timezone

from .semantics import online_order_value_orders, qualifying_online_items, qualifying_online_orders, qualifying_pos_items, qualifying_pos_sales

TEHRAN = ZoneInfo("Asia/Tehran")


def _sql(qs, *columns):
    return qs.order_by().values(*columns).query.sql_with_params()


def refresh_daily_summary(today=None):
    today = today or timezone.localdate()
    online = Value("ONLINE", output_field=CharField())
    line_amount = ExpressionWrapper(F("amount") * F("quantity"), output_field=BigIntegerField())
    parts = {
        "sales_online": _sql(online_order_value_orders().annotate(d=TruncDate("created_at", tzinfo=TEHRAN), ln=online, v=F("total_amount")), "d", "ln", "v"),
        "orders": _sql(qualifying_online_orders().annotate(d=TruncDate("created_at", tzinfo=TEHRAN), ln=online, iid=F("id"), cid=F("customer_id")), "d", "ln", "iid", "cid"),
        "items_online": _sql(qualifying_online_items().annotate(d=TruncDate("order__created_at", tzinfo=TEHRAN), ln=online, q=F("quantity")), "d", "ln", "q"),
        "pos_lines": _sql(qualifying_pos_items().annotate(d=TruncDate("pos_sale__created_at", tzinfo=TEHRAN), ln=F("pos_sale__sales_line"), v=line_amount, q=F("quantity")), "d", "ln", "v", "q"),
        "pos_sales": _sql(qualifying_pos_sales().annotate(d=TruncDate("created_at", tzinfo=TEHRAN), ln=F("sales_line"), iid=F("id"), cid=F("customer_id")), "d", "ln", "iid", "cid"),
    }
    sql = f"""
        WITH sales AS (
            SELECT d, ln, SUM(v)::bigint AS sales, 0::bigint AS items FROM ({parts['sales_online'][0]}) s (d, ln, v) GROUP BY d, ln
            UNION ALL SELECT d, ln, 0, SUM(q) FROM ({parts['items_online'][0]}) i (d, ln, q) GROUP BY d, ln
            UNION ALL SELECT d, ln, SUM(v)::bigint, SUM(q) FROM ({parts['pos_lines'][0]}) p (d, ln, v, q) GROUP BY d, ln
        ),
        inv AS (
            SELECT d, ln, COUNT(*) AS invoices, ARRAY_AGG(DISTINCT cid) FILTER (WHERE cid IS NOT NULL) AS buyers
            FROM (SELECT * FROM ({parts['orders'][0]}) o (d, ln, iid, cid) UNION ALL SELECT * FROM ({parts['pos_sales'][0]}) q (d, ln, iid, cid)) x
            GROUP BY d, ln
        ),
        keys AS (SELECT d, ln FROM sales UNION SELECT d, ln FROM inv)
        INSERT INTO sales_daily_summary (day, sales_line, sales, invoices, items, buyer_ids)
        SELECT k.d, k.ln, COALESCE((SELECT SUM(sales) FROM sales s WHERE s.d = k.d AND s.ln = k.ln), 0),
               COALESCE(i.invoices, 0), COALESCE((SELECT SUM(items) FROM sales s WHERE s.d = k.d AND s.ln = k.ln), 0),
               COALESCE(i.buyers, '{{}}')
        FROM keys k LEFT JOIN inv i ON i.d = k.d AND i.ln = k.ln
        WHERE k.d < %s
    """
    params = (parts["sales_online"][1] + parts["items_online"][1] + parts["pos_lines"][1] + parts["orders"][1] + parts["pos_sales"][1] + (today,))
    with transaction.atomic(), connection.cursor() as cursor:
        cursor.execute("SET LOCAL jit = off")
        cursor.execute("DELETE FROM sales_daily_summary")
        cursor.execute(sql, params)
        return cursor.rowcount
