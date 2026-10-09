from datetime import timedelta

import pytest
from django.utils import timezone

from apps.customers.models import Customer
from apps.products.models import Product, Variant
from apps.sales.models import Order, OrderItem, PosSale, PosSaleItem, SalesLine
from apps.sales.semantics import STORE_ID_CAPRI, STORE_ID_GORGAN, STORE_ID_SARI, sales_line_for_store


def _customer(source_id=1):
    return Customer.objects.create(source_id=source_id, first_name="مریم", last_name="کاظمی")


def _online(customer, source_id, status="delivered", days=1, amount=600000):
    return Order.objects.create(
        source_id=source_id,
        customer=customer,
        status=status,
        total_amount=amount,
        items_count=1,
        created_at=timezone.now() - timedelta(days=days),
    )


def _online_item(order, source_id, product, variant=None, quantity=3, amount=200000):
    return OrderItem.objects.create(
        source_id=source_id,
        order=order,
        product=product,
        variant=variant,
        product_source_id=product.source_id,
        variant_source_id=variant.source_id if variant else None,
        quantity=quantity,
        amount=amount,
        status=1,
        title=product.title,
    )


def _pos(customer, source_id, store_id=STORE_ID_SARI, sale_type="sell", days=1):
    return PosSale.objects.create(
        source_id=source_id,
        customer=customer,
        store_source_id=store_id,
        sales_line=sales_line_for_store(store_id),
        type=sale_type,
        created_at=timezone.now() - timedelta(days=days),
    )


def _pos_item(sale, source_id, product, variant=None, quantity=2, amount=150000):
    return PosSaleItem.objects.create(
        source_id=source_id,
        pos_sale=sale,
        product=product,
        variant=variant,
        product_source_id=product.source_id,
        variant_source_id=variant.source_id if variant else None,
        quantity=quantity,
        amount=amount,
        real_amount=amount * quantity,
        type="sell",
    )


@pytest.mark.django_db
def test_product_list_combines_online_and_pos(auth_api):
    customer = _customer(source_id=101)
    product = Product.objects.create(source_id=501, title="کت لنین پاییزه")
    variant = Variant.objects.create(
        source_id=5011,
        product=product,
        title="کرم / 38",
        color_name="کرم",
        size="38",
        price=300000,
    )

    online_order = _online(customer, 601, days=2)
    _online_item(online_order, 701, product, variant, quantity=3, amount=600000)

    pos_sale = _pos(customer, 602, store_id=STORE_ID_SARI, days=1)
    _pos_item(pos_sale, 702, product, variant, quantity=2, amount=200000)

    response = auth_api.get("/api/products/")
    assert response.status_code == 200
    assert "kpis" in response.data
    kpis = response.data["kpis"]
    assert kpis["units_sold"] == 5
    assert kpis["gross_revenue"] == 1000000  # 600k online + 400k pos

    results = response.data["results"]
    assert len(results) == 1
    row = results[0]
    assert row["product"] == "کت لنین پاییزه"
    assert row["sold_quantity"] == 5
    assert row["channels"]["online"] == 3
    assert row["channels"]["sari"] == 2
    assert row["channels"]["gorgan"] == 0
    assert row["order_count"] == 2
    assert row["status"] in ("hero", "stable", "slow", "dead")
    assert "action_recommendation" in row


@pytest.mark.django_db
def test_product_list_channel_filtering(auth_api):
    customer = _customer(source_id=102)
    product = Product.objects.create(source_id=502, title="شلوار راسته")
    variant = Variant.objects.create(source_id=5021, product=product, title="مشکی / 40")

    online_order = _online(customer, 603, days=1)
    _online_item(online_order, 703, product, variant, quantity=4)

    sari_sale = _pos(customer, 604, store_id=STORE_ID_SARI, days=1)
    _pos_item(sari_sale, 704, product, variant, quantity=1)

    sari_resp = auth_api.get("/api/products/?sales_line=SARI")
    assert sari_resp.status_code == 200
    assert sari_resp.data["kpis"]["units_sold"] == 1
    assert sari_resp.data["results"][0]["sold_quantity"] == 1

    online_resp = auth_api.get("/api/products/?sales_line=ONLINE")
    assert online_resp.status_code == 200
    assert online_resp.data["kpis"]["units_sold"] == 4
    assert online_resp.data["results"][0]["sold_quantity"] == 4


@pytest.mark.django_db
def test_product_bundles_endpoint(auth_api):
    customer = _customer(source_id=103)
    p1 = Product.objects.create(source_id=503, title="کت پاییزه")
    p2 = Product.objects.create(source_id=504, title="شلوار ست")

    order = _online(customer, 605, days=1)
    _online_item(order, 705, p1, quantity=1)
    _online_item(order, 706, p2, quantity=1)

    response = auth_api.get("/api/products/bundles/")
    assert response.status_code == 200
    assert "bundles" in response.data
    bundles = response.data["bundles"]
    assert len(bundles) >= 1
    first_b = bundles[0]
    assert "item_a" in first_b
    assert "item_b" in first_b
    assert "co_occurrence_count" in first_b
    assert "recommendation" in first_b


@pytest.mark.django_db
def test_product_360_endpoint(auth_api):
    customer = _customer(source_id=104)
    product = Product.objects.create(source_id=505, title="بارانی کره‌ای")
    variant = Variant.objects.create(
        source_id=5051,
        product=product,
        title="سبز / 40",
        color_name="سبز",
        size="40",
        price=500000,
    )

    order = _online(customer, 606, days=1)
    _online_item(order, 707, product, variant, quantity=2, amount=1000000)

    response = auth_api.get(f"/api/products/{product.source_id}/360/")
    assert response.status_code == 200
    assert response.data["title"] == "بارانی کره‌ای"
    assert response.data["total_units"] == 2
    assert response.data["channels"]["online"]["units"] == 2
    assert len(response.data["variants"]) == 1
    assert response.data["variants"][0]["size"] == "40"
    assert "action_recommendation" in response.data
