import pytest
from django.utils import timezone

from apps.customers.models import Customer
from apps.products.models import Product
from apps.sales.kpis import compute_overview_kpis, overview_kpis_payload
from apps.sales.models import OnlineInvoice, OnlinePayment, Order, OrderItem, PosSale, PosSaleItem, SalesLine
from apps.sales.semantics import STORE_ID_SARI, sales_line_for_store


def _customer(source_id=1):
    return Customer.objects.create(source_id=source_id, first_name="آوا", last_name="رضایی")


def _online(customer, source_id, *, shopino=False, amount=100000, days=1):
    return Order.objects.create(
        source_id=source_id,
        customer=customer,
        status="delivered",
        is_shopino=shopino,
        is_digify=False,
        total_amount=amount,
        items_count=1,
        items_quantity=2,
        created_at=timezone.now() - timezone.timedelta(days=days),
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


def _pos(source_id, *, store_id=STORE_ID_SARI, amount=80000, quantity=1, snappay=0, days=1):
    sale = PosSale.objects.create(
        source_id=source_id,
        store_source_id=store_id,
        sales_line=sales_line_for_store(store_id),
        type="sell",
        snappay_cashier_amount=snappay,
        created_at=timezone.now() - timezone.timedelta(days=days),
    )
    product = Product.objects.create(source_id=source_id + 20000, title="POS کالا")
    PosSaleItem.objects.create(
        source_id=source_id + 1,
        pos_sale=sale,
        product=product,
        product_source_id=product.source_id,
        quantity=quantity,
        amount=amount,
        type="sell",
        store_source_id=store_id,
    )
    return sale


@pytest.mark.django_db
def test_overview_kpis_respects_channel_and_payment_filters():
    customer = _customer()
    shopino = _online(customer, 1, shopino=True, amount=300000)
    website = _online(customer, 2, shopino=False, amount=200000)
    _online_item(shopino, 11)
    _online_item(website, 12)
    _pos(10, snappay=50000, amount=70000)

    start = timezone.now() - timezone.timedelta(days=30)
    end = timezone.now() + timezone.timedelta(days=1)

    online_only = compute_overview_kpis(start, end, branches=["ONLINE"])
    assert online_only["order_count"] == 2
    assert online_only["net_sales"] == 500000

    pos_only = compute_overview_kpis(start, end, branches=["SARI"], payments=["pos:snappay"])
    assert pos_only["order_count"] == 1
    assert pos_only["net_sales"] == 70000


@pytest.mark.django_db
def test_overview_kpis_compare_payload():
    customer = _customer()
    order = _online(customer, 3, amount=100000)
    _online_item(order, 13)

    start = timezone.now() - timezone.timedelta(days=10)
    mid = timezone.now() - timezone.timedelta(days=5)
    end = timezone.now() + timezone.timedelta(days=1)
    compare_start = timezone.now() - timezone.timedelta(days=20)
    compare_end = timezone.now() - timezone.timedelta(days=10)

    payload = overview_kpis_payload(start, end, compare_start=compare_start, compare_end=compare_end)
    assert payload["net_sales"]["value"] == 100000
    assert payload["net_sales"]["compare_value"] == 0
    assert payload["net_sales"]["change_pct"] is None

    invoice = OnlineInvoice.objects.create(
        source_id=100,
        order_source_id=3,
        order=order,
        amount=100000,
        status="success",
        created_at=timezone.now(),
    )
    OnlinePayment.objects.create(
        source_id=200,
        invoice=invoice,
        gateway="snapppay",
        status="success",
        amount=100000,
        paid_at=timezone.now(),
        created_at=timezone.now(),
    )

    snappay = compute_overview_kpis(start, end, payments=["online:snapppay"])
    assert snappay["order_count"] == 1
    assert snappay["net_sales"] == 100000
