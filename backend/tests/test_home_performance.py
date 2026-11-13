"""Daily sales summary equals semantics and the live home path; slow-request logging logs only slow API requests."""

import logging
from datetime import timedelta

import pytest
from django.db.models import F, Sum
from django.http import HttpResponse
from django.test import RequestFactory, override_settings

from apps.core import home
from apps.core.timing import SlowRequestMiddleware
from apps.customers.models import InternalAccount
from apps.sales.daily_summary import refresh_daily_summary
from apps.sales.models import OrderItem, SalesDailySummary, SalesLine
from apps.sales.semantics import online_order_value_orders, qualifying_online_orders, qualifying_pos_items, qualifying_pos_sales
from tests.test_home_summary import NOW, _customer, _ids, _order, _pos


@pytest.fixture
def week(db):
    a, b, desk = _customer(), _customer(), _customer()
    InternalAccount.objects.create(customer=desk, kind="desk", is_active=True)
    for days in (1, 2, 3, 9):
        order = _order(a, 1_000 * days, NOW - timedelta(days=days))
        OrderItem.objects.create(source_id=next(_ids), order=order, quantity=days, amount=1, status=1)
        _pos(b, 100, NOW - timedelta(days=days), line=SalesLine.CAPRI, quantity=2)
    _order(a, 5_555, NOW - timedelta(days=2), status="canceled")
    _order(desk, 700, NOW - timedelta(days=1))
    _order(a, 42, NOW - timedelta(minutes=30))  # today: never stored
    refresh_daily_summary(today=NOW.date())
    return a, b


def test_daily_summary_equals_semantics_and_skips_today(week):
    stored = SalesDailySummary.objects.aggregate(s=Sum("sales"), i=Sum("invoices"), n=Sum("items"))
    before_today = {"created_at__lt": home._day_start(NOW.date())}
    online = online_order_value_orders().filter(**before_today).aggregate(v=Sum("total_amount"))["v"]
    pos = qualifying_pos_items().aggregate(v=Sum(F("amount") * F("quantity")))["v"]
    invoices = qualifying_online_orders().filter(**before_today).count() + qualifying_pos_sales().count()
    assert stored["s"] == online + pos and stored["i"] == invoices and stored["n"] == (1 + 2 + 3 + 9) + 4 * 2
    assert not SalesDailySummary.objects.filter(day=NOW.date()).exists()
    refresh_daily_summary(today=NOW.date())  # idempotent
    assert SalesDailySummary.objects.aggregate(s=Sum("sales"))["s"] == stored["s"]


@pytest.mark.parametrize("params", [{"period": "7"}, {"period": "30", "line": "CAPRI"}, {"period": "custom", "from": "2026-11-01", "to": "2026-11-11"}, {"period": "7", "compare": "none"}])
def test_home_reads_from_the_summary_exactly_like_the_live_path(week, params, monkeypatch):
    stored = home.summary(params, now=NOW)
    monkeypatch.setattr(home, "_summary_until", lambda: None)  # force every day to be read live
    live = home.summary(params, now=NOW)
    assert stored["cards"] == live["cards"] and stored["branches"] == live["branches"] and stored["trend"] == live["trend"]
    assert stored["cards"]["buyers"]["value"] == (2 if params.get("line") != "CAPRI" else 1)  # internal account excluded


def test_split_reads_partial_last_day_live(week):
    start, end = home._day_start(NOW.date() - timedelta(days=6)), NOW
    assert home._split(start, end) == home._day_start(NOW.date())  # stored up to yesterday, today live
    SalesDailySummary.objects.filter(day=NOW.date() - timedelta(days=1)).delete()
    assert home._split(start, end) == home._day_start(NOW.date() - timedelta(days=1))  # the nightly build has not run yet


@override_settings(SLOW_REQUEST_MS=300)
def test_slow_request_log_only_for_slow_api_requests(caplog, monkeypatch):
    clock = iter([0.0, 0.5, 10.0, 10.1, 20.0, 21.0])
    monkeypatch.setattr("apps.core.timing.time.monotonic", lambda: next(clock))
    middleware = SlowRequestMiddleware(lambda request: HttpResponse(status=200))
    factory = RequestFactory()
    with caplog.at_level(logging.WARNING, logger="elinor.timing"):
        middleware(factory.get("/api/home/summary/?period=90&secret=x"))  # 500 ms: logged, without the query string
        middleware(factory.get("/api/home/summary/"))  # 100 ms: not logged
        middleware(factory.get("/static/app.js"))  # slow but not an API request
    messages = [record.getMessage() for record in caplog.records]
    assert messages == ["SLOW_API GET /api/home/summary/ 200 500"]
