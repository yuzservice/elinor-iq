"""Discover sales filter options from live database facts."""

from apps.integrations.elinor.gateway_payments import GATEWAY_METRICS
from apps.sales.models import OnlinePayment, PosSale, SalesLine
from apps.sales.semantics import SALES_LINE_LABELS

POS_PAYMENT_METHODS = (
    ("cash", "cash_amount", "نقد"),
    ("card", "card_by_card_amount", "کارت به کارت"),
    ("wallet", "from_wallet_amount", "کیف پول"),
    ("snappay", "snappay_cashier_amount", "اسنپ‌پی"),
    ("digipay", "digipay_cashier_amount", "دیجی‌پی"),
)

ONLINE_GATEWAY_LABELS = {
    "digipay": "دیجی‌پی",
    "snapppay": "اسنپ‌پی",
}

BRANCH_OPTIONS = (
    (SalesLine.ONLINE, SALES_LINE_LABELS[SalesLine.ONLINE]),
    (SalesLine.SARI, SALES_LINE_LABELS[SalesLine.SARI]),
    (SalesLine.GORGAN, SALES_LINE_LABELS[SalesLine.GORGAN]),
    (SalesLine.CAPRI, SALES_LINE_LABELS[SalesLine.CAPRI]),
)


def _gateway_label(gateway):
    key = str(gateway or "").strip().lower()
    if not key:
        return ""
    return ONLINE_GATEWAY_LABELS.get(key, key)


def sales_filter_options_payload():
    branches = [{"key": key, "label": label} for key, label in BRANCH_OPTIONS]
    payment_methods = []
    seen_payments = set()
    for gateway in (
        OnlinePayment.objects.exclude(gateway="")
        .values_list("gateway", flat=True)
        .distinct()
        .order_by("gateway")
    ):
        key = str(gateway or "").strip().lower()
        if not key or key in seen_payments:
            continue
        seen_payments.add(key)
        payment_methods.append(
            {
                "key": f"online:{key}",
                "label": _gateway_label(key),
                "scope": "online",
            }
        )

    for method_key, field_name, label in POS_PAYMENT_METHODS:
        composite = f"pos:{method_key}"
        if composite in seen_payments:
            continue
        if PosSale.objects.filter(**{f"{field_name}__gt": 0}).exists():
            seen_payments.add(composite)
            payment_methods.append(
                {
                    "key": composite,
                    "label": label,
                    "scope": "pos",
                }
            )

    return {
        "branches": branches,
        "payment_methods": payment_methods,
        "gateway_metrics": sorted(GATEWAY_METRICS),
    }
