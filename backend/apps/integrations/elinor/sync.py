import logging
from datetime import date, datetime, time, timedelta

from django.conf import settings
from django.db import transaction
from django.db.models import Count, Max, Min
from django.utils import timezone

from apps.customers.ingest import apply_customer_payload, upsert_customer_from_source
from apps.customers.models import Customer
from apps.products.models import Product, Variant
from apps.sales.models import Order, OrderItem, PosSale, PosSaleItem, STORE_SALES_LINE, SalesLine, Store

from .client import ElinorApiError, ElinorClient
from .gateway_payments import extract_order_payment_rows, upsert_order_gateway_payments
from .models import PosDaySync, SyncCursor, SyncRun
from .parsers import as_bool, as_int, extract_list, extract_object, parse_datetime

logger = logging.getLogger(__name__)

BOOTSTRAP_DAYS = 92
OVERLAP_DAYS = 1
POS_OVERLAP_DAYS = 1
# SQL dump of physical sales is complete through 20 Shahrivar 1405.
POS_SQL_CUTOFF = date(2026, 9, 11)
POS_BRANCH_STORE_IDS = {"sari": 3, "gorgan": 2, "capri": 4}
ORDERS_PER_PAGE = 50
MAX_REQUESTS_PER_RUN = int(getattr(settings, "ELINOR_SYNC_MAX_REQUESTS", 900))
HOURLY_ONLINE_DETAILS_LIMIT = int(getattr(settings, "ELINOR_SYNC_HOURLY_ONLINE_DETAILS_LIMIT", "250"))
HOURLY_POS_LOOKBACK_DAYS = int(getattr(settings, "ELINOR_SYNC_HOURLY_POS_DAYS", "3"))
HOURLY_POS_MAX_SALES = int(getattr(settings, "ELINOR_SYNC_HOURLY_POS_MAX_SALES", "300"))
SYNC_STALE_MINUTES = 20


def _nullable_amount(value):
    if value in (None, "", 0, "0"):
        return None
    return as_int(value, default=None)


def clear_stuck_sync_runs(*, minutes=0):
    now = timezone.now()
    cutoff = now - timedelta(minutes=minutes) if minutes else None
    cleared = 0
    for run in SyncRun.objects.filter(status=SyncRun.STATUS_RUNNING):
        if cutoff is not None and run.started_at >= cutoff:
            continue
        heartbeat = parse_datetime((run.report or {}).get("heartbeat"))
        if cutoff is not None and heartbeat and heartbeat >= cutoff:
            continue
        run.status = SyncRun.STATUS_FAILED
        run.finished_at = now
        run.error_message = "Cleared stuck sync run."
        run.save(update_fields=["status", "finished_at", "error_message"])
        cleared += 1
    return cleared


def bootstrap_window():
    end = timezone.now()
    start = end - timedelta(days=BOOTSTRAP_DAYS)
    return start, end


def recent_window(cursor_value=None):
    end = timezone.now()
    if cursor_value and cursor_value.get("last_created_at"):
        parsed = parse_datetime(cursor_value["last_created_at"])
        start = (parsed - timedelta(days=OVERLAP_DAYS)) if parsed else end - timedelta(days=OVERLAP_DAYS)
    else:
        start = end - timedelta(days=OVERLAP_DAYS)
    return start, end


def resume_explicit_pos_start(start_date, end_date, cursor_value=None):
    """Continue the same requested window from the unfinished day."""
    raw = cursor_value or {}
    try:
        next_date = date.fromisoformat(str(raw.get("next_date") or "")[:10])
        window_start = date.fromisoformat(str(raw.get("window_start") or "")[:10])
        window_end = date.fromisoformat(str(raw.get("window_end") or "")[:10])
    except ValueError:
        return start_date
    if window_start == start_date and window_end == end_date and start_date <= next_date <= end_date:
        return next_date
    return start_date


def _pos_resume_page(cursor_value, day):
    raw = cursor_value or {}
    try:
        cursor_day = date.fromisoformat(str(raw.get("next_date") or "")[:10])
    except ValueError:
        return 1
    if cursor_day != day:
        return 1
    try:
        return max(1, int(raw.get("next_page") or 1))
    except (TypeError, ValueError):
        return 1


def pos_window(cursor_value=None):
    """Physical stores resume from the SQL cutoff, not from the newest saved sale.

    A later synced day must not skip the gap after 20 Shahrivar.
    """
    end = timezone.localdate()
    start = POS_SQL_CUTOFF
    raw_next = (cursor_value or {}).get("next_date")
    if raw_next:
        try:
            next_date = date.fromisoformat(str(raw_next)[:10])
        except ValueError:
            next_date = None
        if next_date and POS_SQL_CUTOFF <= next_date <= end:
            # Rewinding a day while a backlog remains makes every hourly run
            # repeat the same sales and never reach the missing days.
            if next_date < end:
                start = next_date
            else:
                start = max(POS_SQL_CUTOFF, next_date - timedelta(days=POS_OVERLAP_DAYS))
    if start > end:
        start = end
    return start, end


class SyncService:
    def __init__(self, kind):
        self.kind = kind
        self.client = ElinorClient()
        self.run = None
        self._fetched_customers = set()
        self._fetched_products = set()
        self._pos_sales_upserted = 0
        self._pos_items_upserted = 0
        self._gateway_payments_upserted = 0
        self.failures = 0
        self.pos_store_ids = None
        self.pos_branches = []
        self.force_pos = False
        self.include_online = False
        self._pos_days_skipped = 0
        self._pos_days_fetched = 0
        self._day_branch_seen = {}
        self._last_online_seen = 0

    def _ensure_not_running(self):
        clear_stuck_sync_runs(minutes=SYNC_STALE_MINUTES)
        if SyncRun.objects.filter(status=SyncRun.STATUS_RUNNING).exists():
            raise RuntimeError("A sync is already running.")

    def execute(self):
        self._ensure_not_running()

        start, end = (
            bootstrap_window()
            if self.kind == SyncRun.KIND_BOOTSTRAP
            else recent_window(_cursor("orders").value)
        )
        self.run = SyncRun.objects.create(
            kind=self.kind,
            status=SyncRun.STATUS_RUNNING,
            window_start=start,
            window_end=end,
        )
        logger.info("Starting %s sync from %s to %s", self.kind, start, end)
        try:
            self.client.authenticate()
            self._sync_orders(start, end)
            if self.run.status == SyncRun.STATUS_PAUSED:
                return self.run
            self._refresh_customer_stats()
            self._finish(SyncRun.STATUS_SUCCESS)
            return self.run
        except Exception as exc:
            logger.exception("Sync failed")
            self._finish(SyncRun.STATUS_FAILED, error=str(exc))
            raise

    def execute_details(self, limit=500):
        self._ensure_not_running()

        self.kind = SyncRun.KIND_DETAILS
        self.failures = 0
        cursor = _cursor("order_details")
        stored_ids = [int(value) for value in (cursor.value.get("pending_source_ids") or [])]
        already_completed = cursor.value.get("completed") is True and not stored_ids

        if already_completed:
            pending_ids = []
        elif stored_ids:
            pending_ids = list(
                Order.objects.filter(source_id__in=stored_ids, details_synced_at__isnull=True)
                .order_by("-created_at", "-source_id")
                .values_list("source_id", flat=True)
            )
        else:
            pending_ids = list(
                Order.objects.filter(details_synced_at__isnull=True)
                .order_by("-created_at", "-source_id")
                .values_list("source_id", flat=True)[:limit]
            )
            cursor.value = {"pending_source_ids": pending_ids, "limit": limit, "completed": False}
            cursor.save()

        self.run = SyncRun.objects.create(
            kind=SyncRun.KIND_DETAILS,
            status=SyncRun.STATUS_RUNNING,
            window_start=None,
            window_end=None,
            report={"pending_source_ids": pending_ids, "limit": limit},
        )
        logger.info("Starting details sync for %s orders", len(pending_ids))
        try:
            if pending_ids:
                self.client.authenticate()
            for source_id in pending_ids:
                order = Order.objects.filter(source_id=source_id, details_synced_at__isnull=True).first()
                if not order:
                    continue
                try:
                    self._sync_order_details(order)
                    self.run.orders_upserted += 1
                except Exception as exc:
                    self.failures += 1
                    logger.warning("Order %s details failed: %s", source_id, exc)
                self._persist_progress()

            remaining = list(
                Order.objects.filter(source_id__in=pending_ids, details_synced_at__isnull=True)
                .values_list("source_id", flat=True)
            ) if pending_ids else []
            cursor.value = {
                "pending_source_ids": remaining,
                "limit": limit,
                "completed": len(remaining) == 0,
            }
            cursor.save()
            if remaining:
                self._finish(
                    SyncRun.STATUS_PAUSED,
                    error=f"Paused with {len(remaining)} orders still pending in this 500-order set.",
                )
            else:
                self._finish(SyncRun.STATUS_SUCCESS)
            return self.run
        except Exception as exc:
            logger.exception("Details sync failed")
            remaining = list(
                Order.objects.filter(source_id__in=pending_ids, details_synced_at__isnull=True)
                .values_list("source_id", flat=True)
            )
            cursor.value = {"pending_source_ids": remaining, "limit": limit, "completed": False}
            cursor.save()
            self._finish(SyncRun.STATUS_FAILED, error=str(exc))
            raise

    def execute_customers(self):
        self._ensure_not_running()

        self.kind = SyncRun.KIND_CUSTOMERS
        cursor = _cursor("customers")
        page = int(cursor.value.get("page") or 1)
        if cursor.value.get("completed") is True:
            page = 1
            cursor.value = {"page": 1, "completed": False}
            cursor.save()

        self.run = SyncRun.objects.create(
            kind=SyncRun.KIND_CUSTOMERS,
            status=SyncRun.STATUS_RUNNING,
            report={"page": page},
        )
        logger.info("Starting all-customers sync from page %s", page)
        try:
            self.client.authenticate()
            last_page = int(cursor.value.get("last_page") or page)
            while True:
                if self.client.requests_made >= MAX_REQUESTS_PER_RUN:
                    cursor.value = {"page": page, "last_page": last_page, "completed": False}
                    cursor.save()
                    self._finish(
                        SyncRun.STATUS_PAUSED,
                        error=f"Paused at customers page {page} to respect Elinor API rate limits.",
                    )
                    return self.run
                payload = self.client.get_customers(page=page, per_page=ORDERS_PER_PAGE)
                last_page = max(1, payload["last_page"])
                logger.info(
                    "customers page %s/%s (%s rows)",
                    page,
                    last_page,
                    len(payload["results"]),
                )
                for row in payload["results"]:
                    self._upsert_customer_row(row)
                self._persist_progress()
                if page >= last_page:
                    cursor.value = {"page": page + 1, "last_page": last_page, "completed": True}
                    cursor.save()
                    break
                page += 1
                cursor.value = {"page": page, "last_page": last_page, "completed": False}
                cursor.save()

            self._finish(SyncRun.STATUS_SUCCESS)
            return self.run
        except Exception as exc:
            logger.exception("Customer sync failed")
            cursor.value = {"page": page, "completed": False}
            cursor.save()
            self._finish(SyncRun.STATUS_FAILED, error=str(exc))
            raise

    def execute_pos(self, start_date=None, end_date=None, branches=None, force=False):
        self._ensure_not_running()
        requested = list(branches or [])
        self.include_online = "online" in requested
        branches = [branch for branch in requested if branch in POS_BRANCH_STORE_IDS]
        if not requested:
            branches = list(POS_BRANCH_STORE_IDS)
        self.pos_branches = branches
        self.pos_store_ids = {POS_BRANCH_STORE_IDS[branch] for branch in branches} if branches else set()
        self.force_pos = bool(force)
        if start_date is not None and end_date is not None:
            end = end_date
            start = start_date
        else:
            start, end = pos_window(_cursor("pos_orders").value)
        self.run = SyncRun.objects.create(
            kind=SyncRun.KIND_POS,
            status=SyncRun.STATUS_RUNNING,
            window_start=timezone.make_aware(datetime.combine(start, time.min), timezone.get_current_timezone()),
            window_end=timezone.make_aware(datetime.combine(end, time.max), timezone.get_current_timezone()),
            report={
                "branches": (["online"] if self.include_online else []) + branches,
                "current_day": start.isoformat(),
                "pos_sales_upserted": 0,
                "heartbeat": timezone.now().isoformat(),
            },
        )
        logger.info("Starting POS sync from %s to %s branches=%s", start, end, branches or "all")
        try:
            self.client.authenticate()
            paused = self._sync_pos_sales(start, end) if self.pos_branches else False
            if paused or self.run.status != SyncRun.STATUS_RUNNING:
                return self.run
            if self.include_online:
                paused = self._sync_online_days(start, end)
                if paused or self.run.status != SyncRun.STATUS_RUNNING:
                    return self.run
            self._finish(SyncRun.STATUS_SUCCESS)
            return self.run
        except Exception as exc:
            logger.exception("POS sync failed")
            self._finish(SyncRun.STATUS_FAILED, error=str(exc))
            raise

    def execute_hourly(self):
        self._ensure_not_running()
        online_start, online_end = recent_window(_cursor("orders").value)
        pos_start, pos_end = pos_window(_cursor("pos_orders").value)
        pos_end = min(pos_end, timezone.localdate())
        self.run = SyncRun.objects.create(
            kind=SyncRun.KIND_HOURLY,
            status=SyncRun.STATUS_RUNNING,
            window_start=online_start,
            window_end=online_end,
            report={
                "online_window": [online_start.isoformat(), online_end.isoformat()],
                "pos_window": [pos_start.isoformat(), pos_end.isoformat()],
            },
        )
        logger.info(
            "Starting hourly sync online=%s..%s pos=%s..%s",
            online_start,
            online_end,
            pos_start,
            pos_end,
        )
        try:
            self.client.authenticate()
            from apps.customers.ingest import repair_stored_customer_profiles

            repaired = repair_stored_customer_profiles()
            if repaired:
                logger.info("Filled %s customer profiles from stored API payloads.", repaired)
            # In-person sales are the part that falls behind. Do them before the
            # online order list, which can use the whole request budget.
            if self.client.requests_made < MAX_REQUESTS_PER_RUN:
                paused = self._sync_pos_sales(pos_start, pos_end, max_sales=HOURLY_POS_MAX_SALES)
                if paused:
                    return self.run

            self._sync_orders(online_start, online_end, fetch_details=False)
            if self.run.status == SyncRun.STATUS_PAUSED:
                return self.run

            details_limit = min(
                HOURLY_ONLINE_DETAILS_LIMIT,
                max(0, MAX_REQUESTS_PER_RUN - self.client.requests_made - 20),
            )
            if details_limit:
                self._sync_pending_order_details(details_limit)

            self._refresh_customer_stats()
            self._finish(SyncRun.STATUS_SUCCESS)
            return self.run
        except Exception as exc:
            logger.exception("Hourly sync failed")
            self._finish(SyncRun.STATUS_FAILED, error=str(exc))
            raise

    def _upsert_customer_row(self, row):
        customer, _created = upsert_customer_from_source(row)
        if not customer:
            return
        customer.synced_at = timezone.now()
        customer.save()
        self.run.customers_upserted += 1

    def _sync_orders(self, start, end, *, fetch_details=True, count_on=None):
        page = 1
        last_page = 1
        last_created = None
        seen = 0
        while page <= last_page:
            if self.client.requests_made >= MAX_REQUESTS_PER_RUN:
                self._last_online_seen = seen
                self._finish(
                    SyncRun.STATUS_PAUSED,
                    error="Paused while fetching online orders to respect Elinor API rate limits.",
                )
                return
            payload = self.client.get_orders_light(
                page=page,
                per_page=ORDERS_PER_PAGE,
                start_date=int(start.timestamp()),
                end_date=int(end.timestamp()),
            )
            last_page = max(1, payload["last_page"])
            rows = payload["results"]
            logger.info("orders_light page %s/%s (%s rows)", page, last_page, len(rows))
            for row in rows:
                self._upsert_light_order(row)
                created = parse_datetime(row.get("created_at"))
                if count_on is None or (created and timezone.localtime(created).date() == count_on):
                    seen += 1
                last_created = created or last_created
            page += 1
            self._persist_progress()
        self._last_online_seen = seen

        if fetch_details:
            pending = Order.objects.filter(created_at__gte=start, created_at__lt=end).order_by("source_id")
            if self.kind == SyncRun.KIND_BOOTSTRAP:
                pending = pending.filter(details_synced_at__isnull=True)
            for order in pending.iterator():
                if self.client.requests_made >= MAX_REQUESTS_PER_RUN:
                    logger.warning(
                        "Stopping details fetch after %s requests to respect API limits.",
                        self.client.requests_made,
                    )
                    self._finish(
                        SyncRun.STATUS_PAUSED,
                        error="Paused to respect Elinor API rate limits. Re-run bootstrap to resume.",
                    )
                    return
                self._sync_order_details(order)

        if last_created:
            cursor = _cursor("orders")
            cursor.value = {
                "last_created_at": last_created.isoformat(),
                "window_start": start.isoformat(),
                "window_end": end.isoformat(),
            }
            cursor.save()

    def _sync_pending_order_details(self, limit):
        pending_ids = list(
            Order.objects.filter(details_synced_at__isnull=True)
            .order_by("-created_at", "-source_id")
            .values_list("source_id", flat=True)[:limit]
        )
        logger.info("Syncing online order details for %s orders", len(pending_ids))
        for source_id in pending_ids:
            if self.client.requests_made >= MAX_REQUESTS_PER_RUN:
                logger.warning("Stopping online details after %s API requests.", self.client.requests_made)
                break
            order = Order.objects.filter(source_id=source_id, details_synced_at__isnull=True).first()
            if not order:
                continue
            try:
                self._sync_order_details(order)
            except Exception as exc:
                self.failures += 1
                logger.warning("Order %s details failed: %s", source_id, exc)

    def _sync_pos_sales(self, start_date, end_date, *, max_sales=None):
        """Fetch each physical-store day separately.

        The mini_orders API returns no rows when start_date equals end_date, and a
        cursor based on the newest saved sale skips the gap after the SQL dump.
        """
        cursor = _cursor("pos_orders")
        processed = 0
        day = start_date
        first_day = True
        while day <= end_date:
            if self._pos_day_is_closed(day):
                self._pos_days_skipped += 1
                self._touch_heartbeat(day)
                day += timedelta(days=1)
                self._save_pos_cursor(cursor, day, start_date, end_date, next_page=1)
                continue
            page = self._pos_day_start_page(day, cursor, first_day)
            first_day = False
            if self.client.requests_made >= MAX_REQUESTS_PER_RUN or (
                max_sales is not None and processed >= max_sales
            ):
                self._save_pos_cursor(cursor, day, start_date, end_date, next_page=page)
                if self.client.requests_made >= MAX_REQUESTS_PER_RUN:
                    self._finish(
                        SyncRun.STATUS_PAUSED,
                        error="Paused while fetching POS sales to respect Elinor API rate limits.",
                    )
                    return True
                return False

            self._pos_days_fetched += 1
            self._day_branch_seen = {branch: 0 for branch in self._active_pos_branches()}
            day_end = day + timedelta(days=1)
            last_page = page
            previous_ids = set()
            day_count = 0
            while page <= last_page:
                if self._stop_requested():
                    self._pause_pos_day(cursor, day, start_date, end_date, page, day_count)
                    self._finish(SyncRun.STATUS_FAILED, error="Stopped by user.")
                    return True
                self._touch_heartbeat(day)
                if self.client.requests_made >= MAX_REQUESTS_PER_RUN:
                    self._pause_pos_day(cursor, day, start_date, end_date, page, day_count)
                    self._finish(
                        SyncRun.STATUS_PAUSED,
                        error="Paused while fetching POS sales to respect Elinor API rate limits.",
                    )
                    return True
                payload = self.client.get_mini_orders(
                    page=page,
                    per_page=ORDERS_PER_PAGE,
                    start_date=day,
                    end_date=day_end,
                )
                rows = payload["results"]
                last_page = max(1, payload["last_page"])
                if page > last_page:
                    break
                row_ids = {as_int(row.get("id"), default=None) for row in rows}
                row_ids.discard(None)
                if page > 1 and row_ids and row_ids == previous_ids:
                    logger.warning("POS pagination repeated page %s for %s; stopping that day.", page, day.isoformat())
                    break
                previous_ids = row_ids
                logger.info(
                    "mini_orders %s..%s page %s/%s (%s rows, total=%s)",
                    day.isoformat(),
                    day_end.isoformat(),
                    page,
                    last_page,
                    len(rows),
                    payload.get("total"),
                )
                stopped_mid_page = False
                for row in rows:
                    if max_sales is not None and processed >= max_sales:
                        stopped_mid_page = True
                        break
                    store_source_id = as_int(row.get("store_id"), default=0)
                    if self.pos_store_ids is not None and store_source_id not in self.pos_store_ids:
                        continue
                    branch_key = next(
                        (key for key, store_id in POS_BRANCH_STORE_IDS.items() if store_id == store_source_id),
                        "",
                    )
                    if branch_key:
                        self._day_branch_seen[branch_key] = self._day_branch_seen.get(branch_key, 0) + 1
                    sale = self._upsert_pos_header(row)
                    if not sale:
                        continue
                    processed += 1
                    day_count += 1
                    try:
                        self._sync_pos_details(sale)
                    except Exception as exc:
                        self.failures += 1
                        logger.warning("POS %s details failed: %s", sale.source_id, exc)
                if stopped_mid_page:
                    self._pause_pos_day(cursor, day, start_date, end_date, page, day_count)
                    logger.info("POS day %s paused on page %s after %s sales; will resume.", day.isoformat(), page, day_count)
                    return False
                page += 1
                self._persist_progress()
                if max_sales is not None and processed >= max_sales:
                    self._pause_pos_day(cursor, day, start_date, end_date, page, day_count)
                    logger.info("POS day %s page %s is next; sales cap reached.", day.isoformat(), page)
                    return False
                if self.client.requests_made >= MAX_REQUESTS_PER_RUN:
                    self._pause_pos_day(cursor, day, start_date, end_date, page, day_count)
                    self._finish(
                        SyncRun.STATUS_PAUSED,
                        error="Paused while fetching POS sales to respect Elinor API rate limits.",
                    )
                    return True

            logger.info("POS day %s upserted %s sales", day.isoformat(), day_count)
            self._note_pos_day(day, PosDaySync.STATUS_COMPLETE, next_page=1, sales=day_count, seen=self._day_branch_seen)
            day += timedelta(days=1)
            self._save_pos_cursor(cursor, day, start_date, end_date, next_page=1)

        logger.info("POS fetch complete for %s..%s (%s sales).", start_date.isoformat(), end_date.isoformat(), processed)
        return False

    def _sync_online_days(self, start_date, end_date):
        day = start_date
        while day <= end_date:
            if self._branch_day_is_closed(day, "online"):
                self._pos_days_skipped += 1
                self._touch_heartbeat(day)
                day += timedelta(days=1)
                continue
            if self.client.requests_made >= MAX_REQUESTS_PER_RUN:
                self._finish(
                    SyncRun.STATUS_PAUSED,
                    error="Paused while fetching online orders to respect Elinor API rate limits.",
                )
                return True
            self._pos_days_fetched += 1
            start_dt = timezone.make_aware(datetime.combine(day, time.min), timezone.get_current_timezone())
            end_dt = start_dt + timedelta(days=1)
            self._sync_orders(start_dt, end_dt, fetch_details=False, count_on=day)
            seen = {"online": self._last_online_seen}
            if self.run.status != SyncRun.STATUS_RUNNING:
                self._note_branches(day, ["online"], PosDaySync.STATUS_PARTIAL, 1, seen)
                return True
            self._note_branches(day, ["online"], PosDaySync.STATUS_COMPLETE, 1, seen)
            day += timedelta(days=1)
        return False

    def _save_pos_cursor(self, cursor, next_date, start_date, end_date, next_page=1):
        cursor.value = {
            "next_date": next_date.isoformat(),
            "next_page": max(1, int(next_page or 1)),
            "window_start": start_date.isoformat(),
            "window_end": end_date.isoformat(),
        }
        cursor.save()

    def _active_pos_branches(self):
        if self.pos_branches:
            return self.pos_branches
        if self.pos_store_ids is None:
            return list(POS_BRANCH_STORE_IDS)
        reverse = {store_id: key for key, store_id in POS_BRANCH_STORE_IDS.items()}
        return [reverse[store_id] for store_id in self.pos_store_ids if store_id in reverse]

    def _pos_day_is_open(self, day):
        return day >= timezone.localdate() - timedelta(days=1)

    def _branch_day_is_closed(self, day, branch):
        if self.force_pos or self._pos_day_is_open(day):
            return False
        return PosDaySync.objects.filter(
            day=day,
            branch=branch,
            status=PosDaySync.STATUS_COMPLETE,
        ).exists()

    def _pos_day_is_closed(self, day):
        branches = self._active_pos_branches()
        return bool(branches) and all(self._branch_day_is_closed(day, branch) for branch in branches)

    def _pos_day_start_page(self, day, cursor, first_day):
        if self.force_pos or self._pos_day_is_open(day):
            return 1
        branches = self._active_pos_branches()
        rows = list(PosDaySync.objects.filter(day=day, branch__in=branches))
        if len(rows) == len(branches) and rows and all(row.status == PosDaySync.STATUS_PARTIAL for row in rows):
            pages = {row.next_page for row in rows}
            if len(pages) == 1:
                return max(1, pages.pop())
        if first_day:
            return _pos_resume_page(cursor.value, day)
        return 1

    def _note_pos_day(self, day, status, next_page, sales, seen=None):
        branches = self._active_pos_branches()
        counts = seen if seen is not None else {branch: sales for branch in branches}
        self._note_branches(day, branches, status, next_page, counts)

    def _note_branches(self, day, branches, status, next_page, seen):
        now = timezone.now()
        for branch in branches:
            PosDaySync.objects.update_or_create(
                day=day,
                branch=branch,
                defaults={
                    "status": status,
                    "next_page": max(1, int(next_page or 1)),
                    "sales_upserted": int(seen.get(branch, 0)),
                    "api_count": int(seen.get(branch, 0)) if status == PosDaySync.STATUS_COMPLETE else None,
                    "completed_at": now if status == PosDaySync.STATUS_COMPLETE else None,
                },
            )

    def _pause_pos_day(self, cursor, day, start_date, end_date, page, sales):
        self._save_pos_cursor(cursor, day, start_date, end_date, next_page=page)
        self._note_pos_day(day, PosDaySync.STATUS_PARTIAL, next_page=page, sales=sales)

    def _upsert_pos_header(self, row):
        source_id = as_int(row.get("id"), default=None)
        if not source_id:
            return None
        customer = None
        customer_source_id = as_int(row.get("customer_id"), default=None)
        if customer_source_id:
            customer, created_customer = Customer.objects.get_or_create(source_id=customer_source_id)
            if created_customer:
                self.run.customers_upserted += 1
        store_source_id = as_int(row.get("store_id"), default=0)
        store = Store.objects.filter(source_id=store_source_id).first()
        created_at = parse_datetime(row.get("created_at")) or timezone.now()
        defaults = {
            "customer": customer,
            "store": store,
            "store_source_id": store_source_id,
            "sales_line": STORE_SALES_LINE.get(store_source_id, ""),
            "type": str(row.get("type") or ""),
            "confirmed": str(row.get("confirmed") or ""),
            "discount_amount": as_int(row.get("discount_amount")),
            "cash_amount": as_int(row.get("cash_amount")),
            "card_by_card_amount": as_int(row.get("cardByCard_amount")),
            "from_wallet_amount": as_int(row.get("from_wallet_amount")),
            "digipay_cashier_amount": as_int(row.get("digipay_cashier_amount")),
            "snappay_cashier_amount": as_int(row.get("snappay_cashier_amount")),
            "tracking_code": str(row.get("tracking_code") or ""),
            "transaction_id": as_int(row.get("transaction_id"), default=None),
            "is_cancelled": as_bool(row.get("is_cancelled")),
            "deleted_at": parse_datetime(row.get("deleted_at")),
            "created_at": created_at,
            "updated_at_source": parse_datetime(row.get("updated_at")),
        }
        sale, _created = PosSale.objects.update_or_create(source_id=source_id, defaults=defaults)
        self._pos_sales_upserted += 1
        return sale

    def _sync_pos_details(self, sale):
        payload = self.client.get_mini_order(sale.source_id)
        order = extract_object(payload, ("mini_order", "mini_orders"))
        if not order:
            raise ElinorApiError(f"Empty POS detail for {sale.source_id}")
        items = extract_list(order, ("mini_order_items", "items"))
        product_ids = {
            as_int(item.get("product_id"), default=None)
            for item in items
            if as_int(item.get("product_id"), default=None)
        }
        for product_id in product_ids:
            self._hydrate_product(product_id)
        if sale.customer_id and sale.customer.source_id not in self._fetched_customers:
            embedded = order.get("customer")
            if isinstance(embedded, dict) and embedded.get("id"):
                apply_customer_payload(sale.customer, embedded)
                sale.customer.synced_at = timezone.now()
                sale.customer.save()
                self._fetched_customers.add(sale.customer.source_id)
                self.run.customers_upserted += 1
        with transaction.atomic():
            sale.customer = sale.customer or self._customer_from_row(order)
            sale.type = str(order.get("type") or sale.type)
            sale.confirmed = str(order.get("confirmed") or sale.confirmed)
            sale.discount_amount = as_int(order.get("discount_amount"), sale.discount_amount)
            sale.cash_amount = as_int(order.get("cash_amount"), sale.cash_amount)
            sale.card_by_card_amount = as_int(order.get("cardByCard_amount"), sale.card_by_card_amount)
            sale.from_wallet_amount = as_int(order.get("from_wallet_amount"), sale.from_wallet_amount)
            sale.digipay_cashier_amount = as_int(order.get("digipay_cashier_amount"), sale.digipay_cashier_amount)
            sale.snappay_cashier_amount = as_int(order.get("snappay_cashier_amount"), sale.snappay_cashier_amount)
            sale.is_cancelled = as_bool(order.get("is_cancelled"))
            sale.deleted_at = parse_datetime(order.get("deleted_at"))
            sale.updated_at_source = parse_datetime(order.get("updated_at"))
            sale.save()
            for item in items:
                self._upsert_pos_item(sale, item)
        self._persist_progress()

    def _customer_from_row(self, row):
        customer_source_id = as_int(row.get("customer_id"), default=None)
        if not customer_source_id:
            return None
        customer, created = Customer.objects.get_or_create(source_id=customer_source_id)
        if created:
            self.run.customers_upserted += 1
        embedded = row.get("customer")
        if isinstance(embedded, dict) and embedded.get("id"):
            apply_customer_payload(customer, embedded)
            customer.synced_at = timezone.now()
            customer.save()
        return customer

    def _upsert_pos_item(self, sale, row):
        source_id = as_int(row.get("id"), default=None)
        if not source_id:
            return
        product = self._hydrate_product(as_int(row.get("product_id"), default=None))
        variant_id = as_int(row.get("variety_id") or row.get("variant_id"), default=None)
        variant = Variant.objects.filter(source_id=variant_id).first() if variant_id else None
        defaults = {
            "pos_sale": sale,
            "product": product,
            "variant": variant,
            "product_source_id": as_int(row.get("product_id"), default=None),
            "variant_source_id": variant_id,
            "quantity": as_int(row.get("quantity"), 1),
            "amount": as_int(row.get("amount")),
            "discount_amount": as_int(row.get("discount_amount")),
            "real_amount": _nullable_amount(row.get("real_amount")),
            "type": str(row.get("type") or ""),
            "store_source_id": as_int(row.get("store_id"), default=None),
            "reference_item_source_id": as_int(row.get("refrence_mini_order_item_id"), default=None),
            "deleted_at": parse_datetime(row.get("deleted_at")),
            "created_at_source": parse_datetime(row.get("created_at")),
        }
        PosSaleItem.objects.update_or_create(source_id=source_id, defaults=defaults)
        self._pos_items_upserted += 1
        self.run.items_upserted += 1

    def _upsert_light_order(self, row):
        source_id = as_int(row.get("id"), default=None)
        if not source_id:
            return None
        customer = None
        customer_source_id = as_int(row.get("customer_id"), default=None)
        if customer_source_id:
            customer, created_customer = Customer.objects.get_or_create(source_id=customer_source_id)
            if created_customer:
                self.run.customers_upserted += 1
        created_at = parse_datetime(row.get("created_at")) or timezone.now()
        defaults = {
            "customer": customer,
            "status": str(row.get("status") or ""),
            "receiver": str(row.get("receiver") or ""),
            "total_amount": as_int(row.get("total_amount")),
            "shipping_amount": as_int(row.get("shipping_amount")),
            "discount_amount": as_int(row.get("discount_amount")),
            "items_count": as_int(row.get("items_count")),
            "is_shopino": as_bool(row.get("is_shopino")),
            "shipping_id": as_int(row.get("shipping_id"), default=None),
            "created_at": created_at,
            "source_payload": row,
        }
        Order.objects.update_or_create(source_id=source_id, defaults=defaults)
        self.run.orders_seen += 1
        self.run.orders_upserted += 1

    def _sync_order_details(self, order):
        detail = self.client.get_order(order.source_id)
        if not isinstance(detail, dict) or not as_int(detail.get("id"), default=None):
            raise ElinorApiError(f"Empty order detail for {order.source_id}")
        items = extract_list(detail, ("items", "order_items", "orderItems"))
        product_ids = {
            as_int(item.get("product_id"), default=None)
            for item in items
            if as_int(item.get("product_id"), default=None)
        }
        for product_id in product_ids:
            self._hydrate_product(product_id)
        if self.kind != SyncRun.KIND_DETAILS:
            self._hydrate_customer(order)
        with transaction.atomic():
            order.status = str(detail.get("status") or order.status)
            order.receiver = str(detail.get("receiver") or order.receiver)
            order.total_amount = as_int(detail.get("total_amount"), order.total_amount)
            order.shipping_amount = as_int(detail.get("shipping_amount"), order.shipping_amount)
            order.discount_amount = as_int(detail.get("discount_amount"), order.discount_amount)
            order.items_count = as_int(detail.get("items_count"), len(items) or order.items_count)
            if "is_shopino" in detail:
                order.is_shopino = as_bool(detail.get("is_shopino"))
            payment_detail = detail
            if not extract_order_payment_rows(order.source_id, detail):
                invoices = self.client.get_order_invoices(order.source_id)
                if invoices:
                    payment_detail = dict(detail)
                    payment_detail["invoices"] = invoices
            order.source_payload = payment_detail
            customer_source_id = as_int(detail.get("customer_id"), default=None)
            if customer_source_id and not order.customer_id:
                customer, _ = Customer.objects.get_or_create(source_id=customer_source_id)
                order.customer = customer
            for item in items:
                self._upsert_item(order, item)
            upserted = upsert_order_gateway_payments(order, payment_detail)
            self._gateway_payments_upserted += upserted
            order.details_synced_at = timezone.now()
            order.save()
        self._persist_progress()

    def _hydrate_customer(self, order):
        if not order.customer_id:
            return
        customer = order.customer
        if customer.mobile and (customer.source_id in self._fetched_customers or customer.synced_at):
            return
        if not customer.mobile and customer.source_payload:
            apply_customer_payload(customer, customer.source_payload)
            if customer.mobile:
                customer.save()
                self._fetched_customers.add(customer.source_id)
                self.run.customers_upserted += 1
                return
        try:
            payload = self.client.get_customer(customer.source_id)
        except ElinorApiError as exc:
            logger.warning("Could not fetch customer %s: %s", customer.source_id, exc)
            return
        apply_customer_payload(customer, payload)
        customer.synced_at = timezone.now()
        customer.save()
        self._fetched_customers.add(customer.source_id)
        self.run.customers_upserted += 1

    def _upsert_item(self, order, row):
        source_id = as_int(row.get("id"), default=None)
        if not source_id:
            return
        product = self._hydrate_product(as_int(row.get("product_id"), default=None))
        variant_id = as_int(row.get("variety_id") or row.get("variant_id"), default=None)
        variant = Variant.objects.filter(source_id=variant_id).first() if variant_id else None
        defaults = {
            "order": order,
            "product": product,
            "variant": variant,
            "product_source_id": as_int(row.get("product_id"), default=None),
            "variant_source_id": variant_id,
            "quantity": as_int(row.get("quantity"), 1),
            "amount": as_int(row.get("amount")),
            "discount_amount": as_int(row.get("discount_amount")),
            "status": as_int(row.get("status"), 1),
            "title": str(row.get("title") or row.get("name") or ""),
            "source_payload": row,
        }
        OrderItem.objects.update_or_create(source_id=source_id, defaults=defaults)
        self.run.items_upserted += 1

    def _hydrate_product(self, source_id):
        if not source_id:
            return None
        product, _ = Product.objects.get_or_create(source_id=source_id)
        if source_id in self._fetched_products or product.synced_at:
            return product
        try:
            payload = self.client.get_product(source_id)
        except ElinorApiError as exc:
            logger.warning("Could not fetch product %s: %s", source_id, exc)
            return product
        product.title = str(payload.get("title") or payload.get("name") or "")
        product.status = str(payload.get("status") or "")
        product.source_payload = payload
        product.synced_at = timezone.now()
        product.save()
        for variety in extract_list(payload, ("varieties", "variants", "variations")):
            self._save_variant(product, variety)
        self._fetched_products.add(source_id)
        self.run.products_upserted += 1
        return product

    def _save_variant(self, product, row):
        source_id = as_int(row.get("id"), default=None)
        if not source_id:
            return
        color = row.get("color") if isinstance(row.get("color"), dict) else {}
        size = ""
        attributes = row.get("attributes") if isinstance(row.get("attributes"), list) else []
        for attr in attributes:
            label = str(attr.get("label") or attr.get("name") or "").lower()
            value = ""
            if isinstance(attr.get("pivot"), dict):
                value = str(attr["pivot"].get("value") or "")
            value = value or str(attr.get("value") or "")
            if "size" in label or label in {"سایز", "size"}:
                size = value
        final_price = None
        if isinstance(row.get("final_price"), dict):
            final_price = as_int(row["final_price"].get("amount"), default=None)
        Variant.objects.update_or_create(
            source_id=source_id,
            defaults={
                "product": product,
                "name": str(row.get("name") or ""),
                "title": str(row.get("title") or ""),
                "sku": str(row.get("SKU") or row.get("sku") or ""),
                "barcode": str(row.get("barcode") or ""),
                "price": as_int(row.get("price"), default=None),
                "final_price": final_price,
                "quantity": as_int(row.get("quantity") or row.get("main_balance"), default=None),
                "color_name": str(color.get("name") or ""),
                "size": size,
                "source_payload": row,
            },
        )
        self.run.variants_upserted += 1

    def _refresh_customer_stats(self):
        logger.info("Refreshing customer order stats…")
        online = (
            Order.objects.exclude(customer=None)
            .values("customer_id")
            .annotate(
                order_count=Count("id"),
                first_order_at=Min("created_at"),
                last_order_at=Max("created_at"),
            )
        )
        pos = (
            PosSale.objects.filter(customer_id__isnull=False, deleted_at__isnull=True)
            .values("customer_id")
            .annotate(
                order_count=Count("id"),
                first_order_at=Min("created_at"),
                last_order_at=Max("created_at"),
            )
        )
        combined = {}
        for row in online:
            combined[row["customer_id"]] = dict(row)
        for row in pos:
            current = combined.get(row["customer_id"])
            if not current:
                combined[row["customer_id"]] = dict(row)
                continue
            current["order_count"] += row["order_count"]
            current["first_order_at"] = min(
                value
                for value in (current["first_order_at"], row["first_order_at"])
                if value is not None
            )
            current["last_order_at"] = max(
                value
                for value in (current["last_order_at"], row["last_order_at"])
                if value is not None
            )
        for customer_id, row in combined.items():
            Customer.objects.filter(id=customer_id).update(
                order_count=row["order_count"],
                first_order_at=row["first_order_at"],
                last_order_at=row["last_order_at"],
            )
        logger.info("Customer order stats refreshed for %s customers.", len(combined))

    def _stop_requested(self):
        if not self.run:
            return False
        fresh = SyncRun.objects.filter(pk=self.run.pk).values_list("report", "status").first()
        if not fresh:
            return False
        report, status = fresh
        report = report or {}
        if report.get("cancel") or status != SyncRun.STATUS_RUNNING:
            self.run.report = report
            self.run.status = status
            return True
        return False

    def _touch_heartbeat(self, day=None):
        if not self.run or self._stop_requested():
            return
        report = dict(self.run.report or {})
        report["heartbeat"] = timezone.now().isoformat()
        report["pos_sales_upserted"] = self._pos_sales_upserted
        report["pos_items_upserted"] = self._pos_items_upserted
        report["failures"] = self.failures
        report["days_skipped"] = self._pos_days_skipped
        report["days_fetched"] = self._pos_days_fetched
        if day is not None:
            report["current_day"] = day.isoformat()
        self.run.report = report
        self.run.requests_made = self.client.requests_made
        self.run.save(update_fields=["report", "requests_made"])

    def _persist_progress(self):
        if self._stop_requested():
            return
        self._touch_heartbeat()
        self.run.save(
            update_fields=[
                "requests_made",
                "orders_seen",
                "orders_upserted",
                "items_upserted",
                "customers_upserted",
                "products_upserted",
                "variants_upserted",
                "report",
            ]
        )

    def _finish(self, status, error=""):
        if not self.run:
            return
        self.run.refresh_from_db()
        previous = self.run.report or {}
        if previous.get("cancel"):
            status = SyncRun.STATUS_FAILED
            error = "Stopped by user."
        elif self.run.status != SyncRun.STATUS_RUNNING and status == SyncRun.STATUS_SUCCESS:
            return
        self.run.status = status
        self.run.finished_at = timezone.now()
        self.run.error_message = error[:2000]
        self.run.requests_made = self.client.requests_made
        self.run.report = {
            "orders": Order.objects.count(),
            "customers": Customer.objects.count(),
            "items": OrderItem.objects.count(),
            "products": Product.objects.count(),
            "variants": Variant.objects.count(),
            "pos_sales": PosSale.objects.count(),
            "pos_items": PosSaleItem.objects.count(),
            "pos_sales_upserted": self._pos_sales_upserted,
            "pos_items_upserted": self._pos_items_upserted,
            "gateway_payments_upserted": self._gateway_payments_upserted,
            "requests_made": self.client.requests_made,
            "retries": getattr(self.client, "retries_made", 0),
            "failures": getattr(self, "failures", 0),
            "days_skipped": self._pos_days_skipped,
            "days_fetched": self._pos_days_fetched,
            "branches": previous.get("branches") or (
                (["online"] if self.include_online else []) + self._active_pos_branches()
            ),
            "current_day": previous.get("current_day"),
            "detailed_orders": Order.objects.exclude(details_synced_at=None).count(),
            "window_start": self.run.window_start.isoformat() if self.run.window_start else None,
            "window_end": self.run.window_end.isoformat() if self.run.window_end else None,
        }
        self.run.save()


def pos_week_activity(today=None):
    today = today or timezone.localdate()
    return pos_range_activity(today - timedelta(days=6), today)


def pos_range_activity(start, end):
    """Per-day coverage for online and each physical store inside an inclusive range."""
    from django.db.models import Count
    from django.db.models.functions import TruncDate

    if end < start:
        raise ValueError("invalid range")
    branches = (
        ("online", "اینترنتی", None),
        ("sari", "ساری", SalesLine.SARI),
        ("gorgan", "گرگان", SalesLine.GORGAN),
        ("capri", "کاپری", SalesLine.CAPRI),
    )
    marks = {
        (row.day, row.branch): row
        for row in PosDaySync.objects.filter(day__gte=start, day__lte=end)
    }
    counts = {}
    sales = (
        PosSale.objects.filter(
            sales_line__in=[line for _key, _label, line in branches if line],
            created_at__gte=timezone.make_aware(datetime.combine(start, time.min), timezone.get_current_timezone()),
            created_at__lt=timezone.make_aware(datetime.combine(end + timedelta(days=1), time.min), timezone.get_current_timezone()),
        )
        .annotate(day=TruncDate("created_at", tzinfo=timezone.get_current_timezone()))
        .values("day", "sales_line")
        .annotate(count=Count("id"))
    )
    for row in sales:
        day_value = row["day"].date() if hasattr(row["day"], "date") else row["day"]
        counts[(day_value, row["sales_line"])] = int(row["count"] or 0)
    online_counts = {}
    online_rows = (
        Order.objects.filter(
            created_at__gte=timezone.make_aware(datetime.combine(start, time.min), timezone.get_current_timezone()),
            created_at__lt=timezone.make_aware(datetime.combine(end + timedelta(days=1), time.min), timezone.get_current_timezone()),
        )
        .annotate(day=TruncDate("created_at", tzinfo=timezone.get_current_timezone()))
        .values("day")
        .annotate(count=Count("id"))
    )
    for row in online_rows:
        day_value = row["day"].date() if hasattr(row["day"], "date") else row["day"]
        online_counts[day_value] = int(row["count"] or 0)

    today = timezone.localdate()
    days = []
    day = start
    while day <= end:
        open_day = day >= today - timedelta(days=1)
        branch_rows = []
        for key, label, line in branches:
            mark = marks.get((day, key))
            sales_count = online_counts.get(day, 0) if line is None else counts.get((day, line), 0)
            api_count = mark.api_count if mark and mark.api_count is not None else None
            if mark and mark.status == PosDaySync.STATUS_COMPLETE and api_count is not None and sales_count == api_count:
                state, state_label = "complete", "تأیید شده"
            elif mark and mark.status == PosDaySync.STATUS_COMPLETE and api_count is not None:
                state, state_label = "mismatch", "اختلاف"
            elif open_day:
                state, state_label = "open", "باز"
            elif mark and mark.status == PosDaySync.STATUS_COMPLETE:
                state, state_label = "read", "خوانده‌شده"
            elif mark and mark.status == PosDaySync.STATUS_PARTIAL:
                state, state_label = "partial", "نیمه‌کاره"
            elif sales_count:
                state, state_label = "unconfirmed", "تأیید نشده"
            else:
                state, state_label = "unread", "خوانده نشده"
            branch_rows.append(
                {
                    "key": key,
                    "label": label,
                    "sales": sales_count,
                    "api_count": api_count,
                    "state": state,
                    "state_label": state_label,
                    "synced_at": mark.completed_at if mark else None,
                }
            )
        days.append({"date": day.isoformat(), "open": open_day, "branches": branch_rows})
        day += timedelta(days=1)
    return {"from": start.isoformat(), "to": end.isoformat(), "days": days}


def _cursor(key):
    cursor, _ = SyncCursor.objects.get_or_create(key=key, defaults={"value": {}})
    return cursor
