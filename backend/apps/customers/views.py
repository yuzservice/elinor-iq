import logging

from django.http import JsonResponse, StreamingHttpResponse
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from apps.accounts.permissions import IsSuperAdmin, is_super_admin
from apps.core.coverage import coverage_payload
from apps.sales.services import parse_range, window_meta

from .detail import HISTORY_PER_PAGE, customer_360_payload, product_history, purchase_history
from .list_query import customer_list_queryset, paginate_customers
from .models import Customer
from .operators import exclude_operator_accounts

# Every customer CSV export is logged here (user, filters, row count, time); see docs/business-rules/customer-rfm.md.
export_logger = logging.getLogger("apps.customers.exports")


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

    if request.query_params.get("call_list") == "1":
        return _call_list_export(request)
    try:
        qs = customer_list_queryset(request.query_params, user=request.user)
        batches = iter_export_row_batches(qs)
        first_batch = next(batches, None)
    except Exception:
        return JsonResponse({"detail": "تهیه خروجی اکسل با خطا مواجه شد."}, status=500)

    counter = {"rows": 0}

    def row_batches():
        for batch in ([first_batch] if first_batch is not None else []):
            counter["rows"] += len(batch)
            yield batch
        for batch in batches:
            counter["rows"] += len(batch)
            yield batch

    filename = f"customers-{timezone.localdate().isoformat()}.csv"
    response = StreamingHttpResponse(
        _logged(iter_customer_export_csv(row_batches()), request, "customers", counter),
        content_type="text/csv; charset=utf-8",
    )
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response


def _call_list_export(request):
    import csv
    from io import StringIO

    from .rfm_reports import CALL_LIST_HEADERS, call_list_csv_cells, call_list_queryset, call_list_rows

    counter = {"rows": 0}

    def chunks():
        buffer = StringIO()
        buffer.write("\ufeff")
        csv.writer(buffer).writerow(CALL_LIST_HEADERS)
        yield buffer.getvalue().encode("utf-8")
        rows = call_list_queryset(request.query_params)
        for start in range(0, rows.count(), 500):
            buffer = StringIO()
            writer = csv.writer(buffer)
            for item in call_list_rows(list(rows[start : start + 500])):
                writer.writerow(call_list_csv_cells(item))
                counter["rows"] += 1
            yield buffer.getvalue().encode("utf-8")

    filename = f"call-list-{timezone.localdate().isoformat()}.csv"
    response = StreamingHttpResponse(
        _logged(chunks(), request, "call_list", counter), content_type="text/csv; charset=utf-8"
    )
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response


def _logged(chunks, request, kind, counter):
    """Stream the CSV, then log who exported what (filters, row count, time)."""
    yield from chunks
    record = {
        "kind": kind,
        "user": getattr(request.user, "username", None),
        "filters": {key: request.query_params.getlist(key) for key in request.query_params},
        "rows": counter["rows"],
        "at": timezone.now().isoformat(),
    }
    export_logger.info(
        "customer export kind=%(kind)s user=%(user)s rows=%(rows)s filters=%(filters)s at=%(at)s",
        record,
        extra={"export": record},
    )


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
    qs = customer_list_queryset(request.query_params, user=request.user)
    total, results = paginate_customers(qs, page, per_page, user=request.user)
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
    payload = customer_360_payload(
        customer,
        history_page=page,
        history_per_page=per_page,
        include_internal=is_super_admin(request.user),
    )
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
    gift_keyword = request.query_params.get("gift_keyword")
    page = _positive_int(request.query_params.get("page"), default=1)
    per_page = _positive_int(request.query_params.get("per_page"), default=20, cap=100)
    payload = get_campaigns_summary(
        action_id=action_id,
        branch=branch,
        gift_keyword=gift_keyword,
        page=page,
        per_page=per_page,
    )
    return Response(payload)




def _tier_rule_errors(exc):
    return Response({"detail": str(exc), "errors": exc.errors}, status=status.HTTP_400_BAD_REQUEST)


@api_view(["GET"])
@permission_classes([IsSuperAdmin])
def tier_rules(request):
    from .tier_rule_admin import rules_state

    return Response(rules_state())


@api_view(["PUT", "DELETE"])
@permission_classes([IsSuperAdmin])
def tier_rules_draft(request):
    from .tier_rule_admin import TierRuleConflict, delete_draft, rules_state, save_draft
    from .tier_rules import TierRulesError

    try:
        if request.method == "DELETE":
            if not delete_draft():
                return Response({"detail": "پیش‌نویسی وجود ندارد."}, status=status.HTTP_404_NOT_FOUND)
            return Response(rules_state())
        save_draft(request.user, rules=request.data.get("rules"), note=request.data.get("note"))
    except TierRulesError as exc:
        return _tier_rule_errors(exc)
    except TierRuleConflict as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_409_CONFLICT)
    return Response(rules_state())


@api_view(["POST"])
@permission_classes([IsSuperAdmin])
def tier_rules_preview(request):
    from .tier_rule_admin import TierRuleConflict, preview_draft
    from .tier_rules import TierRulesError

    try:
        return Response(preview_draft())
    except TierRulesError as exc:
        return _tier_rule_errors(exc)
    except TierRuleConflict as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_409_CONFLICT)


@api_view(["POST"])
@permission_classes([IsSuperAdmin])
def tier_rules_activate(request):
    from .tier_rule_admin import TierRuleConflict, start_activation
    from .tier_rules import TierRulesError

    try:
        draft = start_activation(request.user)
    except TierRulesError as exc:
        return _tier_rule_errors(exc)
    except TierRuleConflict as exc:
        return Response({"started": False, "detail": str(exc)}, status=status.HTTP_409_CONFLICT)
    return Response(
        {"started": True, "version": draft.version, "detail": "فعال‌سازی قوانین جدید شروع شد."},
        status=status.HTTP_202_ACCEPTED,
    )


@api_view(["POST"])
@permission_classes([IsSuperAdmin])
def tier_rules_restore(request, version):
    from .tier_rule_admin import TierRuleConflict, restore_version, rules_state
    from .tier_rules import TierRulesError

    try:
        draft = restore_version(request.user, version)
    except TierRulesError as exc:
        return _tier_rule_errors(exc)
    except TierRuleConflict as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_409_CONFLICT)
    if draft is None:
        return Response({"detail": "این نسخه پیدا نشد."}, status=status.HTTP_404_NOT_FOUND)
    return Response(rules_state())


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def customer_tiers(request):
    from .tier_rule_admin import public_tiers

    return Response({"results": public_tiers()})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def rfm_summary(request):
    from .rfm_reports import rfm_summary as build_summary

    return Response(build_summary(request.query_params))


@api_view(["GET", "POST"])
@permission_classes([IsSuperAdmin])
def internal_accounts(request):
    from .internal_accounts import InternalAccountError, account_payload, create_or_reactivate, list_accounts

    if request.method == "GET":
        return Response({"results": list_accounts()})
    try:
        account, created, refresh_started = create_or_reactivate(request.user, request.data)
    except InternalAccountError as exc:
        return Response({"detail": str(exc), "errors": exc.errors}, status=status.HTTP_400_BAD_REQUEST)
    return Response(
        {**account_payload(account), "refresh_started": refresh_started},
        status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
    )


@api_view(["PATCH"])
@permission_classes([IsSuperAdmin])
def internal_account_detail(request, account_id):
    from .internal_accounts import InternalAccountError, account_payload, update_account

    try:
        account, refresh_started = update_account(request.user, account_id, request.data)
    except InternalAccountError as exc:
        return Response({"detail": str(exc), "errors": exc.errors}, status=status.HTTP_400_BAD_REQUEST)
    if account is None:
        return Response({"detail": "حساب داخلی پیدا نشد."}, status=status.HTTP_404_NOT_FOUND)
    return Response({**account_payload(account), "refresh_started": refresh_started})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def rfm_movement(request):
    from .rfm_reports import rfm_movement as build_movement

    months = _positive_int(request.query_params.get("months"), default=1, cap=12)
    return Response(build_movement(request.query_params, months=months))


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def rfm_call_list(request):
    from .rfm_reports import call_list_page

    page = _positive_int(request.query_params.get("page"), default=1)
    per_page = _positive_int(request.query_params.get("per_page"), default=20, cap=100)
    return Response(call_list_page(request.query_params, page=page, per_page=per_page))
