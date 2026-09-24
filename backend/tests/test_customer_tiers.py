from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

import pytest
from django.utils import timezone

from apps.customers.models import Customer
from apps.customers.tiers import (
    TIER_LABELS,
    filter_customers_by_tier,
    metrics_for_customers,
    tier_code_for,
)
from apps.sales.models import Order, OrderItem, PosSale, PosSaleItem, SalesLine

TEHRAN = ZoneInfo("Asia/Tehran")
REF = date(2026, 6, 15)


def _at(days_before):
    local = datetime.combine(REF, time(12, 0), tzinfo=TEHRAN)
    return local - timedelta(days=days_before)


def _customer(source_id=1):
    return Customer.objects.create(
        source_id=source_id,
        first_name="آوا",
        last_name="رضایی",
        mobile=f"0912{source_id:07d}",
        status="active",
    )


def _online(customer, source_id, *, days, amount=100_000, status="delivered", shipping=0, discount=0):
    return Order.objects.create(
        source_id=source_id,
        customer=customer,
        status=status,
        total_amount=amount,
        shipping_amount=shipping,
        discount_amount=discount,
        created_at=_at(days),
    )


def _pos(customer, source_id, *, days, sale_type="sell", cancelled=False, deleted=False):
    return PosSale.objects.create(
        source_id=source_id,
        customer=customer,
        store_source_id=3,
        sales_line=SalesLine.SARI,
        type=sale_type,
        is_cancelled=cancelled,
        deleted_at=timezone.now() if deleted else None,
        created_at=_at(days),
    )


def _item(sale, source_id, *, amount, quantity=1, item_type="sell", deleted=False):
    return PosSaleItem.objects.create(
        source_id=source_id,
        pos_sale=sale,
        quantity=quantity,
        amount=amount,
        type=item_type,
        deleted_at=timezone.now() if deleted else None,
    )


def _metrics(customer):
    return metrics_for_customers([customer.pk], REF)[customer.pk]


@pytest.mark.parametrize(
    ("count", "days", "amount", "expected"),
    [
        (4, 45, 10_000_000, "VIP"),
        (3, 90, 5_000_000, "DIAMOND"),
        (4, 120, 10_000_000, "GOLD_1"),
        (2, 90, 100_000, "GOLD_2"),
        (1, 30, 100_000, "SILVER"),
        (1, 10, 100_000, "BRONZE_1"),
        (1, 120, 100_000, "BRONZE_2"),
        (1, 180, 100_000, "BRONZE_3"),
        (0, None, 0, None),
        (0, 10, 0, None),
        (5, 20, 12_000_000, "VIP"),
    ],
)
def test_tier_examples(count, days, amount, expected):
    assert tier_code_for(count, days, amount) == expected
    if expected:
        assert TIER_LABELS[expected]


@pytest.mark.parametrize(
    ("count", "days", "amount", "expected"),
    [
        (4, 45, 10_000_000, "VIP"),
        (4, 46, 10_000_000, "DIAMOND"),
        (3, 45, 10_000_000, "DIAMOND"),
        (4, 45, 9_999_999, "DIAMOND"),
        (4, 45, 4_999_999, "GOLD_2"),
        (4, 90, 10_000_000, "DIAMOND"),
        (4, 91, 10_000_000, "GOLD_1"),
        (4, 365, 10_000_000, "GOLD_1"),
        (4, 366, 10_000_000, "BRONZE_3"),
        (1, 29, 100_000, "BRONZE_1"),
        (1, 30, 100_000, "SILVER"),
        (2, 29, 100_000, "GOLD_2"),
        (2, 30, 100_000, "GOLD_2"),
        (1, 90, 100_000, "SILVER"),
        (1, 91, 100_000, "BRONZE_2"),
        (1, 179, 100_000, "BRONZE_2"),
        (1, 180, 100_000, "BRONZE_3"),
        (3, 60, 4_999_999, "GOLD_2"),
        (3, 60, 5_000_000, "DIAMOND"),
        (4, 20, 9_999_999, "DIAMOND"),
        (4, 20, 10_000_000, "VIP"),
        (4, 120, 9_999_999, "BRONZE_2"),
        (4, 120, 10_000_000, "GOLD_1"),
        (4, 20, 12_000_000, "VIP"),
        (3, 20, 12_000_000, "DIAMOND"),
        (2, 20, 12_000_000, "GOLD_2"),
        (4, 200, 12_000_000, "GOLD_1"),
        (4, 100, 1, "BRONZE_2"),
    ],
)
def test_tier_boundaries_and_priority(count, days, amount, expected):
    assert tier_code_for(count, days, amount) == expected


def test_priority_collision_returns_only_the_highest_tier():
    assert tier_code_for(5, 20, 12_000_000) == "VIP"
    assert tier_code_for(4, 60, 7_000_000) == "DIAMOND"
    codes = [tier_code_for(5, 20, 12_000_000)]
    assert len(codes) == 1


@pytest.mark.django_db
def test_sql_tier_matches_service_on_exact_day_boundaries():
    vip = _customer(1)
    for index, amount in enumerate((3_000_000, 3_000_000, 2_000_000, 2_000_000, 2_000_001), start=10):
        _online(vip, index, days=20, amount=amount)
    boundary = _customer(2)
    for index in range(30, 34):
        _online(boundary, index, days=45, amount=2_500_000)
    gold = _customer(3)
    for index in range(40, 44):
        _online(gold, index, days=91, amount=2_500_000)
    year = _customer(4)
    for index in range(50, 54):
        _online(year, index, days=365, amount=2_500_000)
    past_year = _customer(5)
    for index in range(60, 64):
        _online(past_year, index, days=366, amount=2_500_000)

    assert _metrics(vip)["days_since_last_purchase"] == 20
    assert _metrics(vip)["lifetime_purchase_amount"] == 12_000_001
    assert _metrics(vip)["tier_code"] == "VIP"
    assert _metrics(boundary)["days_since_last_purchase"] == 45
    assert _metrics(boundary)["purchase_count"] == 4
    assert _metrics(boundary)["lifetime_purchase_amount"] == 10_000_000
    assert _metrics(boundary)["tier_code"] == "VIP"
    assert _metrics(gold)["days_since_last_purchase"] == 91
    assert _metrics(gold)["tier_code"] == "GOLD_1"
    assert _metrics(year)["days_since_last_purchase"] == 365
    assert _metrics(year)["tier_code"] == "GOLD_1"
    assert _metrics(past_year)["days_since_last_purchase"] == 366
    assert _metrics(past_year)["tier_code"] == "BRONZE_3"

    vip_ids = set(filter_customers_by_tier(Customer.objects.all(), "VIP", REF).values_list("pk", flat=True))
    diamond_ids = set(
        filter_customers_by_tier(Customer.objects.all(), "DIAMOND", REF).values_list("pk", flat=True)
    )
    assert vip.pk in vip_ids
    assert boundary.pk in vip_ids
    assert boundary.pk not in diamond_ids
    assert vip.pk not in diamond_ids
    assert gold.pk in set(filter_customers_by_tier(Customer.objects.all(), "GOLD_1", REF).values_list("pk", flat=True))
    assert year.pk in set(filter_customers_by_tier(Customer.objects.all(), "GOLD_1", REF).values_list("pk", flat=True))
    assert past_year.pk in set(
        filter_customers_by_tier(Customer.objects.all(), "BRONZE_3", REF).values_list("pk", flat=True)
    )


@pytest.mark.django_db
def test_exchange_refund_shipping_and_discount_do_not_follow_sales_counts():
    customer = _customer(7)
    _online(customer, 70, days=10, amount=5_000_000, shipping=180_000, discount=50_000)
    OrderItem.objects.create(
        source_id=700,
        order=Order.objects.get(source_id=70),
        quantity=2,
        amount=2_400_000,
        discount_amount=100_000,
        status=1,
    )
    exchange = _pos(customer, 71, days=3, sale_type="both")
    _item(exchange, 710, amount=2_000_000, quantity=1, item_type="sell")
    _item(exchange, 711, amount=500_000, quantity=2, item_type="refund")
    refund = _pos(customer, 72, days=1, sale_type="refund")
    _item(refund, 720, amount=300_000, quantity=1, item_type="refund")
    _pos(customer, 73, days=0, sale_type="sell", cancelled=True)
    deleted = _pos(customer, 74, days=0, sale_type="sell", deleted=True)
    _item(deleted, 740, amount=9_000_000, quantity=1, item_type="sell")
    _online(customer, 75, days=0, amount=9_000_000, status="canceled")
    _online(customer, 76, days=0, amount=8_000_000, status="failed")
    _online(customer, 77, days=0, amount=7_000_000, status="wait_for_payment")

    facts = _metrics(customer)
    assert facts["purchase_count"] == 1
    assert facts["days_since_last_purchase"] == 10
    assert facts["lifetime_purchase_amount"] == 5_000_000 + 2_000_000 - 1_000_000 - 300_000
    assert facts["tier_code"] == "BRONZE_1"

    other = _customer(8)
    sell = _pos(other, 80, days=4, sale_type="sell")
    _item(sell, 800, amount=400_000, quantity=3, item_type="sell")
    _online(other, 81, days=12, amount=250_000)
    both = _metrics(other)
    assert both["purchase_count"] == 2
    assert both["lifetime_purchase_amount"] == 250_000 + 1_200_000
    assert both["days_since_last_purchase"] == 4
    assert both["tier_code"] == "GOLD_2"


@pytest.mark.django_db
def test_no_purchase_is_null_and_each_customer_has_one_tier():
    empty = _customer(9)
    facts = _metrics(empty)
    assert facts["purchase_count"] == 0
    assert facts["tier_code"] is None
    assert facts["lifetime_purchase_amount"] == 0

    buyer = _customer(10)
    _online(buyer, 100, days=10, amount=100_000)
    assigned = []
    for code in TIER_LABELS:
        if filter_customers_by_tier(Customer.objects.filter(pk=buyer.pk), code, REF).exists():
            assigned.append(code)
    assert assigned == ["BRONZE_1"]
    assert not filter_customers_by_tier(Customer.objects.filter(pk=empty.pk), "BRONZE_3", REF).exists()


@pytest.mark.django_db
def test_negative_lifetime_amount_is_not_clamped():
    customer = _customer(11)
    _online(customer, 110, days=200, amount=100_000)
    refund = _pos(customer, 111, days=10, sale_type="refund")
    _item(refund, 1110, amount=400_000, quantity=1, item_type="refund")
    facts = _metrics(customer)
    assert facts["purchase_count"] == 1
    assert facts["lifetime_purchase_amount"] == -300_000
    assert facts["tier_code"] == "BRONZE_3"
    assert facts["days_since_last_purchase"] == 200
