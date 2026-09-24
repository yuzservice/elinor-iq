import csv
from datetime import timedelta
from io import StringIO

import pytest
from django.utils import timezone

from apps.customers.export import EXPORT_HEADERS
from apps.customers.models import Customer
from apps.sales.models import Order, PosSale, SalesLine


def _customer(**kwargs):
    source_id = kwargs.pop("source_id")
    defaults = {"first_name": "آوا", "last_name": "رضایی", "mobile": "09120000000", "status": "active"}
    defaults.update(kwargs)
    return Customer.objects.create(source_id=source_id, **defaults)


def _online(customer, source_id, days=1):
    return Order.objects.create(
        source_id=source_id,
        customer=customer,
        status="delivered",
        total_amount=100000,
        created_at=timezone.now() - timedelta(days=days),
    )


def _pos(customer, source_id, sales_line=SalesLine.SARI, days=1):
    now = timezone.now()
    return PosSale.objects.create(
        source_id=source_id,
        customer=customer,
        store_source_id=3,
        sales_line=sales_line,
        type="sell",
        created_at=now - timedelta(days=days),
    )


def _read_csv(content):
    text = content.decode("utf-8-sig")
    return list(csv.reader(StringIO(text)))


@pytest.mark.django_db
def test_customer_export_returns_csv_with_all_columns(auth_api):
    buyer = _customer(source_id=1, first_name="سارا", last_name="محمدی", mobile="09121111111")
    registered = _customer(source_id=2, first_name="ثبت", last_name="شده", mobile="09122222222", order_count=0)
    _online(buyer, 21, days=3)
    _pos(buyer, 31, SalesLine.SARI, days=1)

    response = auth_api.get("/api/customers/export/")
    assert response.status_code == 200
    assert response["Content-Type"] == "text/csv; charset=utf-8"
    assert "attachment" in response["Content-Disposition"]

    rows = _read_csv(response.content)
    assert rows[0] == EXPORT_HEADERS
    assert len(rows) == 3
    exported_names = {row[0] for row in rows[1:]}
    assert exported_names == {"سارا محمدی", "ثبت شده"}


@pytest.mark.django_db
def test_customer_export_respects_filters(auth_api):
    buyer = _customer(source_id=1, first_name="خریدار", last_name="فعال", mobile="09121111111")
    registered = _customer(source_id=2, first_name="بدون", last_name="خرید", mobile="09122222222", order_count=0)
    _online(buyer, 21, days=2)

    response = auth_api.get("/api/customers/export/?population=purchasing")
    assert response.status_code == 200

    rows = _read_csv(response.content)
    assert len(rows) == 2
    assert rows[1][0] == "خریدار فعال"
    assert registered.full_name not in {row[0] for row in rows[1:]}


@pytest.mark.django_db
def test_customer_export_requires_auth(api_client):
    response = api_client.get("/api/customers/export/")
    assert response.status_code in {401, 403}
