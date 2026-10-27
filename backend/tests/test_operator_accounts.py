from datetime import timedelta

import pytest
from django.utils import timezone

from apps.customers.models import Customer, InternalAccount
from apps.customers.operators import OPERATOR_LABEL
from apps.customers.tiers import metrics_for_customers, refresh_stored_tiers
from apps.sales.analysis import core_metrics
from apps.sales.models import Order


def _buyer():
    return Customer.objects.create(
        source_id=1,
        first_name="آوا",
        last_name="رضایی",
        mobile="09120000001",
        status="active",
        order_count=1,
    )


def _desk():
    desk = Customer.objects.create(
        source_id=2,
        first_name="خانم",
        last_name="زرگری",
        mobile="09362506974",
        status="active",
        order_count=2,
        tier_code="VIP",
    )
    # The desk account is an InternalAccount row (migration 0008_internalaccount moved it from a hard-coded mobile).
    InternalAccount.objects.create(customer=desk, kind="desk")
    return desk


def _order(customer, source_id, *, receiver="", amount=100_000):
    return Order.objects.create(
        source_id=source_id,
        customer=customer,
        status="delivered",
        receiver=receiver,
        total_amount=amount,
        created_at=timezone.now() - timedelta(days=1),
    )


@pytest.mark.django_db
def test_desk_account_stays_in_the_list_without_a_tier(auth_api):
    buyer = _buyer()
    desk = _desk()
    _order(buyer, 11, receiver="آوا رضایی")
    _order(desk, 21, receiver="مریم احمدی", amount=4_000_000)
    _order(desk, 22, receiver="سارا محمدی", amount=4_000_000)
    refresh_stored_tiers([buyer.pk, desk.pk], reference_date=timezone.localdate())

    desk.refresh_from_db()
    assert desk.tier_code is None
    assert metrics_for_customers([desk.pk])[desk.pk]["tier_code"] is None
    assert metrics_for_customers([desk.pk])[desk.pk]["purchase_count"] == 2

    listing = auth_api.get("/api/customers/?search=09362506974")
    row = listing.data["results"][0]
    assert row["id"] == desk.source_id
    assert row["is_operator"] is True
    assert row["operator_label"] == OPERATOR_LABEL
    assert row["tier_label"] is None
    assert row["order_count"] == 2

    buyers = auth_api.get("/api/customers/?population=purchasing")
    assert desk.source_id not in {item["id"] for item in buyers.data["results"]}

    reports = auth_api.get("/api/customers/reports/")
    groups = {group["key"]: group["count"] for group in reports.data["groups"]}
    assert reports.data["populations"]["purchasing_customers"] == 1
    assert groups["repeating"] == 0


@pytest.mark.django_db
def test_desk_orders_stay_in_sales_and_show_the_receiver(auth_api):
    buyer = _buyer()
    desk = _desk()
    _order(buyer, 11, receiver="آوا رضایی", amount=50_000)
    _order(desk, 21, receiver="مریم احمدی", amount=80_000)
    Order.objects.create(
        source_id=23,
        customer=desk,
        status="delivered",
        receiver_first_name="فاطمه",
        receiver_last_name="سرلک",
        total_amount=20_000,
        created_at=timezone.now() - timedelta(days=2),
    )

    start = timezone.now() - timedelta(days=3)
    end = timezone.now() + timedelta(days=1)
    metrics = core_metrics(start, end)
    assert metrics["purchase_count"] == 3
    assert metrics["customer_count"] == 1
    assert metrics["new_customers"] == 1

    detail = auth_api.get(f"/api/customers/{desk.source_id}/")
    assert detail.status_code == 200
    assert detail.data["is_operator"] is True
    assert detail.data["operator_label"] == OPERATOR_LABEL
    assert detail.data["tier_label"] is None
    assert detail.data["purchase_behavior"] == "operator"
    assert detail.data["online_count"] == 2
    by_id = {row["source_id"]: row for row in detail.data["purchases"]["results"]}
    assert by_id[21]["receiver"] == "مریم احمدی"
    assert by_id[23]["receiver"] == "فاطمه سرلک"
    assert detail.data["purchases"]["results"][0]["value"] == 80_000
