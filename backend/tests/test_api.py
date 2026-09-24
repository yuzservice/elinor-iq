from datetime import timedelta

import pytest
from django.utils import timezone

from apps.customers.models import Customer
from apps.sales.models import Order


@pytest.mark.django_db
def test_customer_list_is_paginated(auth_api):
    now = timezone.now()
    for index in range(25):
        customer = Customer.objects.create(
            source_id=1000 + index,
            first_name="مشتری",
            last_name=str(index),
            mobile=f"091200000{index:02d}",
            order_count=1,
            last_order_at=now,
        )
        Order.objects.create(
            source_id=2000 + index,
            customer=customer,
            status="delivered",
            total_amount=100000,
            created_at=now - timedelta(days=index),
        )

    response = auth_api.get("/api/customers/?page=1&per_page=10")
    assert response.status_code == 200
    assert response.data["total"] == 25
    assert len(response.data["results"]) == 10

    detail = auth_api.get("/api/customers/1000/")
    assert detail.status_code == 200
    assert detail.data["id"] == 1000
    assert "purchases" in detail.data
    assert "discounts" in detail.data
    assert "rfm" not in detail.data
    assert "churn" not in detail.data


@pytest.mark.django_db
def test_home_and_sales_use_date_range(auth_api):
    customer = Customer.objects.create(source_id=1, first_name="آوا", last_name="رضایی")
    inside = timezone.now() - timedelta(days=2)
    outside = timezone.now() - timedelta(days=40)
    Order.objects.create(source_id=1, customer=customer, status="delivered", total_amount=500000, created_at=inside)
    Order.objects.create(source_id=2, customer=customer, status="delivered", total_amount=900000, created_at=outside)
    Order.objects.create(source_id=3, customer=customer, status="canceled", total_amount=100000, created_at=inside)

    start = (timezone.now() - timedelta(days=7)).date().isoformat()
    end = timezone.now().date().isoformat()
    home = auth_api.get(f"/api/home/summary/?from={start}&to={end}")
    assert home.status_code == 200
    assert home.data["metrics"]["sales"] == 500000
    assert home.data["metrics"]["orders"] == 1
    assert home.data["sales_lines"][1]["connected"] is False

    sales = auth_api.get(f"/api/sales/summary/?from={start}&to={end}")
    assert sales.status_code == 200
    assert sales.data["metrics"]["purchase_count"] == 1
    assert sales.data["metrics"]["online_order_value"] == 500000
    assert sales.data["returns_canceled"]["online_canceled"] == 1
