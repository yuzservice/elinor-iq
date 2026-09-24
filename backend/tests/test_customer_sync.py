import pytest

from apps.customers.models import Customer
from apps.integrations.elinor.models import SyncCursor, SyncRun
from apps.integrations.elinor.sync import SyncService


def _page(page, last_page, rows):
    return {
        "results": rows,
        "current_page": page,
        "last_page": last_page,
        "total": 3,
        "raw": {},
    }


@pytest.mark.django_db
def test_customer_sync_paginated_resumable_and_idempotent():
    pages = {
        1: _page(
            1,
            2,
            [
                {"id": 1, "first_name": "آوا", "last_name": "رضایی", "mobile": "09120000001"},
                {"id": 2, "first_name": "سارا", "last_name": "محمدی", "mobile": "09120000002"},
            ],
        ),
        2: _page(
            2,
            2,
            [{"id": 3, "first_name": "نیما", "last_name": "کاظمی", "mobile": "09120000003"}],
        ),
    }

    service = SyncService(SyncRun.KIND_CUSTOMERS)
    service.client.authenticate = lambda: "token"
    service.client.requests_made = 0
    service.client.get_customers = lambda page=1, per_page=50: pages[page]
    first = service.execute_customers()
    assert first.status == SyncRun.STATUS_SUCCESS
    assert Customer.objects.count() == 3
    assert Customer.objects.registered_only().count() == 3

    Customer.objects.filter(source_id=1).update(order_count=4)
    cursor = SyncCursor.objects.get(key="customers")
    assert cursor.value["completed"] is True

    second = SyncService(SyncRun.KIND_CUSTOMERS)
    second.client.authenticate = lambda: "token"
    second.client.requests_made = 0
    second.client.get_customers = lambda page=1, per_page=50: pages[page]
    again = second.execute_customers()
    assert again.status == SyncRun.STATUS_SUCCESS
    assert Customer.objects.count() == 3
    assert Customer.objects.get(source_id=1).order_count == 4
    assert Customer.objects.get(source_id=1).mobile == "09120000001"


@pytest.mark.django_db
def test_customer_sync_resumes_from_saved_page():
    SyncCursor.objects.create(key="customers", value={"page": 2, "completed": False})
    service = SyncService(SyncRun.KIND_CUSTOMERS)
    service.client.authenticate = lambda: "token"
    service.client.requests_made = 0
    seen = []

    def get_customers(page=1, per_page=50):
        seen.append(page)
        return {
            "results": [{"id": 9, "first_name": "رعنا", "last_name": "احمدی"}],
            "current_page": 2,
            "last_page": 2,
            "total": 1,
            "raw": {},
        }

    service.client.get_customers = get_customers
    run = service.execute_customers()
    assert run.status == SyncRun.STATUS_SUCCESS
    assert seen == [2]
    assert Customer.objects.filter(source_id=9).exists()
