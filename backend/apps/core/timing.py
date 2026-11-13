"""Logs API requests slower than SLOW_REQUEST_MS: method, path (no query string), status, duration. No payloads, no users.

One line per slow request, prefixed SLOW_API, so `docker compose logs backend | grep SLOW_API` finds them
(docs/runbooks/performance.md has the command that lists the 20 slowest endpoints)."""

import logging
import time

from django.conf import settings

logger = logging.getLogger("elinor.timing")


class SlowRequestMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        started = time.monotonic()
        response = self.get_response(request)
        ms = (time.monotonic() - started) * 1000
        if request.path.startswith("/api/") and ms >= settings.SLOW_REQUEST_MS:
            logger.warning("SLOW_API %s %s %s %d", request.method, request.path, response.status_code, round(ms))
        return response
