import pytest

from apps.sales.filter_options import sales_filter_options_payload
from apps.sales.models import OnlinePayment, OnlineInvoice, Order, PosSale, SalesLine, Store
from apps.sales.semantics import STORE_ID_SARI
from django.utils import timezone


@pytest.mark.django_db
def test_sales_filter_options_from_live_data():
    Store.objects.create(source_id=STORE_ID_SARI, label="فروشگاه ساری")
    Order.objects.create(
        source_id=1,
        status="delivered",
        is_shopino=True,
        is_digify=False,
        total_amount=1000,
        created_at=timezone.now(),
    )
    Order.objects.create(
        source_id=2,
        status="delivered",
        is_shopino=False,
        is_digify=False,
        total_amount=2000,
        created_at=timezone.now(),
    )
    PosSale.objects.create(
        source_id=10,
        store_source_id=STORE_ID_SARI,
        sales_line=SalesLine.SARI,
        type="sell",
        cash_amount=5000,
        snappay_cashier_amount=3000,
        created_at=timezone.now(),
    )
    invoice = OnlineInvoice.objects.create(
        source_id=100,
        order_source_id=2,
        amount=2000,
        status="paid",
        created_at=timezone.now(),
    )
    OnlinePayment.objects.create(
        source_id=200,
        invoice=invoice,
        gateway="digipay",
        status="success",
        amount=2000,
        paid_at=timezone.now(),
        created_at=timezone.now(),
    )

    payload = sales_filter_options_payload()

    assert [item["key"] for item in payload["branches"]] == [
        SalesLine.ONLINE,
        SalesLine.SARI,
        SalesLine.GORGAN,
        SalesLine.CAPRI,
    ]
    assert [item["label"] for item in payload["branches"]] == ["آنلاین", "ساری", "گرگان", "کاپری"]
    payment_keys = {item["key"] for item in payload["payment_methods"]}
    assert "online:digipay" in payment_keys
    assert "pos:cash" in payment_keys
    assert "pos:snappay" in payment_keys
