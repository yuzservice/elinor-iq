"""Filtered overview KPI calculations for the sales summary tab."""

from django.db.models import Count, Q, Sum
from django.utils import timezone

from apps.sales.analysis import _pct_change, _pos_line_total_expr
from apps.sales.models import Order, PosSale, SalesLine
from apps.sales.semantics import (
    ONLINE_GATEWAY_SUCCESS,
    online_order_value_orders,
    pos_refund_items,
    qualifying_online_items,
    qualifying_online_orders,
    qualifying_pos_items,
    qualifying_pos_sales,
)

ONLINE_CHANNEL_FILTERS = {
    "website": Q(is_shopino=False, is_digify=False),
    "shopino": Q(is_shopino=True),
    "digify": Q(is_digify=True),
}

GATEWAY_PAYMENTS = {
    "snappay": {"gateway": "snapppay", "pos_field": "snappay_cashier_amount"},
    "digipay": {"gateway": "digipay", "pos_field": "digipay_cashier_amount"},
}

VALID_BRANCHES = frozenset({SalesLine.ONLINE, SalesLine.SARI, SalesLine.GORGAN, SalesLine.CAPRI})


def parse_csv_param(raw):
    if not raw:
        return []
    return [part.strip() for part in str(raw).split(",") if part.strip()]


def parse_branch_filter(raw):
    values = []
    for item in parse_csv_param(raw):
        key = item.strip().upper()
        if key in VALID_BRANCHES and key not in values:
            values.append(key)
    return values


def parse_channel_filter(raw):
    values = []
    for item in parse_csv_param(raw):
        key = item.strip().lower()
        if key in ONLINE_CHANNEL_FILTERS or key == "pos":
            if key not in values:
                values.append(key)
    return values


def parse_payment_filter(raw):
    aliases = {
        "snappay": "snappay",
        "snapppay": "snappay",
        "online:snapppay": "snappay",
        "pos:snappay": "snappay",
        "digipay": "digipay",
        "online:digipay": "digipay",
        "pos:digipay": "digipay",
    }
    values = []
    for item in parse_csv_param(raw):
        key = aliases.get(item.strip().lower())
        if key and key not in values:
            values.append(key)
    return values


def _includes_online(channels):
    if not channels:
        return True
    return any(key in ONLINE_CHANNEL_FILTERS for key in channels)


def _includes_pos(channels):
    if not channels:
        return True
    return "pos" in channels


def _apply_online_channel_filter(qs, channels):
    if not channels:
        return qs
    online_keys = [key for key in channels if key in ONLINE_CHANNEL_FILTERS]
    if not online_keys:
        return qs.none()
    condition = Q()
    for key in online_keys:
        condition |= ONLINE_CHANNEL_FILTERS[key]
    return qs.filter(condition)


def _apply_online_payment_filter(qs, payments):
    if not payments:
        return qs
    condition = Q()
    for payment in payments:
        gateway = GATEWAY_PAYMENTS[payment]["gateway"]
        condition |= Q(
            online_invoices__payments__gateway=gateway,
            online_invoices__payments__status=ONLINE_GATEWAY_SUCCESS,
        )
    return qs.filter(condition).distinct()


def _apply_pos_payment_filter(qs, payments):
    if not payments:
        return qs
    condition = Q()
    for payment in payments:
        field_name = GATEWAY_PAYMENTS[payment]["pos_field"]
        condition |= Q(**{f"{field_name}__gt": 0})
    return qs.filter(condition)


def filtered_online_orders(start, end, branches, channels, payments):
    del channels
    branches = branches or []
    if branches and SalesLine.ONLINE not in branches:
        return Order.objects.none()
    qs = qualifying_online_orders().filter(created_at__gte=start, created_at__lt=end)
    if payments:
        qs = _apply_online_payment_filter(qs, payments)
    return qs


def filtered_online_value_orders(start, end, branches, channels, payments):
    qs = filtered_online_orders(start, end, branches, channels, payments)
    return online_order_value_orders(qs)


def filtered_pos_sales(start, end, branches, channels, payments):
    del channels
    branches = branches or []
    pos_branches = [branch for branch in branches if branch != SalesLine.ONLINE]
    if branches and not pos_branches:
        return PosSale.objects.none()
    qs = qualifying_pos_sales().filter(created_at__gte=start, created_at__lt=end)
    if pos_branches:
        qs = qs.filter(sales_line__in=pos_branches)
    if payments:
        qs = _apply_pos_payment_filter(qs, payments)
    return qs


def _refund_amount(start, end, branches, channels):
    del channels
    pos_branches = [branch for branch in branches if branch != SalesLine.ONLINE]
    if branches and not pos_branches:
        return 0
    items = pos_refund_items().filter(
        pos_sale__created_at__gte=start,
        pos_sale__created_at__lt=end,
    )
    if pos_branches:
        items = items.filter(pos_sale__sales_line__in=pos_branches)
    total = items.aggregate(total=Sum(_pos_line_total_expr()))["total"]
    return int(abs(total or 0))


def compute_overview_kpis(start, end, branches=None, channels=None, payments=None):
    branches = branches or []
    channels = channels or []
    payments = payments or []

    online_orders = filtered_online_orders(start, end, branches, channels, payments)
    online_value_orders = filtered_online_value_orders(start, end, branches, channels, payments)
    pos_sales = filtered_pos_sales(start, end, branches, channels, payments)

    online_sales = int(online_value_orders.aggregate(total=Sum("total_amount"))["total"] or 0)
    pos_sales_amount = int(
        qualifying_pos_items()
        .filter(pos_sale__in=pos_sales)
        .aggregate(total=Sum(_pos_line_total_expr()))["total"]
        or 0
    )
    gross_sales = online_sales + pos_sales_amount
    refund_amount = _refund_amount(start, end, branches, channels)
    net_sales = max(gross_sales - refund_amount, 0)

    order_count = online_orders.count() + pos_sales.count()
    online_units = int(
        qualifying_online_items()
        .filter(order__in=online_orders)
        .aggregate(total=Sum("quantity"))["total"]
        or 0
    )
    pos_units = int(
        qualifying_pos_items()
        .filter(pos_sale__in=pos_sales)
        .aggregate(total=Sum("quantity"))["total"]
        or 0
    )
    items_sold = online_units + pos_units

    avg_order_amount = int(round(net_sales / order_count)) if order_count else 0
    avg_items_per_order = round(items_sold / order_count, 2) if order_count else 0
    refund_rate_pct = round((refund_amount / gross_sales) * 100, 1) if gross_sales > 0 else 0

    return {
        "net_sales": net_sales,
        "gross_sales": gross_sales,
        "order_count": order_count,
        "items_sold": items_sold,
        "avg_order_amount": avg_order_amount,
        "avg_items_per_order": avg_items_per_order,
        "refund_amount": refund_amount,
        "refund_rate_pct": refund_rate_pct,
    }


def _metric_payload(value, compare_value):
    return {
        "value": value,
        "compare_value": compare_value,
        "change_pct": _pct_change(value, compare_value) if compare_value is not None else None,
    }


def overview_kpis_payload(
    start,
    end,
    branches=None,
    channels=None,
    payments=None,
    compare_start=None,
    compare_end=None,
):
    current = compute_overview_kpis(start, end, branches, channels, payments)
    compare = None
    if compare_start and compare_end and compare_start < compare_end:
        compare = compute_overview_kpis(compare_start, compare_end, branches, channels, payments)

    def compare_value(key):
        return compare[key] if compare else None

    return {
        "net_sales": _metric_payload(current["net_sales"], compare_value("net_sales")),
        "order_count": _metric_payload(current["order_count"], compare_value("order_count")),
        "items_sold": _metric_payload(current["items_sold"], compare_value("items_sold")),
        "avg_order_amount": _metric_payload(current["avg_order_amount"], compare_value("avg_order_amount")),
        "avg_items_per_order": _metric_payload(current["avg_items_per_order"], compare_value("avg_items_per_order")),
        "refund_amount": _metric_payload(current["refund_amount"], compare_value("refund_amount")),
        "refund_rate_pct": _metric_payload(current["refund_rate_pct"], compare_value("refund_rate_pct")),
    }


TREND_GROUPS = frozenset({"daily", "weekly", "monthly"})


def parse_overview_trend_group(raw):
    group = (raw or "daily").strip().lower()
    return group if group in TREND_GROUPS else "daily"


def _empty_point():
    return {"net_sales": 0, "order_count": 0, "items_sold": 0, "refund_amount": 0}


def _bucket_points(start, end, branches, channels, payments, group):
    from apps.sales.services import _bucket_key, _ordered_bucket_keys

    buckets = {key["iso"]: {**key, **_empty_point()} for key in _ordered_bucket_keys(start, end, group)}

    def add(created_at, **deltas):
        if not created_at:
            return
        key = _bucket_key(timezone.localtime(created_at), group)
        bucket = buckets.get(key["iso"])
        if not bucket:
            return
        for field, value in deltas.items():
            bucket[field] += int(value or 0)

    online_orders = filtered_online_orders(start, end, branches, channels, payments)
    for row in online_orders.order_by().values("created_at").annotate(orders=Count("id")):
        add(row["created_at"], order_count=row["orders"])
    for row in filtered_online_value_orders(start, end, branches, channels, payments).order_by().values("created_at").annotate(
        amount=Sum("total_amount")
    ):
        add(row["created_at"], net_sales=row["amount"])
    for row in qualifying_online_items().filter(order__in=online_orders).order_by().values("order__created_at").annotate(
        units=Sum("quantity")
    ):
        add(row["order__created_at"], items_sold=row["units"])

    pos_sales = filtered_pos_sales(start, end, branches, channels, payments)
    for row in pos_sales.order_by().values("created_at").annotate(orders=Count("id")):
        add(row["created_at"], order_count=row["orders"])
    for row in qualifying_pos_items().filter(pos_sale__in=pos_sales).order_by().values("pos_sale__created_at").annotate(
        amount=Sum(_pos_line_total_expr()),
        units=Sum("quantity"),
    ):
        add(row["pos_sale__created_at"], net_sales=row["amount"], items_sold=row["units"])

    branches = branches or []
    pos_branches = [branch for branch in branches if branch != SalesLine.ONLINE]
    refunds = pos_refund_items().filter(pos_sale__created_at__gte=start, pos_sale__created_at__lt=end)
    if branches and not pos_branches:
        refunds = refunds.none()
    elif pos_branches:
        refunds = refunds.filter(pos_sale__sales_line__in=pos_branches)
    for row in refunds.order_by().values("pos_sale__created_at").annotate(amount=Sum(_pos_line_total_expr())):
        add(row["pos_sale__created_at"], refund_amount=abs(int(row["amount"] or 0)))

    points = []
    for bucket in buckets.values():
        net_sales = max(int(bucket["net_sales"]) - int(bucket["refund_amount"]), 0)
        points.append(
            {
                "date": bucket["iso"],
                "label": bucket["label"],
                "net_sales": net_sales,
                "order_count": int(bucket["order_count"]),
                "items_sold": int(bucket["items_sold"]),
            }
        )
    points.sort(key=lambda row: row["date"])
    return points


def overview_trend_payload(start, end, branches=None, channels=None, payments=None, group="daily", compare_start=None, compare_end=None):
    points = _bucket_points(start, end, branches, channels, payments, group)
    compare_points = []
    if compare_start and compare_end and compare_start < compare_end:
        compare_points = _bucket_points(compare_start, compare_end, branches, channels, payments, group)
    merged = []
    for index, point in enumerate(points):
        compare = compare_points[index] if index < len(compare_points) else None
        merged.append({**point, "compare": compare})
    return {"group": group, "points": merged}
