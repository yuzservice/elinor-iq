"""Discover sales filter options from live database facts."""

from django.db.models import Q

from apps.integrations.elinor.gateway_payments import GATEWAY_METRICS
from apps.sales.models import OnlinePayment, Order, PosSale, STORE_SALES_LINE, Store
from apps.sales.semantics import SALES_LINE_OVERVIEW_LABELS

ONLINE_CHANNEL_DEFINITIONS = (
    ("website", Q(is_shopino=False, is_digify=False), "وب‌سایت"),
    ("shopino", Q(is_shopino=True), "شاپینو"),
    ("digify", Q(is_digify=True), "دیجی‌فای"),
)

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


def _gateway_label(gateway):
    key = str(gateway or "").strip().lower()
    if not key:
        return ""
    return ONLINE_GATEWAY_LABELS.get(key, key)


def sales_filter_options_payload():
    branches = []
    seen_lines = set()
    stores = Store.objects.filter(source_id__in=STORE_SALES_LINE.keys()).order_by("source_id")
    for store in stores:
        line = store.sales_line
        if not line or line in seen_lines:
            continue
        seen_lines.add(line)
        branches.append(
            {
                "key": line,
                "label": (store.label or "").strip() or SALES_LINE_OVERVIEW_LABELS.get(line, line),
            }
        )

    if not branches:
        for store_id, line in sorted(STORE_SALES_LINE.items()):
            if line in seen_lines:
                continue
            seen_lines.add(line)
            branches.append(
                {
                    "key": line,
                    "label": SALES_LINE_OVERVIEW_LABELS.get(line, line),
                }
            )

    channels = []
    for key, condition, label in ONLINE_CHANNEL_DEFINITIONS:
        if Order.objects.filter(condition).exists():
            channels.append({"key": key, "label": label})
    if PosSale.objects.filter(deleted_at__isnull=True).exists():
        channels.append({"key": "pos", "label": "حضوری"})

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
        "channels": channels,
        "payment_methods": payment_methods,
        "gateway_metrics": sorted(GATEWAY_METRICS),
    }
