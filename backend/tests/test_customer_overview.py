from datetime import date, datetime, time, timedelta

import pytest
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APIClient

from apps.customers.models import Customer, CustomerTierHistory, InternalAccount
from apps.customers.overview import compare_window, overview_payload, period_window, spark_windows
from apps.sales.models import OnlineInvoice, OnlinePayment, Order, PosSale, PosSaleItem, SalesLine

TODAY = date(2026, 10, 27)  # 1405/08/05
_ids = iter(range(70_000, 99_999))


@pytest.fixture(autouse=True)
def _clear_cache():
    cache.clear()
    yield
    cache.clear()


def _at(day, hour=12):
    return timezone.make_aware(datetime.combine(day, time(hour)), timezone.get_current_timezone())


def _customer(source_id):
    return Customer.objects.create(source_id=source_id, first_name="الف", last_name="ب", mobile=f"0912{source_id:07d}", status="active")


def _order(customer, day, amount=1_000_000, status="delivered", shopino=False, gateway=None):
    order = Order.objects.create(
        source_id=next(_ids), customer=customer, status=status, total_amount=amount, is_shopino=shopino, created_at=_at(day)
    )
    if gateway:
        invoice = OnlineInvoice.objects.create(
            source_id=next(_ids), order_source_id=order.source_id, order=order, amount=amount, status="success", created_at=_at(day)
        )
        OnlinePayment.objects.create(
            source_id=next(_ids), invoice=invoice, gateway=gateway, status="success", amount=amount, paid_at=_at(day), created_at=_at(day)
        )
    return order


def _pos(customer, day, line=SalesLine.SARI, items=((1, 500_000, "sell"),), kind="sell", **payments):
    sale = PosSale.objects.create(
        source_id=next(_ids), customer=customer, store_source_id=3, sales_line=line, type=kind, created_at=_at(day), **payments
    )
    for quantity, amount, item_type in items:
        PosSaleItem.objects.create(source_id=next(_ids), pos_sale=sale, quantity=quantity, amount=amount, type=item_type)
    return sale


def _lens(payload, lens):
    return payload["lenses"][lens]


# --- Windows ---------------------------------------------------------------------------


def test_windows_jalali_month_prev_and_yoy():
    month = period_window("month", TODAY)
    assert month == (date(2026, 10, 23), TODAY)  # 1405/08/01 .. 1405/08/05
    assert compare_window(month, "prev") == (date(2026, 10, 18), date(2026, 10, 22))
    assert compare_window(month, "yoy") == (date(2025, 10, 23), date(2025, 10, 27))  # 1404/08/01 .. 1404/08/05
    thirty = period_window("30", TODAY)
    assert thirty == (date(2026, 9, 28), TODAY)
    assert compare_window(thirty, "prev") == (date(2026, 8, 29), date(2026, 9, 27))


@pytest.mark.parametrize("period", ["30", "month", "90", "365"])
def test_spark_buckets_are_12_contiguous_and_end_today(period):
    buckets = spark_windows(period, TODAY)
    assert len(buckets) == 12 and buckets[-1][1] == TODAY
    for (_, end), (start, _) in zip(buckets, buckets[1:]):
        assert start == end + timedelta(days=1)
    if period == "30":
        assert buckets[-1] == period_window("30", TODAY)
    if period == "month":
        assert buckets[-1][0] == date(2026, 10, 23) and buckets[0][0] == date(2025, 11, 22)  # 1404/09/01


# --- Lenses, basket, repeat --------------------------------------------------------------


@pytest.mark.django_db
def test_lens_membership_basket_and_repeat():
    day = TODAY - timedelta(days=3)
    online = _customer(1)
    _order(online, day, amount=2_000_000, shopino=True, gateway="snapppay")
    _order(online, day, amount=999, status="canceled")  # not qualifying
    store = _customer(2)
    _pos(store, TODAY - timedelta(days=200))  # earlier purchase -> repeat
    _pos(store, day, items=((2, 300_000, "sell"),), digipay_cashier_amount=600_000)
    _pos(store, day, items=((1, 100_000, "refund"),), kind="refund")  # net amount only, not an invoice
    gorgan = _customer(3)
    _pos(gorgan, day, line=SalesLine.GORGAN, snappay_cashier_amount=1)

    payload = overview_payload("30", "prev", today=TODAY)
    total = _lens(payload, "total")
    assert total["customers"] == {"value": 3, "new": 2}
    assert total["active"]["value"] == 3
    # (2,000,000 + 600,000 - 100,000 + 500,000) / 3 invoices
    assert total["basket"]["value"] == 1_000_000
    assert total["repeat"]["value"] == pytest.approx(33.3)

    assert _lens(payload, "site")["active"]["value"] == 1
    assert _lens(payload, "shopino")["basket"]["value"] == 2_000_000
    assert _lens(payload, "snappay")["active"]["value"] == 2  # online gateway + POS cashier
    assert _lens(payload, "digipay")["basket"]["value"] == 600_000  # full invoice, refund header excluded
    assert _lens(payload, "sari")["basket"]["value"] == 500_000  # (600,000 - 100,000) / 1 invoice in the window
    assert _lens(payload, "sari")["repeat"]["value"] == 100.0
    assert _lens(payload, "capri")["active"]["value"] == 0 and _lens(payload, "capri")["basket"]["value"] is None


@pytest.mark.django_db
def test_delta_and_repeat_points_vs_previous_window():
    a, b = _customer(1), _customer(2)
    _order(a, TODAY - timedelta(days=40))
    _order(a, TODAY - timedelta(days=2))
    _order(b, TODAY - timedelta(days=2))
    _order(b, TODAY - timedelta(days=45))
    _order(_customer(3), TODAY - timedelta(days=50))
    _order(_customer(4), TODAY - timedelta(days=55))
    site = _lens(overview_payload("30", "prev", today=TODAY), "site")
    assert site["active"] == {"value": 2, "delta": -50.0}  # 2 vs 4
    assert site["repeat"] == {"value": 100.0, "delta": 100.0}  # percentage points
    assert site["spark"]["active"][-1] == 2 and site["spark"]["active"][-2] == 4


@pytest.mark.django_db
def test_internal_accounts_are_excluded_everywhere():
    buyer, staff = _customer(1), _customer(2)
    _order(buyer, TODAY - timedelta(days=1))
    _order(staff, TODAY - timedelta(days=1), amount=9_000_000)
    _pos(staff, TODAY - timedelta(days=1))
    InternalAccount.objects.create(customer=staff, kind="staff")
    total = _lens(overview_payload("30", "prev", today=TODAY), "total")
    assert total["customers"]["value"] == 1 and total["active"]["value"] == 1
    assert total["basket"]["value"] == 1_000_000


@pytest.mark.django_db
def test_compare_before_pos_start_is_null_not_extrapolated():
    customer = _customer(1)
    _order(customer, TODAY - timedelta(days=2))
    _pos(customer, TODAY - timedelta(days=2))
    payload = overview_payload("365", "yoy", today=TODAY)  # compare window starts 2024-10
    assert _lens(payload, "sari")["active"]["delta"] is None
    assert _lens(payload, "total")["active"]["delta"] is None
    assert _lens(payload, "site")["active"]["delta"] is None  # covered, but previous is 0
    spark = _lens(overview_payload("90", "prev", today=TODAY), "sari")["spark"]["active"]
    assert spark[0] is None and spark[-1] == 1  # first 90-day bucket starts 2023-11
    assert _lens(overview_payload("90", "prev", today=TODAY), "site")["spark"]["active"][0] == 0


# --- Tiers, insights, API ----------------------------------------------------------------


@pytest.mark.django_db
def test_tier_counts_net_delta_and_insights():
    a, b, c = _customer(1), _customer(2), _customer(3)
    Customer.objects.filter(pk__in=[a.pk, b.pk]).update(tier_code="SILVER")
    Customer.objects.filter(pk=c.pk).update(tier_code="GOLD_1")
    in_window, before = _at(TODAY - timedelta(days=5)), _at(TODAY - timedelta(days=60))
    CustomerTierHistory.objects.create(customer=a, previous_tier_code=None, tier_code="SILVER", reason="daily", changed_at=in_window)
    CustomerTierHistory.objects.create(customer=b, previous_tier_code="GOLD_1", tier_code="SILVER", reason="daily", changed_at=in_window)
    CustomerTierHistory.objects.create(customer=c, previous_tier_code=None, tier_code="GOLD_1", reason="daily", changed_at=before)

    tiers = overview_payload("30", "prev", today=TODAY)["tiers"]
    rows = {tier["code"]: tier for panel in tiers["panels"] for tier in panel["tiers"]}
    assert (rows["SILVER"]["count"], rows["SILVER"]["net"]) == (2, 2)
    assert (rows["GOLD_1"]["count"], rows["GOLD_1"]["net"]) == (1, -1)
    insights = overview_payload("30", "prev", today=TODAY)["insights"]
    assert insights["top_tier"]["code"] == "SILVER" and insights["top_tier"]["net"] == 2


@pytest.mark.django_db
def test_endpoint_validates_params_and_requires_login(auth_api):
    assert APIClient().get("/api/customers/overview/").status_code in (401, 403)
    assert auth_api.get("/api/customers/overview/?period=7").status_code == 400
    response = auth_api.get("/api/customers/overview/?period=month&compare=yoy")
    assert response.status_code == 200
    assert set(response.data["lenses"]) == {"total", "site", "sari", "gorgan", "capri", "shopino", "snappay", "digipay"}
