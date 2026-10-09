"""Desk accounts that register other people's orders under one login.

Sales totals still include those orders. Customer ranking does not treat the
account as a buyer. Add a mobile here when another operator works the same way.
"""

OPERATOR_LABEL = "اکانت دفتر"

# Canonical Iranian mobiles, stored the way Elinor keeps them.
OPERATOR_MOBILES = ("09362506974",)

_DIGIT_TRANSLATION = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")


def canonical_mobile(value):
    digits = "".join(ch for ch in str(value or "").translate(_DIGIT_TRANSLATION) if ch.isdigit())
    if digits.startswith("0098"):
        digits = digits[4:]
    elif digits.startswith("98") and len(digits) > 10:
        digits = digits[2:]
    if len(digits) == 10:
        digits = "0" + digits
    return digits


def operator_mobile_variants():
    variants = set()
    for mobile in OPERATOR_MOBILES:
        canonical = canonical_mobile(mobile)
        if not canonical:
            continue
        variants.add(canonical)
        if canonical.startswith("0") and len(canonical) == 11:
            national = canonical[1:]
            variants.add(national)
            variants.add(f"98{national}")
            variants.add(f"+98{national}")
    return variants


def is_operator_account(customer):
    if customer is None:
        return False
    return canonical_mobile(getattr(customer, "mobile", "")) in {canonical_mobile(mobile) for mobile in OPERATOR_MOBILES}


def operator_payload(customer):
    flagged = is_operator_account(customer)
    return {
        "is_operator": flagged,
        "operator_label": OPERATOR_LABEL if flagged else None,
    }


def operator_customers():
    from apps.customers.models import Customer

    variants = operator_mobile_variants()
    if not variants:
        return Customer.objects.none()
    return Customer.objects.filter(mobile__in=variants)


def operator_customer_ids():
    return set(operator_customers().values_list("pk", flat=True))


def exclude_operator_accounts(qs):
    variants = operator_mobile_variants()
    if not variants:
        return qs
    return qs.exclude(mobile__in=variants)


def exclude_operator_sales(qs, field="customer_id"):
    ids = operator_customer_ids()
    if not ids:
        return qs
    return qs.exclude(**{f"{field}__in": ids})
