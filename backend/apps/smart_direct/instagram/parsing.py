NON_TEXT_PLACEHOLDER = "[پیام غیرمتنی]"


def extract_inbound_messages(payload):
    if not isinstance(payload, dict):
        return []
    messages = []
    for entry in payload.get("entry") or []:
        if not isinstance(entry, dict):
            continue
        for event in entry.get("messaging") or []:
            parsed = _parse_messaging_event(event)
            if parsed:
                messages.append(parsed)
    return messages


def _parse_messaging_event(event):
    if not isinstance(event, dict):
        return None
    message = event.get("message")
    if not isinstance(message, dict):
        return None
    mid = str(message.get("mid") or "").strip()
    sender = event.get("sender") if isinstance(event.get("sender"), dict) else {}
    igsid = str(sender.get("id") or "").strip()
    if not mid or not igsid:
        return None
    text = (message.get("text") or "").strip()
    if not text:
        text = NON_TEXT_PLACEHOLDER
    return {
        "igsid": igsid,
        "mid": mid,
        "text": text,
        "is_echo": bool(message.get("is_echo") or event.get("is_echo")),
        "is_self": bool(message.get("is_self") or event.get("is_self")),
        "is_deleted": bool(message.get("is_deleted")),
        "timestamp": event.get("timestamp"),
    }
