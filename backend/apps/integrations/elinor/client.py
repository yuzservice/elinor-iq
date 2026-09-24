import logging
import time

import requests
from django.conf import settings

from .parsers import extract_object, extract_paginator, unwrap_data

logger = logging.getLogger(__name__)

THROTTLE_HINTS = ("throttle", "rate", "حد", "درخواست")


class ElinorApiError(Exception):
    def __init__(self, message, status_code=None, payload=None, retryable=False):
        super().__init__(message)
        self.status_code = status_code
        self.payload = payload
        self.retryable = retryable


def current_elinor_credentials():
    """Prefer credentials saved in the panel. Fall back to environment variables."""
    base_url = settings.ELINOR_API_BASE_URL.rstrip("/")
    username = settings.ELINOR_API_USERNAME
    password = settings.ELINOR_API_PASSWORD
    try:
        from .models import ElinorApiConfig

        config = ElinorApiConfig.objects.filter(pk=1).first()
    except Exception:
        config = None
    if config and config.username and config.password:
        return (config.base_url or base_url).rstrip("/"), config.username, config.password
    return base_url, username, password


class ElinorClient:
    def __init__(self):
        self.base_url, self.username, self.password = current_elinor_credentials()
        per_minute = max(1, int(settings.ELINOR_RATE_LIMIT_PER_MINUTE))
        self.min_interval = 60.0 / per_minute
        self.token = None
        self.requests_made = 0
        self.retries_made = 0
        self._last_request_at = 0.0
        self.session = requests.Session()
        self.session.headers.update({"Accept": "application/json"})

    def authenticate(self):
        if not self.username or not self.password:
            raise ElinorApiError("ELINOR API credentials are not configured.")
        payload = self._request(
            "POST",
            "/admin/login",
            json={"username": self.username, "password": self.password},
            auth=False,
        )
        data = unwrap_data(payload) or {}
        token = None
        if isinstance(data, dict):
            token = data.get("token")
            if not token and isinstance(data.get("admin"), dict):
                token = data.get("token")
        if not token:
            raise ElinorApiError("Login succeeded but no token was returned.", payload=payload)
        self.token = token
        logger.info("Authenticated with Elinor admin API.")
        return token

    def get_orders_light(self, page=1, per_page=50, start_date=None, end_date=None, **extra):
        params = {"page": page, "per_page": per_page, **extra}
        if start_date is not None:
            params["start_date"] = int(start_date)
        if end_date is not None:
            params["end_date"] = int(end_date)
        payload = self._request("GET", "/admin/orders_light", params=params)
        data = unwrap_data(payload)
        rows, current, last, total = extract_paginator(data, ("orders", "orders_light"))
        return {
            "results": rows,
            "current_page": current,
            "last_page": last,
            "total": total,
            "raw": payload,
        }

    def get_order(self, order_id):
        payload = self._request("GET", f"/admin/orders/{order_id}")
        data = unwrap_data(payload)
        return extract_object(data, ("order", "orders"))

    def get_customer(self, customer_id):
        payload = self._request("GET", f"/admin/customers/{customer_id}")
        data = unwrap_data(payload)
        return extract_object(data, ("customer", "customers"))

    def get_customers(self, page=1, per_page=50, **extra):
        params = {"page": page, "per_page": per_page, **extra}
        payload = self._request("GET", "/admin/customers", params=params)
        data = unwrap_data(payload)
        rows, current, last, total = extract_paginator(data, ("customers",))
        return {
            "results": rows,
            "current_page": current,
            "last_page": last,
            "total": total,
            "raw": payload,
        }

    def get_product(self, product_id):
        payload = self._request("GET", f"/admin/products/{product_id}")
        data = unwrap_data(payload)
        return extract_object(data, ("product", "products"))

    def get_mini_orders(self, page=1, per_page=50, start_date=None, end_date=None, **extra):
        params = {"page": page, "per_page": per_page, **extra}
        if start_date is not None:
            params["start_date"] = start_date.isoformat() if hasattr(start_date, "isoformat") else str(start_date)
        if end_date is not None:
            params["end_date"] = end_date.isoformat() if hasattr(end_date, "isoformat") else str(end_date)
        payload = self._request("GET", "/admin/mini_orders", params=params)
        data = unwrap_data(payload) or {}
        rows, current, last, total = extract_paginator(data, ("mini_orders",))
        return {
            "results": rows,
            "current_page": current,
            "last_page": last,
            "total": total,
            "raw": payload,
        }

    def get_mini_order(self, mini_order_id):
        payload = self._request("GET", f"/admin/mini_orders/{mini_order_id}")
        return unwrap_data(payload) or {}

    def _request(self, method, path, *, auth=True, retries=5, **kwargs):
        url = f"{self.base_url}{path}"
        last_error = None
        for attempt in range(1, retries + 1):
            self._wait()
            headers = dict(kwargs.pop("headers", {}) or {})
            if auth:
                if not self.token:
                    self.authenticate()
                headers["Authorization"] = f"Bearer {self.token}"
            try:
                response = self.session.request(method, url, headers=headers, timeout=45, **kwargs)
            except requests.RequestException as exc:
                self.retries_made += 1
                last_error = ElinorApiError(str(exc), retryable=True)
                self._backoff(attempt)
                continue

            self.requests_made += 1
            remaining = response.headers.get("X-RateLimit-Remaining")
            if remaining is not None:
                logger.info("Elinor %s %s -> %s remaining=%s", method, path, response.status_code, remaining)

            if response.status_code == 401 and auth and attempt == 1:
                logger.warning("Elinor token rejected; re-authenticating.")
                self.retries_made += 1
                self.token = None
                self.authenticate()
                continue

            if self._is_throttle(response):
                self.retries_made += 1
                wait_for = min(60, 2 ** attempt)
                logger.warning("Elinor throttle on %s %s; sleeping %ss", method, path, wait_for)
                time.sleep(wait_for)
                last_error = ElinorApiError(
                    "Rate limited by Elinor API.",
                    status_code=response.status_code,
                    retryable=True,
                )
                continue

            if response.status_code >= 500:
                self.retries_made += 1
                last_error = ElinorApiError(
                    "Elinor server error.",
                    status_code=response.status_code,
                    retryable=True,
                )
                self._backoff(attempt)
                continue

            if response.status_code >= 400:
                message = "Elinor API request failed."
                payload = _safe_json(response)
                if isinstance(payload, dict) and payload.get("message"):
                    message = str(payload["message"])
                raise ElinorApiError(message, status_code=response.status_code, payload=payload)

            payload = _safe_json(response)
            if isinstance(payload, dict) and payload.get("success") is False:
                raise ElinorApiError(
                    str(payload.get("message") or "Elinor API returned success=false."),
                    status_code=response.status_code,
                    payload=payload,
                )
            return payload

        raise last_error or ElinorApiError("Elinor API request failed after retries.")

    def _wait(self):
        elapsed = time.monotonic() - self._last_request_at
        if elapsed < self.min_interval:
            time.sleep(self.min_interval - elapsed)
        self._last_request_at = time.monotonic()

    def _backoff(self, attempt):
        time.sleep(min(30, 2 ** attempt))

    def _is_throttle(self, response):
        if response.status_code == 429:
            return True
        if response.status_code != 422:
            return False
        payload = _safe_json(response)
        text = ""
        if isinstance(payload, dict):
            text = f"{payload.get('message', '')} {payload.get('errors', '')}"
        return any(hint in text.lower() or hint in text for hint in THROTTLE_HINTS)


def _safe_json(response):
    try:
        return response.json()
    except ValueError:
        return {"raw": response.text[:500]}
