import time

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.sales.analysis import product_sales_report
from apps.sales.filter_options import sales_filter_options_payload
from apps.sales.kpis import (
    overview_kpis_payload,
    overview_trend_payload,
    parse_branch_filter,
    parse_overview_trend_group,
    parse_payment_filter,
)
from apps.sales.semantics import parse_sales_line_filter
from apps.sales.services import (
    overview_payload,
    parse_compare_range,
    parse_group,
    parse_range,
    recent_sales_payload,
    window_meta,
)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def filter_options(request):
    started = time.perf_counter()
    payload = sales_filter_options_payload()
    payload["timing_ms"] = round((time.perf_counter() - started) * 1000, 1)
    return Response(payload)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def overview_kpis(request):
    started = time.perf_counter()
    start, end = parse_range(request)
    compare_start, compare_end = parse_compare_range(request)
    branches = parse_branch_filter(request.query_params.get("branches"))
    payments = parse_payment_filter(request.query_params.get("payments"))
    payload = {
        "window": window_meta(start, end),
        "compare_window": window_meta(compare_start, compare_end) if compare_start and compare_end else None,
        "filters": {
            "branches": branches,
            "payments": payments,
        },
        "kpis": overview_kpis_payload(
            start,
            end,
            branches,
            None,
            payments,
            compare_start,
            compare_end,
        ),
    }
    payload["timing_ms"] = round((time.perf_counter() - started) * 1000, 1)
    return Response(payload)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def overview_trend(request):
    started = time.perf_counter()
    start, end = parse_range(request)
    compare_start, compare_end = parse_compare_range(request)
    branches = parse_branch_filter(request.query_params.get("branches"))
    payments = parse_payment_filter(request.query_params.get("payments"))
    group = parse_overview_trend_group(request.query_params.get("group"))
    payload = {
        "window": window_meta(start, end),
        "compare_window": window_meta(compare_start, compare_end) if compare_start and compare_end else None,
        "trend": overview_trend_payload(start, end, branches, None, payments, group, compare_start, compare_end),
    }
    payload["timing_ms"] = round((time.perf_counter() - started) * 1000, 1)
    return Response(payload)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def summary(request):
    started = time.perf_counter()
    start, end = parse_range(request)
    sales_line = parse_sales_line_filter(request.query_params.get("sales_line"))
    group = parse_group(request)
    section = (request.query_params.get("section") or "all").strip().lower()
    payload = overview_payload(start, end, sales_line, group, section)
    payload["timing_ms"] = round((time.perf_counter() - started) * 1000, 1)
    return Response(payload)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def order_list(request):
    started = time.perf_counter()
    start, end = parse_range(request)
    sales_line = parse_sales_line_filter(request.query_params.get("sales_line"))
    page = max(1, int(request.query_params.get("page") or 1))
    per_page = min(50, max(1, int(request.query_params.get("per_page") or 20)))
    payload = recent_sales_payload(start, end, sales_line, page, per_page)
    payload["timing_ms"] = round((time.perf_counter() - started) * 1000, 1)
    return Response(payload)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def product_list(request):
    started = time.perf_counter()
    start, end = parse_range(request)
    sales_line = parse_sales_line_filter(request.query_params.get("sales_line"))
    page = max(1, int(request.query_params.get("page") or 1))
    per_page = min(50, max(1, int(request.query_params.get("per_page") or 20)))
    search = (request.query_params.get("search") or "").strip()
    sort = (request.query_params.get("sort") or "units").strip().lower()
    order = (request.query_params.get("order") or "desc").strip().lower()
    payload = product_sales_report(start, end, sales_line, search, sort, order, page, per_page)
    payload["timing_ms"] = round((time.perf_counter() - started) * 1000, 1)
    return Response(payload)

TARGET_EDITOR_ROLES = ("super_admin", "admin", "manager")


def can_edit_targets(user):
    return bool(user and user.is_authenticated and user.role in TARGET_EDITOR_ROLES)


@api_view(["GET", "PUT"])
@permission_classes([IsAuthenticated])
def targets_view(request):
    """«تارگت‌ها» in Settings: GET ?year= the 12 × 4 grid; PUT {year, cells: [{month, sales_line, amount|null}], source}."""
    import jdatetime
    from django.utils import timezone as tz

    from apps.sales import targets

    if not can_edit_targets(request.user):
        return Response({"detail": "فقط مدیر یا ادمین می‌تواند تارگت‌ها را ببیند و تغییر دهد."}, status=403)
    if request.method == "GET":
        raw = request.query_params.get("year") or ""
        year = int(raw) if raw.isdigit() else jdatetime.date.fromgregorian(date=tz.localdate()).year
        return Response(targets.grid(year))
    year, cells = request.data.get("year"), request.data.get("cells")
    if not isinstance(year, int) or not isinstance(cells, list):
        return Response({"detail": "سال یا خانه‌ها نامعتبر است."}, status=400)
    source = "copy" if request.data.get("source") == "copy" else "manual"
    try:
        changed = targets.save_cells(request.user, year, cells, source=source)
    except (ValueError, KeyError, TypeError) as exc:
        return Response({"detail": str(exc) or "داده نامعتبر است."}, status=400)
    from apps.core.home_cache import clear as clear_home_cache

    clear_home_cache()
    return Response({**targets.grid(year), "changed": changed})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def targets_copy_preview(request):
    """Preview «کپی از سال قبل + X٪» without saving: ?year=&growth="""
    from apps.sales import targets

    if not can_edit_targets(request.user):
        return Response({"detail": "دسترسی ندارید."}, status=403)
    try:
        year = int(request.query_params.get("year"))
        growth = float(request.query_params.get("growth") or 0)
    except (TypeError, ValueError):
        return Response({"detail": "سال یا درصد نامعتبر است."}, status=400)
    if not -90 <= growth <= 500:
        return Response({"detail": "درصد رشد باید بین −۹۰ و ۵۰۰ باشد."}, status=400)
    return Response(targets.copy_preview(year, growth))
