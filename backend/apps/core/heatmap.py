"""«شلوغ‌ترین ساعت‌ها» heatmap: weekday × hour (08:00–23:00) average sales per hour, Tehran time.

A separate lazy endpoint from the home summary (cached ≥10 min, apps.core.home_cache), so it never blocks the main
page. Respects the home page's branch (sales line) filter and ``HIDDEN_SALES_LINES``
(``apps.sales.semantics.visible_sales_lines``, via ``apps.core.home.parse_lines``).

No stored hourly aggregate exists — ``sales_daily_summary`` is daily-only — so this reads the raw sales tables
directly, the same qualifying/visible helpers as the home summary (``apps.sales.semantics``). A window of at least
28 days gives a statistically meaningful per-weekday average; a shorter selected range falls back to the last 8
weeks (``FALLBACK_DAYS``), with the window end always excluding today (a partial day would skew its weekday's
average). Rules: docs/business-rules/home-and-targets.md."""

from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.db.models import BigIntegerField, ExpressionWrapper, F
from django.utils import timezone

from apps.sales.analysis import WEEKDAY_LABELS
from apps.sales.models import SalesLine
from apps.sales.semantics import online_order_value_orders, visible_pos_items

from .home import _day_start, parse_lines, resolve_window

TEHRAN = ZoneInfo("Asia/Tehran")
HOURS = tuple(range(8, 24))
MIN_DAYS = 28  # a range at least this long is used as is; shorter ranges fall back to the last 8 weeks
FALLBACK_DAYS = 56  # 8 weeks


def _weekday_index(local_dt):
    """0 = شنبه (Saturday) .. 6 = جمعه (Friday), matching WEEKDAY_LABELS."""
    return (local_dt.weekday() + 2) % 7


def resolve_range(params, now=None):
    """(start, end, is_selected_range) as aware datetimes, end exclusive, today always excluded."""
    now = timezone.localtime(now or timezone.now())
    today = now.date()
    try:
        start, _end, *_ = resolve_window(params, now)
        start_date = timezone.localtime(start).date()
    except ValueError:
        start_date = today - timedelta(days=MIN_DAYS)
    span_days = (today - start_date).days
    if span_days >= MIN_DAYS:
        return _day_start(start_date), _day_start(today), True
    return _day_start(today - timedelta(days=FALLBACK_DAYS)), _day_start(today), False


def _weekday_counts(start, end):
    """How many times each weekday occurs in [start, end) — the denominator of its average."""
    counts = [0] * 7
    day = timezone.localtime(start).date()
    last = timezone.localtime(end).date()
    while day < last:
        counts[_weekday_index(datetime.combine(day, time.min))] += 1
        day += timedelta(days=1)
    return counts


def busiest_hours(params, now=None):
    lines = parse_lines(params.get("line"))
    start, end, is_selected_range = resolve_range(params, now)
    counts = _weekday_counts(start, end)

    sums = {}  # (weekday, hour) -> total sales
    pos_lines = [line for line in lines if line != SalesLine.ONLINE]
    if SalesLine.ONLINE in lines:
        for created_at, amount in (
            online_order_value_orders()
            .filter(created_at__gte=start, created_at__lt=end)
            .values_list("created_at", "total_amount")
        ):
            local = timezone.localtime(created_at, TEHRAN)
            if local.hour in HOURS:
                key = (_weekday_index(local), local.hour)
                sums[key] = sums.get(key, 0) + int(amount or 0)
    if pos_lines:
        line_amount = ExpressionWrapper(F("amount") * F("quantity"), output_field=BigIntegerField())
        for created_at, value in (
            visible_pos_items()
            .filter(pos_sale__created_at__gte=start, pos_sale__created_at__lt=end, pos_sale__sales_line__in=pos_lines)
            .annotate(v=line_amount)
            .values_list("pos_sale__created_at", "v")
        ):
            local = timezone.localtime(created_at, TEHRAN)
            if local.hour in HOURS:
                key = (_weekday_index(local), local.hour)
                sums[key] = sums.get(key, 0) + int(value or 0)

    peak = None
    rows = []
    for weekday in range(7):
        denom = counts[weekday] or 1
        cells = []
        for hour in HOURS:
            avg_sales = round(sums.get((weekday, hour), 0) / denom)
            cells.append({"hour": hour, "avg_sales": avg_sales})
            if peak is None or avg_sales > peak["avg_sales"]:
                peak = {"weekday": weekday, "day": WEEKDAY_LABELS[weekday], "hour": hour, "avg_sales": avg_sales}
        rows.append({"weekday": weekday, "day": WEEKDAY_LABELS[weekday], "cells": cells})

    return {
        "range": {"from": start, "to": end, "is_selected_range": is_selected_range, "lines": lines},
        "rows": rows,
        "peak": peak,
    }
