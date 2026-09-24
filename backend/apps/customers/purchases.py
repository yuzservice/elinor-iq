"""Purchase facts for the customer list. This is not a revenue metric."""

from django.db.models import Count, Exists, IntegerField, OuterRef, Subquery
from django.db.models.functions import Coalesce

from apps.sales.semantics import qualifying_online_orders, qualifying_pos_sales

# Re-export for existing imports across the codebase.
from apps.sales.semantics import SALES_LINE_LABELS  # noqa: F401

# Re-export for backward compatibility with existing imports.
qualifying_orders = qualifying_online_orders
qualifying_pos = qualifying_pos_sales


def qualifying_order_exists(customer_field="pk"):
    return Exists(qualifying_online_orders().filter(customer_id=OuterRef(customer_field)))


def qualifying_pos_exists(customer_field="pk", sales_line=None):
    qs = qualifying_pos_sales().filter(customer_id=OuterRef(customer_field))
    if sales_line:
        qs = qs.filter(sales_line=sales_line)
    return Exists(qs)


def purchase_count_subquery():
    online = (
        qualifying_online_orders()
        .filter(customer_id=OuterRef("pk"))
        .values("customer_id")
        .annotate(c=Count("id"))
        .values("c")
    )
    pos = (
        qualifying_pos_sales()
        .filter(customer_id=OuterRef("pk"))
        .values("customer_id")
        .annotate(c=Count("id"))
        .values("c")
    )
    return Coalesce(Subquery(online, output_field=IntegerField()), 0) + Coalesce(
        Subquery(pos, output_field=IntegerField()), 0
    )


def last_purchase_subquery():
    from django.db.models import DateTimeField
    from django.db.models.functions import Greatest

    last_online = Subquery(
        qualifying_online_orders()
        .filter(customer_id=OuterRef("pk"))
        .order_by("-created_at")
        .values("created_at")[:1],
        output_field=DateTimeField(),
    )
    last_pos = Subquery(
        qualifying_pos_sales()
        .filter(customer_id=OuterRef("pk"))
        .order_by("-created_at")
        .values("created_at")[:1],
        output_field=DateTimeField(),
    )
    return Greatest(last_online, last_pos)


def behavior_for(count):
    if count <= 0:
        return "none", "بدون خرید"
    if count == 1:
        return "one_time", "تک‌خرید"
    return "repeating", "تکراری"


def channel_for(online_count, pos_count):
    if online_count and pos_count:
        return "both", "هر دو"
    if online_count:
        return "online", "آنلاین"
    if pos_count:
        return "physical", "حضوری"
    return "none", "—"
