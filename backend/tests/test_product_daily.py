"""Daily product summaries on synthetic data: totals vs semantics, status rules, stock flags, basket counts."""

from datetime import datetime, time, timedelta
from itertools import count

import pytest
from django.db.models import F, Sum
from django.utils import timezone

from apps.products import daily
from apps.products.models import BasketItemDaily, BasketPairDaily, Category, CentralStock, Product, ProductDailySales, ProductMetrics, Variant
from apps.products.stock import _balances, refresh_central_stock
from apps.sales.models import Order, OrderItem, PosSale, PosSaleItem, SalesLine
from apps.sales.semantics import pos_refund_items, qualifying_online_items, qualifying_pos_items

_ids = count(1000)
TODAY = timezone.localdate()


def _at(days_ago):
    return timezone.make_aware(datetime.combine(TODAY - timedelta(days=days_ago), time(12)))


def _product(category, n):
    product = Product.objects.create(source_id=next(_ids), title=f"کالا {n}")
    product.categories.add(category)
    return product, Variant.objects.create(source_id=next(_ids), product=product, size="M")


def _online(lines, days_ago, status="delivered"):
    order = Order.objects.create(source_id=next(_ids), status=status, total_amount=0, created_at=_at(days_ago))
    for product, variant, quantity, *disc in lines:
        OrderItem.objects.create(source_id=next(_ids), order=order, product=product, variant=variant, quantity=quantity,
                                 amount=100, discount_amount=disc[0] if disc else 0)
    return order


def _pos(lines, days_ago, kind="sell", line=SalesLine.SARI):
    sale = PosSale.objects.create(source_id=next(_ids), store_source_id=3, sales_line=line, type=kind, created_at=_at(days_ago))
    for product, variant, quantity, item_type in lines:
        PosSaleItem.objects.create(source_id=next(_ids), pos_sale=sale, product=product, variant=variant, quantity=quantity, amount=100, type=item_type)
    return sale


@pytest.fixture
def cat(db):
    return Category.objects.create(source_id=1, title="مانتو")


@pytest.mark.django_db
def test_daily_table_matches_semantics_and_is_idempotent(cat):
    p, v = _product(cat, 1)
    _online([(p, v, 2, 10), (p, v, 1)], days_ago=3)
    _online([(p, v, 5)], days_ago=3, status="canceled")
    _pos([(p, v, 3, "sell")], days_ago=2)
    _pos([(p, v, 1, "refund")], days_ago=1, kind="refund")
    for _ in range(2):
        daily.refresh_daily_sales()
    rows = {r.sales_line: r for r in ProductDailySales.objects.filter(variant_id=v.pk, units__gt=0)}
    assert rows["ONLINE"].units == 3 and rows["ONLINE"].revenue == 300 and rows["ONLINE"].discounted_units == 2 and rows["ONLINE"].invoice_count == 1
    total = ProductDailySales.objects.aggregate(u=Sum("units"), n=Sum("net_units"), r=Sum("revenue"))
    amount = lambda qs: qs.aggregate(r=Sum(F("amount") * F("quantity")))["r"]
    assert total["u"] == 6 and total["n"] == 5
    assert total["r"] == amount(qualifying_online_items()) + amount(qualifying_pos_items()) - amount(pos_refund_items())
    assert ProductDailySales.objects.count() == 3  # online, sari sale day, sari return day


@pytest.mark.django_db
def test_status_rules_within_category_and_stock_flags(cat):
    products = [_product(cat, n) for n in range(11)]
    sales = [(15, 15)] + [(2, 6)] + [(3, 3)] * 6 + [(1, 1)] * 2  # (20 days ago, 5 days ago)
    for (p, v), (old, new) in zip(products, sales):
        _online([(p, v, old)], days_ago=20)
        _online([(p, v, new)], days_ago=5)
    stale_p, stale_v = products[10]
    _online([(stale_p, stale_v, 1)], days_ago=40)
    other = Category.objects.create(source_id=2, title="کیف")
    out_p, out_v = _product(other, 99)
    _online([(out_p, out_v, 8)], days_ago=15)
    CentralStock.objects.create(variant_id=products[0][1].pk, product_id=products[0][0].pk, balance=5, fetched_at=timezone.now())
    CentralStock.objects.create(variant_id=out_v.pk, product_id=out_p.pk, balance=0, fetched_at=timezone.now())
    daily.refresh_daily_sales()
    daily.refresh_metrics(as_of=TODAY)
    m = {row.product_id: row for row in ProductMetrics.objects.all()}
    status = [m[p.pk].status for p, _ in products]
    assert status == ["driver", "growth"] + ["normal"] * 6 + ["slow", "slow", "stale"]
    driver = m[products[0][0].pk]
    assert driver.units_28 == 30 and driver.weekly_speed == pytest.approx(10) and driver.trend_pct == 0
    assert driver.category_ratio == pytest.approx(10 / 2)  # median speed 6 units / 3 weeks and driver.units_first14 == 15
    assert driver.stock_flag == "charge"  # 5 < 14 days × 10/7 per day
    assert m[products[1][0].pk].trend_pct == pytest.approx(200)
    assert m[out_p.pk].stock_flag == "out" and m[out_p.pk].status == "normal"  # alone in its category: no percentile status
    assert driver.last_sale_by_line == {"ONLINE": str(TODAY - timedelta(days=5))}


@pytest.mark.django_db
def test_basket_counts_by_product_and_category(cat):
    bags = Category.objects.create(source_id=2, title="کیف")
    (a, va), (b, vb), (c, vc) = _product(cat, 1), _product(cat, 2), _product(bags, 3)
    _online([(a, va, 1), (c, vc, 1)], days_ago=2)
    _online([(a, va, 1), (b, vb, 1), (c, vc, 2)], days_ago=2)
    _pos([(a, va, 1, "sell"), (c, vc, 1, "sell")], days_ago=2)
    daily.refresh_bundles()
    pairs = {(r.channel, r.level, r.a, r.b): r.baskets for r in BasketPairDaily.objects.all()}
    assert pairs[("online", "product", a.pk, c.pk)] == 2 and pairs[("store", "product", a.pk, c.pk)] == 1
    assert pairs[("online", "category", cat.pk, bags.pk)] == 2  # two mantos in one invoice still count one basket
    items = {(r.channel, r.level, r.key): r.baskets for r in BasketItemDaily.objects.all()}
    assert items[("online", "product", 0)] == 2 and items[("online", "category", cat.pk)] == 2 and items[("store", "product", a.pk)] == 1


class _Client:
    def __init__(self, payloads, fail_after=None):
        self.payloads, self.calls, self.fail_after = payloads, 0, fail_after

    def get_product(self, source_id):
        self.calls += 1
        if self.fail_after is not None and self.calls > self.fail_after:
            raise TimeoutError("offline")
        return self.payloads[source_id]


@pytest.mark.django_db
def test_central_stock_refresh_only_recent_sellers_and_stops_on_error(cat):
    (p1, v1), (p2, v2), (old, vold) = _product(cat, 1), _product(cat, 2), _product(cat, 3)
    _online([(p1, v1, 1), (p2, v2, 1)], days_ago=10)
    _online([(old, vold, 1)], days_ago=200)
    daily.refresh_daily_sales()
    payload = lambda v, bal: {"varieties": [{"id": v.source_id, "main_balance": bal}]}
    client = _Client({p1.source_id: payload(v1, 4), p2.source_id: payload(v2, "7")}, fail_after=1)
    report = refresh_central_stock(limit=10, client=client)
    assert report["fetched"] == 1 and report["error"] == "TimeoutError" and client.calls == 2
    assert CentralStock.objects.count() == 1
    client = _Client({p2.source_id: payload(v2, "7")})
    refresh_central_stock(limit=10, client=client)  # p1 is fresh, only p2 is due; the 200-day-old product never is
    assert client.calls == 1 and CentralStock.objects.get(variant_id=v2.pk).balance == 7
    assert _balances({"varieties": [{"id": 1, "main_balance": None}, {"id": 2, "quantity": 3}]}) == {}
