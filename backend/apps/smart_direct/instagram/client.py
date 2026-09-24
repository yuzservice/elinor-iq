import logging
import re

import requests
from django.conf import settings

from . import DEFAULT_API_VERSION, GRAPH_INSTAGRAM_HOST, MAX_REPLY_CHARS

logger = logging.getLogger(__name__)

TOKEN_RE = re.compile(r"EAA[A-Za-z0-9]+")


class InstagramSendError(Exception):
    def __init__(self, message, status_code=None):
        super().__init__(message)
        self.status_code = status_code


def instagram_api_version():
    raw = (getattr(settings, "INSTAGRAM_API_VERSION", "") or DEFAULT_API_VERSION).strip()
    if not raw:
        raw = DEFAULT_API_VERSION
    if not raw.startswith("v"):
        raw = f"v{raw}"
    return raw


def instagram_is_configured():
    return bool(
        getattr(settings, "INSTAGRAM_ACCESS_TOKEN", "")
        and getattr(settings, "INSTAGRAM_ACCOUNT_ID", "")
    )


def webhook_is_configured():
    return bool(
        getattr(settings, "INSTAGRAM_APP_SECRET", "")
        and getattr(settings, "INSTAGRAM_VERIFY_TOKEN", "")
    )


def sanitize_error(text):
    value = TOKEN_RE.sub("[redacted]", str(text or ""))
    token = getattr(settings, "INSTAGRAM_ACCESS_TOKEN", "") or ""
    if token:
        value = value.replace(token, "[redacted]")
    return value[:255]


def send_text_message(igsid, text):
    token = getattr(settings, "INSTAGRAM_ACCESS_TOKEN", "") or ""
    account_id = getattr(settings, "INSTAGRAM_ACCOUNT_ID", "") or ""
    if not token or not account_id:
        raise InstagramSendError("Instagram is not configured.")
    body = (text or "").strip()
    if not body:
        raise InstagramSendError("Reply text is empty.")
    if len(body) > MAX_REPLY_CHARS:
        raise InstagramSendError("Reply text is too long.")
    url = f"{GRAPH_INSTAGRAM_HOST}/{instagram_api_version()}/{account_id}/messages"
    try:
        response = requests.post(
            url,
            json={"recipient": {"id": igsid}, "message": {"text": body}},
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            timeout=10,
        )
    except requests.RequestException as exc:
        logger.exception("Instagram send request failed.")
        raise InstagramSendError(sanitize_error(exc)) from exc
    if response.status_code >= 400:
        logger.error("Instagram send rejected with HTTP %s.", response.status_code)
        raise InstagramSendError(sanitize_error(response.text), status_code=response.status_code)
    payload = {}
    try:
        payload = response.json()
    except ValueError:
        logger.error("Instagram send returned non-JSON.")
        raise InstagramSendError("Instagram send returned an invalid response.")
    message_id = str(payload.get("message_id") or payload.get("id") or "").strip()
    return {"message_id": message_id, "raw_ok": True}
