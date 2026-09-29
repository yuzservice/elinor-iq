from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from django.utils import timezone

from apps.customers.models import Customer
from apps.integrations.elinor.models import PosDaySync, SyncCursor, SyncRun
from apps.integrations.elinor.sync import (
    POS_SQL_CUTOFF,
    SyncService,
    pos_range_activity,
    pos_week_activity,
    pos_window,
    resume_explicit_pos_start,
)
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


@pytest.mark.django_db
def test_pos_cap_resumes_on_the_next_page_instead_of_page_one():
    Store.objects.create(source_id=3, label="ساری")
    pages = {
        1: [
            _mini_order(1, created_at="2026-09-22 10:00:00"),
            _mini_order(2, created_at="2026-09-22 11:00:00"),
        ],
        2: [_mini_order(3, created_at="2026-09-22 12:00:00")],
    }
    calls = []

    def fake_get_mini_orders(**kwargs):
        page = kwargs["page"]
        calls.append(page)
        return {
            "results": pages.get(page, []),
            "current_page": page,
            "last_page": 2,
            "total": 3,
            "raw": {},
        }

    def make_service():
        service = SyncService(SyncRun.KIND_HOURLY)
        service.client.authenticate = lambda: "token"
        service.client.requests_made = 0
        service.client.get_mini_orders = fake_get_mini_orders
        service.client.get_mini_order = lambda source_id: {"mini_order": _mini_order(source_id=source_id)}
        service.client.get_product = lambda source_id: {"id": source_id, "title": "شال", "status": "1", "varieties": []}
        service.run = SyncRun.objects.create(kind=SyncRun.KIND_HOURLY, status=SyncRun.STATUS_RUNNING)
        return service

    day = datetime(2026, 9, 22).date()
    assert make_service()._sync_pos_sales(day, day, max_sales=2) is False
    cursor = SyncCursor.objects.get(key="pos_orders")
    assert cursor.value["next_date"] == "2026-09-22"
    assert cursor.value["next_page"] == 2

    calls.clear()
    make_service()._sync_pos_sales(day, day, max_sales=2)
    assert calls[0] == 2


@pytest.mark.django_db
def test_hourly_sync_fetches_pos_before_online_orders():
    today = timezone.localdate().isoformat()
    SyncCursor.objects.create(key="pos_orders", value={"next_date": today, "next_page": 1})
    sequence = []

    service = SyncService(SyncRun.KIND_HOURLY)
    service.client.authenticate = lambda: "token"
    service.client.requests_made = 0
    service.client.get_mini_orders = lambda **kwargs: sequence.append("pos") or {
        "results": [],
        "current_page": 1,
        "last_page": 1,
        "total": 0,
        "raw": {},
    }
    service.client.get_orders_light = lambda **kwargs: sequence.append("online") or {
        "results": [],
        "current_page": 1,
        "last_page": 1,
        "total": 0,
        "raw": {},
    }

    run = service.execute_hourly()
    assert run.status == SyncRun.STATUS_SUCCESS
    assert sequence[0] == "pos"
    assert "online" in sequence
    assert sequence.index("pos") < sequence.index("online")


def _sync_service(calls):
    service = SyncService(SyncRun.KIND_POS)
    service.client.authenticate = lambda: "token"
    service.client.requests_made = 0
    service.client.get_mini_orders = lambda **kwargs: calls.append(kwargs["start_date"]) or {
        "results": [],
        "current_page": kwargs.get("page", 1),
        "last_page": 1,
        "total": 0,
        "raw": {},
    }
    service.pos_branches = ["sari", "gorgan", "capri"]
    service.run = SyncRun.objects.create(kind=SyncRun.KIND_POS, status=SyncRun.STATUS_RUNNING)
    return service


@pytest.mark.django_db
def test_closed_store_day_is_not_requested_again():
    day = timezone.localdate() - timedelta(days=4)
    for branch in ("sari", "gorgan", "capri"):
        PosDaySync.objects.create(day=day, branch=branch, status=PosDaySync.STATUS_COMPLETE)
    calls = []
    service = _sync_service(calls)
    assert service._sync_pos_sales(day, day) is False
    assert calls == []
    assert service._pos_days_skipped == 1
    assert service._pos_days_fetched == 0


@pytest.mark.django_db
def test_today_is_fetched_even_when_marked_complete():
    day = timezone.localdate()
    for branch in ("sari", "gorgan", "capri"):
        PosDaySync.objects.create(day=day, branch=branch, status=PosDaySync.STATUS_COMPLETE)
    calls = []
    service = _sync_service(calls)
    service._sync_pos_sales(day, day)
    assert calls == [day]
    assert service._pos_days_fetched == 1


@pytest.mark.django_db
def test_force_refetches_a_closed_day():
    day = timezone.localdate() - timedelta(days=4)
    for branch in ("sari", "gorgan", "capri"):
        PosDaySync.objects.create(day=day, branch=branch, status=PosDaySync.STATUS_COMPLETE)
    calls = []
    service = _sync_service(calls)
    service.force_pos = True
    service._sync_pos_sales(day, day)
    assert calls == [day]


@pytest.mark.django_db
def test_pos_week_activity_covers_seven_days():
    today = timezone.localdate()
    old = today - timedelta(days=3)
    PosDaySync.objects.create(day=old, branch="sari", status=PosDaySync.STATUS_COMPLETE)
    payload = pos_week_activity(today)
    assert len(payload["days"]) == 7
    assert payload["days"][0]["date"] == (today - timedelta(days=6)).isoformat()
    assert payload["days"][-1]["date"] == today.isoformat()
    assert payload["days"][-1]["branches"][0]["state"] == "open"
    row = next(item for item in payload["days"] if item["date"] == old.isoformat())
    by_key = {branch["key"]: branch for branch in row["branches"]}
    assert by_key["sari"]["state"] == "read"
    assert by_key["gorgan"]["state"] == "unread"
    assert by_key["online"]["state"] == "unread"
    assert payload["days"][-1]["branches"][0]["key"] == "online"


@pytest.mark.django_db
def test_pos_range_activity_marks_a_matching_count_complete():
    day = timezone.localdate() - timedelta(days=5)
    PosDaySync.objects.create(day=day, branch="online", status=PosDaySync.STATUS_COMPLETE, api_count=0)
    PosDaySync.objects.create(day=day, branch="gorgan", status=PosDaySync.STATUS_COMPLETE, api_count=4)
    payload = pos_range_activity(day, day)
    assert payload["from"] == day.isoformat()
    assert len(payload["days"]) == 1
    by_key = {branch["key"]: branch for branch in payload["days"][0]["branches"]}
    assert by_key["online"]["state"] == "complete"
    assert by_key["online"]["state_label"] == "تأیید شده"
    assert by_key["gorgan"]["state"] == "mismatch"
    assert by_key["gorgan"]["sales"] == 0
    assert by_key["gorgan"]["api_count"] == 4


@pytest.mark.django_db
def test_open_day_is_confirmed_when_the_api_count_matches():
    today = timezone.localdate()
    PosDaySync.objects.create(day=today, branch="sari", status=PosDaySync.STATUS_COMPLETE, api_count=0)
    payload = pos_week_activity(today)
    row = next(item for item in payload["days"] if item["date"] == today.isoformat())
    by_key = {branch["key"]: branch for branch in row["branches"]}
    assert by_key["sari"]["state"] == "complete"
    assert by_key["sari"]["state_label"] == "تأیید شده"
    assert by_key["gorgan"]["state"] == "open"


@pytest.mark.django_db
def test_online_day_is_skipped_after_a_complete_count():
    day = timezone.localdate() - timedelta(days=4)
    calls = []
    service = _sync_service(calls)
    service.include_online = True
    service.client.get_orders_light = lambda **kwargs: calls.append("online") or {
        "results": [{"id": 9, "status": "delivered", "total_amount": 1000, "created_at": f"{day.isoformat()} 12:00:00"}],
        "current_page": 1,
        "last_page": 1,
        "total": 1,
        "raw": {},
    }
    assert service._sync_online_days(day, day) is False
    mark = PosDaySync.objects.get(day=day, branch="online")
    assert mark.status == PosDaySync.STATUS_COMPLETE
    assert mark.api_count == 1
    calls.clear()
    assert service._sync_online_days(day, day) is False
    assert calls == []


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
