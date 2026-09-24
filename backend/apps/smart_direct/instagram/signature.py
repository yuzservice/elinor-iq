import hmac
import hashlib


def parse_signature_header(header):
    if not header:
        return ""
    value = header.strip()
    if value.lower().startswith("sha256="):
        return value.split("=", 1)[1].strip()
    return value


def expected_signature(app_secret, body):
    secret = (app_secret or "").encode("utf-8")
    raw = body if isinstance(body, (bytes, bytearray)) else str(body or "").encode("utf-8")
    return hmac.new(secret, raw, hashlib.sha256).hexdigest()


def signature_is_valid(app_secret, body, header):
    if not app_secret:
        return False
    provided = parse_signature_header(header)
    if not provided:
        return False
    expected = expected_signature(app_secret, body)
    return hmac.compare_digest(expected, provided)
