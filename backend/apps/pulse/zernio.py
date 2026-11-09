"""Read-only Zernio REST client (https://zernio.com/api). Only GET requests exist here: Pulse never publishes,
deletes or replies on Instagram."""

import logging
import time

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

PAGE_SIZE = 50
MIN_INTERVAL_SECONDS = 1.0  # well under Zernio's per-second analytics window
MAX_RETRIES = 3
TIMEOUT = (10, 60)


class ZernioError(Exception):
    pass


class ZernioClient:
    def __init__(self, api_key=None, base_url=None, session=None, sleep=time.sleep):
        self.api_key = api_key if api_key is not None else settings.ZERNIO_API_KEY
        self.base_url = (base_url or settings.ZERNIO_API_BASE_URL).rstrip("/")
        self.session = session or requests.Session()
        self.sleep = sleep
        self.requests_made = 0
        self._last = 0.0

    def get(self, path, params=None):
        if not self.api_key:
            raise ZernioError("ZERNIO_API_KEY is not set.")
        url = f"{self.base_url}/{path.lstrip('/')}"
        for attempt in range(MAX_RETRIES + 1):
            wait = MIN_INTERVAL_SECONDS - (time.monotonic() - self._last)
            if wait > 0:
                self.sleep(wait)
            self._last = time.monotonic()
            self.requests_made += 1
            try:
                response = self.session.get(url, params=params, headers={"Authorization": f"Bearer {self.api_key}"}, timeout=TIMEOUT)
            except requests.RequestException as exc:
                if attempt == MAX_RETRIES:
                    raise ZernioError(f"GET {path} failed: {exc}") from exc
                self.sleep(2 ** attempt)
                continue
            if response.status_code == 429 or response.status_code >= 500:
                if attempt == MAX_RETRIES:
                    raise ZernioError(f"GET {path} answered {response.status_code}")
                retry_after = response.headers.get("Retry-After")
                self.sleep(float(retry_after) if retry_after and retry_after.replace(".", "", 1).isdigit() else 2 ** attempt)
                continue
            if response.status_code != 200:
                raise ZernioError(f"GET {path} answered {response.status_code}: {response.text[:200]}")
            return response.json()
        raise ZernioError(f"GET {path} failed")

    def instagram_posts(self, account_id, from_date, to_date):
        """Every post published in [from_date, to_date] (Tehran dates as YYYY-MM-DD), with metrics.

        Returns (posts, accounts) where accounts is the response's account list (followersCount)."""
        posts, accounts, page = [], [], 1
        while True:
            data = self.get(
                "/v1/analytics",
                {"accountId": account_id, "platform": "instagram", "fromDate": from_date, "toDate": to_date,
                 "page": page, "limit": PAGE_SIZE, "order": "desc"},
            )
            posts.extend(data.get("posts") or [])
            accounts = data.get("accounts") or accounts
            pages = int((data.get("pagination") or {}).get("pages") or 1)
            if page >= pages:
                return posts, accounts
            page += 1

    def daily_reach(self, account_id, from_date, to_date):
        """{date: reach} from Instagram account insights (the only account metric with a daily series)."""
        data = self.get(
            "/v1/analytics/instagram/account-insights",
            {"accountId": account_id, "metrics": "reach", "metricType": "time_series", "fromDate": from_date, "toDate": to_date},
        )
        values = (((data.get("metrics") or {}).get("reach") or {}).get("values")) or []
        return {row["date"]: row.get("value") for row in values if row.get("date")}

    def post_timeline(self, post_id, from_date, to_date):
        """Daily lifetime totals of one post: [{date, views, reach, likes, ...}]. Zernio keeps them from the day the
        account was connected (2026-11-06 for @elinor_boutique), not before."""
        data = self.get("/v1/analytics/post-timeline", {"postId": post_id, "fromDate": from_date, "toDate": to_date})
        return [row for row in data.get("timeline") or [] if row.get("date") and row.get("platform", "instagram") == "instagram"]
