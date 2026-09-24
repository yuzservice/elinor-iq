from datetime import timedelta

import pytest
from django.utils import timezone

from apps.customers.models import Customer, CustomerAddress
from apps.customers.presentation import UNNAMED_CUSTOMER
from apps.products.models import Product, Variant
from apps.sales.models import Order, OrderItem, PosSale, PosSaleItem, SalesLine


def _customer(**kwargs):
    source_id = kwargs.pop("source_id")
    defaults = {"first_name": "آوا", "last_name": "رضایی", "mobile": "09120000000", "status": "active"}
    defaults.update(kwargs)
    return Customer.objects.create(source_id=source_id, **defaults)


def _online(customer, source_id, status="delivered", days=1, amount=100000, discount=0):
    return Order.objects.create(
        source_id=source_id,
        customer=customer,
        status=status,
        total_amount=amount,
        discount_amount=discount,
        created_at=timezone.now() - timedelta(days=days),
    )


def _pos(customer, source_id, sales_line=SalesLine.SARI, sale_type="sell", days=1, cancelled=False, discount=0):
    return PosSale.objects.create(
        source_id=source_id,
        customer=customer,
        store_source_id={"SARI": 3, "GORGAN": 2, "CAPRI": 4}.get(sales_line, 3),
        sales_line=sales_line,
        type=sale_type,
        is_cancelled=cancelled,
        discount_amount=discount,
        created_at=timezone.now() - timedelta(days=days),
    )


def _item(order, source_id, product, variant=None, quantity=1, amount=50000, discount=0, title=""):
    return OrderItem.objects.create(
        source_id=source_id,
        order=order,
        product=product,
        variant=variant,
        product_source_id=product.source_id if product else None,
        quantity=quantity,
        amount=amount,
        discount_amount=discount,
        title=title,
    )


def _pos_item(sale, source_id, product, variant=None, quantity=1, amount=40000, sale_type="sell"):
    return PosSaleItem.objects.create(
        source_id=source_id,
        pos_sale=sale,
        product=product,
        variant=variant,
        product_source_id=product.source_id if product else None,
        quantity=quantity,
        amount=amount,
        type=sale_type,
    )


@pytest.mark.django_db
def test_customer_360_unified_history_and_profile(auth_api):
    customer = _customer(
        source_id=88,
        email="ava@example.com",
        national_code="0012345678",
        gender="female",
        club_level="gold",
        addresses=[{"province": "گیلان", "city": "رشت", "address": "میدان شهرداری", "postal_code": "1"}],
    )
    unnamed = _customer(source_id=89, first_name="", last_name="", mobile="", status="")
    coat = Product.objects.create(source_id=1, title="پالتو مشکی")
    dress = Product.objects.create(source_id=2, title="پیراهن")
    coat_m = Variant.objects.create(source_id=11, product=coat, title="M", color_name="مشکی", size="M")
    coat_l = Variant.objects.create(source_id=12, product=coat, title="L", color_name="کرم", size="L")
    dress_s = Variant.objects.create(source_id=13, product=dress, title="S", color_name="سفید", size="S")

    newest = _online(customer, 501, days=1, amount=250000, discount=10000)
    _item(newest, 601, coat, coat_m, quantity=2, amount=125000, discount=5000)
    older_online = _online(customer, 502, days=8, amount=80000)
    _item(older_online, 602, dress, dress_s, quantity=1, amount=80000)
    canceled = _online(customer, 503, status="canceled", days=2, amount=90000)
    _item(canceled, 603, dress, dress_s, quantity=1, amount=90000)

    sari = _pos(customer, 701, SalesLine.SARI, days=3)
    _pos_item(sari, 801, coat, coat_l, quantity=1, amount=110000)
    gorgan = _pos(customer, 702, SalesLine.GORGAN, days=5)
    _pos_item(gorgan, 802, dress, dress_s, quantity=3, amount=70000)
    capri = _pos(customer, 703, SalesLine.CAPRI, days=6)
    _pos_item(capri, 803, coat, coat_m, quantity=1, amount=120000)
    refund = _pos(customer, 704, SalesLine.SARI, sale_type="refund", days=4)
    _pos_item(refund, 804, coat, coat_m, quantity=1, amount=110000, sale_type="refund")

    CustomerAddress.objects.create(
        source_id=91,
        customer=customer,
        first_name="آوا",
        last_name="رضایی",
        mobile="09123334444",
        address="خیابان فرهنگ",
        postal_code="48111",
        province_name="مازندران",
        city_name="ساری",
    )

    detail = auth_api.get("/api/customers/88/")
    assert detail.status_code == 200
    data = detail.data
    assert data["name"] == "آوا رضایی"
    assert data["name_is_fallback"] is False
    assert data["purchase_count"] == 5
    assert data["online_count"] == 2
    assert data["pos_count"] == 3
    assert data["items_sold"] == 8
    assert data["sales_line_count"] == 4
    assert data["is_purchasing"] is True
    assert data["profile"]["email"] == "ava@example.com"
    assert data["profile"]["national_code"] == "0012345678"
    assert data["profile"]["gender_label"] == "زن"
    assert data["profile"]["club_level"] == "gold"
    assert data["status_label"] == "فعال"
    assert "rfm" not in data
    assert "churn" not in data
    assert "clv" not in data
    assert "vip" not in data
    assert "recent_value" not in data
    assert "average_order_value" not in data

    history = data["purchases"]["results"]
    assert data["purchases"]["total"] == 7
    assert [row["source_id"] for row in history] == [501, 503, 701, 704, 702, 703, 502]
    assert history[0]["sales_line"] == "ONLINE"
    assert history[0]["status"] == "delivered"
    assert history[0]["value"] == 250000
    assert history[0]["value_kind"] == "online_total"
    assert history[1]["status"] == "canceled"
    assert history[2]["sales_line"] == "SARI"
    assert history[2]["type_label"] == "فروش"
    assert history[2]["value"] is None
    assert history[3]["type_label"] == "مرجوعی"
    assert history[3]["sales_line"] == "SARI"
    assert history[4]["sales_line"] == "GORGAN"
    assert history[5]["sales_line"] == "CAPRI"

    newest_items = history[0]["items"]
    assert newest_items[0]["product"] == "پالتو مشکی"
    assert newest_items[0]["color"] == "مشکی"
    assert newest_items[0]["size"] == "M"
    assert newest_items[0]["quantity"] == 2
    assert newest_items[0]["discount_amount"] == 5000
    assert history[3]["items"][0]["type_label"] == "مرجوعی"

    lines = {row["key"]: row for row in data["sales_lines"]}
    assert lines["ONLINE"]["purchase_count"] == 2
    assert lines["SARI"]["purchase_count"] == 1
    assert lines["GORGAN"]["purchase_count"] == 1
    assert lines["CAPRI"]["purchase_count"] == 1
    assert lines["SARI"]["used"] is True

    products = auth_api.get("/api/customers/88/products/").data["results"]
    assert products[0]["product"] == "پالتو مشکی"
    assert products[0]["total_quantity"] == 4
    assert products[0]["purchase_count"] == 3
    assert set(products[0]["colors"]) == {"مشکی", "کرم"}
    assert set(products[0]["sizes"]) == {"M", "L"}
    assert products[1]["product"] == "پیراهن"
    assert products[1]["total_quantity"] == 4

    assert data["addresses"][0]["city"] == "ساری"
    assert data["addresses"][0]["province"] == "مازندران"
    assert data["addresses"][0]["recipient_mobile"] == "09123334444"
    assert "primary" not in data["addresses"][0]
    assert data["discounts"][0]["source_id"] == 501
    assert data["discounts"][0]["sales_line"] == "ONLINE"

    missing = auth_api.get("/api/customers/89/")
    assert missing.status_code == 200
    assert missing.data["name"] == UNNAMED_CUSTOMER
    assert missing.data["name_is_fallback"] is True
    assert "89" not in missing.data["name"]
    assert missing.data["profile"]["email"] == ""
    assert missing.data["profile"]["national_code"] == ""
    assert missing.data["profile"]["gender_label"] == ""
    assert missing.data["first_purchase_at"] is None
    assert missing.data["purchases"]["total"] == 0
    assert auth_api.get("/api/customers/89/products/").data["results"] == []
    assert missing.data["addresses"] == []

    paged = auth_api.get("/api/customers/88/purchases/?page=2&per_page=2")
    assert paged.status_code == 200
    assert paged.data["total"] == 7
    assert paged.data["page"] == 2
    assert [row["source_id"] for row in paged.data["results"]] == [701, 704]
