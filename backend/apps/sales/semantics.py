"""Central sales semantics for ELINOR IQ.

Single source of truth for sales classification. Do not duplicate these rules
in queries elsewhere.

Online qualifying purchases
---------------------------
Counts, units, and buyer metrics include online orders whose status is NOT in
``ONLINE_EXCLUDED_STATUSES``.

Online order value (not unified revenue)
----------------------------------------
When an online monetary figure is shown it uses ``ONLINE_ORDER_VALUE_STATUSES``
and sums ``Order.total_amount``. This is online-only and must never be merged
with POS.

POS qualifying purchases
------------------------
Counts and units include POS headers where:
  - ``type`` is ``sell`` or ``both`` (pure ``refund`` headers are excluded)
  - ``is_cancelled`` is False
  - ``deleted_at`` is null

POS refunds, cancellations, and soft-deletes are separate facts — never merged
into sales counts.

Sales lines
-----------
  ONLINE — all website orders
  SARI   — ``store_id`` 3
  GORGAN — ``store_id`` 2
  CAPRI  — ``store_id`` 4
  store_id 1 (central warehouse) is NOT a sales line.
"""

from apps.sales.models import Order, OnlinePayment, PosSale, PosSaleItem, SalesLine, STORE_SALES_LINE

# --- Online status groups ---------------------------------------------------

ONLINE_EXCLUDED_STATUSES = ("canceled", "failed", "wait_for_payment")

ONLINE_CANCELED_STATUSES = ("canceled", "canceled_by_user")

ONLINE_FAILED_STATUSES = ("failed",)

ONLINE_WAIT_FOR_PAYMENT = "wait_for_payment"

# Documented successful payment/inventory statuses — online order value only.
ONLINE_ORDER_VALUE_STATUSES = (
    "new",
    "delivered",
    "in_progress",
    "reserved",
    "in_examination",
    "presale",
)

ONLINE_STATUS_LABELS = {
    "wait_for_payment": "در انتظار پرداخت",
    "new": "در انتظار تکمیل",
    "in_progress": "در حال پردازش",
    "in_examination": "در حال بررسی",
    "presale": "پیش‌فروش",
    "reserved": "رزرو",
    "delivered": "ارسال شده",
    "canceled": "لغو شده",
    "failed": "ناموفق",
    "canceled_by_user": "لغو توسط کاربر",
}

ONLINE_ORDER_VALUE_DEFINITION = (
    "جمع total_amount سفارش‌های آنلاین با وضعیت "
    "new, delivered, in_progress, reserved, in_examination, presale. "
    "این مبلغ فقط برای فروش آنلاین است و با POS ترکیب نمی‌شود."
)

ACTIVE_ONLINE_ITEM_STATUS = 1

# --- POS type groups --------------------------------------------------------

POS_TYPE_SELL = "sell"
POS_TYPE_REFUND = "refund"
POS_TYPE_BOTH = "both"

POS_QUALIFYING_TYPES = (POS_TYPE_SELL, POS_TYPE_BOTH)

POS_TYPE_LABELS = {
    POS_TYPE_SELL: "فروش",
    POS_TYPE_REFUND: "مرجوعی",
    POS_TYPE_BOTH: "تعویض",
}

POS_EXCHANGE_LABEL = "تعویض"

# --- Sales line labels ------------------------------------------------------

SALES_LINE_LABELS = {
    SalesLine.ONLINE: "آنلاین",
    SalesLine.SARI: "ساری",
    SalesLine.GORGAN: "گرگان",
    SalesLine.CAPRI: "کاپری",
}

SALES_LINE_OVERVIEW_LABELS = {
    SalesLine.ONLINE: "فروش آنلاین",
    SalesLine.SARI: "فروشگاه ساری",
    SalesLine.GORGAN: "فروشگاه گرگان",
    SalesLine.CAPRI: "فروشگاه کاپری",
}

SALES_LINE_FILTER_OPTIONS = (
    ("all", "همه"),
    (SalesLine.ONLINE, "آنلاین"),
    (SalesLine.SARI, "ساری"),
    (SalesLine.GORGAN, "گرگان"),
    (SalesLine.CAPRI, "کاپری"),
)

# --- Store mapping (canonical) ----------------------------------------------

STORE_ID_SARI = 3
STORE_ID_GORGAN = 2
STORE_ID_CAPRI = 4


def sales_line_for_store(store_id):
    return STORE_SALES_LINE.get(store_id, "")


def parse_sales_line_filter(raw):
    if not raw or raw == "all":
        return None
    value = str(raw).strip().upper()
    valid = {SalesLine.ONLINE, SalesLine.SARI, SalesLine.GORGAN, SalesLine.CAPRI}
    return value if value in valid else None


# --- Query helpers ----------------------------------------------------------


def qualifying_online_orders(qs=None):
    qs = Order.objects.all() if qs is None else qs
    return qs.exclude(status__in=ONLINE_EXCLUDED_STATUSES)


def online_order_value_orders(qs=None):
    qs = Order.objects.all() if qs is None else qs
    return qs.filter(status__in=ONLINE_ORDER_VALUE_STATUSES)


def qualifying_pos_sales(qs=None):
    qs = PosSale.objects.all() if qs is None else qs
    return qs.filter(deleted_at__isnull=True, is_cancelled=False, type__in=POS_QUALIFYING_TYPES)


def pos_refund_sales(qs=None):
    qs = PosSale.objects.all() if qs is None else qs
    return qs.filter(type=POS_TYPE_REFUND, deleted_at__isnull=True)


def pos_exchange_sales(qs=None):
    qs = PosSale.objects.all() if qs is None else qs
    return qs.filter(type=POS_TYPE_BOTH, deleted_at__isnull=True, is_cancelled=False)


def pos_refund_items(qs=None):
    qs = PosSaleItem.objects.all() if qs is None else qs
    return qs.filter(
        type=POS_TYPE_REFUND,
        deleted_at__isnull=True,
        pos_sale__deleted_at__isnull=True,
    )


def pos_exchange_replacement_items(qs=None):
    """Sell items delivered as part of an exchange (``both`` header)."""
    qs = PosSaleItem.objects.all() if qs is None else qs
    return qs.filter(
        type=POS_TYPE_SELL,
        deleted_at__isnull=True,
        pos_sale__deleted_at__isnull=True,
        pos_sale__type=POS_TYPE_BOTH,
    )


def pos_cancelled_sales(qs=None):
    qs = PosSale.objects.all() if qs is None else qs
    return qs.filter(is_cancelled=True, deleted_at__isnull=True)


def pos_deleted_sales(qs=None):
    qs = PosSale.objects.all() if qs is None else qs
    return qs.filter(deleted_at__isnull=False)


def online_canceled_orders(qs=None):
    qs = Order.objects.all() if qs is None else qs
    return qs.filter(status__in=ONLINE_CANCELED_STATUSES)


def online_failed_orders(qs=None):
    qs = Order.objects.all() if qs is None else qs
    return qs.filter(status__in=ONLINE_FAILED_STATUSES)


def online_wait_for_payment_orders(qs=None):
    qs = Order.objects.all() if qs is None else qs
    return qs.filter(status=ONLINE_WAIT_FOR_PAYMENT)


def qualifying_online_items(qs=None):
    from apps.sales.models import OrderItem

    qs = OrderItem.objects.all() if qs is None else qs
    return qs.filter(status=ACTIVE_ONLINE_ITEM_STATUS).exclude(
        order__status__in=ONLINE_EXCLUDED_STATUSES
    )


def qualifying_pos_items(qs=None):
    qs = PosSaleItem.objects.all() if qs is None else qs
    return qs.filter(
        deleted_at__isnull=True,
        type=POS_TYPE_SELL,
        pos_sale__deleted_at__isnull=True,
        pos_sale__is_cancelled=False,
        pos_sale__type__in=POS_QUALIFYING_TYPES,
    )


def filter_by_sales_line_online(qs, sales_line):
    if sales_line and sales_line != SalesLine.ONLINE:
        return qs.none()
    return qs


def filter_by_sales_line_pos(qs, sales_line):
    if sales_line is None:
        return qs
    if sales_line == SalesLine.ONLINE:
        return qs.none()
    field = "pos_sale__sales_line" if qs.model is PosSaleItem else "sales_line"
    return qs.filter(**{field: sales_line})


def online_status_label(status):
    return ONLINE_STATUS_LABELS.get(status, status or "—")


def pos_status_key(sale):
    if sale.deleted_at:
        return "deleted"
    if sale.is_cancelled:
        return "cancelled"
    return sale.type or POS_TYPE_SELL


def pos_status_label(sale):
    if sale.deleted_at:
        return "حذف‌شده"
    if sale.is_cancelled:
        return "لغو شده"
    return POS_TYPE_LABELS.get(sale.type, sale.type or "فروش")


def pos_recent_status_label(sale):
    """Label for recent-sales table; refunds stay explicit."""
    return pos_status_label(sale)


# --- Online gateway payments (DigiPay / SnappPay KPI) -----------------------

ONLINE_GATEWAY_SUCCESS = "success"


def qualifying_online_gateway_payments(gateway, qs=None):
    qs = OnlinePayment.objects.all() if qs is None else qs
    return qs.filter(
        gateway=gateway,
        status=ONLINE_GATEWAY_SUCCESS,
        invoice__status=ONLINE_GATEWAY_SUCCESS,
    )
