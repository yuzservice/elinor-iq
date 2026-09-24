from datetime import timedelta

from django.db.models import F, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone

from apps.sales.analysis import _all_line_metrics, _pct_change, previous_window
from apps.sales.models import Order, PosSale, SalesLine
from apps.sales.semantics import (
    SALES_LINE_OVERVIEW_LABELS,
    online_order_value_orders,
    qualifying_online_items,
    qualifying_pos_items,
    qualifying_pos_sales,
)

HOME_PERIODS = {
    "day": timedelta(days=1),
    "week": timedelta(days=7),
    "month": timedelta(days=30),
    "quarter": timedelta(days=92),
}

METRIC_CARDS = (
    ("sales_amount", "مبلغ فروش کل", "money"),
    ("units_sold", "تعداد کالای فروش‌رفته", "units"),
    ("snappay", "اسنپ‌پی", "snappay"),
    ("digipay", "دیجی‌پی", "digipay"),
)


def parse_home_period(raw):
    period = (raw or "month").strip().lower()
    return period if period in HOME_PERIODS else "month"


def home_period_window(period):
    end = timezone.now()
    start = end - HOME_PERIODS[period]
    return start, end


def _line_values(keys, online_value, pos_map):
    lines = []
    total = 0
    for key in keys:
        value = online_value if key == SalesLine.ONLINE else int(pos_map.get(key, 0) or 0)
        total += value
        lines.append(
            {
                "key": key,
                "label": SALES_LINE_OVERVIEW_LABELS[key],
                "value": value,
            }
        )
    return total, lines


def _online_sales_amount(start, end):
    return int(
        online_order_value_orders()
        .filter(created_at__gte=start, created_at__lt=end)
        .aggregate(v=Sum("total_amount"))["v"]
        or 0
    )


def _pos_item_amounts(start, end):
    line_total = Coalesce(F("amount"), Value(0)) * Coalesce(F("quantity"), Value(0))
    rows = (
        qualifying_pos_items()
        .filter(pos_sale__created_at__gte=start, pos_sale__created_at__lt=end)
        .values("pos_sale__sales_line")
        .annotate(total=Sum(line_total))
    )
    return {row["pos_sale__sales_line"]: int(row["total"] or 0) for row in rows}


def _pos_payment_amounts(start, end, field_name):
    rows = (
        qualifying_pos_sales()
        .filter(created_at__gte=start, created_at__lt=end)
        .values("sales_line")
        .annotate(total=Sum(field_name))
    )
    return {row["sales_line"]: int(row["total"] or 0) for row in rows}


def home_metric_cards(start, end):
    keys = (SalesLine.ONLINE, SalesLine.SARI, SalesLine.GORGAN, SalesLine.CAPRI)
    line_metrics = _all_line_metrics(start, end)
    online_amount = _online_sales_amount(start, end)
    pos_amounts = _pos_item_amounts(start, end)
    snappay_pos = _pos_payment_amounts(start, end, "snappay_cashier_amount")
    digipay_pos = _pos_payment_amounts(start, end, "digipay_cashier_amount")

    sales_total, sales_lines = _line_values(keys, online_amount, pos_amounts)
    units_total = sum(line_metrics[key]["units_sold"] for key in keys)
    units_lines = [
        {
            "key": key,
            "label": SALES_LINE_OVERVIEW_LABELS[key],
            "value": line_metrics[key]["units_sold"],
        }
        for key in keys
    ]
    snappay_total, snappay_lines = _line_values(keys, 0, snappay_pos)
    digipay_total, digipay_lines = _line_values(keys, 0, digipay_pos)

    values = {
        "sales_amount": (sales_total, sales_lines),
        "units_sold": (units_total, units_lines),
        "snappay": (snappay_total, snappay_lines),
        "digipay": (digipay_total, digipay_lines),
    }

    prev_start, prev_end = previous_window(start, end)
    prev_cards = home_metric_cards_values(prev_start, prev_end)

    cards = []
    for key, label, kind in METRIC_CARDS:
        total, lines = values[key]
        cards.append(
            {
                "key": key,
                "label": label,
                "kind": kind,
                "total": total,
                "lines": lines,
                "change_pct": _pct_change(total, prev_cards[key]),
            }
        )
    return cards


def home_metric_cards_values(start, end):
    keys = (SalesLine.ONLINE, SalesLine.SARI, SalesLine.GORGAN, SalesLine.CAPRI)
    line_metrics = _all_line_metrics(start, end)
    online_amount = _online_sales_amount(start, end)
    pos_amounts = _pos_item_amounts(start, end)
    snappay_pos = _pos_payment_amounts(start, end, "snappay_cashier_amount")
    digipay_pos = _pos_payment_amounts(start, end, "digipay_cashier_amount")
    return {
        "sales_amount": _line_values(keys, online_amount, pos_amounts)[0],
        "units_sold": sum(line_metrics[key]["units_sold"] for key in keys),
        "snappay": _line_values(keys, 0, snappay_pos)[0],
        "digipay": _line_values(keys, 0, digipay_pos)[0],
    }
