"""Coverage notices for incomplete live API windows."""

from datetime import date

from django.db.models import Count, Max
from django.utils import timezone

from apps.sales.models import PosSale, SalesLine
from apps.sales.semantics import SALES_LINE_OVERVIEW_LABELS

PARTIAL_DATA = False
COVERAGE_MESSAGE = ""
POS_STALE_DAYS = 1
HISTORICAL_IMPORT_MAX_DATE = date(2026, 9, 13)
POS_BRANCH_LINES = (SalesLine.SARI, SalesLine.GORGAN, SalesLine.CAPRI)


def pos_sync_status():
    today = timezone.localdate()
    by_line = []
    stale_lines = []
    for line in POS_BRANCH_LINES:
        agg = PosSale.objects.filter(sales_line=line).aggregate(
            max_at=Max("created_at"),
            count=Count("id"),
        )
        max_at = agg["max_at"]
        max_date = timezone.localtime(max_at).date() if max_at else None
        lag_days = (today - max_date).days if max_date else None
        row = {
            "key": line,
            "label": SALES_LINE_OVERVIEW_LABELS[line],
            "count": int(agg["count"] or 0),
            "max_date": max_date.isoformat() if max_date else None,
            "lag_days": lag_days,
        }
        by_line.append(row)
        if lag_days is not None and lag_days > POS_STALE_DAYS:
            stale_lines.append(row)

    cursor = None
    try:
        from apps.integrations.elinor.models import SyncCursor

        row = SyncCursor.objects.filter(key="pos_orders").first()
        if row:
            cursor = row.value
    except Exception:
        cursor = None

    return {
        "by_line": by_line,
        "stale_lines": stale_lines,
        "needs_sync": bool(stale_lines),
        "cursor": cursor,
        "historical_import_through": HISTORICAL_IMPORT_MAX_DATE.isoformat(),
    }


def coverage_payload():
    status = pos_sync_status()
    if PARTIAL_DATA:
        return {"partial": True, "message": COVERAGE_MESSAGE, "pos_sync": status}

    if status["needs_sync"]:
        labels = "، ".join(line["label"] for line in status["stale_lines"])
        max_lag = max(line["lag_days"] for line in status["stale_lines"])
        message = (
            f"فروش حضوری ({labels}) تا {max_lag} روز از API همگام نشده است. "
            f"دادهٔ SQL فقط تا {status['historical_import_through']} موجود است؛ "
            "برای تکمیل، sync_elinor_pos را اجرا کنید."
        )
        return {"partial": True, "message": message, "pos_sync": status}

    return {"partial": False, "message": "", "pos_sync": status}
