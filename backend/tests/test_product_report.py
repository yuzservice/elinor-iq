"""Products page report on synthetic data: ranges and the «—» rule, top 10 vs filtered list, bundle lift and minimums."""

from datetime import date, timedelta

import pytest
from django.http import QueryDict
from rest_framework.test import APIClient

from apps.products import daily
from apps.products.models import Category
from apps.products.report import bundles, comparable, products_summary, products_table, resolve_ranges
from apps.sales.models import SalesLine
from tests.test_product_daily import TODAY, _online, _pos, _product


def test_ranges_and_in_store_history_rule():
    today = date(2026, 11, 10)
    assert resolve_ranges({"period": "7"}, today)[:4] == (date(2026, 11, 4), today, date(2026, 10, 28), date(2026, 11, 3))
    assert resolve_ranges({"period": "30", "compare": "year"}, today)[2] == date(2025, 10, 12)
    assert resolve_ranges({"period": "custom", "from": "2026-10-31", "to": "2026-10-01", "compare": "none"}, today)[:3] == (date(2026, 10, 1), date(2026, 10, 31), None)
    assert comparable(["ONLINE"], date(2025, 1, 1)) and not comparable(["ONLINE", "SARI"], date(2025, 1, 1))  # POS starts 2025-05-31
    assert comparable(["SARI"], date(2025, 5, 31)) and not comparable(["SARI"], None)


@pytest.fixture
def shop(db):
    cat = Category.objects.create(source_id=1, title="مانتو")
    products = [_product(cat, n) for n in range(12)]
    for n, (p, v) in enumerate(products):
        _online([(p, v, n + 1)], days_ago=3)
        _online([(p, v, 1)], days_ago=33)
    _pos([(products[0][0], products[0][1], 2, "sell")], days_ago=2, line=SalesLine.CAPRI)
    daily.refresh_daily_sales()
    daily.refresh_metrics(as_of=TODAY)
    return cat, products


@pytest.mark.django_db
def test_table_top_ten_then_full_list_and_summary(shop):
    cat, products = shop
    top = products_table(QueryDict(""), today=TODAY)
    assert not top["full"] and len(top["results"]) == 10 and top["total"] == 12
    assert top["results"][0]["id"] == products[11][0].pk  # most revenue first
    capri = products_table(QueryDict("lines=CAPRI"), today=TODAY)
    assert capri["full"] and capri["total"] == 1 and capri["results"][0]["lines"]["CAPRI"] == 2
    by_speed = products_table(QueryDict("all=1&sort=speed&dir=asc&page=2"), today=TODAY)
    assert by_speed["full"] and by_speed["total"] == 12 and by_speed["results"] == []  # 12 rows fit page 1 of 20
    summary = products_summary(QueryDict(""), today=TODAY)
    assert summary["sales"]["net_units"] == sum(range(1, 13)) + 2
    assert summary["sales"]["units_change"] == pytest.approx((80 - 12) * 100 / 12)  # one unit each 33 days ago
    assert {b["line"] for b in summary["branches"]} == {"ONLINE", "SARI", "GORGAN", "CAPRI"}


@pytest.mark.django_db
def test_pairs_lift_confidence_and_minimum_baskets(db):
    cat = Category.objects.create(source_id=1, title="مانتو")
    (a, va), (b, vb), (c, vc), (d, vd) = (_product(cat, n) for n in range(4))
    for _ in range(6):
        _online([(a, va, 1), (b, vb, 1)], days_ago=2)
    for _ in range(4):
        _online([(a, va, 1), (c, vc, 1)], days_ago=2)  # only 4 shared baskets: hidden
    for _ in range(10):
        _online([(d, vd, 1)], days_ago=2)
    daily.refresh_bundles()
    result = bundles({"period": "7", "channel": "online"}, today=TODAY)
    assert [(r["a"], r["b"]) for r in result["results"]] == [(b.pk, a.pk)]  # first = the item with fewer baskets
    pair = result["results"][0]
    assert pair["baskets"] == 6 and pair["confidence"] == 1.0
    assert pair["lift"] == pytest.approx(6 * 20 / (10 * 6))  # n_ab × N / (n_a × n_b)
    assert pair["early"] is False  # lift 2 < 3
    assert pair["new"] is True  # no shared basket in the previous 7 days
    assert bundles({"period": "7", "channel": "store"}, today=TODAY)["results"] == []
    one = bundles({"period": "7", "product_id": str(a.pk)}, today=TODAY)["results"][0]
    assert one["a"] == a.pk and one["confidence"] == pytest.approx(6 / 10)


@pytest.mark.django_db
def test_endpoints_need_login_and_answer(shop, auth_api):
    assert APIClient().get("/api/products/summary/").status_code in (401, 403)
    for path in ("summary", "table", "pairs"):
        assert auth_api.get(f"/api/products/{path}/?period=7&status=driver,normal").status_code == 200


@pytest.mark.django_db
def test_stock_off_growth_card_no_stock_fields_and_stock_params_ignored(shop, settings):
    settings.PRODUCTS_STOCK_ENABLED = False
    cat, products = shop
    p, v = products[0]
    _online([(p, v, 2)], days_ago=20)  # 2 units in the earlier 14 days, 3 in the last 14: trend +50%
    daily.refresh_daily_sales()
    daily.refresh_metrics(as_of=TODAY)
    summary = products_summary(QueryDict("stock=charge"), today=TODAY)
    assert summary["stock_enabled"] is False and "charge" not in summary
    assert summary["growth"]["count"] == 1
    top = summary["growth"]["top"][0]
    assert top["id"] == p.pk and top["status"] == "growth" and top["trend"] == pytest.approx(50)
    table = products_table(QueryDict("stock=charge,out"), today=TODAY)  # old saved view: ignored, not an error
    assert not table["full"] and table["total"] == 12
    assert not any(key in table["results"][0] for key in ("stock_flag", "central_stock"))


@pytest.mark.django_db
def test_stock_on_keeps_charge_card(shop, settings):
    settings.PRODUCTS_STOCK_ENABLED = True
    summary = products_summary(QueryDict(""), today=TODAY)
    assert summary["stock_enabled"] is True and "charge" in summary and "growth" not in summary
    assert "stock_flag" in products_table(QueryDict(""), today=TODAY)["results"][0]
