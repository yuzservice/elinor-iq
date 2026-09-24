"""Filtered overview KPI calculations for the sales summary tab."""

from django.db.models import Q, Sum, Value
from django.db.models.functions import Coalesce

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

POS_PAYMENT_FIELDS = {
    "cash": "cash_amount",
    "card": "card_by_card_amount",
    "wallet": "from_wallet_amount",
    "snappay": "snappay_cashier_amount",
    "digipay": "digipay_cashier_amount",
}

VALID_BRANCHES = frozenset({SalesLine.SARI, SalesLine.GORGAN, SalesLine.CAPRI})


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
    values = []
    for item in parse_csv_param(raw):
        text = item.strip().lower()
        if not text:
            continue
        if text.startswith("online:") or text.startswith("pos:"):
            if text not in values:
                values.append(text)
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
    gateways = [payment.split(":", 1)[1] for payment in payments if payment.startswith("online:")]
    if not gateways:
        return qs.none()
    condition = Q()
    for gateway in gateways:
        condition |= Q(
            online_invoices__payments__gateway=gateway,
            online_invoices__payments__status=ONLINE_GATEWAY_SUCCESS,
        )
    return qs.filter(condition).distinct()


def _apply_pos_payment_filter(qs, payments):
    if not payments:
        return qs
    methods = [payment.split(":", 1)[1] for payment in payments if payment.startswith("pos:")]
    if not methods:
        return qs.none()
    condition = Q()
    for method in methods:
        field_name = POS_PAYMENT_FIELDS.get(method)
        if field_name:
            condition |= Q(**{f"{field_name}__gt": 0})
    return qs.filter(condition) if condition else qs.none()


def filtered_online_orders(start, end, branches, channels, payments):
    del branches  # Online orders are not tied to POS branches.
    if not _includes_online(channels):
        return Order.objects.none()
    qs = qualifying_online_orders().filter(created_at__gte=start, created_at__lt=end)
    qs = _apply_online_channel_filter(qs, channels)
    if payments:
        qs = _apply_online_payment_filter(qs, payments)
    return qs


def filtered_online_value_orders(start, end, branches, channels, payments):
    qs = filtered_online_orders(start, end, branches, channels, payments)
    return online_order_value_orders(qs)


def filtered_pos_sales(start, end, branches, channels, payments):
    if not _includes_pos(channels):
        return PosSale.objects.none()
    qs = qualifying_pos_sales().filter(created_at__gte=start, created_at__lt=end)
    if branches:
        qs = qs.filter(sales_line__in=branches)
    if payments:
        qs = _apply_pos_payment_filter(qs, payments)
    return qs


def _refund_amount(start, end, branches, channels):
    if not _includes_pos(channels):
        return 0
    items = pos_refund_items().filter(
        pos_sale__created_at__gte=start,
        pos_sale__created_at__lt=end,
    )
    if branches:
        items = items.filter(pos_sale__sales_line__in=branches)
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
