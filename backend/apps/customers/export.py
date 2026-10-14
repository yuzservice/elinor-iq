import csv
from io import StringIO

from apps.core.dates import format_jalali_date
from apps.customers.presentation import INCOMPLETE_LABEL, UNNAMED_CUSTOMER

EXPORT_BATCH_SIZE = 500

EXPORT_HEADERS = [
    "نام و نام خانوادگی",
    "موبایل",
    "سطح مشتری",
    "تعداد خرید",
    "کل مبلغ خرید (تومان)",
    "اولین خرید",
    "آخرین خرید",
    "خرید آنلاین",
    "خرید حضوری",
    "خطوط فروش استفاده‌شده",
    "وضعیت",
]


def export_status_label(row):
    parts = []
    status_label = row.get("status_label") or ""
    if status_label and status_label != "—":
        parts.append(status_label)
    if row.get("incomplete"):
        parts.append(row.get("incomplete_label") or INCOMPLETE_LABEL)
    return " · ".join(parts) if parts else "—"


def export_row_cells(row):
    name = row.get("name") or UNNAMED_CUSTOMER
    if row.get("name_is_fallback"):
        name = UNNAMED_CUSTOMER

    mobile = (row.get("mobile") or "").strip()
    if not mobile:
        mobile = INCOMPLETE_LABEL

    sales_line_labels = row.get("sales_line_labels") or []
    sales_lines = "، ".join(sales_line_labels) if sales_line_labels else "—"

    return [
        name,
        mobile,
        row.get("operator_label") or row.get("tier_label") or "—",
        int(row.get("order_count") or 0),
        int(row.get("lifetime_purchase_amount") or 0),
        format_jalali_date(row.get("first_purchase_at")) or "—",
        format_jalali_date(row.get("last_purchase_at")) or "—",
        int(row.get("online_count") or 0),
        int(row.get("pos_count") or 0),
        sales_lines,
        export_status_label(row),
    ]


def iter_export_row_batches(qs, batch_size=None):
    from apps.customers.list_query import hydrate_customer_rows

    if batch_size is None:
        batch_size = EXPORT_BATCH_SIZE

    offset = 0
    while True:
        batch = list(qs[offset : offset + batch_size])
        if not batch:
            break
        yield hydrate_customer_rows(batch)
        if len(batch) < batch_size:
            break
        offset += batch_size


def iter_customer_export_csv(row_batches):
    buffer = StringIO()
    buffer.write("\ufeff")
    writer = csv.writer(buffer)
    writer.writerow(EXPORT_HEADERS)
    yield buffer.getvalue().encode("utf-8")

    for rows in row_batches:
        buffer = StringIO()
        writer = csv.writer(buffer)
        for row in rows:
            writer.writerow(export_row_cells(row))
        chunk = buffer.getvalue()
        if chunk:
            yield chunk.encode("utf-8")
