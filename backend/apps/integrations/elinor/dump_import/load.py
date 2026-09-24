"""COPY extracted CSV into staging tables, then upsert into V2 models by source_id."""

from __future__ import annotations

from pathlib import Path

from django.db import connection, transaction

from .extract import CSV_COLUMNS
from .mapping import domains_for_tables

STAGING = {
    "provinces": "stg_provinces",
    "cities": "stg_cities",
    "levels": "stg_levels",
    "customer_roles": "stg_customer_roles",
    "customers": "stg_customers",
    "addresses": "stg_addresses",
    "categories": "stg_categories",
    "category_product": "stg_category_product",
    "products": "stg_products",
    "colors": "stg_colors",
    "attributes": "stg_attributes",
    "attribute_values": "stg_attribute_values",
    "varieties": "stg_varieties",
    "attribute_variety": "stg_attribute_variety",
    "stores": "stg_stores",
    "orders": "stg_orders",
    "order_items": "stg_order_items",
    "mini_orders": "stg_mini_orders",
    "mini_order_items": "stg_mini_order_items",
    "invoices": "stg_invoices",
    "payments": "stg_payments",
}

CREATE_STAGING = {
    "provinces": "source_id bigint, name text, status int",
    "cities": "source_id bigint, province_source_id bigint, name text, status int",
    "levels": "source_id bigint, title text, status int, sort_order int",
    "customer_roles": "source_id bigint, name text",
    "customers": """
        source_id bigint, first_name text, last_name text, mobile text, email text,
        national_code text, gender text, birth_date date, card_number text, summary text,
        status text, role_source_id bigint, level_source_id bigint,
        created_at_source timestamptz, updated_at_source timestamptz
    """,
    "addresses": """
        source_id bigint, customer_source_id bigint, city_source_id bigint,
        first_name text, last_name text, mobile text, address text, postal_code text,
        telephone text, deleted_at timestamptz, created_at_source timestamptz, updated_at_source timestamptz
    """,
    "categories": "source_id bigint, title text, slug text, parent_source_id bigint, status int",
    "category_product": "category_source_id bigint, product_source_id bigint",
    "products": """
        source_id bigint, title text, status text, sku text, barcode text,
        created_at_source timestamptz, updated_at_source timestamptz
    """,
    "colors": "source_id bigint, name text, code text, status int",
    "attributes": "source_id bigint, name text, label text, attr_type text",
    "attribute_values": "source_id bigint, attribute_source_id bigint, value text, status int",
    "varieties": """
        source_id bigint, product_source_id bigint, name text, sku text, barcode text,
        price bigint, discount_type text, discount bigint, color_source_id bigint,
        deleted_at timestamptz, created_at_source timestamptz, updated_at_source timestamptz
    """,
    "attribute_variety": "attribute_source_id bigint, variety_source_id bigint, attribute_value_source_id bigint, value text",
    "stores": "source_id bigint, label text, is_main int, address text, mobile text",
    "orders": """
        source_id bigint, customer_source_id bigint, status text, receiver text,
        receiver_first_name text, receiver_last_name text, receiver_city text, receiver_province text,
        total_amount bigint, shipping_amount bigint, discount_amount bigint, items_count int,
        items_quantity int, is_shopino int, is_digify int, shipping_id int, shipping_title text,
        canceled_at timestamptz, created_at timestamptz, updated_at_source timestamptz
    """,
    "order_items": """
        source_id bigint, order_source_id bigint, product_source_id bigint, variant_source_id bigint,
        quantity int, amount bigint, discount_amount bigint, status int
    """,
    "mini_orders": """
        source_id bigint, customer_source_id bigint, store_source_id int, sales_line text, type text,
        confirmed text, discount_amount bigint, cash_amount bigint, card_by_card_amount bigint,
        from_wallet_amount bigint, digipay_cashier_amount bigint, snappay_cashier_amount bigint,
        tracking_code text, transaction_id bigint, is_cancelled int, deleted_at timestamptz,
        created_at timestamptz, updated_at_source timestamptz
    """,
    "mini_order_items": """
        source_id bigint, mini_order_source_id bigint, product_source_id bigint, variant_source_id bigint,
        quantity int, amount bigint, discount_amount bigint, real_amount bigint, type text,
        store_source_id int, reference_item_source_id bigint, deleted_at timestamptz, created_at_source timestamptz
    """,
    "invoices": """
        source_id bigint, amount bigint, wallet_amount bigint, inv_type text, order_source_id bigint,
        status text, created_at timestamptz, updated_at_source timestamptz
    """,
    "payments": """
        source_id bigint, invoice_source_id bigint, gateway text, status text,
        success_at timestamptz, created_at timestamptz, updated_at_source timestamptz
    """,
}

DOMAIN_TABLES = {
    "provinces": ["provinces"],
    "cities": ["cities"],
    "levels": ["levels", "customer_roles"],
    "customers": ["customers"],
    "addresses": ["addresses"],
    "categories": ["categories"],
    "products": ["products", "category_product"],
    "colors": ["colors"],
    "attributes": ["attributes", "attribute_values"],
    "variants": ["varieties", "attribute_variety"],
    "stores": ["stores"],
    "online": ["orders", "order_items"],
    "pos": ["mini_orders", "mini_order_items"],
    "gateway_payments": ["invoices", "payments"],
}


def _copy_csv(cursor, staging, csv_path, columns):
    cols = ", ".join(columns)
    sql = f"COPY {staging} ({cols}) FROM STDIN WITH (FORMAT csv, HEADER true, NULL '')"
    with csv_path.open("r", encoding="utf-8") as handle:
        with cursor.copy(sql) as copy:
            while True:
                chunk = handle.read(1024 * 1024)
                if not chunk:
                    break
                copy.write(chunk)


def _ensure_staging(cursor, table):
    staging = STAGING[table]
    cursor.execute(f"DROP TABLE IF EXISTS {staging}")
    cursor.execute(f"CREATE UNLOGGED TABLE {staging} ({CREATE_STAGING[table]})")
    return staging


def load_extracted(work_dir, domains=None, stdout=None):
    work = Path(work_dir)
    selected = domains_for_tables(domains)
    loaded = {}
    with transaction.atomic():
        with connection.cursor() as cursor:
            cursor.execute("SET LOCAL synchronous_commit TO OFF")
            for domain in selected:
                for table in DOMAIN_TABLES[domain]:
                    csv_path = work / f"{table}.csv"
                    if not csv_path.exists():
                        loaded[table] = 0
                        continue
                    staging = _ensure_staging(cursor, table)
                    _copy_csv(cursor, staging, csv_path, CSV_COLUMNS[table])
                    cursor.execute(f"SELECT COUNT(*) FROM {staging}")
                    loaded[table] = cursor.fetchone()[0]
                    if stdout:
                        stdout.write(f"  staged {table}: {loaded[table]}")
                _upsert_domain(cursor, domain)
                if stdout:
                    stdout.write(f"  upserted domain {domain}")
            if "variants" in selected:
                _fill_variant_size_color(cursor)
            if "addresses" in selected:
                _fill_address_labels(cursor)
            if "customers" in selected or "online" in selected or "pos" in selected:
                _refresh_customer_stats(cursor)
            if _is_full_import(selected):
                _prune_to_dump(cursor)
                _refresh_customer_stats(cursor)
    return loaded


def _upsert_domain(cursor, domain):
    if domain == "provinces":
        cursor.execute(
            """
            INSERT INTO provinces (source_id, name, status)
            SELECT source_id, COALESCE(name, ''), COALESCE(status, 1)::boolean
            FROM stg_provinces WHERE source_id IS NOT NULL
            ON CONFLICT (source_id) DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status
            """
        )
    elif domain == "cities":
        cursor.execute(
            """
            INSERT INTO cities (source_id, province_id, name, status)
            SELECT s.source_id, p.id, COALESCE(s.name, ''), COALESCE(s.status, 1)::boolean
            FROM stg_cities s
            LEFT JOIN provinces p ON p.source_id = s.province_source_id
            WHERE s.source_id IS NOT NULL
            ON CONFLICT (source_id) DO UPDATE SET
                province_id = EXCLUDED.province_id, name = EXCLUDED.name, status = EXCLUDED.status
            """
        )
    elif domain == "levels":
        cursor.execute(
            """
            INSERT INTO customer_levels (source_id, title, status, sort_order)
            SELECT source_id, COALESCE(title, ''), COALESCE(status, 1)::boolean, COALESCE(sort_order, 0)
            FROM stg_levels WHERE source_id IS NOT NULL
            ON CONFLICT (source_id) DO UPDATE SET
                title = EXCLUDED.title, status = EXCLUDED.status, sort_order = EXCLUDED.sort_order
            """
        )
        cursor.execute(
            """
            INSERT INTO customer_roles (source_id, name)
            SELECT source_id, COALESCE(name, '') FROM stg_customer_roles WHERE source_id IS NOT NULL
            ON CONFLICT (source_id) DO UPDATE SET name = EXCLUDED.name
            """
        )
    elif domain == "customers":
        cursor.execute(
            """
            INSERT INTO customers (
                source_id, first_name, last_name, mobile, email, national_code, gender, birth_date,
                card_number, summary, status, role_name, club_level, role_id, level_id,
                created_at_source, updated_at_source, order_count, addresses
            )
            SELECT
                s.source_id,
                COALESCE(s.first_name, ''), COALESCE(s.last_name, ''), COALESCE(s.mobile, ''),
                COALESCE(s.email, ''), COALESCE(s.national_code, ''), COALESCE(s.gender, ''),
                s.birth_date, COALESCE(s.card_number, ''), COALESCE(s.summary, ''),
                COALESCE(s.status, ''),
                COALESCE(r.name, ''), COALESCE(l.title, ''),
                r.id, l.id, s.created_at_source, s.updated_at_source,
                0, '[]'::jsonb
            FROM stg_customers s
            LEFT JOIN customer_roles r ON r.source_id = s.role_source_id
            LEFT JOIN customer_levels l ON l.source_id = s.level_source_id
            WHERE s.source_id IS NOT NULL
            ON CONFLICT (source_id) DO UPDATE SET
                first_name = EXCLUDED.first_name,
                last_name = EXCLUDED.last_name,
                mobile = EXCLUDED.mobile,
                email = EXCLUDED.email,
                national_code = EXCLUDED.national_code,
                gender = EXCLUDED.gender,
                birth_date = EXCLUDED.birth_date,
                card_number = EXCLUDED.card_number,
                summary = EXCLUDED.summary,
                status = EXCLUDED.status,
                role_name = EXCLUDED.role_name,
                club_level = EXCLUDED.club_level,
                role_id = EXCLUDED.role_id,
                level_id = EXCLUDED.level_id,
                created_at_source = EXCLUDED.created_at_source,
                updated_at_source = EXCLUDED.updated_at_source
            """
        )
    elif domain == "addresses":
        cursor.execute(
            """
            INSERT INTO customer_addresses (
                source_id, customer_id, city_id, first_name, last_name, mobile, address,
                postal_code, telephone, deleted_at, created_at_source, updated_at_source,
                province_name, city_name
            )
            SELECT
                s.source_id, c.id, city.id,
                COALESCE(s.first_name, ''), COALESCE(s.last_name, ''), COALESCE(s.mobile, ''),
                COALESCE(s.address, ''), COALESCE(s.postal_code, ''), COALESCE(s.telephone, ''),
                s.deleted_at, s.created_at_source, s.updated_at_source, '', COALESCE(city.name, '')
            FROM stg_addresses s
            JOIN customers c ON c.source_id = s.customer_source_id
            LEFT JOIN cities city ON city.source_id = s.city_source_id
            WHERE s.source_id IS NOT NULL
            ON CONFLICT (source_id) DO UPDATE SET
                customer_id = EXCLUDED.customer_id,
                city_id = EXCLUDED.city_id,
                first_name = EXCLUDED.first_name,
                last_name = EXCLUDED.last_name,
                mobile = EXCLUDED.mobile,
                address = EXCLUDED.address,
                postal_code = EXCLUDED.postal_code,
                telephone = EXCLUDED.telephone,
                deleted_at = EXCLUDED.deleted_at,
                created_at_source = EXCLUDED.created_at_source,
                updated_at_source = EXCLUDED.updated_at_source,
                city_name = EXCLUDED.city_name
            """
        )
    elif domain == "categories":
        cursor.execute(
            """
            INSERT INTO categories (source_id, title, slug, status, parent_id)
            SELECT source_id, COALESCE(title, ''), COALESCE(slug, ''), COALESCE(status, 1)::boolean, NULL
            FROM stg_categories WHERE source_id IS NOT NULL
            ON CONFLICT (source_id) DO UPDATE SET
                title = EXCLUDED.title, slug = EXCLUDED.slug, status = EXCLUDED.status
            """
        )
        cursor.execute(
            """
            UPDATE categories child
            SET parent_id = parent.id
            FROM stg_categories s
            JOIN categories parent ON parent.source_id = s.parent_source_id
            WHERE child.source_id = s.source_id
            """
        )
    elif domain == "products":
        cursor.execute(
            """
            INSERT INTO products (source_id, title, status, sku, barcode, created_at_source, updated_at_source)
            SELECT source_id, COALESCE(title, ''), COALESCE(status, ''), COALESCE(sku, ''),
                   COALESCE(barcode, ''), created_at_source, updated_at_source
            FROM stg_products WHERE source_id IS NOT NULL
            ON CONFLICT (source_id) DO UPDATE SET
                title = EXCLUDED.title, status = EXCLUDED.status, sku = EXCLUDED.sku,
                barcode = EXCLUDED.barcode, created_at_source = EXCLUDED.created_at_source,
                updated_at_source = EXCLUDED.updated_at_source
            """
        )
        cursor.execute(
            """
            INSERT INTO product_categories (product_id, category_id)
            SELECT DISTINCT p.id, c.id
            FROM stg_category_product s
            JOIN products p ON p.source_id = s.product_source_id
            JOIN categories c ON c.source_id = s.category_source_id
            ON CONFLICT (product_id, category_id) DO NOTHING
            """
        )
    elif domain == "colors":
        cursor.execute(
            """
            INSERT INTO colors (source_id, name, code, status)
            SELECT source_id, COALESCE(name, ''), COALESCE(code, ''), COALESCE(status, 1)::boolean
            FROM stg_colors WHERE source_id IS NOT NULL
            ON CONFLICT (source_id) DO UPDATE SET name = EXCLUDED.name, code = EXCLUDED.code, status = EXCLUDED.status
            """
        )
    elif domain == "attributes":
        cursor.execute(
            """
            INSERT INTO product_attributes (source_id, name, label, attr_type)
            SELECT source_id, COALESCE(name, ''), COALESCE(label, ''), COALESCE(attr_type, '')
            FROM stg_attributes WHERE source_id IS NOT NULL
            ON CONFLICT (source_id) DO UPDATE SET name = EXCLUDED.name, label = EXCLUDED.label, attr_type = EXCLUDED.attr_type
            """
        )
        cursor.execute(
            """
            INSERT INTO product_attribute_values (source_id, attribute_id, value, status)
            SELECT s.source_id, a.id, COALESCE(s.value, ''), COALESCE(s.status, 1)::boolean
            FROM stg_attribute_values s
            JOIN product_attributes a ON a.source_id = s.attribute_source_id
            WHERE s.source_id IS NOT NULL
            ON CONFLICT (source_id) DO UPDATE SET attribute_id = EXCLUDED.attribute_id, value = EXCLUDED.value, status = EXCLUDED.status
            """
        )
    elif domain == "variants":
        cursor.execute(
            """
            INSERT INTO variants (
                source_id, product_id, name, title, sku, barcode, price, discount_type, discount,
                color_id, color_name, size, deleted_at, created_at_source, updated_at_source, quantity
            )
            SELECT
                s.source_id, p.id, COALESCE(s.name, ''), COALESCE(s.name, ''), COALESCE(s.sku, ''),
                COALESCE(s.barcode, ''), s.price, COALESCE(s.discount_type, ''), s.discount,
                col.id, COALESCE(col.name, ''), '', s.deleted_at, s.created_at_source, s.updated_at_source, NULL
            FROM stg_varieties s
            LEFT JOIN products p ON p.source_id = s.product_source_id
            LEFT JOIN colors col ON col.source_id = s.color_source_id
            WHERE s.source_id IS NOT NULL
            ON CONFLICT (source_id) DO UPDATE SET
                product_id = EXCLUDED.product_id,
                name = EXCLUDED.name,
                title = EXCLUDED.title,
                sku = EXCLUDED.sku,
                barcode = EXCLUDED.barcode,
                price = EXCLUDED.price,
                discount_type = EXCLUDED.discount_type,
                discount = EXCLUDED.discount,
                color_id = EXCLUDED.color_id,
                color_name = EXCLUDED.color_name,
                deleted_at = EXCLUDED.deleted_at,
                created_at_source = EXCLUDED.created_at_source,
                updated_at_source = EXCLUDED.updated_at_source
            """
        )
        cursor.execute(
            """
            INSERT INTO variant_attributes (variant_id, attribute_id, attribute_value_id, value)
            SELECT DISTINCT ON (v.id, a.id)
                v.id, a.id, av.id, COALESCE(s.value, '')
            FROM stg_attribute_variety s
            JOIN variants v ON v.source_id = s.variety_source_id
            JOIN product_attributes a ON a.source_id = s.attribute_source_id
            LEFT JOIN product_attribute_values av ON av.source_id = s.attribute_value_source_id
            ORDER BY v.id, a.id
            ON CONFLICT (variant_id, attribute_id) DO UPDATE SET
                attribute_value_id = EXCLUDED.attribute_value_id, value = EXCLUDED.value
            """
        )
    elif domain == "stores":
        cursor.execute(
            """
            INSERT INTO stores (source_id, label, is_main, address, mobile)
            SELECT source_id, COALESCE(label, ''), COALESCE(is_main, 0)::boolean,
                   COALESCE(address, ''), COALESCE(mobile, '')
            FROM stg_stores WHERE source_id IS NOT NULL
            ON CONFLICT (source_id) DO UPDATE SET
                label = EXCLUDED.label, is_main = EXCLUDED.is_main,
                address = EXCLUDED.address, mobile = EXCLUDED.mobile
            """
        )
    elif domain == "online":
        cursor.execute(
            """
            INSERT INTO orders (
                source_id, customer_id, status, receiver, receiver_first_name, receiver_last_name,
                receiver_city, receiver_province, total_amount, shipping_amount, discount_amount,
                items_count, items_quantity, is_shopino, is_digify, shipping_id, shipping_title,
                canceled_at, created_at, updated_at_source, details_synced_at
            )
            SELECT
                s.source_id, c.id, COALESCE(s.status, ''), COALESCE(s.receiver, ''),
                COALESCE(s.receiver_first_name, ''), COALESCE(s.receiver_last_name, ''),
                COALESCE(s.receiver_city, ''), COALESCE(s.receiver_province, ''),
                COALESCE(s.total_amount, 0), COALESCE(s.shipping_amount, 0), COALESCE(s.discount_amount, 0),
                COALESCE(s.items_count, 0), s.items_quantity,
                COALESCE(s.is_shopino, 0)::boolean, COALESCE(s.is_digify, 0)::boolean,
                s.shipping_id, COALESCE(s.shipping_title, ''), s.canceled_at, s.created_at,
                s.updated_at_source, s.created_at
            FROM stg_orders s
            LEFT JOIN customers c ON c.source_id = s.customer_source_id
            WHERE s.source_id IS NOT NULL
            ON CONFLICT (source_id) DO UPDATE SET
                customer_id = EXCLUDED.customer_id,
                status = EXCLUDED.status,
                receiver = EXCLUDED.receiver,
                receiver_first_name = EXCLUDED.receiver_first_name,
                receiver_last_name = EXCLUDED.receiver_last_name,
                receiver_city = EXCLUDED.receiver_city,
                receiver_province = EXCLUDED.receiver_province,
                total_amount = EXCLUDED.total_amount,
                shipping_amount = EXCLUDED.shipping_amount,
                discount_amount = EXCLUDED.discount_amount,
                items_count = EXCLUDED.items_count,
                items_quantity = EXCLUDED.items_quantity,
                is_shopino = EXCLUDED.is_shopino,
                is_digify = EXCLUDED.is_digify,
                shipping_id = EXCLUDED.shipping_id,
                shipping_title = EXCLUDED.shipping_title,
                canceled_at = EXCLUDED.canceled_at,
                created_at = EXCLUDED.created_at,
                updated_at_source = EXCLUDED.updated_at_source,
                details_synced_at = EXCLUDED.details_synced_at
            """
        )
        cursor.execute(
            """
            INSERT INTO order_items (
                source_id, order_id, product_id, variant_id, product_source_id, variant_source_id,
                quantity, amount, discount_amount, status, title
            )
            SELECT
                s.source_id, o.id, p.id, v.id, s.product_source_id, s.variant_source_id,
                COALESCE(s.quantity, 0), COALESCE(s.amount, 0), COALESCE(s.discount_amount, 0),
                COALESCE(s.status, 1), COALESCE(p.title, '')
            FROM stg_order_items s
            JOIN orders o ON o.source_id = s.order_source_id
            LEFT JOIN products p ON p.source_id = s.product_source_id
            LEFT JOIN variants v ON v.source_id = s.variant_source_id
            WHERE s.source_id IS NOT NULL
            ON CONFLICT (source_id) DO UPDATE SET
                order_id = EXCLUDED.order_id,
                product_id = EXCLUDED.product_id,
                variant_id = EXCLUDED.variant_id,
                product_source_id = EXCLUDED.product_source_id,
                variant_source_id = EXCLUDED.variant_source_id,
                quantity = EXCLUDED.quantity,
                amount = EXCLUDED.amount,
                discount_amount = EXCLUDED.discount_amount,
                status = EXCLUDED.status,
                title = EXCLUDED.title
            """
        )
    elif domain == "pos":
        cursor.execute(
            """
            INSERT INTO pos_sales (
                source_id, customer_id, store_id, store_source_id, sales_line, type, confirmed,
                discount_amount, cash_amount, card_by_card_amount, from_wallet_amount,
                digipay_cashier_amount, snappay_cashier_amount, tracking_code, transaction_id,
                is_cancelled, deleted_at, created_at, updated_at_source
            )
            SELECT
                s.source_id, c.id, st.id, COALESCE(s.store_source_id, 0), COALESCE(s.sales_line, ''),
                COALESCE(s.type, ''), COALESCE(s.confirmed, ''),
                COALESCE(s.discount_amount, 0), COALESCE(s.cash_amount, 0), COALESCE(s.card_by_card_amount, 0),
                COALESCE(s.from_wallet_amount, 0), COALESCE(s.digipay_cashier_amount, 0),
                COALESCE(s.snappay_cashier_amount, 0), COALESCE(s.tracking_code, ''), s.transaction_id,
                COALESCE(s.is_cancelled, 0)::boolean, s.deleted_at, s.created_at, s.updated_at_source
            FROM stg_mini_orders s
            LEFT JOIN customers c ON c.source_id = s.customer_source_id
            LEFT JOIN stores st ON st.source_id = s.store_source_id
            WHERE s.source_id IS NOT NULL
            ON CONFLICT (source_id) DO UPDATE SET
                customer_id = EXCLUDED.customer_id,
                store_id = EXCLUDED.store_id,
                store_source_id = EXCLUDED.store_source_id,
                sales_line = EXCLUDED.sales_line,
                type = EXCLUDED.type,
                confirmed = EXCLUDED.confirmed,
                discount_amount = EXCLUDED.discount_amount,
                cash_amount = EXCLUDED.cash_amount,
                card_by_card_amount = EXCLUDED.card_by_card_amount,
                from_wallet_amount = EXCLUDED.from_wallet_amount,
                digipay_cashier_amount = EXCLUDED.digipay_cashier_amount,
                snappay_cashier_amount = EXCLUDED.snappay_cashier_amount,
                tracking_code = EXCLUDED.tracking_code,
                transaction_id = EXCLUDED.transaction_id,
                is_cancelled = EXCLUDED.is_cancelled,
                deleted_at = EXCLUDED.deleted_at,
                created_at = EXCLUDED.created_at,
                updated_at_source = EXCLUDED.updated_at_source
            """
        )
        cursor.execute(
            """
            INSERT INTO pos_sale_items (
                source_id, pos_sale_id, product_id, variant_id, product_source_id, variant_source_id,
                quantity, amount, discount_amount, real_amount, type, store_source_id,
                reference_item_source_id, deleted_at, created_at_source
            )
            SELECT
                s.source_id, ps.id, p.id, v.id, s.product_source_id, s.variant_source_id,
                COALESCE(s.quantity, 0), COALESCE(s.amount, 0), COALESCE(s.discount_amount, 0),
                s.real_amount, COALESCE(s.type, ''), s.store_source_id, s.reference_item_source_id,
                s.deleted_at, s.created_at_source
            FROM stg_mini_order_items s
            LEFT JOIN pos_sales ps ON ps.source_id = s.mini_order_source_id
            LEFT JOIN products p ON p.source_id = s.product_source_id
            LEFT JOIN variants v ON v.source_id = s.variant_source_id
            WHERE s.source_id IS NOT NULL
            ON CONFLICT (source_id) DO UPDATE SET
                pos_sale_id = EXCLUDED.pos_sale_id,
                product_id = EXCLUDED.product_id,
                variant_id = EXCLUDED.variant_id,
                product_source_id = EXCLUDED.product_source_id,
                variant_source_id = EXCLUDED.variant_source_id,
                quantity = EXCLUDED.quantity,
                amount = EXCLUDED.amount,
                discount_amount = EXCLUDED.discount_amount,
                real_amount = EXCLUDED.real_amount,
                type = EXCLUDED.type,
                store_source_id = EXCLUDED.store_source_id,
                reference_item_source_id = EXCLUDED.reference_item_source_id,
                deleted_at = EXCLUDED.deleted_at,
                created_at_source = EXCLUDED.created_at_source
            """
        )
    elif domain == "gateway_payments":
        cursor.execute(
            """
            INSERT INTO online_invoices (
                source_id, order_source_id, order_id, amount, status, inv_type,
                created_at, updated_at_source
            )
            SELECT
                s.source_id, s.order_source_id, o.id, COALESCE(s.amount, 0),
                COALESCE(s.status, ''), COALESCE(s.inv_type, ''), s.created_at, s.updated_at_source
            FROM stg_invoices s
            LEFT JOIN orders o ON o.source_id = s.order_source_id
            WHERE s.source_id IS NOT NULL
            ON CONFLICT (source_id) DO UPDATE SET
                order_source_id = EXCLUDED.order_source_id,
                order_id = EXCLUDED.order_id,
                amount = EXCLUDED.amount,
                status = EXCLUDED.status,
                inv_type = EXCLUDED.inv_type,
                created_at = EXCLUDED.created_at,
                updated_at_source = EXCLUDED.updated_at_source
            """
        )
        cursor.execute(
            """
            INSERT INTO online_payments (
                source_id, invoice_id, gateway, status, amount, success_at, paid_at,
                created_at, updated_at_source
            )
            SELECT
                p.source_id,
                i.id,
                COALESCE(p.gateway, ''),
                COALESCE(p.status, ''),
                COALESCE(inv.amount, 0),
                p.success_at,
                COALESCE(p.success_at, inv.updated_at_source, p.created_at, inv.created_at),
                p.created_at,
                p.updated_at_source
            FROM stg_payments p
            JOIN stg_invoices inv ON inv.source_id = p.invoice_source_id
            JOIN online_invoices i ON i.source_id = p.invoice_source_id
            WHERE p.source_id IS NOT NULL
            ON CONFLICT (source_id) DO UPDATE SET
                invoice_id = EXCLUDED.invoice_id,
                gateway = EXCLUDED.gateway,
                status = EXCLUDED.status,
                amount = EXCLUDED.amount,
                success_at = EXCLUDED.success_at,
                paid_at = EXCLUDED.paid_at,
                created_at = EXCLUDED.created_at,
                updated_at_source = EXCLUDED.updated_at_source
            """
        )


def _fill_variant_size_color(cursor):
    cursor.execute(
        """
        UPDATE variants v
        SET size = COALESCE(NULLIF(va.value, ''), pav.value, v.size)
        FROM variant_attributes va
        JOIN product_attributes a ON a.id = va.attribute_id AND a.name = 'size'
        LEFT JOIN product_attribute_values pav ON pav.id = va.attribute_value_id
        WHERE va.variant_id = v.id
        """
    )


def _fill_address_labels(cursor):
    cursor.execute(
        """
        UPDATE customer_addresses a
        SET province_name = COALESCE(p.name, a.province_name)
        FROM cities c
        LEFT JOIN provinces p ON p.id = c.province_id
        WHERE a.city_id = c.id
        """
    )


def _is_full_import(selected):
    return set(selected) >= {
        "customers",
        "addresses",
        "products",
        "variants",
        "online",
        "pos",
    }


def _prune_to_dump(cursor):
    """Remove leftover API-bootstrap rows whose source_id is not in the dump."""
    pairs = [
        ("order_items", "stg_order_items"),
        ("orders", "stg_orders"),
        ("pos_sale_items", "stg_mini_order_items"),
        ("pos_sales", "stg_mini_orders"),
        ("customer_addresses", "stg_addresses"),
        ("variant_attributes", None),
        ("product_categories", None),
        ("variants", "stg_varieties"),
        ("products", "stg_products"),
        ("customers", "stg_customers"),
    ]
    cursor.execute(
        """
        DELETE FROM variant_attributes va
        WHERE NOT EXISTS (
            SELECT 1 FROM variants v WHERE v.id = va.variant_id
        )
        """
    )
    for table, staging in pairs:
        if staging is None:
            continue
        cursor.execute(
            f"""
            DELETE FROM {table} t
            WHERE NOT EXISTS (
                SELECT 1 FROM {staging} s WHERE s.source_id = t.source_id
            )
            """
        )
    _refresh_customer_stats(cursor)


def _refresh_customer_stats(cursor):
    cursor.execute(
        """
        WITH online AS (
            SELECT customer_id, COUNT(*) AS cnt, MIN(created_at) AS first_at, MAX(created_at) AS last_at
            FROM orders WHERE customer_id IS NOT NULL
            GROUP BY customer_id
        ),
        pos AS (
            SELECT customer_id, COUNT(*) AS cnt, MIN(created_at) AS first_at, MAX(created_at) AS last_at
            FROM pos_sales WHERE customer_id IS NOT NULL AND deleted_at IS NULL
            GROUP BY customer_id
        )
        UPDATE customers c SET
            order_count = COALESCE(o.cnt, 0) + COALESCE(p.cnt, 0),
            first_order_at = CASE
                WHEN o.first_at IS NULL THEN p.first_at
                WHEN p.first_at IS NULL THEN o.first_at
                ELSE LEAST(o.first_at, p.first_at)
            END,
            last_order_at = CASE
                WHEN o.last_at IS NULL THEN p.last_at
                WHEN p.last_at IS NULL THEN o.last_at
                ELSE GREATEST(o.last_at, p.last_at)
            END
        FROM customers cx
        LEFT JOIN online o ON o.customer_id = cx.id
        LEFT JOIN pos p ON p.customer_id = cx.id
        WHERE c.id = cx.id
        """
    )
