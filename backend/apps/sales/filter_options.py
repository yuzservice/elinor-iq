"""Discover sales filter options from live database facts."""

from apps.sales.semantics import SALES_LINE_LABELS, visible_sales_lines

GATEWAY_PAYMENT_OPTIONS = (
    ("snappay", "اسنپ‌پی"),
    ("digipay", "دیجی‌پی"),
)

def sales_filter_options_payload():
    return {
        "branches": [{"key": key, "label": SALES_LINE_LABELS[key]} for key in visible_sales_lines()],
        "payment_methods": [{"key": key, "label": label} for key, label in GATEWAY_PAYMENT_OPTIONS],
    }
