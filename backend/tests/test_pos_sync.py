from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from django.utils import timezone

from apps.customers.models import Customer
from apps.integrations.elinor.models import SyncRun
from apps.integrations.elinor.sync import POS_SQL_CUTOFF, SyncService, pos_window, resume_explicit_pos_start
from apps.sales.models import PosSale, PosSaleItem, SalesLine, Store

TEHRAN = ZoneInfo("Asia/Tehran")


def _mini_order(source_id=100, *, store_id=3, customer_id=42, created_at="2026-09-23 12:00:00"):
    return {
        "id": source_id,
        "customer_id": customer_id,
        "store_id": store_id,
        "type": "sell",
        "confirmed": "confirmed",
        "discount_amount": 0,
        "cash_amount": 100_000,
        "cardByCard_amount": 0,
        "from_wallet_amount": 0,
        "digipay_cashier_amount": 0,
        "snappay_cashier_amount": 0,
        "tracking_code": "",
        "transaction_id": None,
        "is_cancelled": False,
        "deleted_at": None,
        "created_at": created_at,
        "updated_at": created_at,
        "customer": {"id": customer_id, "first_name": "آوا", "last_name": "رضایی", "mobile": "09120000042"},
        "mini_order_items": [
            {
                "id": 1000,
                "mini_order_id": source_id,
                "product_id": 10,
                "variety_id": 20,
                "quantity": 1,
                "amount": 100_000,
                "discount_amount": 0,
                "real_amount": None,
                "type": "sell",
                "store_id": store_id,
                "refrence_mini_order_item_id": None,
                "deleted_at": None,
                "created_at": created_at,
            }
        ],
    }


@pytest.mark.django_db
def test_pos_sync_fetches_date_range_not_single_day():
    Store.objects.create(source_id=3, label="ساری")
    calls = []

    def fake_get_mini_orders(**kwargs):
        calls.append(kwargs)
        return {
            "results": [_mini_order()] if kwargs.get("page") == 1 else [],
            "current_page": kwargs.get("page", 1),
            "last_page": 1,
            "total": 1,
            "raw": {},
        }

    service = SyncService(SyncRun.KIND_POS)
    service.client.authenticate = lambda: "token"
    service.client.requests_made = 0
    service.client.get_mini_orders = fake_get_mini_orders
    service.client.get_mini_order = lambda source_id: {"mini_order": _mini_order(source_id=source_id)}
    service.client.get_product = lambda source_id: {"id": source_id, "title": "شال", "status": "1", "varieties": []}

    run = service.execute_pos(start_date=datetime(2026, 9, 14).date(), end_date=datetime(2026, 9, 16).date())
    assert run.status == SyncRun.STATUS_SUCCESS
    assert [call["start_date"].isoformat() for call in calls] == ["2026-09-14", "2026-09-15", "2026-09-16"]
    assert [call["end_date"].isoformat() for call in calls] == ["2026-09-15", "2026-09-16", "2026-09-17"]


@pytest.mark.django_db
def test_pos_sync_upserts_sale_and_items():
    Store.objects.create(source_id=3, label="ساری")
    service = SyncService(SyncRun.KIND_POS)
    service.client.authenticate = lambda: "token"
    service.client.requests_made = 0
    service.client.get_mini_orders = lambda **kwargs: {
        "results": [_mini_order()],
        "current_page": 1,
        "last_page": 1,
        "total": 1,
        "raw": {},
    }
    service.client.get_mini_order = lambda source_id: {"mini_order": _mini_order(source_id=source_id)}
    service.client.get_product = lambda source_id: {"id": source_id, "title": "شال", "status": "1", "varieties": []}

    run = service.execute_pos()
    assert run.status == SyncRun.STATUS_SUCCESS
    sale = PosSale.objects.get(source_id=100)
    assert sale.sales_line == SalesLine.SARI
    assert sale.customer.source_id == 42
    assert PosSaleItem.objects.filter(pos_sale=sale).count() == 1
    assert PosSaleItem.objects.get(source_id=1000).amount == 100_000


@pytest.mark.django_db
def test_pos_window_restarts_from_sql_cutoff_not_latest_sale():
    customer = Customer.objects.create(source_id=1, first_name="آوا", last_name="رضایی", mobile="09120000001")
    Store.objects.create(source_id=3, label="ساری")
    created_at = timezone.make_aware(datetime(2026, 9, 20, 10, 0), TEHRAN)
    PosSale.objects.create(
        source_id=50,
        customer=customer,
        store_source_id=3,
        sales_line=SalesLine.SARI,
        type="sell",
        created_at=created_at,
    )
    start, end = pos_window(None)
    assert start == POS_SQL_CUTOFF
    assert end == timezone.localdate()
    resumed, _end = pos_window({"next_date": "2026-09-18"})
    assert resumed.isoformat() == "2026-09-18"
    today = timezone.localdate().isoformat()
    caught_up, _end = pos_window({"next_date": today})
    assert caught_up == max(POS_SQL_CUTOFF, timezone.localdate() - timedelta(days=1))


def test_explicit_pos_range_resumes_unfinished_day():
    start = datetime(2026, 9, 12).date()
    end = datetime(2026, 9, 25).date()
    resumed = resume_explicit_pos_start(
        start,
        end,
        {"next_date": "2026-09-17", "window_start": "2026-09-12", "window_end": "2026-09-25"},
    )
    assert resumed.isoformat() == "2026-09-17"
    fresh = resume_explicit_pos_start(
        start,
        end,
        {"next_date": "2026-09-17", "window_start": "2026-09-14", "window_end": "2026-09-25"},
    )
    assert fresh == start
