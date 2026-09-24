import logging
from datetime import date, datetime, time, timedelta

from django.conf import settings
from django.db import transaction
from django.db.models import Count, Max, Min
from django.utils import timezone

from apps.customers.ingest import apply_customer_payload, upsert_customer_from_source
from apps.customers.models import Customer
from apps.products.models import Product, Variant
from apps.sales.models import Order, OrderItem, PosSale, PosSaleItem, STORE_SALES_LINE, Store

from .client import ElinorApiError, ElinorClient
from .gateway_payments import extract_order_payment_rows, upsert_order_gateway_payments
from .models import SyncCursor, SyncRun
from .parsers import as_bool, as_int, extract_list, extract_object, parse_datetime

logger = logging.getLogger(__name__)

BOOTSTRAP_DAYS = 92
OVERLAP_DAYS = 1
POS_OVERLAP_DAYS = 1
ORDERS_PER_PAGE = 50
MAX_REQUESTS_PER_RUN = int(getattr(settings, "ELINOR_SYNC_MAX_REQUESTS", 900))
HOURLY_ONLINE_DETAILS_LIMIT = int(getattr(settings, "ELINOR_SYNC_HOURLY_ONLINE_DETAILS_LIMIT", "250"))
HOURLY_POS_LOOKBACK_DAYS = int(getattr(settings, "ELINOR_SYNC_HOURLY_POS_DAYS", "3"))
HOURLY_POS_MAX_SALES = int(getattr(settings, "ELINOR_SYNC_HOURLY_POS_MAX_SALES", "300"))


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


def pos_window(cursor_value=None):
    end = timezone.localdate()
    if cursor_value and cursor_value.get("last_synced_date"):
        parsed = parse_datetime(cursor_value["last_synced_date"])
        start = (parsed.date() if parsed else end) - timedelta(days=POS_OVERLAP_DAYS)
    else:
        last_pos = PosSale.objects.aggregate(last_at=Max("created_at"))["last_at"]
        if last_pos:
            start = timezone.localtime(last_pos).date() - timedelta(days=POS_OVERLAP_DAYS)
        else:
            start = end - timedelta(days=BOOTSTRAP_DAYS)
    if start > end:
        start = end - timedelta(days=POS_OVERLAP_DAYS)
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

    def _ensure_not_running(self):
        stale_before = timezone.now() - timedelta(hours=2)
        SyncRun.objects.filter(status=SyncRun.STATUS_RUNNING, started_at__lt=stale_before).update(
            status=SyncRun.STATUS_FAILED,
            finished_at=timezone.now(),
            error_message="Marked failed after exceeding the sync time limit.",
        )
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

    def execute_pos(self):
        self._ensure_not_running()
        start, end = pos_window(_cursor("pos_orders").value)
        self.run = SyncRun.objects.create(
            kind=SyncRun.KIND_POS,
            status=SyncRun.STATUS_RUNNING,
            window_start=timezone.make_aware(datetime.combine(start, time.min), timezone.get_current_timezone()),
            window_end=timezone.make_aware(datetime.combine(end, time.max), timezone.get_current_timezone()),
        )
        logger.info("Starting POS sync from %s to %s", start, end)
        try:
            self.client.authenticate()
            paused = self._sync_pos_sales(start, end)
            self._refresh_customer_stats()
            if paused:
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
            self._sync_orders(online_start, online_end, fetch_details=False)
            if self.run.status == SyncRun.STATUS_PAUSED:
                return self.run

            if self.client.requests_made < MAX_REQUESTS_PER_RUN:
                paused = self._sync_pos_sales(pos_start, pos_end, max_sales=HOURLY_POS_MAX_SALES)
                if paused:
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

    def _sync_orders(self, start, end, *, fetch_details=True):
        page = 1
        last_page = 1
        last_created = None
        while page <= last_page:
            if self.client.requests_made >= MAX_REQUESTS_PER_RUN:
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
                last_created = parse_datetime(row.get("created_at")) or last_created
            page += 1
            self._persist_progress()

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
        last_created = None
        cursor = _cursor("pos_orders")
        processed = 0
        day = start_date
        while day <= end_date:
            page = 1
            last_page = 1
            previous_ids = set()
            while page <= last_page:
                if self.client.requests_made >= MAX_REQUESTS_PER_RUN:
                    self._finish(
                        SyncRun.STATUS_PAUSED,
                        error="Paused while fetching POS sales to respect Elinor API rate limits.",
                    )
                    return True
                if max_sales is not None and processed >= max_sales:
                    cursor.value = {
                        "last_synced_date": day.isoformat(),
                        "last_created_at": last_created.isoformat() if last_created else cursor.value.get("last_created_at"),
                        "window_start": start_date.isoformat(),
                        "window_end": end_date.isoformat(),
                    }
                    cursor.save()
                    return False
                payload = self.client.get_mini_orders(
                    page=page,
                    per_page=ORDERS_PER_PAGE,
                    start_date=day,
                    end_date=day,
                )
                rows = payload["results"]
                last_page = max(1, payload["last_page"])
                row_ids = {as_int(row.get("id"), default=None) for row in rows}
                row_ids.discard(None)
                if page > 1 and row_ids and row_ids == previous_ids:
                    logger.warning("POS pagination repeated page %s on %s; stopping day.", page, day)
                    break
                previous_ids = row_ids
                logger.info(
                    "mini_orders %s page %s/%s (%s rows)",
                    day.isoformat(),
                    page,
                    last_page,
                    len(rows),
                )
                for row in rows:
                    if max_sales is not None and processed >= max_sales:
                        break
                    if self.client.requests_made >= MAX_REQUESTS_PER_RUN:
                        self._finish(
                            SyncRun.STATUS_PAUSED,
                            error="Paused while fetching POS details to respect Elinor API rate limits.",
                        )
                        return True
                    sale = self._upsert_pos_header(row)
                    if sale:
                        processed += 1
                        last_created = sale.created_at or last_created
                        try:
                            self._sync_pos_details(sale)
                        except Exception as exc:
                            self.failures += 1
                            logger.warning("POS %s details failed: %s", sale.source_id, exc)
                page += 1
                self._persist_progress()
            day += timedelta(days=1)

        cursor.value = {
            "last_synced_date": end_date.isoformat(),
            "last_created_at": last_created.isoformat() if last_created else cursor.value.get("last_created_at"),
            "window_start": start_date.isoformat(),
            "window_end": end_date.isoformat(),
        }
        cursor.save()
        return False

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
            "real_amount": as_int(row.get("real_amount"), default=None),
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
        if customer.source_id in self._fetched_customers or customer.synced_at:
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

    def _persist_progress(self):
        self.run.requests_made = self.client.requests_made
        self.run.save(
            update_fields=[
                "requests_made",
                "orders_seen",
                "orders_upserted",
                "items_upserted",
                "customers_upserted",
                "products_upserted",
                "variants_upserted",
            ]
        )

    def _finish(self, status, error=""):
        if not self.run:
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
            "detailed_orders": Order.objects.exclude(details_synced_at=None).count(),
            "window_start": self.run.window_start.isoformat() if self.run.window_start else None,
            "window_end": self.run.window_end.isoformat() if self.run.window_end else None,
        }
        self.run.save()


def _cursor(key):
    cursor, _ = SyncCursor.objects.get_or_create(key=key, defaults={"value": {}})
    return cursor
