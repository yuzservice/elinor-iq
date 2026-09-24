import time

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.sales.analysis import product_sales_report
from apps.sales.filter_options import sales_filter_options_payload
from apps.sales.semantics import parse_sales_line_filter
from apps.sales.services import (
    overview_payload,
    parse_group,
    parse_range,
    recent_sales_payload,
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
