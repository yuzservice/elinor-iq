"""One-pass dump extract into CSV files. Only listed source tables are read."""

from __future__ import annotations

import csv
from pathlib import Path

from .mapping import as_bool_int, as_date, as_int, as_text, csv_cell, iso_dt, sales_line_for_store, tables_for_domains
from .parser import iter_insert_tuples

CSV_COLUMNS = {
    "provinces": ["source_id", "name", "status"],
    "cities": ["source_id", "province_source_id", "name", "status"],
    "levels": ["source_id", "title", "status", "sort_order"],
    "customer_roles": ["source_id", "name"],
    "customers": [
        "source_id",
        "first_name",
        "last_name",
        "mobile",
        "email",
        "national_code",
        "gender",
        "birth_date",
        "card_number",
        "summary",
        "status",
        "role_source_id",
        "level_source_id",
        "created_at_source",
        "updated_at_source",
    ],
    "addresses": [
        "source_id",
        "customer_source_id",
        "city_source_id",
        "first_name",
        "last_name",
        "mobile",
        "address",
        "postal_code",
        "telephone",
        "deleted_at",
        "created_at_source",
        "updated_at_source",
    ],
    "categories": ["source_id", "title", "slug", "parent_source_id", "status"],
    "category_product": ["category_source_id", "product_source_id"],
    "products": ["source_id", "title", "status", "sku", "barcode", "created_at_source", "updated_at_source"],
    "colors": ["source_id", "name", "code", "status"],
    "attributes": ["source_id", "name", "label", "attr_type"],
    "attribute_values": ["source_id", "attribute_source_id", "value", "status"],
    "varieties": [
        "source_id",
        "product_source_id",
        "name",
        "sku",
        "barcode",
        "price",
        "discount_type",
        "discount",
        "color_source_id",
        "deleted_at",
        "created_at_source",
        "updated_at_source",
    ],
    "attribute_variety": ["attribute_source_id", "variety_source_id", "attribute_value_source_id", "value"],
    "stores": ["source_id", "label", "is_main", "address", "mobile"],
    "orders": [
        "source_id",
        "customer_source_id",
        "status",
        "receiver",
        "receiver_first_name",
        "receiver_last_name",
        "receiver_city",
        "receiver_province",
        "total_amount",
        "shipping_amount",
        "discount_amount",
        "items_count",
        "items_quantity",
        "is_shopino",
        "is_digify",
        "shipping_id",
        "shipping_title",
        "canceled_at",
        "created_at",
        "updated_at_source",
    ],
    "order_items": [
        "source_id",
        "order_source_id",
        "product_source_id",
        "variant_source_id",
        "quantity",
        "amount",
        "discount_amount",
        "status",
    ],
    "mini_orders": [
        "source_id",
        "customer_source_id",
        "store_source_id",
        "sales_line",
        "type",
        "confirmed",
        "discount_amount",
        "cash_amount",
        "card_by_card_amount",
        "from_wallet_amount",
        "digipay_cashier_amount",
        "snappay_cashier_amount",
        "tracking_code",
        "transaction_id",
        "is_cancelled",
        "deleted_at",
        "created_at",
        "updated_at_source",
    ],
    "mini_order_items": [
        "source_id",
        "mini_order_source_id",
        "product_source_id",
        "variant_source_id",
        "quantity",
        "amount",
        "discount_amount",
        "real_amount",
        "type",
        "store_source_id",
        "reference_item_source_id",
        "deleted_at",
        "created_at_source",
    ],
}


def _row(table, fields):
    g = as_text
    n = as_int
    if table == "provinces":
        return [n(fields[0]), g(fields[1]), as_bool_int(fields[2])]
    if table == "cities":
        return [n(fields[0]), n(fields[1]), g(fields[2]), as_bool_int(fields[3])]
    if table == "levels":
        return [n(fields[0]), g(fields[1]), as_bool_int(fields[2]), n(fields[3]) or 0]
    if table == "customer_roles":
        return [n(fields[0]), g(fields[1])]
    if table == "customers":
        return [
            n(fields[0]),
            g(fields[1]),
            g(fields[2]),
            g(fields[3]),
            g(fields[5]),
            g(fields[6]),
            g(fields[7]),
            as_date(fields[9]),
            g(fields[8]),
            g(fields[23]) if len(fields) > 23 else "",
            str(n(fields[19]) if len(fields) > 19 and n(fields[19]) is not None else ""),
            n(fields[18]) if len(fields) > 18 else None,
            n(fields[24]) if len(fields) > 24 else None,
            iso_dt(fields[16]),
            iso_dt(fields[17]),
        ]
    if table == "addresses":
        return [
            n(fields[0]),
            n(fields[1]),
            n(fields[2]),
            g(fields[3]),
            g(fields[4]),
            g(fields[5]),
            g(fields[6]),
            g(fields[7]),
            g(fields[8]),
            iso_dt(fields[15]) if len(fields) > 15 else None,
            iso_dt(fields[13]) if len(fields) > 13 else None,
            iso_dt(fields[14]) if len(fields) > 14 else None,
        ]
    if table == "categories":
        return [n(fields[0]), g(fields[1]), g(fields[2]), n(fields[6]), as_bool_int(fields[7])]
    if table == "category_product":
        return [n(fields[0]), n(fields[1])]
    if table == "products":
        status = g(fields[20]) if len(fields) > 20 else ""
        created = iso_dt(fields[28]) if len(fields) > 28 else None
        updated = iso_dt(fields[29]) if len(fields) > 29 else None
        return [n(fields[0]), g(fields[1]), status, g(fields[10]), g(fields[11]), created, updated]
    if table == "colors":
        return [n(fields[0]), g(fields[1]), g(fields[2]), as_bool_int(fields[3])]
    if table == "attributes":
        return [n(fields[0]), g(fields[1]), g(fields[2]), g(fields[3])]
    if table == "attribute_values":
        return [n(fields[0]), n(fields[1]), g(fields[2]), as_bool_int(fields[4])]
    if table == "varieties":
        return [
            n(fields[0]),
            n(fields[7]),
            g(fields[1]),
            g(fields[4]),
            g(fields[5]),
            n(fields[3]),
            g(fields[9]),
            n(fields[10]),
            n(fields[8]),
            iso_dt(fields[14]),
            iso_dt(fields[15]),
            iso_dt(fields[16]),
        ]
    if table == "attribute_variety":
        return [n(fields[0]), n(fields[1]), n(fields[2]), g(fields[3])]
    if table == "stores":
        return [n(fields[0]), g(fields[1]), as_bool_int(fields[2]), g(fields[3]), g(fields[4])]
    if table == "orders":
        created = iso_dt(fields[21])
        if not created:
            return None
        return [
            n(fields[0]),
            n(fields[1]),
            g(fields[9]),
            g(fields[23]) if len(fields) > 23 else "",
            g(fields[24]) if len(fields) > 24 else "",
            g(fields[25]) if len(fields) > 25 else "",
            g(fields[26]) if len(fields) > 26 else "",
            g(fields[27]) if len(fields) > 27 else "",
            n(fields[28]) or 0,
            n(fields[6]) or 0,
            n(fields[7]) or 0,
            n(fields[29]) or 0,
            n(fields[30]) if len(fields) > 30 else None,
            as_bool_int(fields[37]) if len(fields) > 37 else 0,
            as_bool_int(fields[40]) if len(fields) > 40 else 0,
            n(fields[2]),
            g(fields[36]) if len(fields) > 36 else "",
            iso_dt(fields[42]) if len(fields) > 42 else None,
            created,
            iso_dt(fields[22]),
        ]
    if table == "order_items":
        return [
            n(fields[0]),
            n(fields[1]),
            n(fields[2]),
            n(fields[3]),
            n(fields[5]) or 0,
            n(fields[6]) or 0,
            n(fields[8]) or 0,
            n(fields[10]) if len(fields) > 10 else 1,
        ]
    if table == "mini_orders":
        store_id = n(fields[13]) if len(fields) > 13 else None
        created = iso_dt(fields[9])
        if not created:
            return None
        return [
            n(fields[0]),
            n(fields[1]),
            store_id,
            sales_line_for_store(store_id),
            g(fields[4]),
            g(fields[14]) if len(fields) > 14 else "",
            n(fields[2]) or 0,
            n(fields[18]) or 0,
            n(fields[19]) or 0,
            n(fields[15]) or 0,
            n(fields[25]) or 0,
            n(fields[29]) if len(fields) > 29 else 0,
            g(fields[11]),
            n(fields[12]),
            as_bool_int(fields[26]) if len(fields) > 26 else 0,
            iso_dt(fields[23]) if len(fields) > 23 else None,
            created,
            iso_dt(fields[10]),
        ]
    if table == "mini_order_items":
        return [
            n(fields[0]),
            n(fields[1]),
            n(fields[2]),
            n(fields[3]),
            n(fields[5]) or 0,
            n(fields[6]) or 0,
            n(fields[8]) or 0,
            n(fields[14]) if len(fields) > 14 else None,
            g(fields[9]),
            n(fields[15]) if len(fields) > 15 else None,
            n(fields[18]) if len(fields) > 18 else None,
            iso_dt(fields[16]) if len(fields) > 16 else None,
            iso_dt(fields[11]) if len(fields) > 11 else None,
        ]
    raise KeyError(table)


def extract_dump(dump_path, work_dir, domains=None, stdout=None):
    work = Path(work_dir)
    work.mkdir(parents=True, exist_ok=True)
    tables = tables_for_domains(domains)
    writers = {}
    files = {}
    counts = {table: 0 for table in tables}
    skipped = {table: 0 for table in tables}
    try:
        for table in tables:
            path = work / f"{table}.csv"
            handle = path.open("w", encoding="utf-8", newline="")
            files[table] = handle
            writer = csv.writer(handle, lineterminator="\n")
            writer.writerow(CSV_COLUMNS[table])
            writers[table] = writer
        for table, fields in iter_insert_tuples(dump_path, tables):
            try:
                row = _row(table, fields)
            except (IndexError, ValueError, TypeError):
                skipped[table] += 1
                continue
            if row is None:
                skipped[table] += 1
                continue
            if row[0] is None and table not in {"category_product", "attribute_variety"}:
                skipped[table] += 1
                continue
            writers[table].writerow(csv_cell(cell) for cell in row)
            counts[table] += 1
            if stdout and counts[table] % 100000 == 0:
                stdout.write(f"  extracted {table}: {counts[table]}")
    finally:
        for handle in files.values():
            handle.close()
    return {"counts": counts, "skipped": skipped, "tables": tables, "work_dir": str(work)}
