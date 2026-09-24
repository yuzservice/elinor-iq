from datetime import timedelta
from unittest.mock import patch

import pytest
from django.utils import timezone

from apps.customers.models import Customer
from apps.integrations.elinor.models import SyncRun
from apps.integrations.elinor.sync import SyncService, bootstrap_window
from apps.products.models import Product, Variant
from apps.sales.models import Order, OrderItem


@pytest.mark.django_db
def test_bootstrap_window_is_about_three_months():
    start, end = bootstrap_window()
    assert end > start
    days = (end - start).days
    assert 89 <= days <= 95


@pytest.mark.django_db
def test_bootstrap_upsert_is_idempotent():
    start = timezone.now() - timedelta(days=10)
    created = start + timedelta(days=1)
    light = {
        "results": [
            {
                "id": 15201,
                "customer_id": 884,
                "receiver": "سارا محمدی",
                "shipping_amount": 45000,
                "discount_amount": 20000,
                "status": "new",
                "created_at": created.strftime("%Y-%m-%d %H:%M:%S"),
                "total_amount": 826000,
                "is_shopino": 0,
                "items_count": 2,
            }
        ],
        "current_page": 1,
        "last_page": 1,
        "total": 1,
        "raw": {},
    }
    detail = {
        "id": 15201,
        "customer_id": 884,
        "status": "new",
        "total_amount": 826000,
        "discount_amount": 20000,
        "shipping_amount": 45000,
        "items_count": 2,
        "items": [
            {
                "id": 9,
                "product_id": 310,
                "variety_id": 1842,
                "quantity": 2,
                "amount": 401000,
                "discount_amount": 0,
                "status": 1,
            }
        ],
    }
    customer = {
        "id": 884,
        "first_name": "سارا",
        "last_name": "محمدی",
        "mobile": "09120000000",
        "status": "active",
    }
    product = {
        "id": 310,
        "title": "کت مشکی",
        "status": "available",
        "varieties": [
            {
                "id": 1842,
                "product_id": 310,
                "title": "کت مشکی / M",
                "price": 890000,
                "SKU": "EL-310-M-BLK",
                "quantity": 7,
                "color": {"id": 12, "name": "مشکی"},
                "final_price": {"amount": 801000},
            }
        ],
    }

    service = SyncService(SyncRun.KIND_BOOTSTRAP)
    service.client.authenticate = lambda: "token"
    service.client.requests_made = 4
    service.client.get_orders_light = lambda **kwargs: light
    service.client.get_order = lambda order_id: detail
    service.client.get_customer = lambda customer_id: customer
    service.client.get_product = lambda product_id: product

    first = service.execute()
    second_service = SyncService(SyncRun.KIND_BOOTSTRAP)
    second_service.client.authenticate = lambda: "token"
    second_service.client.requests_made = 1
    second_service.client.get_orders_light = lambda **kwargs: light
    second_service.client.get_order = lambda order_id: detail
    second_service.client.get_customer = lambda customer_id: customer
    second_service.client.get_product = lambda product_id: product
    second = second_service.execute()

    assert first.status == SyncRun.STATUS_SUCCESS
    assert second.status == SyncRun.STATUS_SUCCESS
    assert Order.objects.count() == 1
    assert Customer.objects.count() == 1
    assert OrderItem.objects.count() == 1
    assert Product.objects.count() == 1
    assert Variant.objects.count() == 1
    order = Order.objects.get(source_id=15201)
    assert order.total_amount == 826000
    assert order.customer.mobile == "09120000000"
