"""Sales targets: uniqueness, company sum, Jalali periods (Esfand, leap years), pace, forecast, copy-from-last-year, API roles."""

from datetime import date, datetime, time

import jdatetime
import pytest
from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.utils import timezone
from rest_framework.test import APIClient

from apps.sales.models import Order, SalesTarget, SalesTargetChange
from apps.sales.semantics import ALL_SALES_LINES as LINES
from apps.sales.targets import copy_preview, line_status, period_bounds, progress, save_cells


def _g(jy, jm, jd):
    return jdatetime.date(jy, jm, jd).togregorian()


def _now(jy, jm, jd, hour=12):
    return timezone.make_aware(datetime.combine(_g(jy, jm, jd), time(hour)))


def _set(year, month, amounts):
    for line, amount in zip(LINES, amounts):
        if amount is not None:
            SalesTarget.objects.create(year=year, month=month, sales_line=line, amount=amount)


def _user(role="manager", name="boss"):
    return get_user_model().objects.create_user(username=name, password="secret-pass", role=role)


def test_jalali_period_bounds_including_esfand_and_leap_years():
    start, end, months, _ = period_bounds("month", _g(1405, 8, 21))
    assert (start, end) == (_g(1405, 8, 1), _g(1405, 8, 30)) and months == [(1405, 8)]
    start, end, months, label = period_bounds("quarter", _g(1405, 8, 21))
    assert (start, end, months) == (_g(1405, 7, 1), _g(1405, 9, 30), [(1405, 7), (1405, 8), (1405, 9)]) and label.startswith("پاییز")
    start, end, _, _ = period_bounds("quarter", _g(1403, 12, 5))  # winter of a leap year ends on Esfand 30
    assert end == _g(1403, 12, 30) and (end - start).days + 1 == 30 + 30 + 30
    start, end, _, _ = period_bounds("year", _g(1404, 12, 29))
    assert (end - start).days + 1 == 365 and end == _g(1404, 12, 29)
    start, end, _, _ = period_bounds("year", _g(1403, 1, 1))
    assert (end - start).days + 1 == 366
    assert period_bounds("month", _g(1404, 12, 10))[1] == _g(1404, 12, 29)


@pytest.mark.django_db
def test_target_unique_per_month_and_line():
    SalesTarget.objects.create(year=1405, month=8, sales_line="ONLINE", amount=1)
    with pytest.raises(IntegrityError):
        SalesTarget.objects.create(year=1405, month=8, sales_line="ONLINE", amount=2)


@pytest.mark.django_db
def test_month_progress_pace_forecast_required_daily_and_company_sum():
    _set(1405, 8, [3000, 1200, 600, 200])  # company target 5000
    actual = {"ONLINE": 2400, "SARI": 600, "GORGAN": 300, "CAPRI": 0}
    p = progress("month", now=_now(1405, 8, 20), actuals=actual)  # day 20 of 30
    assert (p["elapsed_days"], p["total_days"], p["remaining_days"]) == (20, 30, 10)
    assert p["expected_pct"] == pytest.approx(200 / 3)
    c = p["company"]
    assert c["target"] == 5000 and c["actual"] == 3300 and c["pct"] == pytest.approx(66)
    assert c["pace"] == "behind" and c["gap"] == pytest.approx(66 - 200 / 3)
    assert c["forecast"] == pytest.approx(3300 * 30 / 20) and c["avg_daily"] == pytest.approx(165)
    assert c["required_daily"] == pytest.approx((5000 - 3300) / 10)
    status = {row["line"]: row["status"] for row in p["lines"]}
    assert status == {"ONLINE": "ahead", "SARI": "behind", "GORGAN": "behind", "CAPRI": "behind"}


def test_line_status_thresholds():
    assert [line_status(g) for g in (3, 2.9, 0, -3, -3.1, None)] == ["ahead", "on_plan", "on_plan", "on_plan", "behind", None]


@pytest.mark.django_db
def test_empty_state_partial_lines_and_partial_quarter():
    zero = dict.fromkeys(LINES, 0)
    assert progress("month", now=_now(1405, 8, 5), actuals=zero)["company"] is None
    _set(1405, 8, [1000, None, None, None])
    p = progress("month", now=_now(1405, 8, 5), actuals={**zero, "ONLINE": 100, "SARI": 999})
    assert p["company"]["target"] == 1000 and p["company"]["actual"] == 100  # only lines with a target are added up
    assert p["company"]["lines_included"] == ["ONLINE"]
    assert [row["target"] for row in p["lines"]] == [1000, None, None, None]
    # Quarter: a line needs a target in every month of the season; Mehr and Azar are missing.
    assert progress("quarter", now=_now(1405, 8, 5), actuals=zero)["company"] is None
    _set(1405, 7, [1000, None, None, None])
    _set(1405, 9, [1000, None, None, None])
    q = progress("quarter", now=_now(1405, 8, 5), actuals={**zero, "ONLINE": 1500})
    assert q["company"]["target"] == 3000 and q["elapsed_days"] == 30 + 5 and q["total_days"] == 90


@pytest.mark.django_db
def test_last_day_of_year_has_no_required_daily():
    for month in range(1, 13):
        _set(1404, month, [100, None, None, None])
    p = progress("year", now=_now(1404, 12, 29), actuals={**dict.fromkeys(LINES, 0), "ONLINE": 1000})
    assert p["remaining_days"] == 0 and p["company"]["required_daily"] is None
    assert p["company"]["forecast"] == pytest.approx(1000)


@pytest.mark.django_db
def test_copy_from_last_year_uses_targets_then_sales_and_skips_incomplete_history():
    SalesTarget.objects.create(year=1404, month=8, sales_line="SARI", amount=1_000_000_000)
    Order.objects.create(source_id=1, status="delivered", total_amount=2_340_000_000, created_at=_now(1404, 8, 3))
    Order.objects.create(source_id=2, status="canceled", total_amount=9_000_000_000, created_at=_now(1404, 8, 3))
    preview = copy_preview(1405, 10)
    cells = {(c["month"], c["sales_line"]): c for c in preview["cells"]}
    assert cells[(8, "SARI")]["source"] == "target" and cells[(8, "SARI")]["amount"] == 1_100_000_000
    assert cells[(8, "ONLINE")]["source"] == "sales" and cells[(8, "ONLINE")]["amount"] == 2_574_000_000  # 2.34B × 1.1
    assert cells[(8, "GORGAN")]["amount"] is None  # no sales last year: left empty
    assert cells[(1, "SARI")]["source"] == "incomplete" and cells[(1, "SARI")]["amount"] is None  # 1404/01 is before POS history
    assert SalesTarget.objects.filter(year=1405).count() == 0  # preview never saves


@pytest.mark.django_db
def test_save_cells_audits_only_changes_and_clears():
    user = _user()
    assert save_cells(user, 1405, [{"month": 8, "sales_line": "ONLINE", "amount": 500}]) == 1
    assert save_cells(user, 1405, [{"month": 8, "sales_line": "ONLINE", "amount": 500}]) == 0  # unchanged: no audit row
    assert save_cells(user, 1405, [{"month": 8, "sales_line": "ONLINE", "amount": None}]) == 1
    assert not SalesTarget.objects.exists()
    assert list(SalesTargetChange.objects.order_by("id").values_list("old_amount", "new_amount", "source")) == [(None, 500, "manual"), (500, None, "clear")]
    with pytest.raises(ValueError):
        save_cells(user, 1405, [{"month": 13, "sales_line": "ONLINE", "amount": 1}])


@pytest.mark.django_db
def test_targets_api_roles_and_home_endpoint():
    analyst, manager = _user("analyst", "a1"), _user("manager", "m1")
    client = APIClient(HTTP_HOST="localhost")
    client.force_authenticate(analyst)
    assert client.get("/api/sales/targets/?year=1405").status_code == 403
    assert client.get("/api/home/targets/?scope=month").json()["can_edit"] is False
    client.force_authenticate(manager)
    response = client.put("/api/sales/targets/", {"year": 1405, "cells": [{"month": 8, "sales_line": "ONLINE", "amount": 7}]}, format="json")
    assert response.status_code == 200 and response.json()["months"][7]["lines"]["ONLINE"] == 7
    assert client.get("/api/sales/targets/copy-preview/?year=1405&growth=10").status_code == 200
    assert client.get("/api/sales/targets/copy-preview/?year=1405&growth=900").status_code == 400
