from datetime import timedelta

import pytest
from django.utils import timezone

from apps.customers.models import Customer
from apps.products.models import Product
from apps.sales.models import Order, OrderItem, PosSale, PosSaleItem, SalesLine
from apps.sales.semantics import (
    ONLINE_EXCLUDED_STATUSES,
    ONLINE_ORDER_VALUE_STATUSES,
    STORE_ID_CAPRI,
    STORE_ID_GORGAN,
    STORE_ID_SARI,
    parse_sales_line_filter,
    qualifying_online_orders,
    qualifying_pos_sales,
    sales_line_for_store,
)
from apps.sales.services import overview_payload, overview_trend_points, recent_sales_payload


def _customer(source_id=1):
    return Customer.objects.create(source_id=source_id, first_name="آوا", last_name="رضایی")


def _online(customer, source_id, status="delivered", days=1, amount=100000):
    return Order.objects.create(
        source_id=source_id,
        customer=customer,
        status=status,
        total_amount=amount,
        items_count=2,
        created_at=timezone.now() - timedelta(days=days),
    )


def _online_item(order, source_id, quantity=2):
    product = Product.objects.create(source_id=source_id + 10000, title="کالا")
    return OrderItem.objects.create(
        source_id=source_id,
        order=order,
        product=product,
        product_source_id=product.source_id,
        quantity=quantity,
        amount=50000,
    )


def _pos(customer, source_id, store_id=STORE_ID_SARI, sale_type="sell", days=1, cancelled=False, deleted=False):
    sale = PosSale.objects.create(
        source_id=source_id,
        customer=customer,
        store_source_id=store_id,
        sales_line=sales_line_for_store(store_id),
        type=sale_type,
        is_cancelled=cancelled,
        deleted_at=timezone.now() if deleted else None,
        created_at=timezone.now() - timedelta(days=days),
    )
    return sale


def _pos_item(sale, source_id, quantity=1, sale_type="sell"):
    product = Product.objects.create(source_id=source_id + 20000, title="POS کالا")
    return PosSaleItem.objects.create(
        source_id=source_id,
        pos_sale=sale,
        product=product,
        product_source_id=product.source_id,
        quantity=quantity,
        amount=40000,
        type=sale_type,
    )


@pytest.mark.django_db
def test_online_qualifying_rule_excludes_documented_statuses():
    customer = _customer()
    qualifying = _online(customer, 1, status="delivered")
    _online(customer, 2, status="canceled")
    _online(customer, 3, status="failed")
    _online(customer, 4, status="wait_for_payment")
    _online(customer, 5, status="in_progress")

    ids = set(qualifying_online_orders().values_list("source_id", flat=True))
    assert qualifying.source_id in ids
    assert 2 not in ids
    assert 3 not in ids
    assert 4 not in ids
    assert 5 in ids
    assert set(ONLINE_EXCLUDED_STATUSES) == {"canceled", "failed", "wait_for_payment"}


@pytest.mark.django_db
def test_online_excluded_statuses_are_not_counted_in_overview(auth_api):
    customer = _customer()
    inside = timezone.now() - timedelta(days=1)
    Order.objects.create(source_id=11, customer=customer, status="delivered", created_at=inside, items_count=1)
    Order.objects.create(source_id=12, customer=customer, status="canceled", created_at=inside, items_count=1)
    Order.objects.create(source_id=13, customer=customer, status="failed", created_at=inside, items_count=1)
    Order.objects.create(source_id=14, customer=customer, status="wait_for_payment", created_at=inside, items_count=1)

    start = (timezone.now() - timedelta(days=7)).date().isoformat()
    end = (timezone.now() + timedelta(days=1)).date().isoformat()
    response = auth_api.get(f"/api/sales/summary/?from={start}&to={end}")
    assert response.status_code == 200
    assert response.data["metrics"]["purchase_count"] == 1


@pytest.mark.django_db
def test_store_sales_line_mapping():
    assert sales_line_for_store(STORE_ID_SARI) == SalesLine.SARI
    assert sales_line_for_store(STORE_ID_GORGAN) == SalesLine.GORGAN
    assert sales_line_for_store(STORE_ID_CAPRI) == SalesLine.CAPRI
    assert sales_line_for_store(1) == ""


@pytest.mark.django_db
def test_pos_refund_and_cancelled_handling(auth_api):
    customer = _customer()
    sell = _pos(customer, 101, store_id=STORE_ID_SARI, sale_type="sell")
    _pos_item(sell, 201, quantity=3)
    refund = _pos(customer, 102, store_id=STORE_ID_SARI, sale_type="refund")
    _pos_item(refund, 202, quantity=1, sale_type="refund")
    cancelled = _pos(customer, 103, store_id=STORE_ID_GORGAN, sale_type="sell", cancelled=True)
    _pos_item(cancelled, 203, quantity=2)
    deleted = _pos(customer, 104, store_id=STORE_ID_CAPRI, sale_type="sell", deleted=True)
    _pos_item(deleted, 204, quantity=2)

    assert qualifying_pos_sales().count() == 1

    start = (timezone.now() - timedelta(days=7)).date().isoformat()
    end = (timezone.now() + timedelta(days=1)).date().isoformat()
    response = auth_api.get(f"/api/sales/summary/?from={start}&to={end}")
    assert response.status_code == 200
    rc = response.data["returns_canceled"]
    assert rc["pos_refunds"] == 1
    assert rc["pos_cancelled"] == 1
    assert response.data["metrics"]["purchase_count"] == 1
    assert response.data["metrics"]["units_sold"] == 3


@pytest.mark.django_db
def test_sales_line_filter_and_comparison(auth_api):
    customer = _customer()
    online = _online(customer, 301, days=1)
    _online_item(online, 401, quantity=2)
    sari = _pos(customer, 302, store_id=STORE_ID_SARI, days=1)
    _pos_item(sari, 402, quantity=4)
    gorgan = _pos(customer, 303, store_id=STORE_ID_GORGAN, days=1)
    _pos_item(gorgan, 403, quantity=5)
    capri = _pos(customer, 304, store_id=STORE_ID_CAPRI, days=1)
    _pos_item(capri, 404, quantity=6)

    start = (timezone.now() - timedelta(days=7)).date().isoformat()
    end = (timezone.now() + timedelta(days=1)).date().isoformat()

    all_response = auth_api.get(f"/api/sales/summary/?from={start}&to={end}")
    assert all_response.data["metrics"]["purchase_count"] == 4
    lines = {row["key"]: row for row in all_response.data["sales_lines"]}
    assert lines["ONLINE"]["purchase_count"] == 1
    assert lines["SARI"]["units_sold"] == 4
    assert lines["GORGAN"]["units_sold"] == 5
    assert lines["CAPRI"]["units_sold"] == 6

    sari_only = auth_api.get(f"/api/sales/summary/?from={start}&to={end}&sales_line=SARI")
    assert sari_only.data["metrics"]["purchase_count"] == 1
    assert sari_only.data["metrics"]["units_sold"] == 4
    assert "online_order_value" not in sari_only.data["metrics"]


@pytest.mark.django_db
def test_date_filtering(auth_api):
    customer = _customer()
    inside = timezone.now() - timedelta(days=2)
    outside = timezone.now() - timedelta(days=40)
    Order.objects.create(source_id=501, customer=customer, status="delivered", created_at=inside, items_count=1)
    Order.objects.create(source_id=502, customer=customer, status="delivered", created_at=outside, items_count=1)

    start = (timezone.now() - timedelta(days=7)).date().isoformat()
    end = timezone.now().date().isoformat()
    response = auth_api.get(f"/api/sales/summary/?from={start}&to={end}")
    assert response.data["metrics"]["purchase_count"] == 1


@pytest.mark.django_db
def test_trend_aggregation_daily_weekly_monthly():
    customer = _customer()
    _online(customer, 601, days=1)
    _online(customer, 602, days=2)
    _pos(customer, 603, store_id=STORE_ID_SARI, days=1)

    start = timezone.now() - timedelta(days=10)
    end = timezone.now() + timedelta(days=1)

    daily = overview_trend_points(start, end, None, "daily")
    assert len(daily) >= 2
    assert sum(point["purchase_count"] for point in daily) == 3
    assert all("date_label" in point for point in daily)
    assert all("amount" in point for point in daily)
    assert sum(point["amount"] for point in daily) > 0

    weekly = overview_trend_points(start, end, None, "weekly")
    assert sum(point["purchase_count"] for point in weekly) == 3

    monthly = overview_trend_points(start, end, None, "monthly")
    assert sum(point["purchase_count"] for point in monthly) == 3
    assert all("amount" in point for point in monthly)


@pytest.mark.django_db
def test_monthly_trend_tolerates_orphan_pos_items():
    customer = _customer()
    product = Product.objects.create(source_id=999, title="کالا")
    PosSaleItem.objects.create(
        source_id=9003,
        pos_sale=None,
        product=product,
        quantity=1,
        amount=100_000,
        type="sell",
    )

    start = timezone.now() - timedelta(days=60)
    end = timezone.now() + timedelta(days=1)
    monthly = overview_trend_points(start, end, None, "monthly")
    assert isinstance(monthly, list)
    assert all("amount" in point for point in monthly)


@pytest.mark.django_db
def test_recent_sales_unified_table(auth_api):
    customer = _customer()
    online = _online(customer, 701, status="canceled", days=1)
    online.items_count = 3
    online.save()
    refund = _pos(customer, 702, store_id=STORE_ID_SARI, sale_type="refund", days=1)
    _pos_item(refund, 801, quantity=1, sale_type="refund")

    start = (timezone.now() - timedelta(days=7)).date().isoformat()
    end = (timezone.now() + timedelta(days=1)).date().isoformat()
    response = auth_api.get(f"/api/sales/orders/?from={start}&to={end}")
    assert response.status_code == 200
    assert response.data["total"] == 2
    kinds = {row["kind"] for row in response.data["results"]}
    assert kinds == {"online", "pos"}
    pos_row = next(row for row in response.data["results"] if row["kind"] == "pos")
    assert pos_row["status_label"] == "مرجوعی"
    online_row = next(row for row in response.data["results"] if row["kind"] == "online")
    assert online_row["status_label"] == "لغو شده"
    assert "sales_line_label" in online_row


@pytest.mark.django_db
def test_online_order_value_only_for_online_line(auth_api):
    customer = _customer()
    _online(customer, 801, status="delivered", amount=250000, days=1)
    _online(customer, 802, status="canceled", amount=900000, days=1)
    sell = _pos(customer, 803, store_id=STORE_ID_SARI, days=1)
    _pos_item(sell, 901, quantity=1)

    start = (timezone.now() - timedelta(days=7)).date().isoformat()
    end = (timezone.now() + timedelta(days=1)).date().isoformat()
    response = auth_api.get(f"/api/sales/summary/?from={start}&to={end}")
    assert response.data["metrics"]["online_order_value"] == 250000
    online_line = next(row for row in response.data["sales_lines"] if row["key"] == "ONLINE")
    assert online_line["online_order_value"] == 250000
    sari_line = next(row for row in response.data["sales_lines"] if row["key"] == "SARI")
    assert "online_order_value" not in sari_line
    assert set(ONLINE_ORDER_VALUE_STATUSES) == {
        "new",
        "delivered",
        "in_progress",
        "reserved",
        "in_examination",
        "presale",
    }


@pytest.mark.django_db
def test_parse_sales_line_filter():
    assert parse_sales_line_filter(None) is None
    assert parse_sales_line_filter("all") is None
    assert parse_sales_line_filter("SARI") == SalesLine.SARI
    assert parse_sales_line_filter("invalid") is None
