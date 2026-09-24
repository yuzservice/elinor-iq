from pathlib import Path

import pytest
from django.db import connection
from django.db.utils import IntegrityError

from apps.customers.models import Customer, CustomerAddress
from apps.integrations.elinor.dump_import.mapping import sales_line_for_store
from apps.integrations.elinor.dump_import.runner import run_core_import
from apps.products.models import Product, Variant
from apps.sales.models import Order, OrderItem, PosSale, PosSaleItem, SalesLine

INVENTORY_TABLES = (
    "store_items",
    "store_item_transactions",
    "store_transfers",
    "store_transfer_items",
    "suppliers",
)


def _sql(value):
    if value is None:
        return "NULL"
    if isinstance(value, str):
        return "'" + value.replace("\\", "\\\\").replace("'", "\\'") + "'"
    if isinstance(value, bool):
        return "1" if value else "0"
    return str(value)


def _tuple(size, mapping):
    fields = ["NULL"] * size
    for index, value in mapping.items():
        fields[index] = _sql(value)
    return "(" + ",".join(fields) + ")"


def write_sample_dump(path):
    statements = [
        "INSERT INTO `provinces` VALUES " + _tuple(5, {0: 1, 1: "مازندران", 2: 1}) + ";",
        "INSERT INTO `cities` VALUES " + _tuple(7, {0: 10, 1: 1, 2: "ساری", 3: 1}) + ";",
        "INSERT INTO `levels` VALUES " + _tuple(6, {0: 2, 1: "طلایی", 2: 1, 3: 2}) + ";",
        "INSERT INTO `customer_roles` VALUES " + _tuple(5, {0: 2, 1: "VIP", 2: 1}) + ";",
        "INSERT INTO `customers` VALUES "
        + ",".join(
            [
                _tuple(
                    25,
                    {
                        0: 101,
                        1: "آوا",
                        2: "رضایی",
                        3: "09121111111",
                        5: "ava@example.com",
                        7: "female",
                        16: "2024-01-01 10:00:00",
                        17: "2024-01-02 10:00:00",
                        18: 2,
                        19: 1,
                        24: 2,
                    },
                ),
                _tuple(
                    25,
                    {
                        0: 102,
                        1: "",
                        2: "",
                        3: "09122222222",
                        16: "2024-02-01 10:00:00",
                        19: 1,
                    },
                ),
            ]
        )
        + ";",
        "INSERT INTO `addresses` VALUES "
        + _tuple(
            16,
            {
                0: 501,
                1: 101,
                2: 10,
                3: "آوا",
                4: "رضایی",
                5: "09121111111",
                6: "خیابان فرهنگ",
                7: "48111",
                13: "2024-01-03 10:00:00",
                14: "2024-01-03 10:00:00",
            },
        )
        + ";",
        "INSERT INTO `categories` VALUES " + _tuple(10, {0: 7, 1: "کت", 2: "coat", 6: None, 7: 1}) + ";",
        "INSERT INTO `products` VALUES "
        + _tuple(
            38,
            {
                0: 9,
                1: "کت مشکی",
                10: "SKU-9",
                11: "123",
                20: "available",
                28: "2023-01-01 08:00:00",
                29: "2023-01-01 08:00:00",
            },
        )
        + ";",
        "INSERT INTO `category_product` VALUES " + _tuple(4, {0: 7, 1: 9}) + ";",
        "INSERT INTO `colors` VALUES " + _tuple(8, {0: 3, 1: "مشکی", 2: "#000", 3: 1}) + ";",
        "INSERT INTO `attributes` VALUES " + _tuple(12, {0: 2, 1: "size", 2: "سایز", 3: "select"}) + ";",
        "INSERT INTO `attribute_values` VALUES " + _tuple(9, {0: 4, 1: 2, 2: "M", 4: 1}) + ";",
        "INSERT INTO `varieties` VALUES "
        + _tuple(
            19,
            {
                0: 90,
                1: "M",
                3: 800000,
                4: "V-90",
                5: "999",
                7: 9,
                8: 3,
                15: "2023-01-02 08:00:00",
                16: "2023-01-02 08:00:00",
            },
        )
        + ";",
        "INSERT INTO `attribute_variety` VALUES " + _tuple(6, {0: 2, 1: 90, 2: 4, 3: "M"}) + ";",
        "INSERT INTO `stores` VALUES "
        + ",".join(
            [
                _tuple(7, {0: 1, 1: "انبار مرکزی", 2: 1}),
                _tuple(7, {0: 2, 1: "انبار فروشگاه گرگان", 2: 0}),
                _tuple(7, {0: 3, 1: "انبار فروشگاه ساری", 2: 0}),
                _tuple(7, {0: 4, 1: "انبار کاپری", 2: 0}),
            ]
        )
        + ";",
        "INSERT INTO `orders` VALUES "
        + ",".join(
            [
                _tuple(
                    47,
                    {
                        0: 8001,
                        1: 101,
                        6: 20000,
                        7: 0,
                        9: "delivered",
                        21: "2024-06-01 12:00:00",
                        22: "2024-06-01 12:00:00",
                        28: 820000,
                        29: 1,
                        30: 1,
                        37: 0,
                    },
                ),
                _tuple(
                    47,
                    {
                        0: 8002,
                        1: 101,
                        6: 0,
                        7: 0,
                        9: "canceled",
                        21: "2024-06-02 12:00:00",
                        22: "2024-06-02 12:00:00",
                        28: 1000,
                        29: 1,
                        37: 0,
                    },
                ),
            ]
        )
        + ";",
        "INSERT INTO `order_items` VALUES "
        + _tuple(17, {0: 9001, 1: 8001, 2: 9, 3: 90, 5: 1, 6: 800000, 8: 0, 10: 1})
        + ";",
        "INSERT INTO `mini_orders` VALUES "
        + ",".join(
            [
                _tuple(
                    30,
                    {
                        0: 7001,
                        1: 101,
                        2: 0,
                        4: "sell",
                        9: "2025-06-01 10:00:00",
                        10: "2025-06-01 10:00:00",
                        13: 3,
                        14: "confirmed",
                        18: 500000,
                        26: 0,
                    },
                ),
                _tuple(
                    30,
                    {
                        0: 7002,
                        1: 101,
                        2: 0,
                        4: "refund",
                        9: "2025-06-02 10:00:00",
                        10: "2025-06-02 10:00:00",
                        13: 2,
                        14: "confirmed",
                        26: 0,
                    },
                ),
                _tuple(
                    30,
                    {
                        0: 7003,
                        1: 102,
                        2: 0,
                        4: "both",
                        9: "2025-12-20 10:00:00",
                        10: "2025-12-20 10:00:00",
                        13: 4,
                        14: "confirmed",
                        26: 1,
                    },
                ),
            ]
        )
        + ";",
        "INSERT INTO `mini_order_items` VALUES "
        + ",".join(
            [
                _tuple(19, {0: 7101, 1: 7001, 2: 9, 3: 90, 5: 1, 6: 500000, 8: 0, 9: "sell", 15: 3, 11: "2025-06-01 10:00:00"}),
                _tuple(
                    19,
                    {
                        0: 7102,
                        1: 7002,
                        2: 9,
                        3: 90,
                        5: 1,
                        6: 500000,
                        8: 0,
                        9: "refund",
                        15: 2,
                        18: 7101,
                        11: "2025-06-02 10:00:00",
                    },
                ),
            ]
        )
        + ";",
        "INSERT INTO `store_items` VALUES (1,1,90,50,'2025-01-01 00:00:00','2025-01-01 00:00:00');",
        "INSERT INTO `suppliers` VALUES (1,'ignored');",
    ]
    Path(path).write_text("\n".join(statements) + "\n", encoding="utf-8")


@pytest.mark.django_db
def test_pos_branch_mapping_is_store_id_only():
    assert sales_line_for_store(2) == SalesLine.GORGAN
    assert sales_line_for_store(3) == SalesLine.SARI
    assert sales_line_for_store(4) == SalesLine.CAPRI
    assert sales_line_for_store(1) == ""


@pytest.mark.django_db(transaction=True)
def test_source_id_uniqueness_on_core_models():
    Customer.objects.create(source_id=1, first_name="آوا")
    with pytest.raises(IntegrityError):
        Customer.objects.create(source_id=1, first_name="دیگر")


@pytest.mark.django_db(transaction=True)
def test_core_historical_import_idempotent_and_relationships(tmp_path):
    dump = tmp_path / "sample.sql"
    work = tmp_path / "work"
    write_sample_dump(dump)

    first = run_core_import(str(dump), work_dir=str(work))
    assert first.status == "success"
    second = run_core_import(str(dump), work_dir=str(work))
    assert second.status == "success"

    assert Customer.objects.count() == 2
    assert CustomerAddress.objects.count() == 1
    assert Order.objects.count() == 2
    assert OrderItem.objects.count() == 1
    assert PosSale.objects.count() == 3
    assert PosSaleItem.objects.count() == 2
    assert Product.objects.count() == 1
    assert Variant.objects.count() == 1

    shared = Customer.objects.get(source_id=101)
    assert shared.orders.count() == 2
    assert shared.pos_sales.count() == 2
    assert shared.address_records.count() == 1
    assert shared.address_records.first().city_name == "ساری"
    assert shared.club_level == "طلایی"
    assert shared.role_name == "VIP"

    online = Order.objects.get(source_id=8002)
    assert online.status == "canceled"
    assert online.sales_line == SalesLine.ONLINE

    sari = PosSale.objects.get(source_id=7001)
    assert sari.sales_line == SalesLine.SARI
    assert sari.store_source_id == 3
    assert sari.type == "sell"

    refund = PosSale.objects.get(source_id=7002)
    assert refund.sales_line == SalesLine.GORGAN
    assert refund.type == "refund"
    item = PosSaleItem.objects.get(source_id=7102)
    assert item.type == "refund"
    assert item.reference_item_source_id == 7101

    capri = PosSale.objects.get(source_id=7003)
    assert capri.sales_line == SalesLine.CAPRI
    assert capri.is_cancelled is True

    variant = Variant.objects.get(source_id=90)
    assert variant.product.source_id == 9
    assert variant.color_name == "مشکی"
    assert variant.size == "M"
    assert variant.quantity is None

    no_purchase = Customer.objects.get(source_id=102)
    assert no_purchase.order_count == 1
    assert shared.order_count == 4

    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename = ANY(%s)",
            [list(INVENTORY_TABLES)],
        )
        assert cursor.fetchall() == []
