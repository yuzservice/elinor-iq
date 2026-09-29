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


def customer_record(payload):
    """Return the customer object from a detail response.

    Elinor's customer endpoint wraps the row as {"0": {...}, "store_rules": ..., "update_rules": ...}.
    Mobile and addresses live on that inner row. The list endpoint already returns the row itself.
    """
    if not isinstance(payload, dict):
        return {}
    if payload.get("id") and "store_rules" not in payload and "update_rules" not in payload:
        return payload
    for key in ("customer", "customers"):
        value = payload.get(key)
        if isinstance(value, dict) and value.get("id"):
            return value
    numbered = payload.get("0")
    if isinstance(numbered, dict) and numbered.get("id"):
        return numbered
    data = payload.get("data")
    if isinstance(data, dict) and data is not payload:
        found = customer_record(data)
        if found.get("id"):
            return found
    if payload.get("id") or payload.get("mobile"):
        return payload
    return {}


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
        city_obj = row.get("city") if isinstance(row.get("city"), dict) else {}
        province_obj = city_obj.get("province") if isinstance(city_obj.get("province"), dict) else {}
        recipient = _first_text(row, ADDRESS_RECIPIENT)
        if not recipient:
            recipient = " ".join(
                part for part in (_first_text(row, ("first_name",)), _first_text(row, ("last_name",))) if part
            )
        item = {
            "province": _first_text(row, ADDRESS_PROVINCE) or _first_text(province_obj, ("name", "title")),
            "city": _first_text(row, ADDRESS_CITY) or _first_text(city_obj, ("name", "title")),
            "address": _first_text(row, ADDRESS_TEXT),
            "postal_code": _first_text(row, ADDRESS_POSTAL),
            "recipient_name": recipient,
            "recipient_mobile": _first_text(row, ADDRESS_MOBILE),
            "raw": row,
        }
        if any(item[key] for key in ("province", "city", "address", "postal_code", "recipient_name", "recipient_mobile")):
            normalized.append(item)
    return normalized


def extract_profile_fields(payload):
    payload = customer_record(payload)
    if not isinstance(payload, dict) or not payload:
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
        for item in addresses:
            raw = item.get("raw") if isinstance(item.get("raw"), dict) else {}
            if not fields.get("first_name"):
                first_name = _first_text(raw, ("first_name",))
                if first_name:
                    fields["first_name"] = first_name
            if not fields.get("last_name"):
                last_name = _first_text(raw, ("last_name",))
                if last_name:
                    fields["last_name"] = last_name
            if not fields.get("mobile") and item.get("recipient_mobile"):
                fields["mobile"] = item["recipient_mobile"]
            if fields.get("first_name") and fields.get("last_name") and fields.get("mobile"):
                break
    return fields


def apply_customer_payload(customer, payload):
    """Fill profile fields without wiping richer values or order statistics."""
    record = customer_record(payload)
    if not record:
        return customer
    extracted = extract_profile_fields(record)
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
    customer.source_payload = record
    return customer


def repair_stored_customer_profiles():
    """Fill mobile, name, and address from detail payloads already saved in the wrong shape."""
    updated = 0
    customers = Customer.objects.filter(mobile="").exclude(source_payload=None)
    for customer in customers.iterator():
        if not customer_record(customer.source_payload).get("id"):
            continue
        apply_customer_payload(customer, customer.source_payload)
        if not customer.mobile and not customer.addresses:
            continue
        customer.save(update_fields=["first_name", "last_name", "mobile", "email", "status", "national_code", "gender", "birth_date", "card_number", "club_level", "summary", "addresses", "created_at_source", "updated_at_source", "source_payload"])
        updated += 1
    return updated


def upsert_customer_from_source(payload):
    record = customer_record(payload)
    source_id = as_int(record.get("id"), default=None)
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
    return normalize_addresses(customer_record(payload))
