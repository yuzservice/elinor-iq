from datetime import timedelta

import pytest
from django.utils import timezone

from apps.customers.models import Customer
from apps.products.models import Product, Variant
from apps.sales.models import Order, OrderItem


@pytest.mark.django_db
def test_products_api_is_sales_focused_without_inventory(auth_api):
    product = Product.objects.create(source_id=1, title="کت مشکی")
    variant = Variant.objects.create(source_id=11, product=product, title="M", quantity=99)
    customer = Customer.objects.create(source_id=1, first_name="آوا", last_name="رضایی")
    order = Order.objects.create(
        source_id=5,
        customer=customer,
        status="delivered",
        total_amount=800000,
        created_at=timezone.now() - timedelta(days=1),
    )
    OrderItem.objects.create(
        source_id=50,
        order=order,
        product=product,
        variant=variant,
        product_source_id=1,
        variant_source_id=11,
        quantity=2,
        amount=400000,
        status=1,
        title="کت مشکی",
    )
    response = auth_api.get("/api/products/")
    assert response.status_code == 200
    assert "inventory_note" not in response.data
    row = response.data["results"][0]
    assert row["product"] == "کت مشکی"
    assert row["sold_quantity"] == 2
    assert row["order_count"] == 1
    assert row["last_sale_at"] is not None
    assert "quantity" not in row
    assert response.data["data_coverage"]["partial"] is False


@pytest.mark.django_db
def test_system_status_includes_coverage_and_purchasing_split(auth_api):
    Customer.objects.create(source_id=1, first_name="آوا", order_count=1)
    Customer.objects.create(source_id=2, first_name="سارا", order_count=0)
    response = auth_api.get("/api/system/status/")
    assert response.status_code == 200
    assert response.data["counts"]["customers"] == 2
    assert response.data["counts"]["purchasing_customers"] == 1
    assert response.data["data_coverage"]["partial"] is False
    assert response.data["data_coverage"]["message"] == ""
