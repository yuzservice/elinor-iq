from datetime import timedelta

import pytest
from django.utils import timezone

from apps.core.home_metrics import home_metric_cards
from apps.integrations.elinor.gateway_payments import extract_order_payment_rows, upsert_order_gateway_payments
from apps.integrations.elinor.models import SyncRun
from apps.integrations.elinor.sync import SyncService
from apps.sales.models import OnlinePayment, Order, PosSale, SalesLine


@pytest.mark.django_db
def test_extract_and_upsert_order_gateway_payments():
    now = timezone.now()
    order = Order.objects.create(
        source_id=9001,
        status="delivered",
        total_amount=2_000_000,
        created_at=now,
        items_count=1,
    )
    detail = {
        "id": 9001,
        "status": "delivered",
        "invoices": [
            {
                "id": 501,
                "payable_id": 9001,
                "payable_type": "Modules\\Order\\Entities\\Order",
                "amount": 2_000_000,
                "status": "success",
                "type": "gateway",
                "created_at": now.isoformat(),
                "updated_at": now.isoformat(),
                "payments": [
                    {
                        "id": 701,
                        "gateway": "snapppay",
                        "status": "success",
                        "success_at": now.isoformat(),
                        "created_at": now.isoformat(),
                    }
                ],
            }
        ],
    }
    rows = extract_order_payment_rows(order.source_id, detail)
    assert len(rows) == 1
    assert rows[0]["gateway"] == "snapppay"
    assert upsert_order_gateway_payments(order, detail) == 1
    payment = OnlinePayment.objects.get(source_id=701)
    assert payment.gateway == "snapppay"
    assert payment.amount == 2_000_000
    assert payment.invoice.order_id == order.id


@pytest.mark.django_db
def test_home_metric_cards_include_online_gateway_amounts():
    now = timezone.now()
    order = Order.objects.create(
        source_id=9100,
        status="delivered",
        total_amount=1_000_000,
        created_at=now,
        items_count=1,
    )
    PosSale.objects.create(
        source_id=9200,
        store_source_id=3,
        sales_line=SalesLine.SARI,
        type="sell",
        snappay_cashier_amount=500_000,
        created_at=now,
    )
    upsert_order_gateway_payments(
        order,
        {
            "id": 9100,
            "invoices": [
                {
                    "id": 601,
                    "payable_id": 9100,
                    "payable_type": "Modules\\Order\\Entities\\Order",
                    "amount": 300_000,
                    "status": "success",
                    "type": "gateway",
                    "created_at": now.isoformat(),
                    "updated_at": now.isoformat(),
                    "payments": [
                        {
                            "id": 801,
                            "gateway": "digipay",
                            "status": "success",
                            "success_at": now.isoformat(),
                            "created_at": now.isoformat(),
                        }
                    ],
                }
            ],
        },
    )
    start = now - timedelta(days=1)
    end = now + timedelta(days=1)
    cards = {card["key"]: card for card in home_metric_cards(start, end)}
    assert cards["snappay"]["total"] == 500_000
    snappay_lines = {line["key"]: line["value"] for line in cards["snappay"]["lines"]}
    assert snappay_lines[SalesLine.ONLINE] == 0
    assert snappay_lines[SalesLine.SARI] == 500_000
    assert cards["digipay"]["total"] == 300_000
    digipay_lines = {line["key"]: line["value"] for line in cards["digipay"]["lines"]}
    assert digipay_lines[SalesLine.ONLINE] == 300_000


@pytest.mark.django_db
def test_gateway_payment_upsert_is_idempotent():
    now = timezone.now()
    order = Order.objects.create(
        source_id=9300,
        status="delivered",
        total_amount=100,
        created_at=now,
        items_count=1,
    )
    detail = {
        "id": 9300,
        "invoices": [
            {
                "id": 701,
                "payable_id": 9300,
                "payable_type": "Modules\\Order\\Entities\\Order",
                "amount": 100,
                "status": "success",
                "type": "gateway",
                "created_at": now.isoformat(),
                "updated_at": now.isoformat(),
                "payments": [
                    {
                        "id": 901,
                        "gateway": "snapppay",
                        "status": "success",
                        "success_at": now.isoformat(),
                        "created_at": now.isoformat(),
                    }
                ],
            }
        ],
    }
    assert upsert_order_gateway_payments(order, detail) == 1
    assert upsert_order_gateway_payments(order, detail) == 1
    assert OnlinePayment.objects.count() == 1


@pytest.mark.django_db
def test_sync_order_details_persists_gateway_payments():
    now = timezone.now()
    order = Order.objects.create(
        source_id=9400,
        status="new",
        total_amount=100,
        created_at=now,
        items_count=1,
    )
    detail = {
        "id": 9400,
        "status": "delivered",
        "total_amount": 100,
        "items": [],
        "invoices": [
            {
                "id": 801,
                "payable_id": 9400,
                "payable_type": "Modules\\Order\\Entities\\Order",
                "amount": 100,
                "status": "success",
                "type": "gateway",
                "created_at": now.isoformat(),
                "updated_at": now.isoformat(),
                "payments": [
                    {
                        "id": 901,
                        "gateway": "digipay",
                        "status": "success",
                        "success_at": now.isoformat(),
                        "created_at": now.isoformat(),
                    }
                ],
            }
        ],
    }
    service = SyncService(SyncRun.KIND_DETAILS)
    service.client.authenticate = lambda: "token"
    service.client.get_order = lambda order_id: detail
    service._sync_order_details(order)
    assert OnlinePayment.objects.filter(gateway="digipay", source_id=901).exists()
