"""Sales analysis v1 — branch comparison, trends, products, returns."""

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.db.models import Count, Exists, F, Max, OuterRef, Q, Sum, Value
from django.db.models.functions import Coalesce, ExtractHour, NullIf, TruncDate
from django.utils import timezone

TEHRAN = ZoneInfo("Asia/Tehran")

from apps.core.dates import format_jalali_date
from apps.sales.models import OrderItem, PosSale, PosSaleItem, SalesLine
from apps.sales.semantics import (
    POS_TYPE_BOTH,
    POS_TYPE_REFUND,
    POS_TYPE_SELL,
    SALES_LINE_OVERVIEW_LABELS,
    filter_by_sales_line_online,
    filter_by_sales_line_pos,
    online_order_value_orders,
    pos_exchange_replacement_items,
    pos_exchange_sales,
    pos_refund_items,
    pos_refund_sales,
    qualifying_online_items,
    qualifying_online_orders,
    qualifying_pos_items,
    qualifying_pos_sales,
)

WEEKDAY_LABELS = (
    "شنبه",
    "یکشنبه",
    "دوشنبه",
    "سه‌شنبه",
    "چهارشنبه",
    "پنجشنبه",
    "جمعه",
)

TREND_GROUPS = frozenset({"daily", "weekly", "monthly", "weekday", "hourly"})


def _empty_trend_bucket():
    return {"purchase_count": 0, "units_sold": 0, "amount": 0}


def _pos_line_total_expr():
    line_from_parts = Coalesce(F("amount"), Value(0)) * Coalesce(F("quantity"), Value(0))
    return Coalesce(NullIf(F("real_amount"), Value(0)), line_from_parts)


def parse_trend_group(raw):
    group = (raw or "daily").strip().lower()
    return group if group in TREND_GROUPS else "daily"


def previous_window(start, end):
    duration = end - start
    return start - duration, start


def _pct_change(current, previous):
    if previous <= 0:
        return None
    return round(((current - previous) / previous) * 100, 1)


def _new_repeat_counts_online(online_qs, start):
    prior = qualifying_online_orders().filter(
        customer_id=OuterRef("customer_id"),
        created_at__lt=start,
    )
    scoped = online_qs.exclude(customer_id=None).annotate(has_prior=Exists(prior))
    new_count = scoped.filter(has_prior=False).values("customer_id").distinct().count()
    repeat_count = scoped.filter(has_prior=True).values("customer_id").distinct().count()
    return new_count, repeat_count


def _new_repeat_counts_pos(pos_qs, sales_line, start):
    prior = qualifying_pos_sales().filter(
        customer_id=OuterRef("customer_id"),
        created_at__lt=start,
    )
    if sales_line:
        prior = prior.filter(sales_line=sales_line)
    scoped = pos_qs.exclude(customer_id=None).annotate(has_prior=Exists(prior))
    new_count = scoped.filter(has_prior=False).values("customer_id").distinct().count()
    repeat_count = scoped.filter(has_prior=True).values("customer_id").distinct().count()
    return new_count, repeat_count


def core_metrics(start, end, sales_line=None):
    online_qs = filter_by_sales_line_online(
        qualifying_online_orders().filter(created_at__gte=start, created_at__lt=end),
        sales_line,
    )
    pos_qs = filter_by_sales_line_pos(
        qualifying_pos_sales().filter(created_at__gte=start, created_at__lt=end),
        sales_line,
    )
    purchase_count = online_qs.count() + pos_qs.count()
    customer_count = _distinct_customer_count(online_qs, pos_qs)

    online_units = (
        filter_by_sales_line_online(
            qualifying_online_items().filter(order__created_at__gte=start, order__created_at__lt=end),
            sales_line,
        ).aggregate(v=Sum("quantity"))["v"]
        or 0
    )
    pos_units = (
        filter_by_sales_line_pos(
            qualifying_pos_items().filter(pos_sale__created_at__gte=start, pos_sale__created_at__lt=end),
            sales_line,
        ).aggregate(v=Sum("quantity"))["v"]
        or 0
    )
    units_sold = int(online_units) + int(pos_units)
    avg_units = round(units_sold / purchase_count, 2) if purchase_count else 0

    if sales_line == SalesLine.ONLINE:
        new_count, repeat_count = _new_repeat_counts_online(online_qs, start)
    elif sales_line:
        new_count, repeat_count = _new_repeat_counts_pos(pos_qs, sales_line, start)
    else:
        new_count = _merge_unique_customer_counts(online_qs, pos_qs, start, kind="new")
        repeat_count = _merge_unique_customer_counts(online_qs, pos_qs, start, kind="repeat")

    metrics = {
        "purchase_count": purchase_count,
        "customer_count": customer_count,
        "units_sold": units_sold,
        "avg_units_per_purchase": avg_units,
        "new_customers": new_count,
        "repeat_customers": repeat_count,
    }
    if sales_line in (None, SalesLine.ONLINE):
        metrics["online_order_value"] = (
            filter_by_sales_line_online(
                online_order_value_orders().filter(created_at__gte=start, created_at__lt=end),
                sales_line,
            ).aggregate(v=Sum("total_amount"))["v"]
            or 0
        )
    return metrics


def _merge_unique_customer_counts(online_qs, pos_qs, start, kind):
    from apps.customers.models import Customer

    online_prior = qualifying_online_orders().filter(
        customer_id=OuterRef("pk"),
        created_at__lt=start,
    )
    pos_prior = qualifying_pos_sales().filter(
        customer_id=OuterRef("pk"),
        created_at__lt=start,
    )
    online_ids = set(online_qs.exclude(customer_id=None).values_list("customer_id", flat=True))
    pos_ids = set(pos_qs.exclude(customer_id=None).values_list("customer_id", flat=True))
    all_ids = online_ids | pos_ids
    if not all_ids:
        return 0
    customers = Customer.objects.filter(id__in=all_ids).annotate(
        had_online_prior=Exists(online_prior),
        had_pos_prior=Exists(pos_prior),
    )
    count = 0
    for row in customers.values("id", "had_online_prior", "had_pos_prior"):
        had_prior = row["had_online_prior"] or row["had_pos_prior"]
        if kind == "new" and not had_prior:
            count += 1
        if kind == "repeat" and had_prior:
            count += 1
    return count


def _distinct_customer_count(online_qs, pos_qs):
    from apps.customers.models import Customer

    online_ids = online_qs.exclude(customer_id=None).values("customer_id")
    pos_ids = pos_qs.exclude(customer_id=None).values("customer_id")
    if not online_ids.exists():
        return pos_ids.values("customer_id").distinct().count()
    if not pos_ids.exists():
        return online_ids.values("customer_id").distinct().count()
    return Customer.objects.filter(Q(id__in=online_ids) | Q(id__in=pos_ids)).distinct().count()


def sales_line_comparison(start, end):
    prev_start, prev_end = previous_window(start, end)
    current = _all_line_metrics(start, end)
    previous = _all_line_metrics(prev_start, prev_end)
    rows = []
    for key in (SalesLine.ONLINE, SalesLine.SARI, SalesLine.GORGAN, SalesLine.CAPRI):
        cur = current[key]
        prev = previous[key]
        row = {
            "key": key,
            "label": SALES_LINE_OVERVIEW_LABELS[key],
            **cur,
            "previous_period": {
                "purchase_count": prev["purchase_count"],
                "customer_count": prev["customer_count"],
                "units_sold": prev["units_sold"],
                "avg_units_per_purchase": prev["avg_units_per_purchase"],
                "new_customers": prev["new_customers"],
                "repeat_customers": prev["repeat_customers"],
            },
            "change_pct": {
                "purchase_count": _pct_change(cur["purchase_count"], prev["purchase_count"]),
                "units_sold": _pct_change(cur["units_sold"], prev["units_sold"]),
            },
        }
        rows.append(row)
    return rows


def _all_line_metrics(start, end):
    online_qs = qualifying_online_orders().filter(created_at__gte=start, created_at__lt=end)
    online_purchase_count = online_qs.count()
    online_customer_count = online_qs.exclude(customer_id=None).values("customer_id").distinct().count()
    online_units = int(
        qualifying_online_items()
        .filter(order__created_at__gte=start, order__created_at__lt=end)
        .aggregate(v=Sum("quantity"))["v"]
        or 0
    )
    online_new, online_repeat = _new_repeat_counts_online(online_qs, start)
    online_value = (
        online_order_value_orders()
        .filter(created_at__gte=start, created_at__lt=end)
        .aggregate(v=Sum("total_amount"))["v"]
        or 0
    )

    pos_base = qualifying_pos_sales().filter(created_at__gte=start, created_at__lt=end)
    pos_stats = {
        row["sales_line"]: row
        for row in pos_base.values("sales_line").annotate(
            purchase_count=Count("id"),
            customer_count=Count("customer_id", distinct=True),
        )
    }
    pos_units = {
        row["pos_sale__sales_line"]: int(row["units"] or 0)
        for row in qualifying_pos_items()
        .filter(pos_sale__created_at__gte=start, pos_sale__created_at__lt=end)
        .values("pos_sale__sales_line")
        .annotate(units=Sum("quantity"))
    }

    metrics = {}
    metrics[SalesLine.ONLINE] = {
        "purchase_count": online_purchase_count,
        "customer_count": online_customer_count,
        "units_sold": online_units,
        "avg_units_per_purchase": round(online_units / online_purchase_count, 2)
        if online_purchase_count
        else 0,
        "new_customers": online_new,
        "repeat_customers": online_repeat,
        "online_order_value": online_value,
    }

    for key in (SalesLine.SARI, SalesLine.GORGAN, SalesLine.CAPRI):
        stats = pos_stats.get(key, {})
        purchase_count = int(stats.get("purchase_count") or 0)
        pos_qs = pos_base.filter(sales_line=key)
        units_sold = pos_units.get(key, 0)
        new_customers, repeat_customers = _new_repeat_counts_pos(pos_qs, key, start)
        metrics[key] = {
            "purchase_count": purchase_count,
            "customer_count": int(stats.get("customer_count") or 0),
            "units_sold": units_sold,
            "avg_units_per_purchase": round(units_sold / purchase_count, 2) if purchase_count else 0,
            "new_customers": new_customers,
            "repeat_customers": repeat_customers,
        }
    return metrics


def trend_points(start, end, sales_line=None, group="daily"):
    from apps.sales.services import _bucket_key, _downsample, _ordered_bucket_keys

    buckets = {}
    if group == "daily":
        _accumulate_daily_purchases(buckets, start, end, sales_line)
        _accumulate_daily_amounts(buckets, start, end, sales_line)
    elif group in {"weekly", "monthly"}:
        daily = {}
        _accumulate_daily_purchases(daily, start, end, sales_line)
        _accumulate_daily_amounts(daily, start, end, sales_line)
        _rollup_daily_buckets(buckets, daily, group)
    elif group == "hourly":
        _accumulate_hourly_purchases(buckets, start, end, sales_line)
    elif group == "weekday":
        _accumulate_weekday_purchases(buckets, start, end, sales_line)

    ordered_keys = _ordered_bucket_keys_extended(start, end, group)
    points = []
    for key in ordered_keys:
        data = buckets.get(key["iso"], _empty_trend_bucket())
        points.append(
            {
                "date": key["iso"],
                "date_label": key["label"],
                "purchase_count": data["purchase_count"],
                "units_sold": data.get("units_sold", 0),
                "amount": data.get("amount", 0),
            }
        )
    if group == "daily" and len(points) > 120:
        from apps.sales.services import _downsample as downsample

        return downsample(points, 90)
    return points


def _accumulate_daily_purchases(buckets, start, end, sales_line):
    online_qs = filter_by_sales_line_online(
        qualifying_online_orders().filter(created_at__gte=start, created_at__lt=end),
        sales_line,
    )
    for row in online_qs.annotate(day=TruncDate("created_at", tzinfo=TEHRAN)).values("day").annotate(
        purchase_count=Count("id")
    ):
        iso = row["day"].isoformat()
        buckets.setdefault(iso, _empty_trend_bucket())["purchase_count"] += row["purchase_count"]

    pos_qs = filter_by_sales_line_pos(
        qualifying_pos_sales().filter(created_at__gte=start, created_at__lt=end),
        sales_line,
    )
    for row in pos_qs.annotate(day=TruncDate("created_at", tzinfo=TEHRAN)).values("day").annotate(
        purchase_count=Count("id")
    ):
        iso = row["day"].isoformat()
        buckets.setdefault(iso, _empty_trend_bucket())["purchase_count"] += row["purchase_count"]


def _accumulate_daily_amounts(buckets, start, end, sales_line):
    online_qs = filter_by_sales_line_online(
        online_order_value_orders().filter(created_at__gte=start, created_at__lt=end),
        sales_line,
    )
    for row in online_qs.annotate(day=TruncDate("created_at", tzinfo=TEHRAN)).values("day").annotate(
        amount=Sum("total_amount")
    ):
        iso = row["day"].isoformat()
        buckets.setdefault(iso, _empty_trend_bucket())["amount"] += int(row["amount"] or 0)

    pos_items = filter_by_sales_line_pos(
        qualifying_pos_items().filter(pos_sale__created_at__gte=start, pos_sale__created_at__lt=end),
        sales_line,
    )
    for row in pos_items.annotate(day=TruncDate("pos_sale__created_at", tzinfo=TEHRAN)).values("day").annotate(
        amount=Sum(_pos_line_total_expr())
    ):
        iso = row["day"].isoformat()
        buckets.setdefault(iso, _empty_trend_bucket())["amount"] += int(row["amount"] or 0)


def _rollup_daily_buckets(buckets, daily, group):
    from apps.sales.services import _bucket_key

    for iso, data in daily.items():
        day = date.fromisoformat(iso)
        local_dt = timezone.make_aware(datetime.combine(day, time.min), TEHRAN)
        key = _bucket_key(local_dt, group)
        bucket = buckets.setdefault(key["iso"], _empty_trend_bucket())
        bucket["purchase_count"] += data["purchase_count"]
        bucket["amount"] += data.get("amount", 0)


def _accumulate_hourly_purchases(buckets, start, end, sales_line):
    for hour in range(24):
        buckets[str(hour)] = {"purchase_count": 0, "units_sold": 0}

    online_qs = filter_by_sales_line_online(
        qualifying_online_orders().filter(created_at__gte=start, created_at__lt=end),
        sales_line,
    )
    for row in online_qs.annotate(hour=ExtractHour("created_at")).values("hour").annotate(
        purchase_count=Count("id")
    ):
        buckets[str(row["hour"])]["purchase_count"] += row["purchase_count"]

    pos_qs = filter_by_sales_line_pos(
        qualifying_pos_sales().filter(created_at__gte=start, created_at__lt=end),
        sales_line,
    )
    for row in pos_qs.annotate(hour=ExtractHour("created_at")).values("hour").annotate(
        purchase_count=Count("id")
    ):
        buckets[str(row["hour"])]["purchase_count"] += row["purchase_count"]


def _accumulate_weekday_purchases(buckets, start, end, sales_line):
    for index in range(7):
        buckets[str(index)] = {"purchase_count": 0, "units_sold": 0}

    online_qs = filter_by_sales_line_online(
        qualifying_online_orders().filter(created_at__gte=start, created_at__lt=end),
        sales_line,
    )
    for row in online_qs.only("created_at"):
        index = _weekday_index(timezone.localtime(row.created_at))
        buckets[str(index)]["purchase_count"] += 1

    pos_qs = filter_by_sales_line_pos(
        qualifying_pos_sales().filter(created_at__gte=start, created_at__lt=end),
        sales_line,
    )
    for row in pos_qs.only("created_at"):
        index = _weekday_index(timezone.localtime(row.created_at))
        buckets[str(index)]["purchase_count"] += 1


def _weekday_index(local_dt):
    return (local_dt.weekday() + 2) % 7


def _ordered_bucket_keys_extended(start, end, group):
    from apps.sales.services import _bucket_key, _ordered_bucket_keys

    if group == "weekday":
        return [{"iso": str(i), "label": WEEKDAY_LABELS[i], "sort": (i,)} for i in range(7)]
    if group == "hourly":
        return [
            {"iso": str(h), "label": f"{h:02d}:۰۰", "sort": (h,)}
            for h in range(24)
        ]
    return _ordered_bucket_keys(start, end, group)


def _product_key(product_id, product_source_id, title):
    if product_id:
        return ("id", product_id)
    if product_source_id:
        return ("src", product_source_id)
    return ("title", title or "کالا")


def product_sales_report(start, end, sales_line=None, search="", sort="units", order="desc", page=1, per_page=20):
    buckets = {}

    online_items = filter_by_sales_line_online(
        qualifying_online_items().filter(order__created_at__gte=start, order__created_at__lt=end),
        sales_line,
    ).values(
        "product_id",
        "product_source_id",
        "product__title",
        "title",
        "order_id",
        "order__customer_id",
        "order__created_at",
        "quantity",
    )
    for row in online_items:
        key = _product_key(row["product_id"], row["product_source_id"], row["product__title"] or row["title"])
        bucket = _ensure_product_bucket(buckets, key, row["product__title"] or row["title"])
        qty = int(row["quantity"] or 0)
        bucket["units_sold"] += qty
        bucket["online_units"] += qty
        bucket["purchase_ids"].add(f"online:{row['order_id']}")
        if row["order__customer_id"]:
            bucket["customer_ids"].add(row["order__customer_id"])
        created = row["order__created_at"]
        if created and (bucket["last_sale_at"] is None or created > bucket["last_sale_at"]):
            bucket["last_sale_at"] = created

    pos_items = filter_by_sales_line_pos(
        qualifying_pos_items().filter(pos_sale__created_at__gte=start, pos_sale__created_at__lt=end),
        sales_line,
    ).values(
        "product_id",
        "product_source_id",
        "product__title",
        "pos_sale_id",
        "pos_sale__customer_id",
        "pos_sale__created_at",
        "pos_sale__sales_line",
        "quantity",
    )
    for row in pos_items:
        key = _product_key(row["product_id"], row["product_source_id"], row["product__title"])
        bucket = _ensure_product_bucket(buckets, key, row["product__title"] or "کالا")
        qty = int(row["quantity"] or 0)
        line = row["pos_sale__sales_line"]
        bucket["units_sold"] += qty
        if line == SalesLine.SARI:
            bucket["sari_units"] += qty
        elif line == SalesLine.GORGAN:
            bucket["gorgan_units"] += qty
        elif line == SalesLine.CAPRI:
            bucket["capri_units"] += qty
        bucket["purchase_ids"].add(f"pos:{row['pos_sale_id']}")
        if row["pos_sale__customer_id"]:
            bucket["customer_ids"].add(row["pos_sale__customer_id"])
        created = row["pos_sale__created_at"]
        if created and (bucket["last_sale_at"] is None or created > bucket["last_sale_at"]):
            bucket["last_sale_at"] = created

    results = []
    for bucket in buckets.values():
        results.append(
            {
                "product": bucket["product"],
                "units_sold": bucket["units_sold"],
                "purchase_count": len(bucket["purchase_ids"]),
                "customer_count": len(bucket["customer_ids"]),
                "last_sale_at": bucket["last_sale_at"],
                "online_units": bucket["online_units"],
                "sari_units": bucket["sari_units"],
                "gorgan_units": bucket["gorgan_units"],
                "capri_units": bucket["capri_units"],
            }
        )

    if search:
        needle = search.strip().lower()
        results = [row for row in results if needle in row["product"].lower()]

    sort_key = {
        "units": lambda r: r["units_sold"],
        "purchases": lambda r: r["purchase_count"],
        "customers": lambda r: r["customer_count"],
        "last_sale": lambda r: r["last_sale_at"]
        or datetime(1970, 1, 1, tzinfo=timezone.get_current_timezone()),
        "title": lambda r: r["product"],
    }.get(sort, lambda r: r["units_sold"])
    results.sort(key=sort_key, reverse=(order != "asc"))

    total = len(results)
    start_idx = (page - 1) * per_page
    page_rows = results[start_idx : start_idx + per_page]
    return {"page": page, "per_page": per_page, "total": total, "results": page_rows}


def _ensure_product_bucket(buckets, key, title):
    bucket = buckets.get(key)
    if bucket is None:
        bucket = {
            "product": title or "کالا",
            "units_sold": 0,
            "online_units": 0,
            "sari_units": 0,
            "gorgan_units": 0,
            "capri_units": 0,
            "purchase_ids": set(),
            "customer_ids": set(),
            "last_sale_at": None,
        }
        buckets[key] = bucket
    return bucket


def size_color_report(start, end, sales_line=None, limit=8):
    size_counts = {}
    color_counts = {}

    online_items = filter_by_sales_line_online(
        qualifying_online_items()
        .filter(order__created_at__gte=start, order__created_at__lt=end)
        .select_related("variant"),
        sales_line,
    ).values("quantity", "variant__size", "variant__color_name")

    for row in online_items:
        _add_variant_count(size_counts, row["variant__size"], row["quantity"])
        _add_variant_count(color_counts, row["variant__color_name"], row["quantity"])

    pos_items = filter_by_sales_line_pos(
        qualifying_pos_items()
        .filter(pos_sale__created_at__gte=start, pos_sale__created_at__lt=end)
        .select_related("variant"),
        sales_line,
    ).values("quantity", "variant__size", "variant__color_name")

    for row in pos_items:
        _add_variant_count(size_counts, row["variant__size"], row["quantity"])
        _add_variant_count(color_counts, row["variant__color_name"], row["quantity"])

    return {
        "sizes": _top_variant_rows(size_counts, limit),
        "colors": _top_variant_rows(color_counts, limit),
    }


def _add_variant_count(store, label, quantity):
    if not label:
        return
    store[label] = store.get(label, 0) + int(quantity or 0)


def _top_variant_rows(store, limit):
    rows = [{"label": label, "units_sold": units} for label, units in store.items()]
    rows.sort(key=lambda row: (-row["units_sold"], row["label"]))
    return rows[:limit]


def physical_returns_report(start, end, sales_line=None):
    """POS-only returns and exchanges. Online canceled/failed are excluded."""
    pos_scope = PosSale.objects.filter(created_at__gte=start, created_at__lt=end)
    pos_scope = filter_by_sales_line_pos(pos_scope, sales_line)

    branches = []
    branch_lines = (
        [sales_line]
        if sales_line and sales_line != SalesLine.ONLINE
        else [SalesLine.SARI, SalesLine.GORGAN, SalesLine.CAPRI]
    )
    if sales_line == SalesLine.ONLINE:
        branch_lines = []

    totals = {
        "refund_count": 0,
        "exchange_count": 0,
        "refunded_item_units": 0,
        "replacement_item_units": 0,
    }

    for line in branch_lines:
        line_scope = pos_scope.filter(sales_line=line)
        refund_count = pos_refund_sales(line_scope).count()
        exchange_count = pos_exchange_sales(line_scope).count()

        refund_items = pos_refund_items().filter(
            pos_sale__created_at__gte=start,
            pos_sale__created_at__lt=end,
            pos_sale__sales_line=line,
        )
        replacement_items = pos_exchange_replacement_items().filter(
            pos_sale__created_at__gte=start,
            pos_sale__created_at__lt=end,
            pos_sale__sales_line=line,
        )
        refunded_units = int(refund_items.aggregate(v=Sum("quantity"))["v"] or 0)
        replacement_units = int(replacement_items.aggregate(v=Sum("quantity"))["v"] or 0)

        branches.append(
            {
                "key": line,
                "label": SALES_LINE_OVERVIEW_LABELS[line],
                "refund_count": refund_count,
                "exchange_count": exchange_count,
                "refunded_item_units": refunded_units,
                "replacement_item_units": replacement_units,
            }
        )
        totals["refund_count"] += refund_count
        totals["exchange_count"] += exchange_count
        totals["refunded_item_units"] += refunded_units
        totals["replacement_item_units"] += replacement_units

    return {"branches": branches, "totals": totals}


def branch_insights(start, end, sales_line=None, lines=None, include_top_product=True):
    lines = lines or sales_line_comparison(start, end)
    if sales_line:
        lines = [row for row in lines if row["key"] == sales_line]

    active = [row for row in lines if row["purchase_count"] > 0]
    insights = []

    if active:
        top_purchases = max(active, key=lambda r: r["purchase_count"])
        insights.append(
            {
                "key": "top_purchase_count",
                "label": "بیشترین تعداد خرید",
                "value": top_purchases["label"],
                "detail": f"{top_purchases['purchase_count']} خرید",
            }
        )

        top_avg = max(active, key=lambda r: r["avg_units_per_purchase"])
        insights.append(
            {
                "key": "top_avg_units",
                "label": "بیشترین میانگین کالا در خرید",
                "value": top_avg["label"],
                "detail": str(top_avg["avg_units_per_purchase"]),
            }
        )

        repeat_shares = []
        for row in active:
            if row["customer_count"] <= 0:
                continue
            share = round((row["repeat_customers"] / row["customer_count"]) * 100, 1)
            repeat_shares.append((row, share))
        if repeat_shares:
            top_repeat, share = max(repeat_shares, key=lambda item: item[1])
            insights.append(
                {
                    "key": "top_repeat_share",
                    "label": "بیشترین سهم مشتری تکراری",
                    "value": top_repeat["label"],
                    "detail": f"{share}٪",
                }
            )

    product_by_branch = _top_product_by_branch(start, end, sales_line) if include_top_product else None
    if product_by_branch:
        insights.append(
            {
                "key": "top_product_by_branch",
                "label": "قوی‌ترین محصول در هر شعبه",
                "value": product_by_branch["label"],
                "detail": product_by_branch["detail"],
            }
        )

    return insights


def _top_product_by_branch(start, end, sales_line=None):
    parts = []
    targets = (
        [sales_line]
        if sales_line
        else [SalesLine.ONLINE, SalesLine.SARI, SalesLine.GORGAN, SalesLine.CAPRI]
    )
    for line in targets:
        top = _top_product_for_line(start, end, line)
        if top:
            parts.append(f"{SALES_LINE_OVERVIEW_LABELS[line]}: {top['product']} ({top['units']} واحد)")
    if not parts:
        return None
    return {"label": parts[0].split(": ", 1)[-1], "detail": " · ".join(parts)}


def _top_product_for_line(start, end, sales_line):
    counts = {}
    if sales_line == SalesLine.ONLINE:
        rows = (
            qualifying_online_items()
            .filter(order__created_at__gte=start, order__created_at__lt=end)
            .values("product__title", "title")
            .annotate(units=Sum("quantity"))
        )
    else:
        rows = (
            qualifying_pos_items()
            .filter(
                pos_sale__created_at__gte=start,
                pos_sale__created_at__lt=end,
                pos_sale__sales_line=sales_line,
            )
            .values("product__title")
            .annotate(units=Sum("quantity"))
        )
    for row in rows:
        title = row.get("product__title") or row.get("title") or "کالا"
        counts[title] = counts.get(title, 0) + int(row["units"] or 0)
    if not counts:
        return None
    product, units = max(counts.items(), key=lambda item: item[1])
    return {"product": product, "units": units}
