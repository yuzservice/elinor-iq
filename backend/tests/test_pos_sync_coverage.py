from datetime import timedelta

import pytest
from django.utils import timezone

from apps.core.coverage import coverage_payload
from apps.customers.models import Customer
from apps.sales.models import PosSale, SalesLine


@pytest.mark.django_db
def test_coverage_ok_without_pos_sales():
    payload = coverage_payload()
    assert payload["partial"] is False
    assert payload["message"] == ""
    assert payload["pos_sync"]["needs_sync"] is False


@pytest.mark.django_db
def test_coverage_warns_when_pos_sync_is_stale():
    customer = Customer.objects.create(source_id=1, first_name="آوا", last_name="رضایی")
    PosSale.objects.create(
        source_id=100,
        customer=customer,
        store_source_id=3,
        sales_line=SalesLine.SARI,
        type="sell",
        created_at=timezone.now() - timedelta(days=8),
    )
    payload = coverage_payload()
    assert payload["partial"] is True
    assert "ساری" in payload["message"]
    assert payload["pos_sync"]["needs_sync"] is True


@pytest.mark.django_db
def test_coverage_ok_for_recent_pos_sales():
    customer = Customer.objects.create(source_id=2, first_name="سارا", last_name="کاظمی")
    PosSale.objects.create(
        source_id=101,
        customer=customer,
        store_source_id=3,
        sales_line=SalesLine.SARI,
        type="sell",
        created_at=timezone.now() - timedelta(hours=6),
    )
    payload = coverage_payload()
    assert payload["partial"] is False
    assert payload["pos_sync"]["needs_sync"] is False
