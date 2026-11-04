from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APIClient

from apps.calls import forms
from apps.calls.models import CallLog, CallProgram, CallTag, CallTask, CustomerCallStatus, CustomerCallTag
from apps.customers.metrics import refresh_customer_metrics
from apps.customers.models import Customer, CustomerMetrics, InternalAccount
from apps.customers.tiers import metrics_for_customers
from apps.sales.models import Order, OrderItem, PosSale, PosSaleItem, SalesLine

_ids = iter(range(600_000, 699_999))


@pytest.fixture(autouse=True)
def _clear_cache():
    cache.clear()
    yield
    cache.clear()


def _customer(n, **extra):
    return Customer.objects.create(source_id=n, first_name="الف", last_name=f"ب{n}", mobile=f"0912{n:07d}", status="active", **extra)


def _order(customer, amount=1_000_000, days=5, status="delivered"):
    return Order.objects.create(source_id=next(_ids), customer=customer, status=status, total_amount=amount, created_at=timezone.now() - timedelta(days=days))


def _pos(customer, items=((1, 500_000, "sell"),), kind="sell", days=3, line=SalesLine.SARI):
    sale = PosSale.objects.create(source_id=next(_ids), customer=customer, store_source_id=3, sales_line=line, type=kind, created_at=timezone.now() - timedelta(days=days))
    for quantity, amount, item_type in items:
        PosSaleItem.objects.create(source_id=next(_ids), pos_sale=sale, quantity=quantity, amount=amount, type=item_type)
    return sale


@pytest.mark.django_db
def test_metrics_match_tier_amounts_and_are_idempotent():
    both, online_only, none, refund_only = _customer(1), _customer(2), _customer(3), _customer(4)
    _order(both, 2_000_000, days=20)
    _order(both, 999, status="canceled")
    _pos(both, items=((2, 300_000, "sell"),), days=2)
    _pos(both, items=((1, 100_000, "refund"),), kind="refund", days=1)
    _order(online_only, 700_000)
    _pos(refund_only, items=((1, 50_000, "refund"),), kind="refund")

    assert refresh_customer_metrics() == 4
    assert refresh_customer_metrics() == 0  # nothing changed, nothing rewritten

    row = CustomerMetrics.objects.get(customer=both)
    tier = metrics_for_customers([both.pk])[both.pk]
    assert row.total_amount == tier["lifetime_purchase_amount"] == 2_500_000
    assert (row.invoice_count, row.avg_basket, row.channel) == (2, 1_250_000, "both")
    assert row.last_purchase_at > row.first_purchase_at
    assert CustomerMetrics.objects.get(customer=online_only).channel == "online"
    empty = CustomerMetrics.objects.get(customer=none)
    assert (empty.invoice_count, empty.total_amount, empty.avg_basket, empty.channel) == (0, 0, None, "none")
    refund = CustomerMetrics.objects.get(customer=refund_only)
    assert (refund.invoice_count, refund.total_amount, refund.avg_basket) == (0, -50_000, None)  # zero invoices: no division


# --- List API ----------------------------------------------------------------------------------


def _rows(client, query):
    response = client.get(f"/api/customers/?{query}")
    assert response.status_code == 200, response.data
    return [row["id"] for row in response.data["results"]]


@pytest.fixture
def three(db):
    a, b, c = _customer(1, tier_code="VIP"), _customer(2, tier_code="SILVER"), _customer(3)
    _order(a, 9_000_000, days=200)
    _order(a, 1_000_000, days=100)
    _pos(b, items=((1, 3_000_000, "sell"),), days=2)
    refresh_customer_metrics()
    return a, b, c


@pytest.mark.django_db
@pytest.mark.parametrize(
    "sort,asc,desc",
    [
        ("avg_basket", [2, 1, 3], [1, 2, 3]),
        ("invoice_count", [3, 2, 1], [1, 2, 3]),
        ("total_amount", [3, 2, 1], [1, 2, 3]),
        ("last_purchase", [1, 2, 3], [2, 1, 3]),
        ("first_purchase", [1, 2, 3], [2, 1, 3]),
        ("tier", [1, 2, 3], [2, 1, 3]),
        ("name", [1, 2, 3], [3, 2, 1]),
    ],
)
def test_every_sort_both_directions_nulls_last(auth_api, three, sort, asc, desc):
    assert _rows(auth_api, f"sort={sort}&dir=asc") == asc
    assert _rows(auth_api, f"sort={sort}&dir=desc") == desc


@pytest.mark.django_db
def test_payload_new_fields_and_metric_filters(auth_api, three):
    row = auth_api.get("/api/customers/?sort=name&dir=asc").data["results"][0]
    assert (row["invoice_count"], row["total_amount"], row["avg_basket"]) == (2, 10_000_000, 5_000_000)
    assert row["last_invoice_at"] is not None
    assert _rows(auth_api, "min_avg_basket=4000000&sort=name&dir=asc") == [1]
    assert _rows(auth_api, "max_avg_basket=4000000&sort=name&dir=asc") == [2]
    assert _rows(auth_api, "min_invoices=2&sort=name&dir=asc") == [1]
    assert _rows(auth_api, "min_total=5000000&sort=name&dir=asc") == [1]
    assert _rows(auth_api, "channels=physical,both&sort=name&dir=asc") == [2]
    assert _rows(auth_api, "last_days=30&sort=name&dir=asc") == [2]
    assert _rows(auth_api, "last_days=gt90&sort=name&dir=asc") == [1]
    assert _rows(auth_api, "tier=VIP,SILVER&sort=name&dir=asc") == [1, 2]
    assert _rows(auth_api, "ids=2,3&sort=name&dir=asc") == [2, 3]


@pytest.mark.django_db
def test_old_filter_params_return_the_same_customers(auth_api, three):
    """Saved CallList.filter_params use these names, with no dir."""
    a, b, _c = three
    Customer.objects.filter(pk=a.pk).update(order_count=2)
    from apps.calls.lists import filtered_customer_ids

    for params, expected in (
        ({"population": "purchasing"}, {a.pk, b.pk}),
        ({"population": "registered"}, {_c.pk}),
        ({"tier": "VIP"}, {a.pk}),
        ({"channel": "online"}, {a.pk}),
        ({"channel": "physical"}, {b.pk}),
        ({"min_amount": "5000000"}, {a.pk}),
        ({"min_purchases": "2"}, {a.pk}),
        ({"sales_lines": "sari"}, {b.pk}),
        ({"sort": "lifetime_amount", "population": "purchasing"}, {a.pk, b.pk}),
    ):
        assert set(filtered_customer_ids(params).values_list("pk", flat=True)) == expected, params
    assert _rows(auth_api, "sort=lifetime_amount") == [1, 2, 3]  # old sort value, no dir


@pytest.mark.django_db
def test_call_filters(auth_api, three):
    a, b, _c = three
    agent = get_user_model().objects.create_user(username="ag", password="secret-pass", role="sales_agent")
    program = CallProgram.objects.create(name="پ", status="active")
    form = forms.save_draft(program, {"outcomes": []})
    tag = CallTag.objects.get(title="فرصت فروش")
    task = CallTask.objects.create(program=program, customer=a, assignee=agent, due_at=timezone.now(), status="done")
    log = CallLog.objects.create(task=task, customer=a, agent=agent, program=program, form_version=form, outcome_id="o", outcome_title="علاقه‌مند", created_at=timezone.now())
    CustomerCallStatus.objects.create(customer=a, last_outcome_title="علاقه‌مند", last_call_at=timezone.now())
    CustomerCallStatus.objects.create(customer=b, do_not_call=True)
    CustomerCallTag.objects.create(customer=a, tag=tag, program=program, log=log, tagged_at=timezone.now())
    assert _rows(auth_api, "call_result=علاقه‌مند&sort=name&dir=asc") == [1]
    assert _rows(auth_api, "call_result=none&sort=name&dir=asc") == [2, 3]
    assert _rows(auth_api, f"call_tag={tag.pk}&sort=name&dir=asc") == [1]
    assert _rows(auth_api, "do_not_call=yes&sort=name&dir=asc") == [2]
    assert _rows(auth_api, "do_not_call=no&sort=name&dir=asc") == [1, 3]
    assert auth_api.get("/api/customers/list-options/").data["call_results"] == ["علاقه‌مند"]


@pytest.mark.django_db
def test_summary_matches_list_and_excludes_internal(auth_api, three):
    a, b, c = three
    staff = _customer(4)
    _order(staff, 50_000_000)
    refresh_customer_metrics()
    InternalAccount.objects.create(customer=staff, kind="staff")
    query = "sort=name&dir=asc"
    assert _rows(auth_api, query) == [1, 2, 3]  # internal account out
    summary = auth_api.get(f"/api/customers/list-summary/?{query}").data
    assert summary["count"] == auth_api.get(f"/api/customers/?{query}").data["total"] == 3
    assert summary["total_amount"] == 13_000_000
    assert summary["avg_basket"] == 4_333_333
    assert summary["avg_invoice_count"] == 1.0
    assert summary["share"] == 100.0

    filtered = auth_api.get("/api/customers/list-summary/?min_invoices=2&sort=name&dir=asc").data
    assert filtered["count"] == auth_api.get("/api/customers/?min_invoices=2&sort=name&dir=asc").data["total"] == 1
    assert filtered["avg_basket"] == 5_000_000
    assert filtered["share"] == pytest.approx(33.3)
    assert filtered["baseline"]["avg_basket"] == 4_333_333
    empty = auth_api.get("/api/customers/list-summary/?min_invoices=99").data
    assert (empty["count"], empty["avg_basket"], empty["avg_invoice_count"]) == (0, None, None)


@pytest.mark.django_db
def test_sales_agent_is_blocked(db):
    agent = get_user_model().objects.create_user(username="ag", password="secret-pass", role="sales_agent")
    client = APIClient()
    client.force_login(agent)
    for path in ("/api/customers/list-summary/", "/api/customers/list-options/", "/api/customers/"):
        assert client.get(path).status_code == 403


@pytest.mark.django_db
def test_saved_views_are_per_user_with_unique_names(auth_api):
    created = auth_api.post("/api/customers/list-views/", {"name": "طلایی", "filters": {"tier": "GOLD_1"}}, format="json")
    assert created.status_code == 201
    assert auth_api.post("/api/customers/list-views/", {"name": "طلایی", "filters": {}}, format="json").status_code == 409
    assert auth_api.post("/api/customers/list-views/", {"name": " ", "filters": {}}, format="json").status_code == 400

    other = APIClient()
    other.force_login(get_user_model().objects.create_user(username="other", password="secret-pass", role="admin"))
    assert other.get("/api/customers/list-views/").data["results"] == []
    assert other.delete(f"/api/customers/list-views/{created.data['id']}/").status_code == 404
    assert other.post("/api/customers/list-views/", {"name": "طلایی", "filters": {}}, format="json").status_code == 201
    assert auth_api.get("/api/customers/list-views/").data["results"][0]["filters"] == {"tier": "GOLD_1"}
    assert auth_api.delete(f"/api/customers/list-views/{created.data['id']}/").status_code == 204


@pytest.mark.django_db
def test_facet_filters_and_options(auth_api):
    from apps.customers.models import CustomerAddress
    from apps.products.models import Category, Product, Variant

    category = Category.objects.create(source_id=1, title="مانتو")
    product = Product.objects.create(source_id=1, title="کالا")
    product.categories.add(category)
    variant = Variant.objects.create(source_id=1, product=product, size="m")
    a, b, c = _customer(1), _customer(2), _customer(3)
    order = _order(a, 1_000_000)
    Order.objects.filter(pk=order.pk).update(discount_amount=100, receiver_city=" ساری ")
    OrderItem.objects.create(source_id=next(_ids), order=order, product=product, variant=variant, quantity=1, amount=1)
    sale = _pos(b, line=SalesLine.GORGAN)
    PosSale.objects.filter(pk=sale.pk).update(snappay_cashier_amount=5)
    CustomerAddress.objects.create(source_id=9, customer=b, city_name="گرگان")
    refresh_customer_metrics()
    query = "&sort=name&dir=asc"
    assert _rows(auth_api, "branches=GORGAN" + query) == [2]
    assert _rows(auth_api, "branches=GORGAN,ONLINE" + query) == [1, 2]
    assert _rows(auth_api, "payments=snappay" + query) == [2]
    assert _rows(auth_api, "sizes=M" + query) == [1]
    assert _rows(auth_api, "categories=مانتو" + query) == [1]
    assert _rows(auth_api, "cities=ساری" + query) == [1]
    assert _rows(auth_api, "cities=گرگان,ساری" + query) == [1, 2]
    assert _rows(auth_api, "discount=yes" + query) == [1]
    assert _rows(auth_api, "discount=no" + query) == [2]  # purchasers only; 3 has no purchase
    options = auth_api.get("/api/customers/list-options/").data
    assert options["sizes"] == ["M"] and options["categories"] == ["مانتو"] and set(options["cities"]) == {"ساری", "گرگان"}


# --- Filter v2: geo, products, profile, tier change ------------------------------------------------


@pytest.fixture
def geo(db):
    from apps.customers.models import City, CustomerAddress, Province

    maz, gol = Province.objects.create(source_id=1, name="مازندران"), Province.objects.create(source_id=2, name="گلستان")
    sari, babol = City.objects.create(source_id=1, province=maz, name="ساری"), City.objects.create(source_id=2, province=maz, name="بابل")
    gorgan = City.objects.create(source_id=3, province=gol, name="گرگان")
    a, b, c = _customer(1), _customer(2), _customer(3)
    CustomerAddress.objects.create(source_id=1, customer=a, city=sari, city_name="ساری")
    CustomerAddress.objects.create(source_id=2, customer=b, city=gorgan, city_name="گرگان")
    refresh_customer_metrics()
    return {"maz": maz, "gol": gol, "sari": sari, "babol": babol, "gorgan": gorgan, "customers": (a, b, c)}


@pytest.mark.django_db
def test_province_and_city_filters_match_the_old_city_names(auth_api, geo):
    query = "&sort=name&dir=asc"
    assert _rows(auth_api, f"provinces={geo['maz'].pk}" + query) == [1]
    assert _rows(auth_api, f"provinces={geo['maz'].pk},{geo['gol'].pk}" + query) == [1, 2]
    assert _rows(auth_api, f"city_ids={geo['gorgan'].pk}" + query) == [2]
    assert _rows(auth_api, "cities=گرگان" + query) == _rows(auth_api, f"city_ids={geo['gorgan'].pk}" + query)  # old name param


@pytest.mark.django_db
def test_geo_options_are_dependent_counted_and_zero_last(auth_api, geo):
    options = auth_api.get("/api/customers/list-options/").data
    provinces = {row["name"]: row["count"] for row in options["provinces"]}
    assert provinces == {"مازندران": 1, "گلستان": 1}
    cities = options["cities_by_id"]
    assert [row["name"] for row in cities][-1] == "بابل"  # zero customers last
    assert {row["name"] for row in cities if row["province_id"] == geo["maz"].pk} == {"ساری", "بابل"}
    assert options["fill_rates"]["address"] == pytest.approx(66.7)


@pytest.mark.django_db
def test_birth_month_jalali_stored_and_gregorian(auth_api):
    from datetime import date

    stored = _customer(1, birth_date=date(1378, 12, 29))  # synced Jalali date: Esfand
    farvardin = _customer(2, birth_date=date(2000, 3, 21))  # Gregorian 1379/01/02
    esfand = _customer(3, birth_date=date(2000, 3, 19))  # Gregorian 1378/12/29
    _customer(4)
    refresh_customer_metrics()
    assert CustomerMetrics.objects.get(customer=stored).birth_month == 12
    assert CustomerMetrics.objects.get(customer=farvardin).birth_month == 1
    assert CustomerMetrics.objects.get(customer=esfand).birth_month == 12
    assert _rows(auth_api, "birth_months=12&sort=name&dir=asc") == [1, 3]
    assert _rows(auth_api, "birth_months=1,12&sort=name&dir=asc") == [1, 2, 3]


@pytest.mark.django_db
def test_gender_joined_and_products(auth_api):
    from apps.products.models import Product

    a = _customer(1, gender="female", created_at_source=timezone.now() - timedelta(days=400))
    b = _customer(2, gender="male", created_at_source=timezone.now() - timedelta(days=10))
    shoe, bag = Product.objects.create(source_id=1, title="کفش چرم"), Product.objects.create(source_id=2, title="کیف")
    order = _order(a)
    OrderItem.objects.create(source_id=next(_ids), order=order, product=shoe, quantity=1, amount=1)
    canceled = _order(b, status="canceled")
    OrderItem.objects.create(source_id=next(_ids), order=canceled, product=bag, quantity=1, amount=1)  # not qualifying
    sale = _pos(b)
    PosSaleItem.objects.filter(pos_sale=sale).update(product=shoe)
    refresh_customer_metrics()
    query = "&sort=name&dir=asc"
    assert _rows(auth_api, "genders=female" + query) == [1]
    since = (timezone.localdate() - timedelta(days=30)).isoformat()
    assert _rows(auth_api, f"joined_after={since}" + query) == [2]
    assert _rows(auth_api, f"joined_before={since}" + query) == [1]
    assert _rows(auth_api, f"products={shoe.pk}" + query) == [1, 2]
    assert _rows(auth_api, f"products={bag.pk}" + query) == []
    found = auth_api.get("/api/customers/list-products/?q=کفش").data["results"]
    assert found == [{"id": shoe.pk, "title": "کفش چرم"}]
    assert auth_api.get("/api/customers/list-products/?q=ک").data["results"] == []  # too short
    assert auth_api.get(f"/api/customers/list-products/?ids={bag.pk}").data["results"][0]["title"] == "کیف"


@pytest.mark.django_db
def test_tier_change_direction_and_range(auth_api):
    from apps.customers.models import CustomerTierHistory

    up, down, entered, left, old = (_customer(n) for n in range(1, 6))
    now = timezone.now()
    for customer, previous, new, days in ((up, "SILVER", "GOLD_1", 3), (down, "VIP", "BRONZE_1", 3), (entered, None, "BRONZE_3", 3), (left, "SILVER", None, 3), (old, "SILVER", "VIP", 90)):
        CustomerTierHistory.objects.create(customer=customer, previous_tier_code=previous, tier_code=new, reason="daily", changed_at=now - timedelta(days=days))
    since = (timezone.localdate() - timedelta(days=30)).isoformat()
    query = "&sort=name&dir=asc"
    assert _rows(auth_api, "tier_change=up" + query) == [1, 3, 5]
    assert _rows(auth_api, f"tier_change=up&tier_change_after={since}" + query) == [1, 3]
    assert _rows(auth_api, f"tier_change=down&tier_change_after={since}" + query) == [2, 4]
    assert _rows(auth_api, f"tier_change=up&tier_change_before={since}" + query) == [5]
