from io import BytesIO

from openpyxl import Workbook
from openpyxl.styles import Font

from apps.core.dates import format_jalali_date
from apps.customers.presentation import INCOMPLETE_LABEL, UNNAMED_CUSTOMER

EXPORT_LIMIT = 50_000

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
        row.get("tier_label") or "—",
        int(row.get("order_count") or 0),
        int(row.get("lifetime_purchase_amount") or 0),
        format_jalali_date(row.get("first_purchase_at")) or "—",
        format_jalali_date(row.get("last_purchase_at")) or "—",
        int(row.get("online_count") or 0),
        int(row.get("pos_count") or 0),
        sales_lines,
        export_status_label(row),
    ]


def build_customer_export_xlsx(rows, *, truncated=False, total=0):
    wb = Workbook()
    ws = wb.active
    ws.title = "مشتریان"

    header_row_index = 1
    if truncated:
        ws.append([f"توجه: فقط {len(rows):,} از {total:,} مشتری صادر شد (حداکثر {EXPORT_LIMIT:,} ردیف)."])
        ws.append([])
        header_row_index = 3

    ws.append(EXPORT_HEADERS)
    for row in rows:
        ws.append(export_row_cells(row))

    for cell in ws[header_row_index]:
        cell.font = Font(bold=True)

    bio = BytesIO()
    wb.save(bio)
    return bio.getvalue()
