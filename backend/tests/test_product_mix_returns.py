"""Products «سایز و رنگ پرفروش» and «مرجوعی و تعویض شعب» on synthetic data: real POS facts only, «—» when empty."""

import pytest
from django.http import QueryDict

from apps.products import daily
from apps.products.models import Category, Variant
from apps.products.report import returns_breakdown, size_color
from apps.sales.models import SalesLine
from tests.test_product_daily import TODAY, _online, _pos, _product


@pytest.fixture
def shop(db):
    cat = Category.objects.create(source_id=1, title="مانتو")
    (a, va), (b, vb) = _product(cat, 1), _product(cat, 2)
    Variant.objects.filter(pk=va.pk).update(size="m", color_name="مشکی")
    Variant.objects.filter(pk=vb.pk).update(size="", color_name="")
    _pos([(a, va, 10, "sell")], days_ago=3)  # Sari: 10 sold
    _pos([(a, va, 2, "refund")], days_ago=2, kind="refund")  # Sari: 2 returned
    _pos([(a, va, 1, "refund"), (a, va, 1, "sell")], days_ago=2, kind="both")  # Sari: one exchange
    _pos([(b, vb, 5, "sell")], days_ago=3, line=SalesLine.GORGAN)
    _online([(a, va, 4)], days_ago=3)  # online sales never enter the return figures
    daily.refresh_daily_sales()
    daily.refresh_metrics(as_of=TODAY)
    return cat, a, b


def test_returns_cards_branch_rates_and_products(shop, settings):
    settings.HIDDEN_SALES_LINES = "CAPRI"  # production default (tests show every line unless they say otherwise)
    _cat, a, _b = shop
    data = returns_breakdown(QueryDict("period=7"), today=TODAY)
    t = data["totals"]
    assert (t["refund_invoices"], t["exchange_invoices"]) == (1, 1)
    assert t["refunded_units"] == 3 and t["replacement_units"] == 1 and t["refunded_amount"] == 300  # amount 100 a unit
    assert t["sold_units"] == 10 + 1 + 5  # in-store only: online units are not in the denominator
    assert t["rate"] == pytest.approx(3 / 16)
    rows = {row["line"]: row for row in data["branches"]}
    assert set(rows) == {"SARI", "GORGAN"}  # no online row; hidden lines never appear
    assert rows["SARI"]["rate"] == pytest.approx(3 / 11) and rows["GORGAN"]["rate"] == 0
    assert [p["id"] for p in data["products"]] == [a.pk] and data["products"][0]["returned"] == 3  # ≥ 10 sold, has returns


def test_returns_empty_scope_is_dash_not_zero(db):
    data = returns_breakdown(QueryDict("period=7"), today=TODAY)
    assert data["totals"]["rate"] is None and data["totals"]["refunded_amount_share"] is None
    assert data["products"] == [] and all(row["rate"] is None for row in data["branches"])


def test_returns_follow_the_branch_filter_and_ignore_hidden_lines(shop, settings):
    settings.HIDDEN_SALES_LINES = "CAPRI"
    gorgan = returns_breakdown(QueryDict("period=7&lines=GORGAN"), today=TODAY)
    assert [row["line"] for row in gorgan["branches"]] == ["GORGAN"] and gorgan["totals"]["refunded_units"] == 0
    hidden = returns_breakdown(QueryDict("period=7&lines=CAPRI"), today=TODAY)  # hidden by default: dropped, so all lines
    assert hidden["totals"]["refunded_units"] == 3


def test_size_color_shares_skip_blank_variants(shop):
    data = size_color(QueryDict("period=7"), today=TODAY)
    # Net units: product a = 4 online + 10 sold − 2 returned − 1 exchanged back + 1 replacement = 12; product b (no size) = 5.
    assert data["total_units"] == 17
    assert data["sizes"] == [{"label": "M", "units": 12, "share": pytest.approx(12 / 17)}]  # upper-cased, blanks left out
    assert data["colors"][0]["label"] == "مشکی" and data["colors"][0]["units"] == 12
    assert all(s["label"] for s in data["sizes"]) and all(c["label"] for c in data["colors"])
    assert data["no_size_share"] == pytest.approx(5 / 17) and data["no_color_share"] == pytest.approx(5 / 17)
    assert data["categories"] and data["categories"][0]["label"]
