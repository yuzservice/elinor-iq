from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import jdatetime
from django.db.models import Count
from django.utils import timezone
from django.utils.dateparse import parse_datetime as django_parse_datetime

from apps.core.coverage import coverage_payload
from apps.core.dates import format_jalali_date
from apps.integrations.elinor.models import SyncRun
from apps.sales.analysis import (
    branch_insights,
    core_metrics,
    parse_trend_group,
    physical_returns_report,
    sales_line_comparison,
    size_color_report,
    trend_points as analysis_trend_points,
)
from apps.sales.models import Order, PosSale, SalesLine
from apps.sales.semantics import (
    ONLINE_ORDER_VALUE_DEFINITION,
    SALES_LINE_LABELS,
    filter_by_sales_line_online,
    filter_by_sales_line_pos,
    online_canceled_orders,
    online_failed_orders,
    online_order_value_orders,
    online_status_label,
    online_wait_for_payment_orders,
    pos_cancelled_sales,
    pos_refund_sales,
    pos_status_label,
    qualifying_online_items,
    qualifying_online_orders,
    qualifying_pos_items,
    qualifying_pos_sales,
)

TEHRAN = ZoneInfo("Asia/Tehran")


def default_window():
    latest = (
        SyncRun.objects.filter(status=SyncRun.STATUS_SUCCESS)
        .order_by("-finished_at")
        .first()
    )
    if latest and latest.window_start and latest.window_end:
        return latest.window_start, latest.window_end
    end = timezone.now()
    return end - timedelta(days=92), end


def parse_range(request):
    start, end = default_window()
    raw_from = request.query_params.get("from")
    raw_to = request.query_params.get("to")
    if raw_from:
        parsed = _parse_bound(raw_from, end_of_day=False)
        if parsed:
            start = parsed
    if raw_to:
        parsed = _parse_bound(raw_to, end_of_day=True)
        if parsed:
            end = parsed
    if start >= end:
        end = start + timedelta(days=1)
    return start, end


def parse_group(request):
    return parse_trend_group(request.query_params.get("group"))


def window_meta(start, end):
    return {
        "start": start,
        "end": end,
        "label": f"{format_jalali_date(start, long=True)} تا {format_jalali_date(end, long=True)}",
        "data_coverage": coverage_payload(),
    }


def revenue_orders():
    """Backward-compatible alias for online order value queryset."""
    return online_order_value_orders()


def overview_payload(start, end, sales_line=None, group="daily", section="all"):
    if section not in {"overview", "trend", "details", "all"}:
        section = "all"
    payload = {
        "window": window_meta(start, end),
        "semantics_note": ONLINE_ORDER_VALUE_DEFINITION,
        "data_coverage": coverage_payload(),
        "filters": {"sales_line": sales_line or "all", "group": group, "section": section},
    }
    if section in {"all", "overview"}:
        lines = sales_line_comparison(start, end)
        payload["metrics"] = core_metrics(start, end, sales_line)
        payload["sales_lines"] = lines
        payload["insights"] = branch_insights(
            start,
            end,
            sales_line,
            lines=lines,
            include_top_product=section == "all",
        )
    if section in {"all", "trend"}:
        payload["trend"] = {"group": group, "points": analysis_trend_points(start, end, sales_line, group)}
    if section in {"all", "details"}:
        payload["returns_canceled"] = _returns_canceled_counts(start, end, sales_line)
        payload["physical_returns"] = physical_returns_report(start, end, sales_line)
        payload["size_color"] = size_color_report(start, end, sales_line)
    return payload


def overview_trend_points(start, end, sales_line=None, group="daily"):
    """Backward-compatible alias for tests."""
    return analysis_trend_points(start, end, sales_line, group)


def recent_sales_payload(start, end, sales_line=None, page=1, per_page=20):
    online_qs = filter_by_sales_line_online(
        Order.objects.filter(created_at__gte=start, created_at__lt=end),
        sales_line,
    )
    pos_qs = filter_by_sales_line_pos(
        PosSale.objects.filter(created_at__gte=start, created_at__lt=end).annotate(
            item_count=Count("items")
        ),
        sales_line,
    )
    total = online_qs.count() + pos_qs.count()
    start_idx = (page - 1) * per_page
    fetch_limit = start_idx + per_page

    online_rows = list(
        online_qs.select_related("customer").order_by("-created_at", "-source_id")[:fetch_limit]
    )
    pos_rows = list(pos_qs.select_related("customer").order_by("-created_at", "-source_id")[:fetch_limit])

    events = [_recent_online_event(order) for order in online_rows]
    events.extend(_recent_pos_event(sale) for sale in pos_rows)
    events.sort(key=lambda row: (row["created_at"], row["kind"], row["id"]), reverse=True)
    page_rows = events[start_idx : start_idx + per_page]
    return {
        "page": page,
        "per_page": per_page,
        "total": total,
        "results": page_rows,
    }


def _returns_canceled_counts(start, end, sales_line):
    online_scope = Order.objects.filter(created_at__gte=start, created_at__lt=end)
    online_scope = filter_by_sales_line_online(online_scope, sales_line)
    pos_scope = PosSale.objects.filter(created_at__gte=start, created_at__lt=end)
    pos_scope = filter_by_sales_line_pos(pos_scope, sales_line)
    return {
        "online_canceled": online_canceled_orders(online_scope).count(),
        "online_failed": online_failed_orders(online_scope).count(),
        "online_wait_for_payment": online_wait_for_payment_orders(online_scope).count(),
        "pos_refunds": pos_refund_sales(pos_scope).count(),
        "pos_cancelled": pos_cancelled_sales(pos_scope).count(),
    }


def _customer_name(customer):
    from apps.customers.presentation import order_customer_name

    return order_customer_name(customer)


def _recent_online_event(order):
    return {
        "created_at": order.created_at,
        "sales_line": SalesLine.ONLINE,
        "sales_line_label": SALES_LINE_LABELS[SalesLine.ONLINE],
        "id": order.source_id,
        "customer_id": order.customer.source_id if order.customer_id else None,
        "customer_name": _customer_name(order.customer),
        "customer_name_is_fallback": bool(
            order.customer_id and not (order.customer.full_name or "").strip()
        ),
        "kind": "online",
        "status": order.status,
        "status_label": online_status_label(order.status),
        "item_count": order.items_count,
    }


def _recent_pos_event(sale):
    return {
        "created_at": sale.created_at,
        "sales_line": sale.sales_line,
        "sales_line_label": SALES_LINE_LABELS.get(sale.sales_line, sale.sales_line),
        "id": sale.source_id,
        "customer_id": sale.customer.source_id if sale.customer_id else None,
        "customer_name": _customer_name(sale.customer),
        "customer_name_is_fallback": bool(
            sale.customer_id and not (sale.customer.full_name or "").strip()
        ),
        "kind": "pos",
        "status": sale.type
        if not sale.is_cancelled and not sale.deleted_at
        else ("cancelled" if sale.is_cancelled else "deleted"),
        "status_label": pos_status_label(sale),
        "item_count": sale.item_count,
    }


def _bucket_key(local_dt, group):
    jalali = jdatetime.datetime.fromgregorian(datetime=local_dt)
    if group == "monthly":
        iso = f"{jalali.year:04d}-{jalali.month:02d}"
        label = f"{jalali.year}/{jalali.month:02d}"
        sort = (jalali.year, jalali.month, 1)
    elif group == "weekly":
        week_start_date = local_dt.date() - timedelta(days=(local_dt.weekday() + 2) % 7)
        iso = week_start_date.isoformat()
        week_start_dt = local_dt.replace(
            year=week_start_date.year,
            month=week_start_date.month,
            day=week_start_date.day,
            hour=0,
            minute=0,
            second=0,
            microsecond=0,
        )
        label = format_jalali_date(week_start_dt, long=False)
        sort = (week_start_date.year, week_start_date.month, week_start_date.day)
    else:
        iso = local_dt.date().isoformat()
        label = format_jalali_date(local_dt, long=False)
        sort = (local_dt.year, local_dt.month, local_dt.day)
    return {"iso": iso, "label": label, "sort": sort}


def _ordered_bucket_keys(start, end, group):
    keys = []
    cursor = timezone.localtime(start)
    end_local = timezone.localtime(end)
    seen = set()
    while cursor < end_local:
        key = _bucket_key(cursor, group)
        if key["iso"] not in seen:
            seen.add(key["iso"])
            keys.append(key)
        if group == "monthly":
            jalali = jdatetime.datetime.fromgregorian(datetime=cursor)
            if jalali.month == 12:
                next_j = jdatetime.datetime(jalali.year + 1, 1, 1, tzinfo=cursor.tzinfo)
            else:
                next_j = jdatetime.datetime(jalali.year, jalali.month + 1, 1, tzinfo=cursor.tzinfo)
            cursor = next_j.togregorian()
            cursor = cursor.replace(tzinfo=cursor.tzinfo)
        elif group == "weekly":
            week_start_date = cursor.date() - timedelta(days=(cursor.weekday() + 2) % 7)
            cursor = cursor.replace(
                year=week_start_date.year,
                month=week_start_date.month,
                day=week_start_date.day,
                hour=0,
                minute=0,
                second=0,
                microsecond=0,
            ) + timedelta(days=7)
        else:
            cursor += timedelta(days=1)
    keys.sort(key=lambda row: row["sort"])
    return keys


def _parse_bound(value, end_of_day=False):
    text = str(value).strip()
    dt = django_parse_datetime(text)
    if dt is None:
        try:
            dt = datetime.strptime(text[:10], "%Y-%m-%d")
        except ValueError:
            return None
        if end_of_day:
            dt = dt.replace(hour=23, minute=59, second=59)
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, TEHRAN)
    return dt


def _downsample(points, size):
    if len(points) <= size:
        return points
    step = len(points) / size
    sampled = []
    index = 0.0
    while len(sampled) < size and int(index) < len(points):
        sampled.append(points[int(index)])
        index += step
    return sampled


def trend_points(orders, start, end):
    days = max(1, (end.date() - start.date()).days)
    buckets = {}
    for order in orders.only("created_at", "total_amount"):
        key = timezone.localtime(order.created_at).date().isoformat()
        buckets[key] = buckets.get(key, 0) + order.total_amount
    points = []
    cursor = timezone.localtime(start).date()
    last = timezone.localtime(end).date()
    while cursor < last:
        points.append({"date": cursor.isoformat(), "value": buckets.get(cursor.isoformat(), 0)})
        cursor += timedelta(days=1)
    if days > 120:
        return _downsample(points, 90)
    return points


def product_performance(start, end, limit=8):
    from apps.sales.semantics import ONLINE_ORDER_VALUE_STATUSES

    rows = (
        qualifying_online_items()
        .filter(
            order__created_at__gte=start,
            order__created_at__lt=end,
            order__status__in=ONLINE_ORDER_VALUE_STATUSES,
        )
        .values("product_source_id", "product__title", "title")
        .annotate(quantity=Sum("quantity"), value=Sum("amount"))
        .order_by("-quantity")[:limit]
    )
    results = []
    for row in rows:
        results.append(
            {
                "title": row["product__title"] or row["title"] or f"کالا {row['product_source_id'] or '—'}",
                "quantity": row["quantity"] or 0,
                "value": row["value"] or 0,
            }
        )
    return results
