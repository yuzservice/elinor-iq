from datetime import datetime, timezone as dt_timezone
from zoneinfo import ZoneInfo

from apps.sales.models import STORE_SALES_LINE, SalesLine

TEHRAN = ZoneInfo("Asia/Tehran")

DUMP_TABLES = [
    "provinces",
    "cities",
    "levels",
    "customer_roles",
    "customers",
    "addresses",
    "categories",
    "category_product",
    "products",
    "colors",
    "attributes",
    "attribute_values",
    "varieties",
    "attribute_variety",
    "stores",
    "orders",
    "order_items",
    "mini_orders",
    "mini_order_items",
    "invoices",
    "payments",
]

DOMAINS = {
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

LOAD_ORDER = [
    "provinces",
    "cities",
    "levels",
    "customers",
    "addresses",
    "categories",
    "products",
    "colors",
    "attributes",
    "variants",
    "stores",
    "online",
    "pos",
    "gateway_payments",
]

INVENTORY_TABLES = {
    "store_items",
    "store_item_transactions",
    "store_transfers",
    "store_transfer_items",
    "store_transactions",
    "stores_2",
    "product_stocktakings",
    "suppliers",
}


def tables_for_domains(names):
    if not names:
        return list(DUMP_TABLES)
    tables = []
    for name in names:
        if name not in DOMAINS:
            raise ValueError(f"Unknown domain '{name}'. Choose from: {', '.join(DOMAINS)}")
        for table in DOMAINS[name]:
            if table not in tables:
                tables.append(table)
    return tables


def domains_for_tables(only):
    if not only:
        return list(LOAD_ORDER)
    unknown = [name for name in only if name not in DOMAINS]
    if unknown:
        raise ValueError(f"Unknown domain(s): {', '.join(unknown)}")
    return [name for name in LOAD_ORDER if name in only]


def sql_null(token):
    return token is None or token.strip().upper() == "NULL"


def as_text(token):
    if sql_null(token):
        return ""
    value = token.strip()
    if len(value) >= 2 and value[0] == "'" and value[-1] == "'":
        inner = value[1:-1]
        inner = inner.replace("\\'", "'").replace("\\\\", "\\")
        inner = inner.replace("\\n", "\n").replace("\\r", "\r").replace("\\t", "\t")
        return inner
    return value


def as_int(token):
    if sql_null(token):
        return None
    text = as_text(token)
    if text == "":
        return None
    try:
        return int(float(text))
    except (TypeError, ValueError):
        return None


def as_bool_int(token):
    value = as_int(token)
    if value is None:
        return 0
    return 1 if value else 0


def as_dt(token):
    if sql_null(token):
        return None
    text = as_text(token).strip()
    if not text or text.startswith("0000-00-00"):
        return None
    try:
        naive = datetime.strptime(text[:19], "%Y-%m-%d %H:%M:%S")
    except ValueError:
        try:
            naive = datetime.strptime(text[:10], "%Y-%m-%d")
        except ValueError:
            return None
    return naive.replace(tzinfo=TEHRAN).astimezone(dt_timezone.utc)


def as_date(token):
    dt = as_dt(token)
    return dt.date().isoformat() if dt else None


def iso_dt(token):
    dt = as_dt(token)
    return dt.isoformat() if dt else None


def sales_line_for_store(store_id):
    if store_id is None:
        return ""
    return STORE_SALES_LINE.get(int(store_id), "")


def csv_cell(value):
    if value is None:
        return ""
    if isinstance(value, bool):
        return "1" if value else "0"
    return str(value)


ONLINE_SALES_LINE = SalesLine.ONLINE
