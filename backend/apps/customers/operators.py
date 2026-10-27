"""Internal accounts: desk accounts and staff who place orders for other people under their own login.

Active rows of customers.InternalAccount are the source of truth (migration 0008_internalaccount moved the
former hard-coded desk mobile there). Sales totals still include these accounts' orders. Customer reports
(tiers, ranking, buyer counts, campaign customer reports) do not treat them as buyers.
Helpers query the table on each call; nothing is cached.
"""

OPERATOR_LABEL = "اکانت دفتر"
KIND_LABELS = {"desk": OPERATOR_LABEL, "staff": "کارمند"}

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


def active_internal_accounts():
    """customer_id -> kind for every active internal account (one query)."""
    from apps.customers.models import InternalAccount

    return dict(InternalAccount.objects.filter(is_active=True).values_list("customer_id", "kind"))


def operator_customer_ids():
    return set(active_internal_accounts())


def operator_customers():
    from apps.customers.models import Customer

    return Customer.objects.filter(internal_account__is_active=True)


def exclude_operator_accounts(qs):
    return qs.exclude(internal_account__is_active=True)


def exclude_operator_sales(qs, field="customer_id"):
    ids = operator_customer_ids()
    if not ids:
        return qs
    return qs.exclude(**{f"{field}__in": ids})


def operator_kind(customer, accounts=None):
    """Kind of an active internal account, or None. Pass `accounts` (active_internal_accounts()) for batches."""
    if customer is None or not getattr(customer, "pk", None):
        return None
    if accounts is not None:
        return accounts.get(customer.pk)
    from apps.customers.models import InternalAccount

    return (
        InternalAccount.objects.filter(customer_id=customer.pk, is_active=True).values_list("kind", flat=True).first()
    )


def is_operator_account(customer, accounts=None):
    return operator_kind(customer, accounts) is not None


def operator_payload(customer, accounts=None):
    kind = operator_kind(customer, accounts)
    return {
        "is_operator": kind is not None,
        "operator_kind": kind,
        "operator_label": KIND_LABELS.get(kind) if kind else None,
    }
