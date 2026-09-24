from datetime import timedelta

import pytest
from django.utils import timezone

from apps.customers.ingest import extract_profile_fields, normalize_addresses, upsert_customer_from_source
from apps.customers.models import Customer
from apps.customers.presentation import INCOMPLETE_LABEL, UNNAMED_CUSTOMER, list_payload
from apps.sales.models import Order


@pytest.mark.django_db
def test_customer_fallback_display_does_not_fabricate_source_id_name():
    customer = Customer.objects.create(source_id=254843, first_name="", last_name="", mobile="")
    payload = list_payload(customer)
    assert payload["name"] == UNNAMED_CUSTOMER
    assert "254843" not in payload["name"]
    assert payload["name_is_fallback"] is True
    assert payload["incomplete"] is True
    assert payload["incomplete_label"] == INCOMPLETE_LABEL
    assert payload["is_purchasing"] is False


@pytest.mark.django_db
def test_all_customers_vs_purchasing_customers():
    buyer = Customer.objects.create(source_id=1, first_name="آوا", last_name="رضایی", order_count=2)
    registered = Customer.objects.create(source_id=2, first_name="سارا", last_name="محمدی", order_count=0)
    Order.objects.create(
        source_id=11,
        customer=buyer,
        status="delivered",
        total_amount=1000,
        created_at=timezone.now(),
    )
    assert Customer.objects.count() == 2
    assert Customer.objects.purchasing().count() == 1
    assert Customer.objects.registered_only().count() == 1
    assert registered.source_id == 2


@pytest.mark.django_db
def test_customer_profile_fields_and_addresses_from_payload():
    payload = {
        "id": 88,
        "first_name": "نیما",
        "last_name": "کاظمی",
        "mobile": "09121112233",
        "email": "nima@example.com",
        "national_code": "0012345678",
        "gender": "male",
        "birth_date": "1990-04-10 00:00:00",
        "status": "active",
        "card_number": "12345",
        "club_level": "gold",
        "admin_summary": "مشتری قدیمی",
        "created_at": "2024-01-01 10:00:00",
        "updated_at": "2024-06-01 10:00:00",
        "addresses": [
            {
                "province": "تهران",
                "city": "تهران",
                "address": "خیابان ولیعصر",
                "postal_code": "1234567890",
                "receiver": "نیما کاظمی",
                "mobile": "09121112233",
            },
            {
                "province": "مازندران",
                "city": "ساری",
                "address": "خیابان فرهنگ",
                "postal_code": "4811111111",
            },
        ],
    }
    customer, created = upsert_customer_from_source(payload)
    customer.synced_at = timezone.now()
    customer.save()
    customer.refresh_from_db()
    assert created is True
    assert customer.email == "nima@example.com"
    assert customer.national_code == "0012345678"
    assert customer.gender == "male"
    assert customer.birth_date.isoformat() == "1990-04-10"
    assert customer.card_number == "12345"
    assert customer.club_level == "gold"
    assert customer.summary == "مشتری قدیمی"
    assert len(customer.addresses) == 2
    assert customer.addresses[0]["city"] == "تهران"
    assert customer.addresses[1]["province"] == "مازندران"
    assert customer.addresses[0]["recipient_name"] == "نیما کاظمی"

    fields = extract_profile_fields(payload)
    assert len(normalize_addresses(payload)) == 2
    assert fields["summary"] == "مشتری قدیمی"


@pytest.mark.django_db
def test_customer_api_populations_fallback_and_addresses(auth_api):
    now = timezone.now()
    named = Customer.objects.create(
        source_id=10,
        first_name="آوا",
        last_name="رضایی",
        mobile="09120000000",
        order_count=1,
        last_order_at=now,
        addresses=[{"province": "گیلان", "city": "رشت", "address": "میدان شهرداری", "postal_code": "1"}],
    )
    Customer.objects.create(source_id=11, first_name="", last_name="", mobile="", order_count=0)
    Order.objects.create(source_id=21, customer=named, status="delivered", total_amount=250000, created_at=now)

    reports = auth_api.get("/api/customers/reports/")
    assert reports.status_code == 200
    assert reports.data["populations"]["all_customers"] == 2
    assert reports.data["populations"]["purchasing_customers"] == 1
    assert reports.data["data_coverage"]["partial"] is False

    listing = auth_api.get("/api/customers/?page=1&per_page=20")
    names = {row["id"]: row for row in listing.data["results"]}
    assert names[11]["name"] == UNNAMED_CUSTOMER
    assert names[11]["incomplete_label"] == INCOMPLETE_LABEL
    assert names[10]["name"] == "آوا رضایی"

    purchasing = auth_api.get("/api/customers/?population=purchasing")
    assert purchasing.data["total"] == 1

    detail = auth_api.get("/api/customers/10/")
    assert detail.status_code == 200
    assert detail.data["addresses"][0]["city"] == "رشت"
    assert detail.data["is_purchasing"] is True
    assert "rfm" not in detail.data
    assert "churn" not in detail.data
