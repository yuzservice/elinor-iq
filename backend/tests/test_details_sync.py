from datetime import timedelta

import pytest
from django.utils import timezone

from apps.customers.models import Customer
from apps.integrations.elinor.client import ElinorApiError
from apps.integrations.elinor.models import SyncCursor, SyncRun
from apps.integrations.elinor.sync import SyncService
from apps.products.models import Product, Variant
from apps.sales.models import Order, OrderItem


def _order(source_id, created_at, customer):
    return Order.objects.create(
        source_id=source_id,
        customer=customer,
        status="new",
        total_amount=1000,
        created_at=created_at,
    )


@pytest.mark.django_db
def test_details_sync_is_limited_resumable_and_idempotent():
    now = timezone.now()
    customer = Customer.objects.create(source_id=1, first_name="آوا")
    for index in range(6):
        _order(100 + index, now - timedelta(minutes=index), customer)

    detail = {
        "id": 105,
        "customer_id": 1,
        "status": "delivered",
        "total_amount": 2000,
        "items": [
            {
                "id": 9001,
                "product_id": 310,
                "variety_id": 1842,
                "quantity": 1,
                "amount": 2000,
                "status": 1,
            }
        ],
    }
    product = {
        "id": 310,
        "title": "کت",
        "status": "available",
        "varieties": [{"id": 1842, "title": "M", "price": 2000, "SKU": "EL-M"}],
    }

    calls = []

    def get_order(order_id):
        calls.append(order_id)
        payload = dict(detail)
        payload["id"] = order_id
        payload["items"] = [
            {
                "id": 9000 + order_id,
                "product_id": 310,
                "variety_id": 1842,
                "quantity": 1,
                "amount": 2000,
                "status": 1,
            }
        ]
        return payload

    first = SyncService(SyncRun.KIND_DETAILS)
    first.client.authenticate = lambda: "token"
    first.client.requests_made = 0
    first.client.retries_made = 0
    first.client.get_order = get_order
    first.client.get_product = lambda product_id: product
    run = first.execute_details(limit=2)

    assert run.status == SyncRun.STATUS_SUCCESS
    assert Order.objects.count() == 6
    assert Order.objects.exclude(details_synced_at=None).count() == 2
    assert set(calls) == {100, 101}
    assert OrderItem.objects.count() == 2
    assert Product.objects.count() == 1
    assert Variant.objects.count() == 1

    second = SyncService(SyncRun.KIND_DETAILS)
    second.client.authenticate = lambda: "token"
    second.client.requests_made = 0
    second.client.retries_made = 0
    second.client.get_order = get_order
    second.client.get_product = lambda product_id: product
    second.execute_details(limit=2)

    assert Order.objects.count() == 6
    assert Order.objects.exclude(details_synced_at=None).count() == 2
    assert OrderItem.objects.count() == 2
    assert calls.count(100) == 1
    assert calls.count(101) == 1
    assert calls.count(102) == 0


@pytest.mark.django_db
def test_failed_order_detail_is_not_marked_synced():
    now = timezone.now()
    customer = Customer.objects.create(source_id=2)
    order = _order(500, now, customer)

    service = SyncService(SyncRun.KIND_DETAILS)
    service.client.authenticate = lambda: "token"
    service.client.requests_made = 0
    service.client.retries_made = 0

    def fail(_order_id):
        raise ElinorApiError("boom")

    service.client.get_order = fail
    run = service.execute_details(limit=1)
    order.refresh_from_db()
    assert order.details_synced_at is None
    assert OrderItem.objects.count() == 0
    assert run.report["failures"] == 1
