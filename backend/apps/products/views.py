import time

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.products.intelligence import (
    product_360_report,
    product_bundles_report,
    product_intelligence_report,
    product_size_color_intelligence,
)
from apps.sales.semantics import parse_sales_line_filter
from apps.sales.services import parse_range


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def product_list(request):
    """Unified sales intelligence list across online & physical stores (Sari, Gorgan, Capri)."""
    started = time.perf_counter()
    start, end = parse_range(request)
    sales_line = parse_sales_line_filter(request.query_params.get("sales_line"))
    page = max(1, int(request.query_params.get("page") or 1))
    per_page = min(100, max(1, int(request.query_params.get("per_page") or 20)))
    search = (request.query_params.get("search") or "").strip()
    sort = (request.query_params.get("sort") or "units").strip().lower()
    order = (request.query_params.get("order") or "desc").strip().lower()
    tab = (request.query_params.get("tab") or "all").strip().lower()

    payload = product_intelligence_report(
        start=start,
        end=end,
        sales_line=sales_line,
        search=search,
        sort=sort,
        order=order,
        tab=tab,
        page=page,
        per_page=per_page,
    )
    payload["timing_ms"] = round((time.perf_counter() - started) * 1000, 1)
    return Response(payload)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def product_bundles(request):
    """Returns top market basket bundles and co-occurrence pairs."""
    started = time.perf_counter()
    start, end = parse_range(request)
    limit = min(20, max(1, int(request.query_params.get("limit") or 5)))
    payload = product_bundles_report(start=start, end=end, limit=limit)
    payload["timing_ms"] = round((time.perf_counter() - started) * 1000, 1)
    return Response(payload)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def product_size_color(request):
    """Returns size and color demand distribution."""
    started = time.perf_counter()
    start, end = parse_range(request)
    sales_line = parse_sales_line_filter(request.query_params.get("sales_line"))
    payload = product_size_color_intelligence(start=start, end=end, sales_line=sales_line)
    payload["timing_ms"] = round((time.perf_counter() - started) * 1000, 1)
    return Response(payload)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def product_360(request, product_id):
    """Returns complete 360-degree sales intelligence for a single product."""
    started = time.perf_counter()
    payload = product_360_report(product_id)
    payload["timing_ms"] = round((time.perf_counter() - started) * 1000, 1)
    return Response(payload)
