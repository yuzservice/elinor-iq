"""Discover sales filter options from live database facts."""

from apps.sales.models import SalesLine
from apps.sales.semantics import SALES_LINE_LABELS

GATEWAY_PAYMENT_OPTIONS = (
    ("snappay", "اسنپ‌پی"),
    ("digipay", "دیجی‌پی"),
)

BRANCH_OPTIONS = (
    (SalesLine.ONLINE, SALES_LINE_LABELS[SalesLine.ONLINE]),
    (SalesLine.SARI, SALES_LINE_LABELS[SalesLine.SARI]),
    (SalesLine.GORGAN, SALES_LINE_LABELS[SalesLine.GORGAN]),
    (SalesLine.CAPRI, SALES_LINE_LABELS[SalesLine.CAPRI]),
)


def sales_filter_options_payload():
    return {
        "branches": [{"key": key, "label": label} for key, label in BRANCH_OPTIONS],
        "payment_methods": [{"key": key, "label": label} for key, label in GATEWAY_PAYMENT_OPTIONS],
    }
