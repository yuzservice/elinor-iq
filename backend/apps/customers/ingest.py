"""Upsert customers from any ingestion source into local PostgreSQL."""

from apps.integrations.elinor.parsers import as_int, extract_list, parse_datetime

from .models import Customer

PROFILE_KEYS = {
    "first_name": ("first_name", "firstName", "name"),
    "last_name": ("last_name", "lastName", "family"),
    "mobile": ("mobile", "phone", "cellphone"),
    "email": ("email",),
    "status": ("status",),
    "national_code": ("national_code", "nationalCode", "melli_code", "nationalcode"),
    "gender": ("gender", "sex"),
    "card_number": ("card_number", "cardNumber", "card"),
    "club_level": ("club_level", "clubLevel", "club", "level", "customer_level"),
    "summary": ("summary", "admin_summary", "adminSummary", "description", "note"),
}

ADDRESS_PROVINCE = ("province", "province_name", "state", "ostan")
ADDRESS_CITY = ("city", "city_name", "town")
ADDRESS_TEXT = ("address", "address_text", "full_address", "address1")
ADDRESS_POSTAL = ("postal_code", "postalCode", "zip", "zipcode")
ADDRESS_RECIPIENT = ("receiver", "recipient", "recipient_name", "name", "full_name")
ADDRESS_MOBILE = ("recipient_mobile", "mobile", "phone", "receiver_mobile")


def _first_text(payload, keys):
    if not isinstance(payload, dict):
        return ""
    for key in keys:
        value = payload.get(key)
        if value in (None, ""):
            continue
        if isinstance(value, dict):
            nested = _first_text(value, ("name", "title", "label", "value"))
            if nested:
                return nested
            continue
        text = str(value).strip()
        if text:
            return text
    return ""


def _parse_date(value):
    parsed = parse_datetime(value)
    return parsed.date() if parsed else None


def normalize_addresses(payload):
    if not isinstance(payload, dict):
        return []
    rows = extract_list(payload, ("addresses", "address_list", "customer_addresses"))
    if not rows:
        raw_address = payload.get("address")
        if isinstance(raw_address, list):
            rows = raw_address
        elif isinstance(raw_address, dict):
            rows = [raw_address]
        elif isinstance(raw_address, str) and raw_address.strip():
            rows = [{"address": raw_address.strip()}]
    normalized = []
    for row in rows:
        if isinstance(row, str) and row.strip():
            row = {"address": row.strip()}
        if not isinstance(row, dict):
            continue
        item = {
            "province": _first_text(row, ADDRESS_PROVINCE),
            "city": _first_text(row, ADDRESS_CITY),
            "address": _first_text(row, ADDRESS_TEXT),
            "postal_code": _first_text(row, ADDRESS_POSTAL),
            "recipient_name": _first_text(row, ADDRESS_RECIPIENT),
            "recipient_mobile": _first_text(row, ADDRESS_MOBILE),
            "raw": row,
        }
        if any(item[key] for key in ("province", "city", "address", "postal_code", "recipient_name", "recipient_mobile")):
            normalized.append(item)
    return normalized


def extract_profile_fields(payload):
    if not isinstance(payload, dict):
        return {}
    fields = {}
    for field, keys in PROFILE_KEYS.items():
        value = _first_text(payload, keys)
        if field == "first_name" and value and " " in value and not _first_text(payload, PROFILE_KEYS["last_name"]):
            # Keep a single "name" as first_name only; do not invent a split.
            fields[field] = value
        elif value:
            fields[field] = value
    birth = _parse_date(payload.get("birth_date") or payload.get("birthDate") or payload.get("birthday"))
    if birth:
        fields["birth_date"] = birth
    created = parse_datetime(payload.get("created_at") or payload.get("createdAt"))
    updated = parse_datetime(payload.get("updated_at") or payload.get("updatedAt"))
    if created:
        fields["created_at_source"] = created
    if updated:
        fields["updated_at_source"] = updated
    addresses = normalize_addresses(payload)
    if addresses:
        fields["addresses"] = addresses
    return fields


def apply_customer_payload(customer, payload):
    """Fill profile fields without wiping richer values or order statistics."""
    extracted = extract_profile_fields(payload)
    for field, value in extracted.items():
        if field in {"first_order_at", "last_order_at", "order_count"}:
            continue
        current = getattr(customer, field, None)
        if field == "addresses":
            if value and (not current or current == []):
                customer.addresses = value
            elif value:
                customer.addresses = value
            continue
        if value in (None, ""):
            continue
        setattr(customer, field, value)
    if isinstance(payload, dict):
        customer.source_payload = payload
    return customer


def upsert_customer_from_source(payload):
    source_id = as_int((payload or {}).get("id"), default=None)
    if not source_id:
        return None, False
    customer, created = Customer.objects.get_or_create(source_id=source_id)
    apply_customer_payload(customer, payload)
    customer.save()
    return customer, created


def addresses_for(customer):
    records = list(customer.address_records.all()) if hasattr(customer, "address_records") else []
    if records:
        return [
            {
                "source_id": row.source_id,
                "province": row.province_name,
                "city": row.city_name,
                "address": row.address,
                "postal_code": row.postal_code,
                "recipient_name": row.recipient_name,
                "recipient_mobile": row.mobile,
            }
            for row in records
            if row.deleted_at is None
        ]
    if customer.addresses:
        return customer.addresses
    payload = customer.source_payload if isinstance(customer.source_payload, dict) else {}
    return normalize_addresses(payload)
