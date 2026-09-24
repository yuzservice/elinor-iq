from datetime import timedelta

import pytest
from django.utils import timezone

from apps.customers.models import Customer
from apps.customers.presentation import UNNAMED_CUSTOMER
from apps.sales.models import Order, PosSale, SalesLine


def _customer(**kwargs):
    source_id = kwargs.pop("source_id")
    defaults = {"first_name": "آوا", "last_name": "رضایی", "mobile": "09120000000", "status": "active"}
    defaults.update(kwargs)
    return Customer.objects.create(source_id=source_id, **defaults)


def _online(customer, source_id, status="delivered", days=1, amount=100000):
    return Order.objects.create(
        source_id=source_id,
        customer=customer,
        status=status,
        total_amount=amount,
        created_at=timezone.now() - timedelta(days=days),
    )


def _pos(customer, source_id, sales_line=SalesLine.SARI, sale_type="sell", days=1, cancelled=False, deleted=False):
    now = timezone.now()
    return PosSale.objects.create(
        source_id=source_id,
        customer=customer,
        store_source_id={"SARI": 3, "GORGAN": 2, "CAPRI": 4}.get(sales_line, 3),
        sales_line=sales_line,
        type=sale_type,
        is_cancelled=cancelled,
        deleted_at=now if deleted else None,
        created_at=now - timedelta(days=days),
    )


def _ids(response):
    return {row["id"] for row in response.data["results"]}


def _row(response, source_id):
    return next(row for row in response.data["results"] if row["id"] == source_id)


@pytest.mark.django_db
def test_customer_list_default_is_all_customers(auth_api):
    none = _customer(source_id=1, first_name="", last_name="", mobile="", order_count=0)
    one = _customer(source_id=2, first_name="سارا", last_name="محمدی", mobile="09121111111", last_order_at=timezone.now())
    repeat = _customer(source_id=3, first_name="نیما", last_name="کاظمی", mobile="09122222222", last_order_at=timezone.now())
    online_only = _customer(source_id=4, first_name="آنلاین", last_name="صرف", mobile="09123333333", last_order_at=timezone.now())
    physical_only = _customer(source_id=5, first_name="حضوری", last_name="صرف", mobile="09124444444", last_order_at=timezone.now())
    both = _customer(source_id=6, first_name="هر", last_name="دو", mobile="09125555555", last_order_at=timezone.now())
    gorgan = _customer(source_id=7, first_name="گرگان", last_name="شعبه", mobile="09126666666", last_order_at=timezone.now())
    canceled_only = _customer(source_id=8, first_name="لغو", last_name="شده", mobile="09127777777", order_count=1)

    _online(one, 21, days=10)
    _online(repeat, 22, days=20)
    _online(repeat, 23, days=2)
    _online(online_only, 24, days=3)
    _pos(physical_only, 31, SalesLine.SARI, days=4)
    _online(both, 25, days=8)
    _pos(both, 32, SalesLine.CAPRI, days=1)
    _pos(gorgan, 33, SalesLine.GORGAN, days=5)
    _pos(gorgan, 34, SalesLine.SARI, days=2)
    _online(canceled_only, 26, status="canceled", days=1)

    listing = auth_api.get("/api/customers/?page=1&per_page=20")
    assert listing.status_code == 200
    assert listing.data["total"] == 8
    assert listing.data["page"] == 1
    assert len(listing.data["results"]) == 8

    unnamed = _row(listing, none.source_id)
    assert unnamed["name"] == UNNAMED_CUSTOMER
    assert unnamed["name_is_fallback"] is True
    assert "254843" not in unnamed["name"]
    assert unnamed["order_count"] == 0
    assert unnamed["tier_code"] is None
    assert unnamed["lifetime_purchase_amount"] == 0
    assert unnamed["online_count"] == 0
    assert unnamed["pos_count"] == 0

    assert _row(listing, one.source_id)["tier_code"] == "BRONZE_1"
    assert _row(listing, one.source_id)["tier_label"] == "برنزی سطح ۱"
    assert _row(listing, one.source_id)["lifetime_purchase_amount"] == 100000
    assert _row(listing, repeat.source_id)["tier_code"] == "GOLD_2"
    assert _row(listing, repeat.source_id)["order_count"] == 2

    online_row = _row(listing, online_only.source_id)
    assert online_row["channel"] == "online"
    assert online_row["online_count"] == 1
    assert online_row["pos_count"] == 0
    assert online_row["sales_lines"] == ["ONLINE"]

    physical_row = _row(listing, physical_only.source_id)
    assert physical_row["channel"] == "physical"
    assert physical_row["sales_lines"] == ["SARI"]
    assert physical_row["sales_line_labels"] == ["ساری"]

    both_row = _row(listing, both.source_id)
    assert both_row["channel"] == "both"
    assert both_row["order_count"] == 2
    assert set(both_row["sales_lines"]) == {"ONLINE", "CAPRI"}

    gorgan_row = _row(listing, gorgan.source_id)
    assert set(gorgan_row["sales_lines"]) == {"GORGAN", "SARI"}
    assert gorgan_row["tier_code"] == "GOLD_2"
    assert gorgan_row["order_count"] == 2

    canceled_row = _row(listing, canceled_only.source_id)
    assert canceled_row["order_count"] == 0
    assert canceled_row["is_purchasing"] is False

    all_pop = auth_api.get("/api/customers/?population=all")
    purchasing = auth_api.get("/api/customers/?population=purchasing")
    registered = auth_api.get("/api/customers/?population=registered")
    no_purchase = auth_api.get("/api/customers/?population=no_purchase")
    assert all_pop.data["total"] == 8
    assert purchasing.data["total"] == 6
    assert registered.data["total"] == 2
    assert no_purchase.data["total"] == 2
    assert _ids(purchasing) == {2, 3, 4, 5, 6, 7}
    assert _ids(registered) == {1, 8}

    ignored_behavior = auth_api.get("/api/customers/?behavior=one_time")
    assert ignored_behavior.data["total"] == 8
    bronze = auth_api.get("/api/customers/?tier=BRONZE_1")
    gold_two = auth_api.get("/api/customers/?tier=GOLD_2")
    assert bronze.data["total"] == 3
    assert _ids(bronze) == {2, 4, 5}
    assert gold_two.data["total"] == 3
    assert _ids(gold_two) == {3, 6, 7}
    assert all(row["tier_code"] == "BRONZE_1" for row in bronze.data["results"])

    online_channel = auth_api.get("/api/customers/?channel=online")
    physical_channel = auth_api.get("/api/customers/?channel=physical")
    both_channel = auth_api.get("/api/customers/?channel=both")
    assert _ids(online_channel) == {2, 3, 4}
    assert _ids(physical_channel) == {5, 7}
    assert _ids(both_channel) == {6}

    sari = auth_api.get("/api/customers/?sales_line=sari")
    gorgan_line = auth_api.get("/api/customers/?sales_line=gorgan")
    capri = auth_api.get("/api/customers/?sales_line=capri")
    online_line = auth_api.get("/api/customers/?sales_line=online")
    sari_or_gorgan = auth_api.get("/api/customers/?sales_lines=sari,gorgan")
    assert _ids(sari) == {5, 7}
    assert _ids(gorgan_line) == {7}
    assert _ids(capri) == {6}
    assert _ids(online_line) == {2, 3, 4, 6}
    assert _ids(sari_or_gorgan) == {5, 7}

    name_search = auth_api.get("/api/customers/?search=نیما")
    full_name_search = auth_api.get("/api/customers/?search=نیما کاظمی")
    mobile_search = auth_api.get("/api/customers/?search=09125555555")
    assert _ids(name_search) == {3}
    assert _ids(full_name_search) == {3}
    assert _ids(mobile_search) == {6}

    paged = auth_api.get("/api/customers/?page=2&per_page=3")
    assert paged.data["total"] == 8
    assert paged.data["page"] == 2
    assert paged.data["per_page"] == 3
    assert len(paged.data["results"]) == 3

    ranged = auth_api.get("/api/customers/?min_purchases=2&max_purchases=2")
    assert _ids(ranged) == {3, 6, 7}

    refund_only = _customer(source_id=9, first_name="مرجوع", last_name="فقط", mobile="09128888888")
    _pos(refund_only, 35, sale_type="refund")
    refund_listing = auth_api.get("/api/customers/?population=purchasing")
    assert refund_only.source_id not in _ids(refund_listing)
    assert auth_api.get("/api/customers/").data["total"] == 9
