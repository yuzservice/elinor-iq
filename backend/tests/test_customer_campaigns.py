from datetime import timedelta
import pytest
from django.utils import timezone

from apps.customers.models import Customer
from apps.sales.models import PosSale, SalesLine


def _customer(**kwargs):
    source_id = kwargs.pop("source_id")
    defaults = {"first_name": "آوا", "last_name": "رضایی", "mobile": "09120000000", "status": "active"}
    defaults.update(kwargs)
    return Customer.objects.create(source_id=source_id, **defaults)


def _pos_wallet_sale(customer, source_id, sales_line=SalesLine.SARI, wallet_amount=300000, cash_amount=1200000, days=1):
    now = timezone.now()
    return PosSale.objects.create(
        source_id=source_id,
        customer=customer,
        store_source_id=3 if sales_line == SalesLine.SARI else 2,
        sales_line=sales_line,
        type="sell",
        from_wallet_amount=wallet_amount,
        cash_amount=cash_amount,
        is_cancelled=False,
        created_at=now - timedelta(days=days),
    )


@pytest.mark.django_db
def test_customer_campaigns_api_and_redemptions(auth_api):
    c1 = _customer(source_id=201, first_name="مریم", last_name="کریمی", mobile="09111111111")
    c2 = _customer(source_id=202, first_name="سارا", last_name="نجفی", mobile="09222222222")

    # Pos sale with wallet usage
    _pos_wallet_sale(c1, 501, sales_line=SalesLine.SARI, wallet_amount=300000, cash_amount=700000, days=1)
    _pos_wallet_sale(c2, 502, sales_line=SalesLine.GORGAN, wallet_amount=300000, cash_amount=1500000, days=2)

    # Call /api/customers/campaigns/
    res = auth_api.get("/api/customers/campaigns/")
    assert res.status_code == 200
    data = res.data

    assert "campaigns" in data
    assert "summary" in data
    assert "redemptions" in data
    assert "pagination" in data

    summary = data["summary"]
    assert summary["total_gift_used"] >= 600000
    assert summary["redemption_count"] >= 2
    assert summary["unique_customers_count"] >= 2
    assert summary["basket_lift"] >= 2200000  # (700000 + 1500000)

    # Test branch filter
    res_sari = auth_api.get("/api/customers/campaigns/?branch=sari")
    assert res_sari.status_code == 200
    assert res_sari.data["summary"]["redemption_count"] == 1
    assert res_sari.data["redemptions"][0]["sales_line"] == "SARI"
    assert res_sari.data["redemptions"][0]["customer_name"] == "مریم کریمی"
    assert res_sari.data["redemptions"][0]["total_amount"] == 1000000
    assert res_sari.data["redemptions"][0]["incremental_amount"] == 700000
