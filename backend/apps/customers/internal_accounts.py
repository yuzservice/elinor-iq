"""Management of internal (staff / desk) accounts. Super admins confirm or restore them.

Any change starts the background tier refresh, which also refreshes RFM, so exclusion
and restoration reach tiers, tier history and RFM without waiting for the daily run.
"""

from django.db import transaction

from apps.customers.models import Customer, InternalAccount
from apps.customers.operators import KIND_LABELS


class InternalAccountError(ValueError):
    def __init__(self, errors):
        super().__init__("اطلاعات حساب داخلی معتبر نیست.")
        self.errors = errors


def _username(user):
    return user.username if user is not None else None


def account_payload(account):
    customer = account.customer
    return {
        "id": account.pk,
        "customer_source_id": customer.source_id,
        "name": (customer.full_name or "").strip(),
        "mobile": customer.mobile or "",
        "kind": account.kind,
        "kind_label": KIND_LABELS.get(account.kind, account.kind),
        "note": account.note,
        "is_active": account.is_active,
        "created_by": _username(account.created_by),
        "created_at": account.created_at,
        "updated_by": _username(account.updated_by),
        "updated_at": account.updated_at,
    }


def internal_account_payload(customer):
    """For Customer 360: the account row (active or not), or None."""
    account = InternalAccount.objects.filter(customer=customer).select_related("created_by", "updated_by").first()
    if account is None:
        return None
    return {
        "id": account.pk,
        "kind": account.kind,
        "kind_label": KIND_LABELS.get(account.kind, account.kind),
        "note": account.note,
        "is_active": account.is_active,
        "created_by": _username(account.created_by),
        "created_at": account.created_at,
        "updated_by": _username(account.updated_by),
        "updated_at": account.updated_at,
    }


def list_accounts():
    rows = InternalAccount.objects.select_related("customer", "created_by", "updated_by").order_by("-is_active", "-updated_at")
    return [account_payload(row) for row in rows]


def _clean_kind(value, errors, required):
    if value is None:
        if required:
            errors["kind"] = "نوع حساب را انتخاب کنید («کارمند» یا «اکانت دفتر»)."
        return None
    if value not in KIND_LABELS:
        errors["kind"] = "نوع حساب باید «کارمند» یا «اکانت دفتر» باشد."
        return None
    return value


def _clean_note(value, errors):
    if value is None:
        return None
    if not isinstance(value, str):
        errors["note"] = "یادداشت باید متن باشد."
        return None
    return value.strip()


def create_or_reactivate(user, data):
    errors = {}
    source_id = data.get("customer_source_id")
    customer = None
    if isinstance(source_id, bool) or not isinstance(source_id, int):
        errors["customer_source_id"] = "شناسه مشتری را وارد کنید."
    else:
        customer = Customer.objects.filter(source_id=source_id).first()
        if customer is None:
            errors["customer_source_id"] = "مشتری با این شناسه پیدا نشد."
    kind = _clean_kind(data.get("kind"), errors, required=True)
    note = _clean_note(data.get("note"), errors)
    if errors:
        raise InternalAccountError(errors)
    with transaction.atomic():
        account, created = InternalAccount.objects.select_for_update().get_or_create(
            customer=customer,
            defaults={"kind": kind, "note": note or "", "is_active": True, "created_by": user, "updated_by": user},
        )
        if not created:
            account.kind = kind
            if note is not None:
                account.note = note
            account.is_active = True
            account.updated_by = user
            account.save()
    return account, created, _refresh_after_change()


def update_account(user, account_id, data):
    errors = {}
    unknown = sorted(set(data) - {"kind", "note", "is_active"})
    if unknown:
        errors["_"] = f"فیلد ناشناخته: {', '.join(unknown)}"
    kind = _clean_kind(data.get("kind"), errors, required=False)
    note = _clean_note(data.get("note"), errors)
    is_active = data.get("is_active")
    if is_active is not None and not isinstance(is_active, bool):
        errors["is_active"] = "وضعیت فعال بودن باید بله یا خیر باشد."
    if errors:
        raise InternalAccountError(errors)
    with transaction.atomic():
        account = InternalAccount.objects.select_for_update().filter(pk=account_id).first()
        if account is None:
            return None, False
        status_changed = is_active is not None and is_active != account.is_active
        if kind is not None:
            account.kind = kind
        if note is not None:
            account.note = note
        if is_active is not None:
            account.is_active = is_active
        account.updated_by = user
        account.save()
    return account, _refresh_after_change() if status_changed else False


def _refresh_after_change():
    """Start the background tier + RFM refresh. False when one is already running."""
    from apps.customers.tier_refresh import start_full_tier_refresh

    return start_full_tier_refresh()
