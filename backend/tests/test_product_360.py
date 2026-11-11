"""Product 360 on synthetic data: suggestions only with data, charge need, branch index, buyers, call lists."""

import pytest
from django.utils import timezone

from apps.calls.models import CallList, CallProgram
from apps.customers.metrics import refresh_customer_metrics
from apps.customers.models import Customer
from apps.products import daily
from apps.products.models import Category, CentralStock
from apps.products.product360 import product_detail
from apps.sales.models import Order, OrderItem, PosSale, PosSaleItem, SalesLine
from tests.test_call_center import sync_threads  # noqa: F401  (fixture)
from tests.test_product_daily import TODAY, _at, _ids, _product


def _customer(n):
    return Customer.objects.create(source_id=next(_ids), first_name="الف", last_name=f"ب{n}", mobile=f"0912{n:07d}", status="active")


def _buy(customer, lines, days_ago, line=None):
    if line is None:
        order = Order.objects.create(source_id=next(_ids), customer=customer, status="delivered", total_amount=0, created_at=_at(days_ago))
        for product, variant, quantity in lines:
            OrderItem.objects.create(source_id=next(_ids), order=order, product=product, variant=variant, quantity=quantity, amount=100)
        return
    sale = PosSale.objects.create(source_id=next(_ids), customer=customer, store_source_id=3, sales_line=line, type="sell", created_at=_at(days_ago))
    for product, variant, quantity in lines:
        PosSaleItem.objects.create(source_id=next(_ids), pos_sale=sale, product=product, variant=variant, quantity=quantity, amount=100, type="sell")


@pytest.fixture
def setup(db):
    cat = Category.objects.create(source_id=1, title="مانتو")
    star, sv = _product(cat, 1)
    other, ov = _product(cat, 2)
    buyers = [_customer(n) for n in range(3)]
    prospect = _customer(9)
    for n, c in enumerate(buyers):
        _buy(c, [(star, sv, 4)], days_ago=3 + n, line=SalesLine.SARI)  # all of star's units in Sari
    _buy(buyers[0], [(star, sv, 1)], days_ago=2)  # one online unit, repeat buyer
    _buy(prospect, [(other, ov, 2)], days_ago=10)  # category buyer, never bought star
    _buy(prospect, [(other, ov, 2)], days_ago=11, line=SalesLine.GORGAN)
    CentralStock.objects.create(variant_id=sv.pk, product_id=star.pk, balance=1, fetched_at=timezone.now())
    daily.refresh_daily_sales()
    daily.refresh_bundles()
    daily.refresh_metrics(as_of=TODAY)
    refresh_customer_metrics()  # the buyers list filters on CustomerMetrics.product_ids
    return {"cat": cat, "star": star, "other": other, "buyers": buyers, "prospect": prospect}


@pytest.mark.django_db
def test_detail_kpis_branches_buyers_and_rule_based_tips(setup):
    d = product_detail(setup["star"].pk, {}, today=TODAY)
    assert d["kpis"]["units"] == 13 and d["kpis"]["revenue"] == 1300 and d["kpis"]["revenue_change"] is None  # nothing in the previous 30 days
    sari = next(b for b in d["branches"] if b["line"] == "SARI")
    # Star: 12 of 13 units in Sari; category: 12 of 17 units in Sari → index (12/13) / (12/17).
    assert sari["index"] == pytest.approx((12 / 13) / (12 / 17))
    assert d["buyers"]["buyers"] == 3 and d["buyers"]["repeat_share"] == 1.0  # each bought 4 units
    assert d["prospects"] == 1
    kinds = [t["kind"] for t in d["tips"]]
    assert "prospects" in kinds and "bundle" not in kinds  # no pair with 5 shared baskets: no bundle tip
    assert d["status"] == "normal"  # 2 products in the category: no percentile status; no earlier sales: no trend
    charge = next(t for t in d["tips"] if t["kind"] == "charge")
    assert charge["central"] == 1 and charge["need"] == 26 - 1  # ⌈13 a week / 7 × 14 days⌉ − central stock
    assert charge["needs"] == [{"size": "M", "color": "", "need": 26 - 1}]
    assert product_detail(999999, {}, today=TODAY) is None


@pytest.mark.django_db
def test_call_lists_from_buyers_and_prospects_land_on_a_program(setup, sync_threads, auth_api, django_user_model):  # noqa: F811
    from tests.test_call_center import _user

    manager = _user("boss2", "admin")
    auth_api.force_authenticate(manager)
    response = auth_api.post(f"/api/products/{setup['star'].pk}/call-list/", {"kind": "buyers"}, format="json")
    assert response.status_code == 201
    buyers = CallList.objects.get(pk=response.data["list_id"])
    assert buyers.filter_params == {"products": str(setup["star"].pk)} and buyers.customer_count == 3
    assert CallProgram.objects.get(pk=response.data["program_id"]).list_id == buyers.pk
    response = auth_api.post(f"/api/products/{setup['star'].pk}/call-list/", {"kind": "prospects"}, format="json")
    prospects = CallList.objects.get(pk=response.data["list_id"])
    assert set(prospects.members.values_list("customer_id", flat=True)) == {setup["prospect"].pk}
    assert auth_api.post(f"/api/products/{setup['star'].pk}/call-list/", {"kind": "x"}, format="json").status_code == 400
