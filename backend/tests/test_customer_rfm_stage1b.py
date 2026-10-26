import logging
from datetime import datetime, time, timedelta

import pytest
from django.http import QueryDict
from django.utils import timezone

from apps.customers import rfm_reports
from apps.customers.models import Customer, CustomerRfm, CustomerRfmSnapshot, InternalAccount
from apps.customers.rfm import customer_rfm_payload, previous_month_keys, refresh_rfm, write_snapshot
from apps.customers.rfm_reports import (
    PRIORITY_ORDER,
    axis_labels,
    call_list_page,
    rfm_movement,
    rfm_summary,
)
from apps.sales.models import Order, PosSale, PosSaleItem, SalesLine

_ids = iter(range(70_000, 99_999))


def _today():
    return timezone.localdate()


def _at(days_before, hour=12):
    local = datetime.combine(_today(), time(hour, 0))
    return timezone.make_aware(local, timezone.get_current_timezone()) - timedelta(days=days_before)


def _customer(source_id, mobile=None):
    return Customer.objects.create(
        source_id=source_id, first_name="نسرین", last_name="مرادی", mobile=mobile or f"0939{source_id:07d}", status="active"
    )


def _order(customer, days, amount=1_000_000, hour=12):
    return Order.objects.create(
        source_id=next(_ids), customer=customer, status="delivered", total_amount=amount, created_at=_at(days, hour)
    )


def _pos(customer, days, amount=1_000_000, sales_line=SalesLine.SARI):
    sale = PosSale.objects.create(
        source_id=next(_ids),
        customer=customer,
        store_source_id=3,
        sales_line=sales_line,
        type="sell",
        is_cancelled=False,
        created_at=_at(days),
    )
    PosSaleItem.objects.create(source_id=next(_ids), pos_sale=sale, quantity=1, amount=amount, type="sell")


def _buyer(source_id, *days, amount=1_000_000):
    customer = _customer(source_id)
    for day in days:
        _order(customer, day, amount)
    return customer


def _snapshot(month, customer, segment="hibernating", **facts):
    defaults = {"purchase_count": 1, "purchase_count_12m": 0, "amount_12m": 0, "lifetime_amount": 1_000_000, "days_since_last_purchase": 400}
    defaults.update(facts)
    return CustomerRfmSnapshot.objects.create(month=month, customer=customer, r_score=1, f_score=1, m_score=1, segment=segment, **defaults)


# --- Stored purchase stats --------------------------------------------------------------------


@pytest.mark.django_db
def test_first_second_interval_and_overdue_are_stored():
    regular = _buyer(1, 130, 100, 70)  # interval 30, 70 days since last > 45 → overdue
    recent = _buyer(2, 90, 60, 30)  # interval 30, 30 days since last ≤ 45 → not overdue
    single = _buyer(3, 200)
    same_day = _customer(4)
    _order(same_day, 10, hour=10)
    _order(same_day, 10, hour=15)
    desk = _buyer(5, 20, 10)
    InternalAccount.objects.create(customer=desk, kind="staff")
    refresh_rfm()

    rows = {row.customer_id: row for row in CustomerRfm.objects.all()}
    assert desk.pk not in rows
    row = rows[regular.pk]
    assert timezone.localtime(row.first_purchase_at).date() == _today() - timedelta(days=130)
    assert timezone.localtime(row.second_purchase_at).date() == _today() - timedelta(days=100)
    assert (row.avg_interval_days, row.is_overdue) == (30.0, True)
    assert (rows[recent.pk].avg_interval_days, rows[recent.pk].is_overdue) == (30.0, False)
    assert (rows[single.pk].avg_interval_days, rows[single.pk].second_purchase_at, rows[single.pk].is_overdue) == (None, None, False)
    # Two purchases on one day: interval 0 is not a usual buying rhythm, so never overdue.
    assert (rows[same_day.pk].avg_interval_days, rows[same_day.pk].is_overdue) == (0.0, False)

    # Customer 360 reads the stored values.
    CustomerRfm.objects.filter(customer=regular).update(avg_interval_days=12.0, is_overdue=False)
    payload = customer_rfm_payload(regular)
    assert (payload["avg_days_between_purchases"], payload["overdue"], payload["days_late"]) == (12.0, False, 58)


# --- KPIs ------------------------------------------------------------------------------------


@pytest.mark.django_db
def test_kpis_value_previous_delta_and_trend_from_snapshots():
    recent = _buyer(1, 5, 300)
    old = _buyer(2, 500)
    refresh_rfm()
    month = previous_month_keys(_today(), 1)[0]
    _snapshot(month, recent, days_since_last_purchase=10, purchase_count_12m=1)
    _snapshot(month, old, days_since_last_purchase=20, purchase_count_12m=1)

    kpis = rfm_summary(QueryDict(""))["kpis"]
    buyers = kpis["buyers_30d"]
    assert (buyers["value"], buyers["previous"], buyers["delta_pct"]) == (1, 2, -50.0)
    assert buyers["secondary"]["value"] == 1
    assert len(buyers["trend"]) == 12 and buyers["trend"][-1] == {"month": month, "label": buyers["trend"][-1]["label"], "value": 2}
    assert buyers["trend"][0]["value"] is None  # no snapshot for that month
    active = kpis["active_customers_12m"]
    assert (active["value"], active["previous"], active["delta_pct"]) == (1, 2, -50.0)
    assert kpis["value_at_risk"]["value"] == 0


@pytest.mark.django_db
def test_second_purchase_90d_cohort_bounds():
    _buyer(1, 89, 60)  # too new: excluded
    _buyer(2, 90, 10)  # in cohort, second after 80 days → reached
    _buyer(3, 455)  # in cohort, no second
    _buyer(4, 456, 400)  # too old: excluded
    _buyer(5, 300, 150)  # in cohort, second after 150 days → not reached
    refresh_rfm()
    kpi = rfm_summary(QueryDict(""))["kpis"]["second_purchase_90d"]
    assert kpi["secondary"]["value"] == 3
    assert kpi["value"] == pytest.approx(33.3)


@pytest.mark.django_db
def test_funnel_and_reactivated():
    _buyer(1, 200, 180)  # second after 20 days
    _buyer(2, 300, 250)  # second after 50 days
    _buyer(3, 100)  # no second
    back_now = _buyer(4, 400, 5, amount=2_000_000)  # back after 395 days, 5 days ago
    _buyer(5, 100, 5)  # gap 95 days: not a reactivation
    _buyer(6, 500, 40, amount=3_000_000)  # back 40 days ago: previous window
    refresh_rfm()

    summary = rfm_summary(QueryDict(""))
    funnel = summary["second_purchase_funnel"]
    steps = {step["days"]: step for step in funnel["steps"]}
    assert funnel["cohort"] == 4  # first purchase in the last 365 days: customers 1, 2, 3, 5
    assert (steps[30]["eligible"], steps[30]["reached"]) == (4, 1)
    assert (steps[60]["reached"], steps[90]["reached"]) == (2, 2)  # customer 5's second came after 95 days
    assert steps[180]["eligible"] == 2  # only customers whose first purchase is ≥ 180 days old
    assert funnel["median_days_to_second"] == 50
    assert "۵۰" in funnel["guidance"]

    reactivated = summary["reactivated"]
    assert (reactivated["count"], reactivated["amount"]) == (1, 2_000_000)
    assert (reactivated["previous"]["count"], reactivated["previous"]["amount"]) == (1, 3_000_000)
    assert back_now.pk


# --- Segments and matrix ---------------------------------------------------------------------


@pytest.mark.django_db
def test_segments_priority_overdue_delta_and_matrix_enrichment():
    regular = _buyer(1, 130, 100, 70)
    _buyer(2, 10)
    refresh_rfm()
    month = previous_month_keys(_today(), 1)[0]
    _snapshot(month, regular, segment="attention")

    summary = rfm_summary(QueryDict(""))
    assert [segment["key"] for segment in summary["segments"]] == list(PRIORITY_ORDER)
    assert [segment["priority_rank"] for segment in summary["segments"]] == list(range(1, 9))
    by_key = {segment["key"]: segment for segment in summary["segments"]}
    regular_segment = CustomerRfm.objects.get(customer=regular).segment
    assert by_key[regular_segment]["overdue_count"] == 1
    assert by_key["new"]["delta_count_vs_previous_month"] == 1
    assert by_key["attention"]["delta_count_vs_previous_month"] == (1 if regular_segment == "attention" else -1)

    cell = next(item for item in summary["matrix"] if item["r"] == 5 and item["f"] == 1)
    assert (cell["count"], cell["pct_customers"], cell["lifetime_amount_sum"], cell["pct_lifetime_amount"]) == (1, 50.0, 1_000_000, 25.0)
    assert (cell["r_label"], cell["f_label"], cell["segment_label"]) == ("تا ۳۰ روز", "۱ خرید", "تازه‌واردها")
    assert sum(item["pct_customers"] for item in summary["composition"]) == 100.0


def test_axis_labels_follow_the_thresholds(monkeypatch):
    labels = axis_labels()
    assert [item["label"] for item in labels["r"]] == ["تا ۳۰ روز", "۳۱ تا ۹۰ روز", "۹۱ تا ۱۸۰ روز", "۱۸۱ تا ۳۶۵ روز", "بیش از ۳۶۵ روز"]
    assert [item["label"] for item in labels["f"]] == ["۶+ خرید", "۴ تا ۵ خرید", "۳ خرید", "۲ خرید", "۱ خرید"]
    monkeypatch.setattr(rfm_reports, "R_MAX_DAYS", ((5, 14), (4, 60), (3, 120), (2, 240)))
    assert axis_labels()["r"][0]["label"] == "تا ۱۴ روز"
    assert axis_labels()["r"][-1]["label"] == "بیش از ۲۴۰ روز"


# --- Movement --------------------------------------------------------------------------------


@pytest.mark.django_db
def test_movement_windows_retention_and_rank():
    latest = previous_month_keys(_today(), 1)[0]
    start = rfm_reports._shift_month(latest, 3)
    customers = [_customer(source_id) for source_id in range(1, 7)]
    plan = [
        ("loyal", "loyal"),  # stayed
        ("loyal", "champions"),  # improved
        ("loyal", "at_risk"),  # declined
        ("at_risk", "loyal"),  # improved (enters loyal)
        (None, "new"),  # new purchaser
        ("loyal", "loyal"),  # internal account: excluded
    ]
    for customer, (before, after) in zip(customers, plan):
        if before:
            _snapshot(start, customer, segment=before)
        _snapshot(latest, customer, segment=after)
    InternalAccount.objects.create(customer=customers[5], kind="staff")

    assert rfm_movement(QueryDict(""), 1)["movement"] is None
    assert "موجود نیست" in rfm_movement(QueryDict(""), 1)["reason"]
    result = rfm_movement(QueryDict(""), 3)["movement"]
    loyal = next(item for item in result["segments"] if item["key"] == "loyal")
    assert (loyal["start_count"], loyal["stayed"], loyal["improved"], loyal["declined"]) == (3, 1, 1, 1)
    assert (loyal["entered"], loyal["exited"], loyal["net"]) == (1, 2, -1)
    assert loyal["stayed_pct"] == pytest.approx(33.3)
    at_risk = next(item for item in result["segments"] if item["key"] == "at_risk")
    assert (at_risk["start_count"], at_risk["improved"], at_risk["entered"]) == (1, 1, 1)
    assert result["new_purchasers"] == 1
    assert {(move["from"], move["to"]) for move in result["moves"]} == {
        ("loyal", "champions"),
        ("loyal", "at_risk"),
        ("at_risk", "loyal"),
    }
    assert rfm_movement(QueryDict(""), 12)["movement"] is None


# --- Call list and exports -------------------------------------------------------------------


@pytest.mark.django_db
def test_call_list_filter_order_and_csv(auth_api, caplog):
    big = _buyer(1, 130, 100, 70, amount=5_000_000)
    small = _customer(2)
    for day in (140, 110, 80):
        _pos(small, day, amount=1_000_000, sales_line=SalesLine.GORGAN)
    _buyer(3, 90, 60, 30)  # not overdue
    _buyer(4, 900, 850, 800)  # overdue but last purchase > 365 days
    refresh_rfm()

    page = call_list_page(QueryDict(""))
    assert [row["source_id"] for row in page["results"]] == [big.source_id, small.source_id]
    assert page["results"][0]["days_late"] == 40
    assert page["results"][0]["last_sales_line"] == "آنلاین"
    assert page["results"][1]["last_sales_line"] == "گرگان"
    segment = CustomerRfm.objects.get(customer=small).segment
    filtered = call_list_page(QueryDict(f"segment={segment}"))
    assert small.source_id in [row["source_id"] for row in filtered["results"]]
    assert auth_api.get("/api/customers/rfm/call-list/?sales_line=gorgan").data["total"] == 1

    with caplog.at_level(logging.INFO, logger="apps.customers.exports"):
        response = auth_api.get("/api/customers/export/?call_list=1")
        body = b"".join(response.streaming_content).decode("utf-8")
    assert response.status_code == 200
    assert body.splitlines()[0].lstrip("﻿").startswith("نام و نام خانوادگی")
    assert len(body.strip().splitlines()) == 3
    record = next(item for item in caplog.records if item.name == "apps.customers.exports")
    assert record.export["kind"] == "call_list" and record.export["rows"] == 2 and record.export["user"] == "admin"


@pytest.mark.django_db
def test_customer_export_is_logged(auth_api, caplog):
    _buyer(1, 10)
    with caplog.at_level(logging.INFO, logger="apps.customers.exports"):
        response = auth_api.get("/api/customers/export/?population=purchasing")
        b"".join(response.streaming_content)
    record = next(item for item in caplog.records if item.name == "apps.customers.exports")
    assert record.export["kind"] == "customers"
    assert record.export["rows"] == 1
    assert record.export["filters"] == {"population": ["purchasing"]}


# --- Snapshots -------------------------------------------------------------------------------


@pytest.mark.django_db
def test_backfill_rebuild_fills_new_fields_idempotently():
    customer = _buyer(1, 200, 100)
    month = previous_month_keys(_today(), 1)[0]
    CustomerRfmSnapshot.objects.create(month=month, customer=customer, r_score=1, f_score=1, m_score=1, segment="hibernating")

    assert write_snapshot(month) is None  # existing month, no rebuild
    assert write_snapshot(month, rebuild=True) == 1
    assert write_snapshot(month, rebuild=True) == 1
    row = CustomerRfmSnapshot.objects.get(month=month, customer=customer)
    assert CustomerRfmSnapshot.objects.filter(month=month).count() == 1
    assert row.purchase_count == 2 and row.lifetime_amount == 2_000_000
    assert row.purchase_count_12m == 2 and row.amount_12m == 2_000_000
    assert 90 <= row.days_since_last_purchase <= 135  # relative to the month end, not today
    assert row.segment == "attention"  # R3 (91–180 days at month end) × F2, refilled from facts, not the old value
