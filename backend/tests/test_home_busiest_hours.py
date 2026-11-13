"""«شلوغ‌ترین ساعت‌ها» heatmap: shape, averaging, the peak cell, the ≥28-day/8-week fallback window, and
HIDDEN_SALES_LINES / branch filtering."""

from datetime import datetime, time, timedelta
from itertools import count

import pytest
from django.utils import timezone

from apps.core import heatmap
from apps.customers.models import Customer
from apps.sales.models import Order, PosSale, PosSaleItem, SalesLine

_ids = count(6000)
NOW = timezone.make_aware(datetime(2026, 11, 14, 12, 0))  # a Saturday


def _customer():
    return Customer.objects.create(source_id=next(_ids), first_name="الف", last_name="ب", mobile=f"0912{next(_ids):07d}")


def _order(customer, amount, at):
    return Order.objects.create(source_id=next(_ids), customer=customer, status="delivered", total_amount=amount, created_at=at)


def _pos(customer, amount, at, line=SalesLine.SARI, quantity=1):
    sale = PosSale.objects.create(source_id=next(_ids), customer=customer, store_source_id=3, sales_line=line, type="sell", created_at=at)
    PosSaleItem.objects.create(source_id=next(_ids), pos_sale=sale, quantity=quantity, amount=amount, type="sell")
    return sale


@pytest.mark.django_db
def test_shape_has_seven_days_and_hours_8_to_23():
    data = heatmap.busiest_hours({}, now=NOW)
    assert [row["weekday"] for row in data["rows"]] == list(range(7))
    assert data["rows"][0]["day"] == "شنبه"
    for row in data["rows"]:
        assert [cell["hour"] for cell in row["cells"]] == list(range(8, 24))


@pytest.mark.django_db
def test_averages_over_the_weekday_occurrences_and_marks_the_peak():
    customer = _customer()
    today = NOW.date()
    # Two Saturdays before today (7 and 14 days earlier) at 18:00, one Sunday at 10:00.
    _order(customer, 1_000_000, timezone.make_aware(datetime.combine(today - timedelta(days=7), time(18, 30))))
    _order(customer, 3_000_000, timezone.make_aware(datetime.combine(today - timedelta(days=14), time(18, 30))))
    _order(customer, 100_000, timezone.make_aware(datetime.combine(today - timedelta(days=6), time(10, 0))))

    data = heatmap.busiest_hours({}, now=NOW)
    saturdays_in_window = heatmap.FALLBACK_DAYS // 7  # 56 days = exactly 8 full weeks
    saturday_18 = next(c for c in data["rows"][0]["cells"] if c["hour"] == 18)
    assert saturday_18["avg_sales"] == (1_000_000 + 3_000_000) // saturdays_in_window
    assert data["peak"] == {"weekday": 0, "day": "شنبه", "hour": 18, "avg_sales": saturday_18["avg_sales"]}


@pytest.mark.django_db
def test_hours_outside_8_to_23_are_dropped():
    customer = _customer()
    today = NOW.date()
    _order(customer, 5_000_000, timezone.make_aware(datetime.combine(today - timedelta(days=1), time(3, 0))))
    data = heatmap.busiest_hours({}, now=NOW)
    assert all(cell["avg_sales"] == 0 for row in data["rows"] for cell in row["cells"])


@pytest.mark.django_db
def test_today_is_always_excluded():
    customer = _customer()
    _order(customer, 9_000_000, NOW.replace(hour=11, minute=0))  # today, would otherwise land in the 11:00 cell
    data = heatmap.busiest_hours({}, now=NOW)
    assert all(cell["avg_sales"] == 0 for row in data["rows"] for cell in row["cells"])


@pytest.mark.django_db
def test_selected_range_of_28_days_or_more_is_used_as_is():
    start, end, is_selected = heatmap.resolve_range({"period": "30"}, now=NOW)
    assert is_selected is True
    assert (NOW.date() - timezone.localtime(start).date()).days == 29
    assert timezone.localtime(end).date() == NOW.date()


@pytest.mark.django_db
def test_shorter_range_falls_back_to_the_last_8_weeks():
    start, end, is_selected = heatmap.resolve_range({"period": "7"}, now=NOW)
    assert is_selected is False
    assert (NOW.date() - timezone.localtime(start).date()).days == heatmap.FALLBACK_DAYS
    assert timezone.localtime(end).date() == NOW.date()


@pytest.mark.django_db
def test_respects_the_branch_filter():
    customer = _customer()
    today = NOW.date()
    at = timezone.make_aware(datetime.combine(today - timedelta(days=1), time(14, 0)))
    _pos(customer, 2_000_000, at, line=SalesLine.SARI)
    _pos(customer, 500_000, at, line=SalesLine.GORGAN)

    all_lines = heatmap.busiest_hours({}, now=NOW)
    sari_only = heatmap.busiest_hours({"line": "SARI"}, now=NOW)
    weekday = heatmap._weekday_index(at)
    cell_all = next(c for c in all_lines["rows"][weekday]["cells"] if c["hour"] == 14)
    cell_sari = next(c for c in sari_only["rows"][weekday]["cells"] if c["hour"] == 14)
    assert cell_all["avg_sales"] > cell_sari["avg_sales"]
    assert cell_sari["avg_sales"] > 0


@pytest.mark.django_db
def test_hidden_sales_lines_are_excluded(settings):
    settings.HIDDEN_SALES_LINES = "CAPRI"
    customer = _customer()
    today = NOW.date()
    at = timezone.make_aware(datetime.combine(today - timedelta(days=1), time(14, 0)))
    _pos(customer, 7_000_000, at, line=SalesLine.CAPRI)
    data = heatmap.busiest_hours({}, now=NOW)
    weekday = heatmap._weekday_index(at)
    cell = next(c for c in data["rows"][weekday]["cells"] if c["hour"] == 14)
    assert cell["avg_sales"] == 0
