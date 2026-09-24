from django.db.models import Sum
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.core.coverage import coverage_payload
from apps.core.metrics import REVENUE_DEFINITION, STATUS_LABELS
from apps.customers.models import Customer
from apps.customers.presentation import order_customer_name
from apps.sales.models import Order, OrderItem, PosSale
from apps.sales.services import parse_range, revenue_orders, trend_points, window_meta


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def home_summary(request):
    start, end = parse_range(request)
    orders = revenue_orders().filter(created_at__gte=start, created_at__lt=end)
    items = OrderItem.objects.filter(order__in=orders, status=1)
    sales_total = orders.aggregate(v=Sum("total_amount"))["v"] or 0
    order_count = orders.count()
    customer_count = orders.exclude(customer_id=None).values("customer_id").distinct().count()
    items_sold = items.aggregate(v=Sum("quantity"))["v"] or 0

    shopino = orders.filter(is_shopino=True).aggregate(v=Sum("total_amount"))["v"] or 0
    website = orders.filter(is_shopino=False).aggregate(v=Sum("total_amount"))["v"] or 0

    recent_orders = (
        Order.objects.select_related("customer")
        .filter(created_at__gte=start, created_at__lt=end)
        .order_by("-created_at")[:8]
    )
    unnamed = Customer.objects.filter(first_name="", last_name="").count()
    missing_mobile = Customer.objects.filter(mobile="").count()
    pending_details = Order.objects.filter(details_synced_at__isnull=True).count()
    pos_connected = PosSale.objects.exists()
    attention = []
    if unnamed:
        attention.append(f"{unnamed} مشتری بدون نام در داده فعلی.")
    if missing_mobile:
        attention.append(f"{missing_mobile} مشتری بدون موبایل در داده فعلی.")
    if pending_details:
        attention.append(f"{pending_details} سفارش هنوز جزئیات اقلام ندارد.")
    if not attention:
        attention.append("مورد فوری در داده همگام‌سازی‌شده دیده نشد.")

    return Response(
        {
            "window": window_meta(start, end),
            "revenue_definition": REVENUE_DEFINITION,
            "data_coverage": coverage_payload(),
            "metrics": {
                "sales": sales_total,
                "orders": order_count,
                "customers": customer_count,
                "items_sold": items_sold,
            },
            "trend": trend_points(orders, start, end),
            "recent_orders": [
                {
                    "id": order.source_id,
                    "created_at": order.created_at,
                    "customer_id": order.customer.source_id if order.customer_id else None,
                    "customer_name": order_customer_name(order.customer),
                    "customer_name_is_fallback": bool(
                        order.customer_id and not (order.customer.full_name or "").strip()
                    ),
                    "status": order.status,
                    "status_label": STATUS_LABELS.get(order.status, order.status),
                    "total_amount": order.total_amount,
                }
                for order in recent_orders
            ],
            "sales_lines": [
                {
                    "key": "online",
                    "label": "فروش آنلاین",
                    "connected": True,
                    "value": sales_total,
                    "note": "سفارش‌های وب‌سایت الینور، شامل شاپینو در صورت وجود.",
                    "parts": [
                        {"key": "website", "label": "وب‌سایت", "value": website},
                        {"key": "shopino", "label": "شاپینو", "value": shopino},
                    ],
                },
                {
                    "key": "sari",
                    "label": "فروشگاه ساری",
                    "connected": pos_connected,
                    "value": None,
                    "note": (
                        "فروش حضوری به‌صورت واقعیت ذخیره شده است. متریک درآمد هنوز تعریف نشده."
                        if pos_connected
                        else "در داده فعلی فروش حضوری موجود نیست."
                    ),
                },
                {
                    "key": "gorgan",
                    "label": "فروشگاه گرگان",
                    "connected": pos_connected,
                    "value": None,
                    "note": (
                        "فروش حضوری به‌صورت واقعیت ذخیره شده است. متریک درآمد هنوز تعریف نشده."
                        if pos_connected
                        else "در داده فعلی فروش حضوری موجود نیست."
                    ),
                },
                {
                    "key": "capri",
                    "label": "فروشگاه کاپری",
                    "connected": pos_connected,
                    "value": None,
                    "note": (
                        "فروش حضوری به‌صورت واقعیت ذخیره شده است. متریک درآمد هنوز تعریف نشده."
                        if pos_connected
                        else "در داده فعلی فروش حضوری موجود نیست."
                    ),
                },
            ],
            "needs_attention": {
                "available": True,
                "message": attention[0],
                "items": attention,
            },
        }
    )
