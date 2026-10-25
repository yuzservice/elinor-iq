"""Full tier refresh: once a day, and whenever someone asks from the customer list."""

import logging
import threading
from datetime import timedelta

from django.db import IntegrityError, connection, transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from apps.customers.tiers import refresh_stored_tiers
from apps.integrations.elinor.models import SyncCursor

logger = logging.getLogger(__name__)

CURSOR_KEY = "customer_tiers"
STALE_AFTER = timedelta(hours=2)


def tier_refresh_status():
    cursor = SyncCursor.objects.filter(key=CURSOR_KEY).first()
    value = dict((cursor.value if cursor else None) or {})
    return {
        "running": _is_running(value),
        "last_date": value.get("last_date") or None,
        "finished_at": value.get("finished_at") or None,
    }


def refresh_due_tiers():
    """Store tiers for every customer when today's pass has not finished.

    Returns "done", "skipped", or "failed".
    """
    today = timezone.localdate().isoformat()
    status = tier_refresh_status()
    if status["running"] or status["last_date"] == today:
        return "skipped"
    if not _claim():
        return "skipped"
    return "done" if _run_full_refresh(reason="daily") else "failed"


def start_full_tier_refresh():
    """Start a full refresh in the background. False when one is already running."""
    if not _claim():
        return False
    threading.Thread(
        target=_run_full_refresh,
        kwargs={"close_connection": True, "reason": "manual"},
        name="customer-tier-refresh",
        daemon=True,
    ).start()
    return True


def _run_full_refresh(close_connection=False, reason="manual"):
    try:
        refresh_stored_tiers(reason=reason)
        # RFM is independent of tiers; it shares the daily/manual path and logs its own failures.
        from apps.customers.rfm import refresh_rfm_daily

        refresh_rfm_daily()
        _finish(success=True)
        return True
    except Exception:
        logger.exception("Customer tier refresh failed")
        _finish(success=False)
        return False
    finally:
        if close_connection:
            connection.close()


def _claim():
    with transaction.atomic():
        cursor = SyncCursor.objects.select_for_update().filter(key=CURSOR_KEY).first()
        if cursor is None:
            try:
                SyncCursor.objects.create(
                    key=CURSOR_KEY,
                    value={"running": True, "started_at": timezone.now().isoformat()},
                )
                return True
            except IntegrityError:
                return False
        value = dict(cursor.value or {})
        if _is_running(value):
            return False
        value["running"] = True
        value["started_at"] = timezone.now().isoformat()
        cursor.value = value
        cursor.save(update_fields=["value", "updated_at"])
        return True


def _finish(success):
    cursor, _created = SyncCursor.objects.get_or_create(key=CURSOR_KEY, defaults={"value": {}})
    value = dict(cursor.value or {})
    value["running"] = False
    value["finished_at"] = timezone.now().isoformat()
    if success:
        value["last_date"] = timezone.localdate().isoformat()
    cursor.value = value
    cursor.save(update_fields=["value", "updated_at"])


def _is_running(value):
    if not value.get("running"):
        return False
    started = parse_datetime(value.get("started_at") or "")
    if started is None:
        return False
    if timezone.is_naive(started):
        started = timezone.make_aware(started, timezone.get_current_timezone())
    return timezone.now() - started < STALE_AFTER
