from datetime import datetime, time, timedelta

import pytest
from django.db import connection
from django.http import QueryDict
from django.utils import timezone

from apps.customers.models import Customer, CustomerRfm, CustomerRfmSnapshot
from apps.customers.rfm import (
    F_SQL,
    M_SQL,
    R_SQL,
    SEGMENT_ORDER,
    SEGMENT_SQL,
    customer_rfm_payload,
    f_score,
    jalali_month_end,
    jalali_month_key,
    m_score,
    movement_payload,
    previous_month_keys,
    r_score,
    refresh_rfm,
    refresh_rfm_daily,
    rfm_facts_sql,
    rfm_summary,
    segment_for,
    write_snapshot,
    backfill_snapshots,
)
from apps.customers.tiers import _fact_params, _facts_sql
from apps.sales.models import Order, PosSale, PosSaleItem, SalesLine

OPERATOR_MOBILE = "09362506974"


def _today():
    return timezone.localdate()


def _at(days_before, today=None):
    local = datetime.combine(today or _today(), time(12, 0))
    return timezone.make_aware(local, timezone.get_current_timezone()) - timedelta(days=days_before)


def _customer(source_id, mobile=None):
    return Customer.objects.create(
        source_id=source_id,
        first_name="سارا",
        last_name="کریمی",
        mobile=mobile or f"0935{source_id:07d}",
        status="active",
    )


_ids = iter(range(10_000, 99_999))


def _order(customer, *, days, amount=1_000_000, status="delivered"):
    return Order.objects.create(
        source_id=next(_ids), customer=customer, status=status, total_amount=amount, created_at=_at(days)
    )


def _pos(customer, *, days, amount=1_000_000, sales_line=SalesLine.SARI, sale_type="sell"):
    sale = PosSale.objects.create(
        source_id=next(_ids),
        customer=customer,
        store_source_id=3,
        sales_line=sales_line,
        type=sale_type,
        is_cancelled=False,
        created_at=_at(days),
    )
    PosSaleItem.objects.create(source_id=next(_ids), pos_sale=sale, quantity=1, amount=amount, type="sell")
    return sale


def _buyer(source_id, *, count, days, amount_each=1_000_000):
    customer = _customer(source_id)
    for index in range(count):
        _order(customer, days=days + index * 2, amount=amount_each)
    return customer


# --- Scores and segments ---------------------------------------------------------------------


@pytest.mark.parametrize(
    ("days", "expected"),
    [(-3, 5), (0, 5), (30, 5), (31, 4), (90, 4), (91, 3), (180, 3), (181, 2), (365, 2), (366, 1), (2000, 1)],
)
def test_r_score_boundaries(days, expected):
    assert r_score(days) == expected


@pytest.mark.parametrize(("count", "expected"), [(1, 1), (2, 2), (3, 3), (4, 4), (5, 4), (6, 5), (40, 5)])
def test_f_score_boundaries(count, expected):
    assert f_score(count) == expected


@pytest.mark.parametrize(
    ("amount", "expected"),
    [
        (-500_000, 1),
        (0, 1),
        (1_999_999, 1),
        (2_000_000, 2),
        (4_999_999, 2),
        (5_000_000, 3),
        (9_999_999, 3),
        (10_000_000, 4),
        (19_999_999, 4),
        (20_000_000, 5),
    ],
)
def test_m_score_boundaries(amount, expected):
    assert m_score(amount) == expected


EXPECTED_SEGMENTS = {
    5: {5: "champions", 4: "champions", 3: "potential", 2: "potential", 1: "new"},
    4: {5: "champions", 4: "loyal", 3: "potential", 2: "potential", 1: "new"},
    3: {5: "loyal", 4: "loyal", 3: "attention", 2: "attention", 1: "attention"},
    2: {5: "cant_lose", 4: "at_risk", 3: "at_risk", 2: "hibernating", 1: "hibernating"},
    1: {5: "cant_lose", 4: "at_risk", 3: "at_risk", 2: "hibernating", 1: "hibernating"},
}


@pytest.mark.parametrize(("r", "f"), [(r, f) for r in range(1, 6) for f in range(1, 6)])
def test_every_rf_cell_maps_to_one_segment(r, f):
    assert segment_for(r, f) == EXPECTED_SEGMENTS[r][f]


@pytest.mark.django_db
def test_sql_scores_and_segments_match_python():
    grid = [(days, count, amount) for days in (-1, 30, 31, 90, 91, 180, 181, 365, 366) for count in (1, 2, 3, 5, 6) for amount in (0, 2_000_000, 9_999_999, 20_000_000)]
    rows = ", ".join(["(%s::int, %s::int, %s::bigint)"] * len(grid))
    params = [value for row in grid for value in row]
    with connection.cursor() as cursor:
        cursor.execute(
            f"""
            SELECT r, f, m, {SEGMENT_SQL}
            FROM (
                SELECT {R_SQL} AS r, {F_SQL} AS f, {M_SQL} AS m
                FROM (VALUES {rows}) AS facts(days_since_last_purchase, purchase_count, lifetime_purchase_amount)
            ) scored
            """,
            params,
        )
        result = cursor.fetchall()
    expected = [
        (r_score(days), f_score(count), m_score(amount), segment_for(r_score(days), f_score(count)))
        for days, count, amount in grid
    ]
    assert result == expected


# --- Facts -----------------------------------------------------------------------------------


def _rows(sql, params, columns):
    with connection.cursor() as cursor:
        cursor.execute(f"{sql} SELECT customer_id, {', '.join(columns)} FROM facts ORDER BY customer_id", params)
        return cursor.fetchall()


@pytest.mark.django_db
def test_as_of_today_equals_the_tier_facts_and_past_as_of_excludes_later_purchases():
    first = _customer(1)
    _order(first, days=400, amount=3_000_000)
    _order(first, days=100, amount=2_000_000)
    _pos(first, days=10, amount=500_000)
    second = _customer(2)
    _pos(second, days=5, amount=700_000, sales_line=SalesLine.GORGAN)
    _customer(3)

    columns = ["purchase_count", "days_since_last_purchase", "lifetime_purchase_amount"]
    tier_sql, _mobiles = _facts_sql()
    tier = _rows(tier_sql, _fact_params(None), columns)
    current = _rows(*rfm_facts_sql(), columns)
    bounded_today = _rows(*rfm_facts_sql(as_of=_today()), columns)
    assert current == tier == bounded_today

    past = dict((row[0], row[1:]) for row in _rows(*rfm_facts_sql(as_of=_today() - timedelta(days=50)), columns + ["purchase_count_12m", "amount_12m"]))
    assert past[first.pk] == (2, 50, 5_000_000, 2, 5_000_000)
    assert past[second.pk][0] == 0

    window = dict((row[0], row[1:]) for row in _rows(*rfm_facts_sql(), ["purchase_count_12m", "amount_12m"]))
    assert window[first.pk] == (2, 2_500_000)


# --- Refresh and snapshots -------------------------------------------------------------------


@pytest.mark.django_db
def test_refresh_excludes_operators_and_non_purchasers_and_is_idempotent():
    buyer = _buyer(1, count=2, days=10)
    _customer(2)
    desk = _customer(3, mobile=OPERATOR_MOBILE)
    _order(desk, days=3, amount=50_000_000)

    assert refresh_rfm() == 1
    row = CustomerRfm.objects.get()
    assert (row.customer_id, row.r_score, row.f_score, row.m_score, row.segment) == (buyer.pk, 5, 2, 2, "potential")
    first_computed = row.computed_at

    assert refresh_rfm() == 1
    assert CustomerRfm.objects.count() == 1
    assert CustomerRfm.objects.get().computed_at >= first_computed

    Order.objects.filter(customer=buyer).update(status="canceled")
    refresh_rfm()
    assert not CustomerRfm.objects.exists()


@pytest.mark.django_db
def test_snapshot_is_written_once_per_month_and_backfill_is_idempotent():
    _buyer(1, count=1, days=10)
    _buyer(2, count=3, days=200)
    month = previous_month_keys(_today(), 1)[0]

    assert refresh_rfm_daily() is True
    assert CustomerRfmSnapshot.objects.filter(month=month).count() == 2
    assert refresh_rfm_daily() is True
    assert CustomerRfmSnapshot.objects.filter(month=month).count() == 2
    assert write_snapshot(month) is None

    result = backfill_snapshots(3)
    assert result[month] is None
    assert list(result) == list(reversed(previous_month_keys(_today(), 3)))
    total = CustomerRfmSnapshot.objects.count()
    assert backfill_snapshots(3) == {key: None for key in result}
    assert CustomerRfmSnapshot.objects.count() == total


def test_jalali_month_helpers():
    from datetime import date

    assert jalali_month_key(date(2026, 10, 25)) == "1405-08"
    assert jalali_month_end("1405-07") == date(2026, 10, 22)
    assert jalali_month_end("1404-12") == date(2026, 3, 20)
    assert previous_month_keys(date(2026, 10, 25), 2) == ["1405-07", "1405-06"]
    assert previous_month_keys(date(2026, 3, 25), 1) == ["1404-12"]


# --- Summary ---------------------------------------------------------------------------------


@pytest.mark.django_db
def test_summary_counts_filters_and_movement():
    online = _buyer(1, count=6, days=5, amount_each=5_000_000)
    store = _customer(2)
    _pos(store, days=400, sales_line=SalesLine.SARI)
    _customer(3)
    refresh_rfm()

    summary = rfm_summary(QueryDict(""))
    kpis = summary["kpis"]
    assert kpis["purchasing_customers"] == 2
    assert kpis["registered_without_purchase"] == 1
    assert kpis["active_customers_12m"] == 1
    assert kpis["repeat_rate_12m"] == 100.0
    assert sum(segment["count"] for segment in summary["segments"]) == 2
    assert [segment["key"] for segment in summary["segments"]] == list(SEGMENT_ORDER)
    assert len(summary["matrix"]) == 25
    by_key = {segment["key"]: segment for segment in summary["segments"]}
    assert by_key["champions"]["count"] == 1 and by_key["champions"]["high_value_count"] == 1
    assert by_key["hibernating"]["count"] == 1
    assert summary["movement"] is None

    online_only = rfm_summary(QueryDict("sales_line=online"))
    assert online_only["kpis"]["purchasing_customers"] == 1
    assert {s["key"]: s["count"] for s in online_only["segments"]}["champions"] == 1
    sari_only = rfm_summary(QueryDict("sales_line=sari"))
    assert sari_only["kpis"]["purchasing_customers"] == 1

    CustomerRfmSnapshot.objects.create(month="1405-06", customer=online, r_score=2, f_score=5, m_score=5, segment="cant_lose")
    CustomerRfmSnapshot.objects.create(month="1405-07", customer=online, r_score=5, f_score=5, m_score=5, segment="champions")
    CustomerRfmSnapshot.objects.create(month="1405-07", customer=store, r_score=1, f_score=1, m_score=1, segment="hibernating")
    movement = movement_payload()
    assert movement["month"] == "1405-07" and movement["previous_month"] == "1405-06"
    assert movement["moves"] == [
        {"from": "cant_lose", "from_label": "نباید از دست برود", "to": "champions", "to_label": "قهرمانان", "count": 1}
    ]
    assert movement["new_purchasers"] == 1


@pytest.mark.django_db
def test_payment_other_means_purchasers_without_snappay_or_digipay(auth_api):
    plain = _buyer(1, count=1, days=10)
    snapp = _customer(2)
    sale = _pos(snapp, days=10)
    PosSale.objects.filter(pk=sale.pk).update(snappay_cashier_amount=100_000)
    _customer(3)
    refresh_rfm()

    ids = {row["id"] for row in auth_api.get("/api/customers/?payment_method=other").data["results"]}
    assert ids == {plain.source_id}
    assert rfm_summary(QueryDict("payment_method=other"))["kpis"]["purchasing_customers"] == 1
    assert rfm_summary(QueryDict("payment_method=snappay"))["kpis"]["purchasing_customers"] == 1


# --- List, export, 360 -----------------------------------------------------------------------


@pytest.mark.django_db
def test_list_filters_sort_and_row_fields(auth_api):
    champion = _buyer(1, count=6, days=5, amount_each=4_000_000)
    newcomer = _buyer(2, count=1, days=5)
    sleeper = _buyer(3, count=1, days=500)
    refresh_rfm()

    rows = auth_api.get("/api/customers/?rfm_segment=new").data["results"]
    assert [row["id"] for row in rows] == [newcomer.source_id]
    assert rows[0]["rfm_segment_label"] == "تازه‌واردها"
    assert (rows[0]["r_score"], rows[0]["f_score"], rows[0]["m_score"], rows[0]["high_value"]) == (5, 1, 1, False)

    rows = auth_api.get("/api/customers/?r_score=1&f_score=1").data["results"]
    assert [row["id"] for row in rows] == [sleeper.source_id]

    rows = auth_api.get("/api/customers/?sort=rfm").data["results"]
    assert [row["id"] for row in rows] == [champion.source_id, newcomer.source_id, sleeper.source_id]
    assert rows[0]["high_value"] is True


@pytest.mark.django_db
def test_export_honors_rfm_filters(auth_api):
    _buyer(1, count=1, days=5)
    sleeper = _buyer(2, count=1, days=500)
    refresh_rfm()
    response = auth_api.get("/api/customers/export/?rfm_segment=hibernating")
    assert response.status_code == 200
    body = b"".join(response.streaming_content).decode("utf-8")
    assert sleeper.mobile in body
    assert "09350000001" not in body


@pytest.mark.django_db
def test_customer_360_rfm_payload(auth_api):
    single = _buyer(1, count=1, days=20)
    regular = _customer(2)
    for days in (130, 100, 70):
        _order(regular, days=days, amount=3_000_000)
    refresh_rfm()

    one = customer_rfm_payload(single)
    assert one["avg_days_between_purchases"] is None
    assert one["overdue"] is False
    assert one["segment"]["key"] == "new"

    payload = auth_api.get(f"/api/customers/{regular.source_id}/").data["rfm"]
    assert payload["purchase_count"] == 3
    assert payload["avg_days_between_purchases"] == 30.0
    assert payload["days_since_last_purchase"] == 70
    assert payload["overdue"] is True
    assert payload["avg_order_amount"] == 3_000_000
    assert (payload["r_score"], payload["f_score"], payload["m_score"]) == (4, 3, 3)
    assert payload["segment"]["key"] == "potential"

    no_purchase = _customer(3)
    assert auth_api.get(f"/api/customers/{no_purchase.source_id}/").data["rfm"] is None
