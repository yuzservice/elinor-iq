import importlib
from datetime import datetime, time, timedelta
from unittest.mock import patch

import pytest
from django.apps import apps as django_apps
from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.customers.models import Customer, CustomerRfm, CustomerTierHistory, InternalAccount
from apps.customers.operators import exclude_operator_accounts, operator_customer_ids
from apps.customers.rfm import SUSPECTED_MIN_SCORE, refresh_rfm
from apps.customers.tiers import refresh_stored_tiers
from apps.sales.analysis import core_metrics
from apps.sales.models import Order, PosSale, SalesLine

migration = importlib.import_module("apps.customers.migrations.0008_internal_accounts")

_ids = iter(range(50_000, 99_999))


def _at(days_before, hour=12):
    local = datetime.combine(timezone.localdate(), time(hour, 0))
    return timezone.make_aware(local, timezone.get_current_timezone()) - timedelta(days=days_before)


def _customer(source_id, first="سارا", last="کریمی", mobile=None):
    return Customer.objects.create(
        source_id=source_id, first_name=first, last_name=last, mobile=mobile or f"0937{source_id:07d}", status="active"
    )


def _order(customer, *, days=5, amount=1_000_000, receiver=("", ""), city="", hour=12):
    return Order.objects.create(
        source_id=next(_ids),
        customer=customer,
        status="delivered",
        total_amount=amount,
        receiver_first_name=receiver[0],
        receiver_last_name=receiver[1],
        receiver_city=city,
        created_at=_at(days, hour),
    )


def _pos(customer, *, days=5, sales_line=SalesLine.SARI):
    return PosSale.objects.create(
        source_id=next(_ids),
        customer=customer,
        store_source_id=3,
        sales_line=sales_line,
        type="sell",
        is_cancelled=False,
        created_at=_at(days),
    )


@pytest.fixture
def super_admin(db):
    return get_user_model().objects.create_user(username="root", password="secret-pass", role="super_admin")


@pytest.fixture
def super_api(api, super_admin):
    api.force_login(super_admin)
    return api


def _signals(customer):
    return {signal["key"]: signal["value"] for signal in CustomerRfm.objects.get(customer=customer).internal_signals}


# --- Migration -------------------------------------------------------------------------------


@pytest.mark.django_db
def test_data_migration_moves_the_desk_mobile_and_is_idempotent():
    desk = _customer(1, mobile="9362506974")  # stored without the leading zero
    other = _customer(2)
    migration.move_desk_accounts(django_apps, None)
    migration.move_desk_accounts(django_apps, None)
    assert list(InternalAccount.objects.values_list("customer_id", "kind", "is_active")) == [(desk.pk, "desk", True)]
    assert operator_customer_ids() == {desk.pk}

    staff = InternalAccount.objects.create(customer=other, kind="staff")
    migration.remove_moved_accounts(django_apps, None)
    assert list(InternalAccount.objects.values_list("pk", flat=True)) == [staff.pk]


# --- Exclusion parity ------------------------------------------------------------------------


@pytest.mark.django_db
def test_staff_account_is_excluded_from_customer_reports_but_not_sales(auth_api):
    buyer = _customer(1)
    staff = _customer(2, first="کارمند", last="فروشگاه")
    _order(buyer, days=3, amount=500_000)
    for days in (1, 2, 4, 6):
        _order(staff, days=days, amount=9_000_000)
    refresh_stored_tiers(reference_date=timezone.localdate())
    staff.refresh_from_db()
    assert staff.tier_code is not None

    InternalAccount.objects.create(customer=staff, kind="staff")
    refresh_stored_tiers(reference_date=timezone.localdate())
    refresh_rfm()
    staff.refresh_from_db()
    assert staff.tier_code is None
    assert CustomerTierHistory.objects.filter(customer=staff, tier_code=None).exists()
    assert not CustomerRfm.objects.filter(customer=staff).exists()
    assert CustomerRfm.objects.filter(customer=buyer).exists()
    assert set(exclude_operator_accounts(Customer.objects.all()).values_list("pk", flat=True)) == {buyer.pk}

    ranked = auth_api.get("/api/customers/?sort=lifetime_amount").data["results"]
    assert [row["id"] for row in ranked] == [buyer.source_id, staff.source_id]
    assert ranked[1]["is_operator"] is True and ranked[1]["operator_label"] == "کارمند"
    assert ranked[1]["operator_kind"] == "staff"

    metrics = core_metrics(_at(10), _at(-1))
    assert metrics["purchase_count"] == 5
    assert metrics["customer_count"] == 1


@pytest.mark.django_db
def test_deactivating_returns_the_account_to_tiers_and_rfm(super_api):
    staff = _customer(1)
    for days in (1, 3):
        _order(staff, days=days)
    account = InternalAccount.objects.create(customer=staff, kind="staff")
    refresh_stored_tiers(reference_date=timezone.localdate())
    refresh_rfm()
    assert not CustomerRfm.objects.filter(customer=staff).exists()

    with patch("apps.customers.tier_refresh.threading.Thread") as thread:
        response = super_api.patch(f"/api/customers/internal-accounts/{account.pk}/", {"is_active": False}, format="json")
    assert response.status_code == 200
    assert response.data["is_active"] is False
    assert response.data["refresh_started"] is True
    assert thread.return_value.start.called

    refresh_stored_tiers(reference_date=timezone.localdate())
    refresh_rfm()
    staff.refresh_from_db()
    assert staff.tier_code == "GOLD_2"
    assert CustomerTierHistory.objects.filter(customer=staff, tier_code="GOLD_2").exists()
    assert CustomerRfm.objects.filter(customer=staff).exists()


# --- Signals ---------------------------------------------------------------------------------


@pytest.mark.django_db
def test_receivers_cities_burst_and_branches_signals():
    holder = _customer(1, first="علی", last="رضایی")
    # The holder's own name written with Arabic letters and extra spaces does not count.
    _order(holder, days=40, receiver=("  علي ", "رضايي"), city="ساری")
    for index, city in enumerate(("گرگان", "رشت", "ساری", "ساري", "تهران")):
        _order(holder, days=50 + index, receiver=(f"گیرنده{index}", "احمدی"), city=city)
    for _ in range(3):
        _order(holder, days=10, hour=11)
    for line in (SalesLine.SARI, SalesLine.GORGAN, SalesLine.CAPRI):
        _pos(holder, sales_line=line)
    quiet = _customer(2)
    _order(quiet, days=5)

    refresh_rfm()
    signals = _signals(holder)
    assert signals["many_receivers"] == 5
    assert signals["many_cities"] == 4  # ساری and ساري are one city
    assert signals["same_day_burst"] == 3
    assert signals["many_branches"] == 3
    holder_rfm = CustomerRfm.objects.get(customer=holder)
    assert holder_rfm.internal_signal_score == len(holder_rfm.internal_signals) >= 4
    assert CustomerRfm.objects.get(customer=quiet).internal_signal_score == 0


@pytest.mark.django_db
def test_thresholds_are_inclusive_and_below_them_nothing_fires():
    customer = _customer(1)
    for index in range(4):
        _order(customer, days=30 + index * 7, receiver=(f"نفر{index}", "یک"), city=f"شهر{index % 2}")
    for _ in range(2):
        _order(customer, days=3)
    refresh_rfm()
    signals = _signals(customer)
    assert "many_receivers" not in signals  # 4 < 5
    assert "many_cities" not in signals  # 2 < 3
    assert "same_day_burst" not in signals  # 2 < 3


@pytest.mark.django_db
def test_high_frequency_uses_the_99_5_percentile():
    for source_id in range(1, 11):
        _order(_customer(source_id), days=5)
    heavy = _customer(99)
    for days in range(1, 13):
        _order(heavy, days=days * 3)
    refresh_rfm()
    assert _signals(heavy)["high_frequency"] == 12
    assert "high_frequency" not in _signals(Customer.objects.get(source_id=1))


# --- API, 360 and list -----------------------------------------------------------------------


def _suspect():
    customer = _customer(7, first="مینا", last="نوری")
    for _ in range(3):
        _order(customer, days=2)
    for line in (SalesLine.SARI, SalesLine.GORGAN, SalesLine.CAPRI):
        _pos(customer, sales_line=line)
    refresh_rfm()
    assert CustomerRfm.objects.get(customer=customer).internal_signal_score >= SUSPECTED_MIN_SCORE
    return customer


@pytest.mark.django_db
def test_admin_cannot_manage_or_see_internal_data(auth_api):
    customer = _suspect()
    assert auth_api.get("/api/customers/internal-accounts/").status_code == 403
    assert auth_api.post("/api/customers/internal-accounts/", {"customer_source_id": 7, "kind": "staff"}, format="json").status_code == 403
    assert auth_api.patch("/api/customers/internal-accounts/1/", {"is_active": False}, format="json").status_code == 403

    detail = auth_api.get(f"/api/customers/{customer.source_id}/").data
    assert detail["internal_account"] is None
    assert detail["internal_account_signals"] is None

    rows = auth_api.get("/api/customers/?internal=suspected").data
    assert rows["total"] == 1  # filter ignored: the only customer is listed anyway
    assert "internal_suspected" not in rows["results"][0]
    _customer(8)
    assert auth_api.get("/api/customers/?internal=suspected").data["total"] == 2


@pytest.mark.django_db
def test_super_admin_sees_signals_filters_and_confirms(super_api):
    customer = _suspect()
    _customer(8)

    detail = super_api.get(f"/api/customers/{customer.source_id}/").data
    signals = detail["internal_account_signals"]
    assert signals["suspected"] is True
    assert {item["key"] for item in signals["signals"]} >= {"same_day_burst", "many_branches"}
    assert any(item["text"] == "خرید از ۳ شعبه" for item in signals["signals"])
    assert detail["internal_account"] is None

    suspected = super_api.get("/api/customers/?internal=suspected").data
    assert [row["id"] for row in suspected["results"]] == [customer.source_id]
    assert suspected["results"][0]["internal_suspected"] is True

    invalid = super_api.post("/api/customers/internal-accounts/", {"customer_source_id": 7, "kind": "boss"}, format="json")
    assert invalid.status_code == 400 and invalid.data["errors"]["kind"]
    missing = super_api.post("/api/customers/internal-accounts/", {"customer_source_id": 404, "kind": "staff"}, format="json")
    assert missing.status_code == 400 and missing.data["errors"]["customer_source_id"]

    with patch("apps.customers.tier_refresh.threading.Thread"):
        created = super_api.post(
            "/api/customers/internal-accounts/", {"customer_source_id": 7, "kind": "staff", "note": "سفارش برای مشتری‌ها"}, format="json"
        )
    assert created.status_code == 201
    assert created.data["kind_label"] == "کارمند" and created.data["created_by"] == "root"

    assert super_api.get("/api/customers/?internal=suspected").data["total"] == 0
    confirmed = super_api.get("/api/customers/?internal=confirmed").data["results"]
    assert [row["id"] for row in confirmed] == [customer.source_id]
    assert confirmed[0]["internal_suspected"] is False

    detail = super_api.get(f"/api/customers/{customer.source_id}/").data
    assert detail["internal_account"]["is_active"] is True
    assert detail["internal_account"]["note"] == "سفارش برای مشتری‌ها"
    assert detail["internal_account_signals"] is None
    listed = super_api.get("/api/customers/internal-accounts/").data["results"]
    assert [row["customer_source_id"] for row in listed] == [7]

    with patch("apps.customers.tier_refresh.threading.Thread"):
        restored = super_api.patch(f"/api/customers/internal-accounts/{created.data['id']}/", {"is_active": False}, format="json")
        again = super_api.post("/api/customers/internal-accounts/", {"customer_source_id": 7, "kind": "desk"}, format="json")
    assert restored.data["is_active"] is False
    assert again.status_code == 200 and again.data["is_active"] is True and again.data["kind"] == "desk"
    assert InternalAccount.objects.count() == 1
