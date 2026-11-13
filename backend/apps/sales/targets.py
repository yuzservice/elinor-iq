"""Monthly sales targets per sales line and their progress over a Jalali month, season or year.

The measured amount is `net_sales_by_line`, the home revenue card's figure: online order value (`online_order_value_orders`,
`Order.total_amount`) plus in-store sold lines (`visible_pos_items`, amount × quantity). Online and POS are computed
apart and only added per line. Only visible lines (`visible_sales_lines()`) are shown or saved. Rules: docs/business-rules/home-and-targets.md."""

from datetime import date, datetime, time, timedelta

import jdatetime
from django.db import transaction
from django.db.models import F, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone

from apps.core.dates import JALALI_MONTHS_FA

from .models import SalesLine, SalesTarget, SalesTargetChange
from .semantics import online_order_value_orders, visible_pos_items, visible_sales_lines

POS_START = date(2025, 5, 31)  # in-store history starts 1404/03/10
SEASONS = ("بهار", "تابستان", "پاییز", "زمستان")
STATUS_BAND = 3  # points: ahead ≥ +3, on plan within ±3, behind < −3
ROUND_TO = 1_000_000  # copied targets are rounded to a million toman


def _aware(day):
    return timezone.make_aware(datetime.combine(day, time.min))


def net_sales_by_line(start, end):
    """{line: toman} for start ≤ created_at < end (aware datetimes)."""
    online = online_order_value_orders().filter(created_at__gte=start, created_at__lt=end).aggregate(v=Sum("total_amount"))["v"] or 0
    line_total = Coalesce(F("amount"), Value(0)) * Coalesce(F("quantity"), Value(0))
    pos = {
        row["pos_sale__sales_line"]: int(row["total"] or 0)
        for row in visible_pos_items().filter(pos_sale__created_at__gte=start, pos_sale__created_at__lt=end)
        .values("pos_sale__sales_line").annotate(total=Sum(line_total))
    }
    return {line: int(online) if line == SalesLine.ONLINE else pos.get(line, 0) for line in visible_sales_lines()}


def month_days(jy, jm):
    first = jdatetime.date(jy, jm, 1)
    nxt = jdatetime.date(jy + (jm == 12), jm % 12 + 1, 1)
    return (nxt.togregorian() - first.togregorian()).days


def period_bounds(scope, today):
    """(first day, last day, [(jy, jm), ...], label) of the Jalali month, season or year holding `today` (a Gregorian date)."""
    j = jdatetime.date.fromgregorian(date=today)
    if scope == "year":
        months = [(j.year, m) for m in range(1, 13)]
        label = f"سال {j.year}"
    elif scope == "quarter":
        first = (j.month - 1) // 3 * 3 + 1
        months = [(j.year, m) for m in range(first, first + 3)]
        label = f"{SEASONS[(j.month - 1) // 3]} {j.year}"
    else:
        months = [(j.year, j.month)]
        label = f"{JALALI_MONTHS_FA[j.month - 1]} {j.year}"
    start = jdatetime.date(*months[0], 1).togregorian()
    last_year, last_month = months[-1]
    end = jdatetime.date(last_year, last_month, month_days(last_year, last_month)).togregorian()
    return start, end, months, label


def line_status(gap):
    if gap is None:
        return None
    return "ahead" if gap >= STATUS_BAND else ("on_plan" if gap >= -STATUS_BAND else "behind")


def progress(scope="month", now=None, actuals=None, lines=None):
    """Target progress for the current Jalali period. A line has a target only when every month of the period has one;
    the company figures add up the lines that have a target. Expected = elapsed days (today counted) ÷ total days.
    `lines` limits everything to those sales lines (the home «شعبه» filter)."""
    now = timezone.localtime(now or timezone.now())
    today = now.date()
    start, end, months, label = period_bounds(scope, today)
    total_days = (end - start).days + 1
    elapsed = (today - start).days + 1
    remaining = total_days - elapsed
    expected = elapsed * 100.0 / total_days

    rows = SalesTarget.objects.filter(year=months[0][0], month__in=[m for _, m in months])
    sums, counts = {}, {}
    for row in rows:
        sums[row.sales_line] = sums.get(row.sales_line, 0) + row.amount
        counts[row.sales_line] = counts.get(row.sales_line, 0) + 1
    actual = actuals if actuals is not None else net_sales_by_line(_aware(start), now)

    rows_out = []
    for line in (lines or visible_sales_lines()):
        target = sums.get(line) if counts.get(line) == len(months) else None
        pct = actual[line] * 100.0 / target if target else None
        gap = pct - expected if pct is not None else None
        rows_out.append({"line": line, "target": target, "actual": actual[line], "pct": pct, "gap": gap, "status": line_status(gap)})

    with_target = [row for row in rows_out if row["target"]]
    company = None
    if with_target:
        target = sum(row["target"] for row in with_target)
        done = sum(row["actual"] for row in with_target)
        pct = done * 100.0 / target
        company = {
            "target": target, "actual": done, "pct": pct, "gap": pct - expected,
            "pace": "ahead" if pct >= expected else "behind",
            "forecast": done * total_days / elapsed,
            "avg_daily": done / elapsed,
            "required_daily": max(target - done, 0) / remaining if remaining > 0 else None,
            "lines_included": [row["line"] for row in with_target],
        }
    return {
        "scope": scope, "label": label, "start": start, "end": end, "today": today,
        "elapsed_days": elapsed, "total_days": total_days, "remaining_days": remaining, "expected_pct": expected,
        "has_target": company is not None, "company": company, "lines": rows_out,
        "month": {"year": months[0][0], "month": jdatetime.date.fromgregorian(date=today).month},
    }


def grid(year):
    """12 months × the visible lines of the year, plus the latest changes (audit)."""
    cells = {(t.month, t.sales_line): t.amount for t in SalesTarget.objects.filter(year=year)}
    changes = SalesTargetChange.objects.filter(year=year).select_related("changed_by")[:30]
    return {
        "year": year,
        "months": [{"month": m, "name": JALALI_MONTHS_FA[m - 1], "lines": {line: cells.get((m, line)) for line in visible_sales_lines()}} for m in range(1, 13)],
        "changes": [
            {"month": c.month, "sales_line": c.sales_line, "old": c.old_amount, "new": c.new_amount, "source": c.source,
             "by": c.changed_by.username if c.changed_by else None, "at": c.changed_at}
            for c in changes
        ],
    }


def _round(value):
    return int(round(value / ROUND_TO)) * ROUND_TO


def copy_preview(year, growth_pct):
    """«کپی از سال قبل + X٪»: last year's target for the same month and line, or else last year's sales; × (1 + X/100),
    rounded to a million toman. A line-month whose sales history is incomplete (in-store before 1404/03/10) is left empty."""
    last = {(t.month, t.sales_line): t.amount for t in SalesTarget.objects.filter(year=year - 1)}
    factor = 1 + float(growth_pct) / 100
    cells = []
    for m in range(1, 13):
        start = jdatetime.date(year - 1, m, 1).togregorian()
        end = start + timedelta(days=month_days(year - 1, m))
        sales = None
        for line in visible_sales_lines():
            if (m, line) in last:
                source, base = "target", last[(m, line)]
            elif line != SalesLine.ONLINE and start < POS_START:
                source, base = "incomplete", None
            else:
                if sales is None:
                    sales = net_sales_by_line(_aware(start), _aware(end))
                source, base = "sales", sales[line]
            amount = _round(base * factor) if base else None
            cells.append({"month": m, "sales_line": line, "amount": amount, "source": source, "base": base})
    return {"year": year, "growth_pct": float(growth_pct), "cells": cells}


def save_cells(user, year, cells, source="manual"):
    """Upsert or clear cells (amount None or 0 = clear) in one transaction; one audit row per changed cell."""
    clean = []
    for cell in cells:
        month, line, amount = int(cell["month"]), cell["sales_line"], cell.get("amount")
        if not 1 <= month <= 12 or line not in visible_sales_lines():
            raise ValueError("ماه یا شعبه نامعتبر است.")
        amount = int(amount) if amount not in (None, "") else None
        if amount is not None and amount < 0:
            raise ValueError("تارگت نمی‌تواند منفی باشد.")
        clean.append((month, line, amount or None))
    changed = 0
    with transaction.atomic():
        current = {(t.month, t.sales_line): t for t in SalesTarget.objects.select_for_update().filter(year=year)}
        for month, line, amount in clean:
            row = current.get((month, line))
            old = row.amount if row else None
            if old == amount:
                continue
            if amount is None:
                row.delete()
            elif row:
                row.amount, row.updated_by = amount, user
                row.save(update_fields=["amount", "updated_by", "updated_at"])
            else:
                current[(month, line)] = SalesTarget.objects.create(year=year, month=month, sales_line=line, amount=amount,
                                                                    created_by=user, updated_by=user)
            SalesTargetChange.objects.create(year=year, month=month, sales_line=line, old_amount=old, new_amount=amount,
                                             source="clear" if amount is None else source, changed_by=user)
            changed += 1
    return changed
