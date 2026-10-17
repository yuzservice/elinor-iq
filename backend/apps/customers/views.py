from django.http import JsonResponse, StreamingHttpResponse
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from apps.core.coverage import coverage_payload
from apps.sales.services import parse_range, window_meta

from .detail import HISTORY_PER_PAGE, customer_360_payload, product_history, purchase_history
from .list_query import customer_list_queryset, paginate_customers
from .models import Customer
from .operators import exclude_operator_accounts


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def reports(request):
    start, end = parse_range(request)
    all_customers = exclude_operator_accounts(Customer.objects.all())
    purchasing = all_customers.purchasing()
    new_customers = purchasing.filter(first_order_at__gte=start, first_order_at__lt=end)
    repeating = purchasing.filter(order_count__gt=1)
    one_time = purchasing.filter(order_count=1)
    return Response(
        {
            "window": window_meta(start, end),
            "data_coverage": coverage_payload(),
            "note": "گروه‌ها فقط بر اساس سفارش‌های همگام‌سازی‌شده ساخته شده‌اند، نه کل تاریخچه مشتری.",
            "populations": {
                "all_customers": all_customers.count(),
                "purchasing_customers": purchasing.count(),
                "registered_without_orders": all_customers.registered_only().count(),
            },
            "groups": [
                {
                    "key": "new",
                    "label": "مشتریان جدید",
                    "count": new_customers.count(),
                    "explanation": "اولین سفارش ثبت‌شده آن‌ها در بازه همگام‌سازی فعلی بوده است.",
                },
                {
                    "key": "repeating",
                    "label": "مشتریان تکراری",
                    "count": repeating.count(),
                    "explanation": "بیش از یک سفارش در داده‌های همگام‌سازی‌شده دارند.",
                },
                {
                    "key": "one_time",
                    "label": "مشتریان تک‌خریدی",
                    "count": one_time.count(),
                    "explanation": "فقط یک سفارش در داده‌های همگام‌سازی‌شده دارند.",
                },
            ],
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def customer_export(request):
    from .export import iter_customer_export_csv, iter_export_row_batches

    try:
        qs = customer_list_queryset(request.query_params)
        batches = iter_export_row_batches(qs)
        first_batch = next(batches, None)
    except Exception:
        return JsonResponse({"detail": "تهیه خروجی اکسل با خطا مواجه شد."}, status=500)

    def row_batches():
        if first_batch is not None:
            yield first_batch
        yield from batches

    filename = f"customers-{timezone.localdate().isoformat()}.csv"
    response = StreamingHttpResponse(
        iter_customer_export_csv(row_batches()),
        content_type="text/csv; charset=utf-8",
    )
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def refresh_tiers(request):
    from .tier_refresh import start_full_tier_refresh, tier_refresh_status

    if request.method == "GET":
        return Response(tier_refresh_status())
    started = start_full_tier_refresh()
    if started:
        return Response(
            {"started": True, "detail": "به‌روزرسانی سطح‌ها شروع شد."},
            status=status.HTTP_202_ACCEPTED,
        )
    return Response(
        {"started": False, "detail": "به‌روزرسانی سطح‌ها در حال انجام است."},
        status=status.HTTP_200_OK,
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def customer_list(request):
    page = _positive_int(request.query_params.get("page"), default=1)
    per_page = _positive_int(request.query_params.get("per_page"), default=20, cap=50)
    qs = customer_list_queryset(request.query_params)
    total, results = paginate_customers(qs, page, per_page)
    return Response(
        {
            "page": page,
            "per_page": per_page,
            "total": total,
            "data_coverage": coverage_payload(),
            "results": results,
        }
    )


def _positive_int(value, default, cap=None):
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    parsed = max(1, parsed)
    if cap is not None:
        parsed = min(cap, parsed)
    return parsed


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def customer_detail(request, source_id):
    customer = (
        Customer.objects.filter(source_id=source_id)
        .prefetch_related("address_records")
        .first()
    )
    if not customer:
        return Response({"detail": "مشتری پیدا نشد."}, status=status.HTTP_404_NOT_FOUND)

    page = _positive_int(request.query_params.get("history_page"), default=1)
    per_page = _positive_int(request.query_params.get("history_per_page"), default=HISTORY_PER_PAGE, cap=50)
    payload = customer_360_payload(customer, history_page=page, history_per_page=per_page)
    payload["data_coverage"] = coverage_payload()
    return Response(payload)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def customer_purchases(request, source_id):
    customer = Customer.objects.filter(source_id=source_id).first()
    if not customer:
        return Response({"detail": "مشتری پیدا نشد."}, status=status.HTTP_404_NOT_FOUND)
    page = _positive_int(request.query_params.get("page"), default=1)
    per_page = _positive_int(request.query_params.get("per_page"), default=HISTORY_PER_PAGE, cap=50)
    payload = purchase_history(customer, page=page, per_page=per_page)
    payload["id"] = customer.source_id
    return Response(payload)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def customer_products(request, source_id):
    customer = Customer.objects.filter(source_id=source_id).first()
    if not customer:
        return Response({"detail": "مشتری پیدا نشد."}, status=status.HTTP_404_NOT_FOUND)
    payload = product_history(customer)
    payload["id"] = customer.source_id
    return Response(payload)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def customer_campaigns(request):
    from .campaigns import get_campaigns_summary

    action_id = request.query_params.get("action_id")
    branch = request.query_params.get("branch")
    page = _positive_int(request.query_params.get("page"), default=1)
    per_page = _positive_int(request.query_params.get("per_page"), default=20, cap=100)
    payload = get_campaigns_summary(action_id=action_id, branch=branch, page=page, per_page=per_page)
    return Response(payload)

