from datetime import timedelta

import pytest
from django.utils import timezone

from apps.customers.models import Customer
from apps.products.models import Product, Variant
from apps.sales.analysis import (
    core_metrics,
    physical_returns_report,
    product_sales_report,
    sales_line_comparison,
    size_color_report,
    trend_points,
)
from apps.sales.models import OrderItem, PosSaleItem, SalesLine
from apps.sales.semantics import STORE_ID_CAPRI, STORE_ID_GORGAN, STORE_ID_SARI, sales_line_for_store


def _customer(source_id=1):
    return Customer.objects.create(source_id=source_id, first_name="آوا", last_name="رضایی")


def _online(customer, source_id, status="delivered", days=1):
    from apps.sales.models import Order

    order = Order.objects.create(
        source_id=source_id,
        customer=customer,
        status=status,
        total_amount=100000,
        items_count=1,
        created_at=timezone.now() - timedelta(days=days),
    )
    return order


def _online_item(order, source_id, product, variant=None, quantity=2):
    return OrderItem.objects.create(
        source_id=source_id,
        order=order,
        product=product,
        variant=variant,
        product_source_id=product.source_id,
        quantity=quantity,
        amount=50000,
    )


def _pos(customer, source_id, store_id=STORE_ID_SARI, sale_type="sell", days=1):
    from apps.sales.models import PosSale

    return PosSale.objects.create(
        source_id=source_id,
        customer=customer,
        store_source_id=store_id,
        sales_line=sales_line_for_store(store_id),
        type=sale_type,
        created_at=timezone.now() - timedelta(days=days),
    )


def _pos_item(sale, source_id, product, variant=None, quantity=1, sale_type="sell"):
    return PosSaleItem.objects.create(
        source_id=source_id,
        pos_sale=sale,
        product=product,
        variant=variant,
        product_source_id=product.source_id,
        quantity=quantity,
        amount=40000,
        type=sale_type,
    )


@pytest.mark.django_db
def test_sales_line_comparison_with_new_repeat_and_previous(auth_api):
    old_customer = _customer(source_id=10)
    new_customer = _customer(source_id=11)
    coat = Product.objects.create(source_id=100, title="پالتو")
    _online(old_customer, 1001, days=40)
    _online(new_customer, 1002, days=2)
    _online_item(_online(new_customer, 1003, days=1), 2001, coat, quantity=3)

    sari = _pos(new_customer, 3001, store_id=STORE_ID_SARI, days=1)
    _pos_item(sari, 4001, coat, quantity=2)

    start = (timezone.now() - timedelta(days=7)).date().isoformat()
    end = (timezone.now() + timedelta(days=1)).date().isoformat()
    response = auth_api.get(f"/api/sales/summary/?from={start}&to={end}")
    assert response.status_code == 200
    lines = {row["key"]: row for row in response.data["sales_lines"]}
    assert lines["ONLINE"]["new_customers"] >= 1
    assert "previous_period" in lines["SARI"]
    assert "change_pct" in lines["GORGAN"]
    assert response.data["metrics"]["new_customers"] >= 1


@pytest.mark.django_db
def test_sales_summary_sections_skip_unrequested_work(auth_api):
    customer = _customer(source_id=21)
    _online(customer, 2101, days=1)
    start = (timezone.now() - timedelta(days=7)).date().isoformat()
    end = (timezone.now() + timedelta(days=1)).date().isoformat()

    overview = auth_api.get(f"/api/sales/summary/?from={start}&to={end}&section=overview")
    assert overview.status_code == 200
    assert "metrics" in overview.data
    assert "sales_lines" in overview.data
    assert "size_color" not in overview.data
    assert "trend" not in overview.data

    trend = auth_api.get(f"/api/sales/summary/?from={start}&to={end}&section=trend")
    assert trend.status_code == 200
    assert "points" in trend.data["trend"]
    assert "metrics" not in trend.data


@pytest.mark.django_db
def test_weekday_and_hourly_grouping():
    customer = _customer()
    product = Product.objects.create(source_id=101, title="شال")
    order = _online(customer, 5001, days=1)
    _online_item(order, 6001, product, quantity=1)
    pos = _pos(customer, 5002, store_id=STORE_ID_GORGAN, days=1)
    _pos_item(pos, 6002, product, quantity=1)

    start = timezone.now() - timedelta(days=10)
    end = timezone.now() + timedelta(days=1)

    weekday = trend_points(start, end, None, "weekday")
    assert len(weekday) == 7
    assert sum(point["purchase_count"] for point in weekday) == 2

    hourly = trend_points(start, end, None, "hourly")
    assert len(hourly) == 24
    assert sum(point["purchase_count"] for point in hourly) == 2


@pytest.mark.django_db
def test_product_aggregation_and_filters(auth_api):
    customer = _customer()
    product = Product.objects.create(source_id=200, title="کیف چرم")
    variant = Variant.objects.create(source_id=201, product=product, title="M", size="M", color_name="مشکی")
    order = _online(customer, 7001, days=1)
    _online_item(order, 8001, product, variant, quantity=4)
    sari = _pos(customer, 7002, store_id=STORE_ID_SARI, days=1)
    _pos_item(sari, 8002, product, variant, quantity=2)

    start = (timezone.now() - timedelta(days=7)).date().isoformat()
    end = (timezone.now() + timedelta(days=1)).date().isoformat()
    response = auth_api.get(f"/api/sales/products/?from={start}&to={end}&search=چرم&sort=units")
    assert response.status_code == 200
    assert response.data["total"] == 1
    row = response.data["results"][0]
    assert row["units_sold"] == 6
    assert row["online_units"] == 4
    assert row["sari_units"] == 2

    sari_only = auth_api.get(f"/api/sales/products/?from={start}&to={end}&sales_line=SARI")
    assert sari_only.data["results"][0]["units_sold"] == 2


@pytest.mark.django_db
def test_color_and_size_aggregation():
    customer = _customer()
    product = Product.objects.create(source_id=300, title="کفش")
    red = Variant.objects.create(source_id=301, product=product, title="41", size="41", color_name="قرمز")
    blue = Variant.objects.create(source_id=302, product=product, title="42", size="42", color_name="آبی")
    order = _online(customer, 9001, days=1)
    _online_item(order, 9101, product, red, quantity=5)
    _online_item(order, 9102, product, blue, quantity=2)

    start = timezone.now() - timedelta(days=7)
    end = timezone.now() + timedelta(days=1)
    report = size_color_report(start, end)
    sizes = {row["label"]: row["units_sold"] for row in report["sizes"]}
    colors = {row["label"]: row["units_sold"] for row in report["colors"]}
    assert sizes["41"] == 5
    assert colors["قرمز"] == 5
    assert colors["آبی"] == 2


@pytest.mark.django_db
def test_refund_exchange_counts_and_item_breakdown():
    customer = _customer()
    product = Product.objects.create(source_id=400, title="کت")
    refund = _pos(customer, 10001, store_id=STORE_ID_SARI, sale_type="refund", days=1)
    _pos_item(refund, 11001, product, quantity=2, sale_type="refund")
    exchange = _pos(customer, 10002, store_id=STORE_ID_CAPRI, sale_type="both", days=1)
    _pos_item(exchange, 11002, product, quantity=1, sale_type="refund")
    _pos_item(exchange, 11003, product, quantity=3, sale_type="sell")

    start = timezone.now() - timedelta(days=7)
    end = timezone.now() + timedelta(days=1)
    report = physical_returns_report(start, end)
    assert report["totals"]["refund_count"] == 1
    assert report["totals"]["exchange_count"] == 1
    assert report["totals"]["refunded_item_units"] == 3
    assert report["totals"]["replacement_item_units"] == 3
    capri = next(row for row in report["branches"] if row["key"] == SalesLine.CAPRI)
    assert capri["exchange_count"] == 1
    assert capri["replacement_item_units"] == 3


@pytest.mark.django_db
def test_core_metrics_respects_sales_line_filter():
    customer = _customer()
    product = Product.objects.create(source_id=500, title="کلاه")
    _online(customer, 12001, days=1)
    sari = _pos(customer, 12002, store_id=STORE_ID_SARI, days=1)
    _pos_item(sari, 13001, product, quantity=4)

    start = timezone.now() - timedelta(days=7)
    end = timezone.now() + timedelta(days=1)
    all_metrics = core_metrics(start, end, None)
    sari_metrics = core_metrics(start, end, SalesLine.SARI)
    assert all_metrics["purchase_count"] == 2
    assert sari_metrics["purchase_count"] == 1
    assert sari_metrics["units_sold"] == 4
