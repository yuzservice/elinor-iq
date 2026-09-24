from apps.core.metrics import STATUS_LABELS

UNNAMED_CUSTOMER = "مشتری بدون نام"
INCOMPLETE_LABEL = "اطلاعات ناقص"

GENDER_LABELS = {
    "male": "مرد",
    "female": "زن",
    "m": "مرد",
    "f": "زن",
    "man": "مرد",
    "woman": "زن",
}


def display_name(customer):
    name = (customer.full_name or "").strip()
    return name or UNNAMED_CUSTOMER


def is_incomplete(customer):
    return not (customer.full_name or "").strip() or not (customer.mobile or "").strip()


def gender_label(value):
    if not value:
        return ""
    return GENDER_LABELS.get(str(value).strip().lower(), str(value))


def list_payload(customer):
    name = (customer.full_name or "").strip()
    return {
        "id": customer.source_id,
        "name": name or UNNAMED_CUSTOMER,
        "name_is_fallback": not bool(name),
        "incomplete": is_incomplete(customer),
        "incomplete_label": INCOMPLETE_LABEL if is_incomplete(customer) else None,
        "mobile": customer.mobile or "",
        "order_count": customer.order_count,
        "first_purchase_at": customer.first_order_at,
        "last_purchase_at": customer.last_order_at,
        "status": customer.status or "—",
        "is_purchasing": customer.order_count > 0,
    }


def order_customer_name(customer):
    if customer is None:
        return "—"
    return display_name(customer)


def status_label(status):
    return STATUS_LABELS.get(status, status or "—")


def customer_status_label(status):
    text = str(status or "").strip()
    if text in {"1", "active", "True", "true"}:
        return "فعال"
    if text in {"0", "inactive", "disabled", "False", "false"}:
        return "غیرفعال"
    return text or ""
