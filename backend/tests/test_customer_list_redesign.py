from datetime import timedelta

import pytest
from django.core.cache import cache
from django.utils import timezone

from apps.customers.metrics import refresh_customer_metrics
from apps.customers.models import Customer, CustomerMetrics
from apps.customers.tiers import metrics_for_customers
from apps.sales.models import Order, PosSale, PosSaleItem, SalesLine

_ids = iter(range(600_000, 699_999))


@pytest.fixture(autouse=True)
def _clear_cache():
    cache.clear()
    yield
    cache.clear()


def _customer(n, **extra):
    return Customer.objects.create(source_id=n, first_name="الف", last_name=f"ب{n}", mobile=f"0912{n:07d}", status="active", **extra)


def _order(customer, amount=1_000_000, days=5, status="delivered"):
    return Order.objects.create(source_id=next(_ids), customer=customer, status=status, total_amount=amount, created_at=timezone.now() - timedelta(days=days))


def _pos(customer, items=((1, 500_000, "sell"),), kind="sell", days=3, line=SalesLine.SARI):
    sale = PosSale.objects.create(source_id=next(_ids), customer=customer, store_source_id=3, sales_line=line, type=kind, created_at=timezone.now() - timedelta(days=days))
    for quantity, amount, item_type in items:
        PosSaleItem.objects.create(source_id=next(_ids), pos_sale=sale, quantity=quantity, amount=amount, type=item_type)
    return sale


@pytest.mark.django_db
def test_metrics_match_tier_amounts_and_are_idempotent():
    both, online_only, none, refund_only = _customer(1), _customer(2), _customer(3), _customer(4)
    _order(both, 2_000_000, days=20)
    _order(both, 999, status="canceled")
    _pos(both, items=((2, 300_000, "sell"),), days=2)
    _pos(both, items=((1, 100_000, "refund"),), kind="refund", days=1)
    _order(online_only, 700_000)
    _pos(refund_only, items=((1, 50_000, "refund"),), kind="refund")

    assert refresh_customer_metrics() == 4
    assert refresh_customer_metrics() == 0  # nothing changed, nothing rewritten

    row = CustomerMetrics.objects.get(customer=both)
    tier = metrics_for_customers([both.pk])[both.pk]
    assert row.total_amount == tier["lifetime_purchase_amount"] == 2_500_000
    assert (row.invoice_count, row.avg_basket, row.channel) == (2, 1_250_000, "both")
    assert row.last_purchase_at > row.first_purchase_at
    assert CustomerMetrics.objects.get(customer=online_only).channel == "online"
    empty = CustomerMetrics.objects.get(customer=none)
    assert (empty.invoice_count, empty.total_amount, empty.avg_basket, empty.channel) == (0, 0, None, "none")
    refund = CustomerMetrics.objects.get(customer=refund_only)
    assert (refund.invoice_count, refund.total_amount, refund.avg_basket) == (0, -50_000, None)  # zero invoices: no division
