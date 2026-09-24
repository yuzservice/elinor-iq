from django.db import connection
from django.db.models import Count, Max, Min, Q

from apps.customers.models import Customer, CustomerAddress
from apps.products.models import Product, Variant
from apps.sales.models import OnlineInvoice, OnlinePayment, Order, OrderItem, PosSale, PosSaleItem, SalesLine

from .mapping import INVENTORY_TABLES


def audit_imported(extract_counts=None):
    extract_counts = extract_counts or {}
    online_customers = set(
        Order.objects.exclude(customer_id=None).values_list("customer_id", flat=True).distinct()
    )
    pos_customers = set(
        PosSale.objects.exclude(customer_id=None).values_list("customer_id", flat=True).distinct()
    )
    both = online_customers & pos_customers
    only_online = online_customers - pos_customers
    only_pos = pos_customers - online_customers
    purchasing = len(online_customers | pos_customers)

    inventory_present = _inventory_tables_present()

    def rec(name, imported, source_key=None):
        source = extract_counts.get(source_key or name)
        return {
            "source": source,
            "imported": imported,
            "difference": None if source is None else imported - source,
        }

    pos_by_line = {
        row["sales_line"]: row["c"]
        for row in PosSale.objects.values("sales_line").annotate(c=Count("id"))
    }

    return {
        "reconciliation": {
            "customers": rec("customers", Customer.objects.count()),
            "addresses": rec("addresses", CustomerAddress.objects.count()),
            "online_orders": rec("orders", Order.objects.count(), "orders"),
            "online_order_items": rec("order_items", OrderItem.objects.count(), "order_items"),
            "pos_sales": rec("mini_orders", PosSale.objects.count(), "mini_orders"),
            "pos_sale_items": rec("mini_order_items", PosSaleItem.objects.count(), "mini_order_items"),
            "online_invoices": rec("invoices", OnlineInvoice.objects.count(), "invoices"),
            "online_payments": rec("payments", OnlinePayment.objects.count(), "payments"),
            "products": rec("products", Product.objects.count()),
            "variants": rec("varieties", Variant.objects.count(), "varieties"),
        },
        "customers": {
            "total": Customer.objects.count(),
            "missing_first_name": Customer.objects.filter(Q(first_name="") | Q(first_name__isnull=True)).count(),
            "missing_last_name": Customer.objects.filter(Q(last_name="") | Q(last_name__isnull=True)).count(),
            "missing_email": Customer.objects.filter(Q(email="") | Q(email__isnull=True)).count(),
            "unique_mobiles": Customer.objects.exclude(mobile="").values("mobile").distinct().count(),
            "duplicate_mobile_values": list(
                Customer.objects.exclude(mobile="")
                .values("mobile")
                .annotate(c=Count("id"))
                .filter(c__gt=1)
                .values("mobile", "c")[:20]
            ),
            "no_purchase": Customer.objects.count() - purchasing,
            "online_only": len(only_online),
            "pos_only": len(only_pos),
            "both_channels": len(both),
        },
        "online": {
            "orders": Order.objects.count(),
            "items": OrderItem.objects.count(),
            "null_customer": Order.objects.filter(customer_id=None).count(),
            "status": list(Order.objects.values("status").annotate(c=Count("id")).order_by("-c")),
            "created_min": Order.objects.aggregate(v=Min("created_at"))["v"],
            "created_max": Order.objects.aggregate(v=Max("created_at"))["v"],
            "orphan_items": OrderItem.objects.filter(order_id=None).count(),
            "items_missing_product": OrderItem.objects.filter(product_id=None).count(),
            "items_missing_variant": OrderItem.objects.filter(variant_id=None).count(),
        },
        "pos": {
            "total": PosSale.objects.count(),
            "by_sales_line": pos_by_line,
            "sari": PosSale.objects.filter(sales_line=SalesLine.SARI).count(),
            "gorgan": PosSale.objects.filter(sales_line=SalesLine.GORGAN).count(),
            "capri": PosSale.objects.filter(sales_line=SalesLine.CAPRI).count(),
            "type": list(PosSale.objects.values("type").annotate(c=Count("id"))),
            "cancelled": PosSale.objects.filter(is_cancelled=True).count(),
            "soft_deleted": PosSale.objects.exclude(deleted_at=None).count(),
            "null_customer": PosSale.objects.filter(customer_id=None).count(),
            "created_min": PosSale.objects.aggregate(v=Min("created_at"))["v"],
            "created_max": PosSale.objects.aggregate(v=Max("created_at"))["v"],
            "orphan_items": PosSaleItem.objects.filter(pos_sale_id=None).count(),
            "items_missing_product": PosSaleItem.objects.filter(product_id=None).count(),
            "items_missing_variant": PosSaleItem.objects.filter(variant_id=None).count(),
            "item_types": list(PosSaleItem.objects.values("type").annotate(c=Count("id"))),
        },
        "products": {
            "products": Product.objects.count(),
            "variants": Variant.objects.count(),
            "variants_without_product": Variant.objects.filter(product_id=None).count(),
            "missing_color": Variant.objects.filter(Q(color_id=None) | Q(color_name="")).count(),
            "missing_size": Variant.objects.filter(Q(size="") | Q(size__isnull=True)).count(),
            "missing_sku": Variant.objects.filter(Q(sku="") | Q(sku__isnull=True)).count(),
            "missing_barcode": Variant.objects.filter(Q(barcode="") | Q(barcode__isnull=True)).count(),
            "created_min": Product.objects.aggregate(v=Min("created_at_source"))["v"],
            "created_max": Product.objects.aggregate(v=Max("created_at_source"))["v"],
            "variant_created_min": Variant.objects.aggregate(v=Min("created_at_source"))["v"],
            "variant_created_max": Variant.objects.aggregate(v=Max("created_at_source"))["v"],
        },
        "inventory_imported": bool(inventory_present),
        "inventory_tables_found": inventory_present,
        "customer_created_min": Customer.objects.aggregate(v=Min("created_at_source"))["v"],
        "customer_created_max": Customer.objects.aggregate(v=Max("created_at_source"))["v"],
    }


def _inventory_tables_present():
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT tablename FROM pg_tables
            WHERE schemaname = 'public' AND tablename = ANY(%s)
            """,
            [list(INVENTORY_TABLES)],
        )
        return [row[0] for row in cursor.fetchall()]
