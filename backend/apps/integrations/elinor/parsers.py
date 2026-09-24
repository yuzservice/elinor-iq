from datetime import datetime
from zoneinfo import ZoneInfo

TEHRAN = ZoneInfo("Asia/Tehran")


def parse_datetime(value):
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        dt = value
    elif isinstance(value, (int, float)):
        dt = datetime.fromtimestamp(value, tz=TEHRAN)
    else:
        text = str(value).strip().replace("T", " ")
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d"):
            try:
                dt = datetime.strptime(text[:26], fmt)
                break
            except ValueError:
                dt = None
        if dt is None:
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=TEHRAN)
    return dt


def unwrap_data(payload):
    if not isinstance(payload, dict):
        return payload
    return payload.get("data", payload)


def extract_paginator(data, resource_keys):
    if isinstance(data, list):
        return data, 1, 1, len(data)
    if not isinstance(data, dict):
        return [], 1, 1, 0

    for key in resource_keys:
        inner = data.get(key)
        if isinstance(inner, dict) and isinstance(inner.get("data"), list):
            return (
                inner["data"],
                int(inner.get("current_page") or 1),
                int(inner.get("last_page") or inner.get("current_page") or 1),
                int(inner.get("total") or len(inner["data"])),
            )
        if isinstance(inner, list):
            return inner, 1, 1, len(inner)

    if isinstance(data.get("data"), list):
        return (
            data["data"],
            int(data.get("current_page") or 1),
            int(data.get("last_page") or data.get("current_page") or 1),
            int(data.get("total") or len(data["data"])),
        )
    return [], 1, 1, 0


def extract_object(data, keys):
    if not isinstance(data, dict):
        return {}
    for key in keys:
        value = data.get(key)
        if isinstance(value, dict):
            return value
    if "id" in data:
        return data
    return data


def extract_list(container, keys):
    if isinstance(container, list):
        return container
    if not isinstance(container, dict):
        return []
    for key in keys:
        value = container.get(key)
        if isinstance(value, list):
            return value
        if isinstance(value, dict) and isinstance(value.get("data"), list):
            return value["data"]
    return []


def as_int(value, default=0):
    if value in (None, ""):
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def as_bool(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes"}
    return False
