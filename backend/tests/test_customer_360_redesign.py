from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APIClient

from apps.calls.models import CallList, CallProgram, CallTask
from apps.customers.metrics import refresh_customer_metrics
from apps.customers.models import Customer, CustomerAddress, CustomerTierHistory, InternalAccount
from apps.customers.profile360 import customer_taste, purchase_rhythm, timeline, value_summary
from apps.products.models import Category, Product, Variant
from apps.sales.models import Order, OrderItem, PosSale, PosSaleItem, SalesLine
from apps.sales.semantics import qualifying_online_orders, qualifying_pos_sales

_ids = iter(range(900_000, 999_999))


@pytest.fixture(autouse=True)
def _clear_cache():
    cache.clear()
    yield
    cache.clear()


def _customer(n, **extra):
    return Customer.objects.create(source_id=n, first_name="الف", last_name=f"ب{n}", mobile=f"0912{n:07d}", status="active", **extra)


def _order(customer, amount=1_000_000, days=5, status="delivered", discount=0):
    return Order.objects.create(source_id=next(_ids), customer=customer, status=status, total_amount=amount, discount_amount=discount, created_at=timezone.now() - timedelta(days=days))


def _pos(customer, amount=500_000, days=3, line=SalesLine.SARI, kind="sell", **extra):
    sale = PosSale.objects.create(source_id=next(_ids), customer=customer, store_source_id=3, sales_line=line, type=kind, created_at=timezone.now() - timedelta(days=days), **extra)
    PosSaleItem.objects.create(source_id=next(_ids), pos_sale=sale, quantity=1, amount=amount, type="refund" if kind == "refund" else "sell")
    return sale


@pytest.mark.django_db
def test_value_cards_and_tier_comparison():
    peer = _customer(1, tier_code="SILVER")
    _order(peer, 2_000_000)
    _order(peer, 2_000_000)
    me = _customer(2, tier_code="SILVER")
    _order(me, 3_000_000, days=10)
    _pos(me, 1_000_000, days=4)
    _pos(me, 200_000, kind="refund", days=2)  # net amount only
    _order(me, 999, status="canceled")
    refresh_customer_metrics()
    value = value_summary(me)
    assert (value["total_amount"], value["invoice_count"], value["online_count"], value["pos_count"]) == (3_800_000, 2, 1, 1)
    assert value["avg_basket"] == 1_900_000
    assert value["days_since_last"] == 4
    # SILVER average: total (4.0M + 3.8M) / 2 = 3.9M; basket 7.8M / 4 invoices = 1.95M
    assert value["comparison"] == {"tier_label": value["comparison"]["tier_label"], "total_percent": -3, "basket_percent": -3}
    assert value_summary(_customer(3))["comparison"] is None  # no tier, no comparison


@pytest.mark.django_db
def test_internal_account_keeps_no_tier_and_no_comparison(auth_api):
    desk = _customer(1, tier_code="VIP")
    _order(desk)
    InternalAccount.objects.create(customer=desk, kind="desk")
    refresh_customer_metrics()
    data = auth_api.get(f"/api/customers/{desk.source_id}/").data
    assert data["tier_code"] is None and data["value"]["comparison"] is None
    assert data["value"]["invoice_count"] == 1


@pytest.mark.django_db
def test_purchase_rhythm_median_and_threshold():
    two = _customer(1)
    _order(two, days=40)
    _order(two, days=10)
    assert value_summary(two)["usual_gap_days"] is None  # fewer than 3 purchases
    steady = _customer(2)
    for days in (70, 50, 30, 10):  # gaps 20, 20, 20
        _order(steady, days=days)
    _order(steady, days=10)  # same day: not a new gap
    value = value_summary(steady)
    assert value["usual_gap_days"] == 20 and value["overdue"] is False
    late = _customer(3)
    for days in (100, 90, 80, 30):  # gaps 10, 10, 50 -> median 10; 30 days since last > 10
        _order(late, days=days)
    value = value_summary(late)
    assert (value["usual_gap_days"], value["overdue"]) == (10, True)
    same_day = _customer(4)
    for _ in range(3):
        _order(same_day, days=5)
    assert purchase_rhythm(qualifying_online_orders(same_day.orders.all()), qualifying_pos_sales(same_day.pos_sales.all()), 3) is None


@pytest.mark.django_db
def test_taste_ties_and_missing_data():
    shoes, coats = Category.objects.create(source_id=1, title="کفش"), Category.objects.create(source_id=2, title="کت")
    shoe, coat = Product.objects.create(source_id=1, title="ک"), Product.objects.create(source_id=2, title="ت")
    shoe.categories.add(shoes)
    coat.categories.add(coats)
    small, large = Variant.objects.create(source_id=1, product=shoe, size="S", color_name="مشکی"), Variant.objects.create(source_id=2, product=coat, size="L", color_name="")
    customer = _customer(1)
    old = _order(customer, days=30, discount=10)
    new = _order(customer, days=2)
    OrderItem.objects.create(source_id=next(_ids), order=old, product=shoe, variant=small, quantity=1, amount=1)
    OrderItem.objects.create(source_id=next(_ids), order=new, product=coat, variant=large, quantity=1, amount=1)
    _pos(customer, days=1, snappay_cashier_amount=5, cash_amount=5)
    taste = customer_taste(customer)
    assert taste["category"] == "کت"  # 1-1 tie: the more recent wins
    assert taste["size"] == "L"
    assert taste["color"] == "مشکی"  # the empty color is ignored
    assert taste["branch"] == "سایت"
    assert taste["payment"] == "درگاه آنلاین"  # two online invoices vs one POS
    assert taste["discount_percent"] == 33
    empty = customer_taste(_customer(2))
    assert empty == {"category": None, "size": None, "color": None, "branch": None, "payment": None, "discount_percent": None}


@pytest.mark.django_db
def test_timeline_order_type_filter_and_pages():
    customer = _customer(1)
    _order(customer, days=10, discount=100)
    _pos(customer, days=5)
    _order(customer, days=1, status="canceled")
    CustomerTierHistory.objects.create(customer=customer, previous_tier_code=None, tier_code="SILVER", reason="daily", changed_at=timezone.now() - timedelta(days=3))
    data = timeline(customer)
    assert [event["type"] for event in data["results"]] == ["invoice", "tier", "invoice", "invoice"]
    assert data["results"][0]["qualifying"] is False and data["results"][2]["channel"] == "pos"
    assert data["total"] == 4
    assert [event["type"] for event in timeline(customer, "tier")["results"]] == ["tier"]
    assert len(timeline(customer, "discount")["results"]) == 1
    paged = timeline(customer, page=2, per_page=3)
    assert len(paged["results"]) == 1 and paged["total"] == 4


@pytest.mark.django_db
def test_sales_agent_payload_hides_email_address_and_national_code(db):
    agent = get_user_model().objects.create_user(username="ag", password="secret-pass", role="sales_agent")
    customer = _customer(1, email="a@example.com", national_code="0012345678")
    CustomerAddress.objects.create(source_id=1, customer=customer, city_name="ساری", province_name="مازندران", address="خیابان ۱", postal_code="123")
    program = CallProgram.objects.create(name="پ", list=CallList.objects.create(name="ل", kind="fixed", source="manual"))
    CallTask.objects.create(program=program, customer=customer, assignee=agent, due_at=timezone.now())
    client = APIClient()
    client.force_login(agent)
    data = client.get(f"/api/customers/{customer.source_id}/").data
    assert data["email"] == "" and data["profile"]["email"] == "" and data["profile"]["national_code"] == ""
    assert data["addresses"] == [{"city": "ساری", "province": "مازندران"}]
    assert "value" in data and "taste" in data
    assert client.get(f"/api/customers/{customer.source_id}/timeline/").status_code == 200
    manager = get_user_model().objects.create_user(username="boss", password="secret-pass", role="admin")
    client.force_login(manager)
    assert client.get(f"/api/customers/{customer.source_id}/").data["profile"]["national_code"] == "0012345678"
