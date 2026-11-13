"""settings.HIDDEN_SALES_LINES: hidden lines leave every report, data and the tier engine stay untouched (decision 0010)."""

from datetime import datetime, timedelta
from itertools import count

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from apps.customers.metrics import refresh_customer_metrics
from apps.customers.models import Customer, CustomerMetrics, CustomerTierHistory
from apps.customers.tiers import refresh_stored_tiers
from apps.sales.kpis import compute_overview_kpis, parse_branch_filter
from apps.sales.models import Order, PosSale, PosSaleItem, SalesLine
from apps.sales.semantics import (
    hidden_sales_lines,
    parse_hidden_sales_lines,
    parse_sales_line_filter,
    sales_line_label,
    visible_pos_items,
    visible_sales_lines,
)
from apps.sales.targets import net_sales_by_line

_ids = count(91000)
NOW = timezone.now()
START, END = NOW - timedelta(days=5), NOW + timedelta(minutes=1)


def _customer():
    n = next(_ids)
    return Customer.objects.create(source_id=n, first_name="الف", last_name="ب", mobile=f"0912{n:07d}")


def _pos(customer, amount, line, at=None, quantity=1):
    sale = PosSale.objects.create(source_id=next(_ids), customer=customer, store_source_id=4, sales_line=line, type="sell",
                                  created_at=at or NOW - timedelta(days=1))
    PosSaleItem.objects.create(source_id=next(_ids), pos_sale=sale, quantity=quantity, amount=amount, type="sell")
    return sale


@pytest.fixture
def data(db):
    a, b = _customer(), _customer()
    Order.objects.create(source_id=next(_ids), customer=a, status="delivered", total_amount=1_000_000, created_at=NOW - timedelta(days=1))
    _pos(a, 200_000, SalesLine.SARI, quantity=2)
    _pos(b, 300_000, SalesLine.CAPRI)
    return a, b


@pytest.fixture
def client(db):
    user = get_user_model().objects.create_user(username="boss", password="secret-pass", role="super_admin")
    api = APIClient()
    api.force_login(user)
    return api


def test_setting_parsing():
    assert parse_hidden_sales_lines("CAPRI") == {"CAPRI"}
    assert parse_hidden_sales_lines(" capri , gorgan,") == {"CAPRI", "GORGAN"}
    assert parse_hidden_sales_lines("") == frozenset()
    assert parse_hidden_sales_lines(None) == frozenset()
    assert parse_hidden_sales_lines("FOO,BAR") == frozenset()  # unknown codes ignored
    # ONLINE can never be hidden, so hiding "everything" still leaves a line
    assert parse_hidden_sales_lines("ONLINE,SARI,GORGAN,CAPRI") == {"SARI", "GORGAN", "CAPRI"}


def test_visible_lines_follow_the_setting(settings):
    settings.HIDDEN_SALES_LINES = "CAPRI"
    assert visible_sales_lines() == ("ONLINE", "SARI", "GORGAN")
    settings.HIDDEN_SALES_LINES = ""
    assert visible_sales_lines() == ("ONLINE", "SARI", "GORGAN", "CAPRI")
    settings.HIDDEN_SALES_LINES = "ONLINE,SARI,GORGAN,CAPRI"
    assert visible_sales_lines() == ("ONLINE",)


def test_totals_exclude_the_hidden_line_and_empty_setting_restores_them(settings, data):
    settings.HIDDEN_SALES_LINES = ""
    old = compute_overview_kpis(START, END)
    old_lines = net_sales_by_line(START, END)
    assert old["gross_sales"] == 1_000_000 + 400_000 + 300_000 and old["order_count"] == 3
    assert old_lines == {"ONLINE": 1_000_000, "SARI": 400_000, "GORGAN": 0, "CAPRI": 300_000}

    settings.HIDDEN_SALES_LINES = "CAPRI"
    new = compute_overview_kpis(START, END)
    assert new["gross_sales"] == 1_400_000 and new["order_count"] == 2 and new["items_sold"] == 2
    assert net_sales_by_line(START, END) == {"ONLINE": 1_000_000, "SARI": 400_000, "GORGAN": 0}
    assert visible_pos_items().count() == 1
    assert PosSale.objects.filter(sales_line=SalesLine.CAPRI).count() == 1  # data is kept

    settings.HIDDEN_SALES_LINES = ""
    assert compute_overview_kpis(START, END) == old


def test_hidden_line_params_are_dropped(settings, data, client):
    settings.HIDDEN_SALES_LINES = "CAPRI"
    assert parse_branch_filter("CAPRI") == []  # = all visible lines
    assert parse_branch_filter("SARI,CAPRI") == ["SARI"]
    assert parse_sales_line_filter("CAPRI") is None

    home = client.get("/api/home/summary/", {"period": "7", "line": "CAPRI"}).json()
    assert [row["line"] for row in home["branches"]] == ["ONLINE", "SARI", "GORGAN"]
    targets = client.get("/api/home/targets/", {"line": "CAPRI"}).json()
    assert [row["line"] for row in targets["lines"]] == ["ONLINE", "SARI", "GORGAN"]
    options = client.get("/api/sales/filters/").json()
    assert [row["key"] for row in options["branches"]] == ["ONLINE", "SARI", "GORGAN"]
    me = client.get("/api/auth/me/").json()
    assert me["visible_sales_lines"] == ["ONLINE", "SARI", "GORGAN"] and me["features"] == {"pulse": True}

    settings.HIDDEN_SALES_LINES = ""
    assert parse_branch_filter("CAPRI") == ["CAPRI"]
    assert client.get("/api/auth/me/").json()["visible_sales_lines"] == ["ONLINE", "SARI", "GORGAN", "CAPRI"]


def test_customer_history_keeps_hidden_rows_under_a_generic_label(settings):
    settings.HIDDEN_SALES_LINES = "CAPRI"
    assert sales_line_label("CAPRI") == "فروشگاه حضوری"
    assert sales_line_label("SARI") == "ساری"
    settings.HIDDEN_SALES_LINES = ""
    assert sales_line_label("CAPRI") == "کاپری"


def test_tier_engine_and_customer_metrics_ignore_the_setting(settings, data, client):
    settings.HIDDEN_SALES_LINES = ""
    refresh_customer_metrics()
    refresh_stored_tiers()
    metrics_before = list(CustomerMetrics.objects.order_by("customer_id").values())
    tiers_before = list(Customer.objects.order_by("pk").values_list("pk", "tier_code"))
    history_before = CustomerTierHistory.objects.count()

    settings.HIDDEN_SALES_LINES = "CAPRI"
    assert hidden_sales_lines() == {"CAPRI"}
    refresh_customer_metrics()
    refresh_stored_tiers()
    for path in ("/api/home/summary/", "/api/customers/overview/", "/api/customers/", "/api/sales/summary/"):
        assert client.get(path).status_code == 200, path

    assert CustomerTierHistory.objects.count() == history_before  # 0 new tier-history rows
    assert list(Customer.objects.order_by("pk").values_list("pk", "tier_code")) == tiers_before
    after = list(CustomerMetrics.objects.order_by("customer_id").values())
    assert [{k: v for k, v in row.items() if k != "updated_at"} for row in after] == \
        [{k: v for k, v in row.items() if k != "updated_at"} for row in metrics_before]
