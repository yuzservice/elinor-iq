"""Product 360: one product from the summary tables, rule-based suggestions, buyers and call lists.

Sales figures come from product_daily_sales / product_metrics. Buyers and prospects need customers, so they read the
qualifying items of this product (or its category's products) through apps.sales.semantics, by indexed product id.
A suggestion is shown only when its data exists. Rules: docs/business-rules/products.md."""

import math
from collections import Counter, defaultdict
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.db.models import BigIntegerField, ExpressionWrapper, F
from django.utils import timezone

from apps.customers.models import Customer, CustomerMetrics
from apps.customers.operators import operator_customer_ids
from apps.customers.tiers import tier_label, tier_title_map
from apps.sales.semantics import qualifying_online_items, qualifying_pos_items

from .categories import descendant_ids, tree
from .models import CentralStock, Product, ProductMetrics, Variant
from .report import LINES, Scope, _fetch, _plain, bundles, comparable, stock_enabled

CHART_DAYS = 180
PROSPECT_DAYS = 90


def _line_rows(product_ids, start, end):
    rows = _fetch(
        """SELECT product_id, sales_line, SUM(units)::bigint AS units, SUM(net_units)::bigint AS net, SUM(revenue)::bigint AS revenue,
                  SUM(discounted_units)::bigint AS disc
           FROM product_daily_sales WHERE product_id = ANY(%s) AND day BETWEEN %s AND %s GROUP BY 1, 2""",
        [list(product_ids), start, end],
    )
    return rows


def _purchases(product_ids, since=None):
    """(customer_id, invoice key, created_at, quantity) of qualifying sold lines of these products, internal accounts left out."""
    online = qualifying_online_items().filter(product_id__in=product_ids, order__customer_id__isnull=False)
    pos = qualifying_pos_items().filter(product_id__in=product_ids, pos_sale__customer_id__isnull=False)
    if since:
        online, pos = online.filter(order__created_at__gte=since), pos.filter(pos_sale__created_at__gte=since)
    internal = operator_customer_ids()
    rows = [(c, f"o{i}", at, q) for c, i, at, q in online.values_list("order__customer_id", "order_id", "order__created_at", "quantity")]
    rows += [(c, f"p{i}", at, q) for c, i, at, q in pos.values_list("pos_sale__customer_id", "pos_sale_id", "pos_sale__created_at", "quantity")]
    return [row for row in rows if row[0] not in internal]


def buyer_ids(product_id):
    return {row[0] for row in _purchases([product_id])}


def prospect_ids(product_id, category_id):
    """Bought any product of the category (with descendants) in the last 90 days, never this product."""
    if not category_id:
        return set()
    products = list(ProductMetrics.objects.filter(category_id__in=descendant_ids([category_id])).values_list("product_id", flat=True))
    recent = {row[0] for row in _purchases(products, since=timezone.now() - timedelta(days=PROSPECT_DAYS))}
    return recent - buyer_ids(product_id)


def _buyers(product_id):
    rows = _purchases([product_id])
    if not rows:
        return None
    per_customer = defaultdict(lambda: {"units": 0, "invoices": set(), "first": None})
    for customer, invoice, at, quantity in rows:
        entry = per_customer[customer]
        entry["units"] += quantity or 0
        entry["invoices"].add(invoice)
        entry["first"] = at if entry["first"] is None or at < entry["first"] else entry["first"]
    first_ever = dict(CustomerMetrics.objects.filter(customer_id__in=per_customer).values_list("customer_id", "first_purchase_at"))
    new = sum(1 for cid, entry in per_customer.items() if first_ever.get(cid) and entry["first"] <= first_ever[cid])
    repeat = sum(1 for entry in per_customer.values() if entry["units"] > 1 or len(entry["invoices"]) > 1)
    # Basket = line total of every qualifying line on the invoices that hold this product (same shape for both channels).
    orders = [int(key[1:]) for _, key, _, _ in rows if key[0] == "o"]
    sales = [int(key[1:]) for _, key, _, _ in rows if key[0] == "p"]
    totals = Counter()
    line = ExpressionWrapper(F("amount") * F("quantity"), output_field=BigIntegerField())
    for order_id, amount in qualifying_online_items().filter(order_id__in=orders).values_list("order_id", line):
        totals[f"o{order_id}"] += amount or 0
    for sale_id, amount in qualifying_pos_items().filter(pos_sale_id__in=sales).values_list("pos_sale_id", line):
        totals[f"p{sale_id}"] += amount or 0
    titles = tier_title_map()
    tiers = Counter(Customer.objects.filter(pk__in=per_customer).values_list("tier_code", flat=True))
    return {
        "buyers": len(per_customer),
        "new_share": new / len(per_customer),
        "repeat_share": repeat / len(per_customer),
        "avg_basket": sum(totals.values()) / len(totals) if totals else None,
        "tiers": [{"code": code, "label": tier_label(code, titles), "count": n} for code, n in tiers.most_common() if code],
    }


def _variant_needs(product_id, as_of, first_sale, lead, with_stock=True):
    """Per variant: speed per day × lead time (− central stock when stock is on), the largest first. Speed uses the same
    basis as ProductMetrics.weekly_speed: net units of the last 28 days over min(28, days since first sale), at least 7 days."""
    end, start = as_of, as_of - timedelta(days=27)
    days = max(min(28, (as_of - first_sale).days + 1), 7)
    rows = _fetch(
        """SELECT d.variant_id, SUM(d.net_units)::bigint AS net FROM product_daily_sales d
           WHERE d.product_id = %s AND d.day BETWEEN %s AND %s AND d.variant_id IS NOT NULL GROUP BY 1""",
        [product_id, start, end],
    )
    stock = dict(CentralStock.objects.filter(product_id=product_id).values_list("variant_id", "balance")) if with_stock else None
    variants = {v.pk: v for v in Variant.objects.filter(pk__in=[r["variant_id"] for r in rows])}
    needs = []
    for row in rows:
        variant = variants.get(row["variant_id"])
        if variant is None or (stock is not None and row["variant_id"] not in stock):
            continue
        need = math.ceil(max(row["net"], 0) / days * lead) - (max(stock[row["variant_id"]], 0) if stock is not None else 0)
        if need > 0:
            needs.append({"size": variant.size, "color": variant.color_name, "need": need})
    return sorted(needs, key=lambda n: -n["need"])


def product_detail(product_id, params, today=None):
    params = _plain(params)
    product = Product.objects.filter(pk=product_id).first()
    metrics = ProductMetrics.objects.filter(product_id=product_id).first()
    if product is None:
        return None
    scope = Scope({**params, "lines": ""}, today)
    start, end, days = scope.start, scope.end, (scope.end - scope.start).days + 1
    has_compare = comparable(list(LINES), scope.cfrom)
    nodes = {n["id"]: n for n in tree(include_inactive=True)}
    category_id = metrics.category_id if metrics else None
    category = nodes.get(category_id, {})
    cat_title = category.get("title", "")

    cur = _line_rows([product_id], start, end)
    prev = _line_rows([product_id], scope.cfrom, scope.cto) if has_compare else []
    units = sum(r["units"] for r in cur)
    net = sum(r["net"] for r in cur)
    revenue = sum(r["revenue"] for r in cur)
    disc = sum(r["disc"] for r in cur)
    prev_net, prev_revenue = sum(r["net"] for r in prev), sum(r["revenue"] for r in prev)
    first_sale = metrics.first_sale_date if metrics else None
    weeks = max(min(days, (end - first_sale).days + 1 if first_sale else days), 7) / 7
    speed = net / weeks

    # Branches: product share of each line ÷ the category's share of that line (same range).
    cat_products = list(ProductMetrics.objects.filter(category_id=category_id).values_list("product_id", flat=True)) if category_id else []
    cat_lines = Counter()
    for row in _line_rows(cat_products, start, end) if cat_products else []:
        cat_lines[row["sales_line"]] += row["units"]
    cat_total = sum(cat_lines.values())
    by_line = {r["sales_line"]: r for r in cur}
    last = (metrics.last_sale_by_line if metrics else {}) or {}
    branches = []
    for line in LINES:
        line_units = by_line.get(line, {}).get("units", 0)
        share = line_units / units if units else None
        cat_share = cat_lines[line] / cat_total if cat_total else None
        index = share / cat_share if share is not None and cat_share else None
        branches.append({"line": line, "units": line_units, "share": share, "index": index, "last_sale": last.get(line)})

    # Daily chart from the first sale (last 180 days for older products), with the category's typical day.
    chart_start = max(first_sale or start, end - timedelta(days=CHART_DAYS - 1))
    daily = {r["day"]: r["n"] for r in _fetch(
        "SELECT day, SUM(net_units)::bigint AS n FROM product_daily_sales WHERE product_id = %s AND day BETWEEN %s AND %s GROUP BY day",
        [product_id, chart_start, end])}
    series = [{"day": chart_start + timedelta(days=i), "units": daily.get(chart_start + timedelta(days=i), 0)} for i in range((end - chart_start).days + 1)]

    sizes = _fetch(
        """SELECT COALESCE(NULLIF(TRIM(v.color_name), ''), '—') AS color, COALESCE(NULLIF(UPPER(TRIM(v.size)), ''), '—') AS size,
                  SUM(d.net_units)::bigint AS units
           FROM product_daily_sales d JOIN variants v ON v.id = d.variant_id
           WHERE d.product_id = %s AND d.day BETWEEN %s AND %s GROUP BY 1, 2""",
        [product_id, start, end],
    )
    price = Variant.objects.filter(product_id=product_id, deleted_at__isnull=True).values_list("final_price", "price")
    prices = [fp or p for fp, p in price if (fp or p)]

    first14_rank = None
    if metrics and category_id:
        peers = list(ProductMetrics.objects.filter(category_id=category_id, first_sale_date__gte=end - timedelta(days=365))
                     .order_by("-units_first14").values_list("product_id", flat=True))
        first14_rank = peers.index(product_id) + 1 if product_id in peers else None

    pair_rows = bundles({**params, "product_id": str(product_id), "level": "product"}, today)
    prospects = len(prospect_ids(product_id, category_id))
    lead = settings.PRODUCTS_RULES["lead_time_days"]

    tips = []
    status = metrics.status if metrics else None
    stock_on = stock_enabled()
    central = metrics.central_stock if metrics and stock_on else None
    if metrics and not stock_on and metrics.weekly_speed > 0 and status in ("driver", "growth", "normal"):
        # Stock off: a sales forecast only, with the variants that sell fastest; no stock numbers, no charge advice.
        per_day = metrics.weekly_speed / 7
        tips.append({"kind": "forecast", "units": math.ceil(per_day * lead), "lead": lead, "per_day": per_day,
                     "fastest": _variant_needs(product_id, metrics.as_of, metrics.first_sale_date, lead, with_stock=False)[:3]})
    if metrics and central is not None and metrics.weekly_speed > 0 and status in ("driver", "growth", "normal"):
        per_day = metrics.weekly_speed / 7
        need = math.ceil(per_day * lead) - central
        if need > 0:
            tips.append({"kind": "charge", "need": need, "lead": lead, "per_day": per_day, "central": central, "dropped": metrics.stock_flag == "out",
                         "needs": _variant_needs(product_id, metrics.as_of, metrics.first_sale_date, lead)[:3]})
    known = [b for b in branches if b["index"] is not None and b["units"] >= 5]
    if known:
        best = max(known, key=lambda b: b["index"])
        worst = min((b for b in branches if b["index"] is not None), key=lambda b: b["index"])
        if best["index"] >= 1.2:
            tips.append({"kind": "branch", "best": best, "worst": worst if worst["index"] < 0.8 else None})
    strong = [p for p in pair_rows["results"] if p["lift"] >= 2]
    if strong:
        tips.append({"kind": "bundle", "pair": strong[0], "comparable": pair_rows["comparable"]})
    if units >= 10:
        share = disc / units
        if status in ("driver", "growth") and share < 0.2:
            tips.append({"kind": "no_discount", "share": share})
        elif status in ("slow", "stale") and share < 0.2:
            tips.append({"kind": "try_discount", "share": share})
    if prospects:
        tips.append({"kind": "prospects", "count": prospects, "days": PROSPECT_DAYS})

    return {
        "id": product.pk, "title": (product.title or "").split("|")[0].strip(), "code": product.sku or str(product.source_id),
        "status": status, "stock_enabled": stock_on,
        **({"stock_flag": metrics.stock_flag if metrics else "", "central_stock": central} if stock_on else {}),
        "category": {"id": category_id, "title": cat_title, "path": category.get("path", "")},
        "first_sale_date": first_sale, "age": (end - first_sale).days if first_sale else None, "price": max(prices) if prices else None,
        "range": {"from": start, "to": end, "compare_from": scope.cfrom, "compare_to": scope.cto, "compare": scope.compare, "comparable": has_compare},
        "kpis": {
            "revenue": revenue, "units": units, "net_units": net, "speed": speed,
            "revenue_change": (revenue - prev_revenue) * 100.0 / prev_revenue if has_compare and prev_revenue else None,
            "units_change": (net - prev_net) * 100.0 / prev_net if has_compare and prev_net else None,
            "ratio": metrics.category_ratio if metrics else None, "first14": metrics.units_first14 if metrics else None,
            "first14_rank": first14_rank, "return_rate": (units - net) / units if units else None, "discount_share": disc / units if units else None,
        },
        "tips": tips,
        "daily": series, "category_day": (metrics.category_median_speed or 0) / 7 if metrics and metrics.category_median_speed else None,
        "sizes": sizes, "size_days": days,
        "branches": branches,
        "pairs": pair_rows,
        "buyers": _buyers(product_id),
        "prospects": prospects,
    }


def create_call_list(user, product_id, kind):
    """«ساخت لیست تماس از خریداران» / «لیست مشتریان مستعد» through the call center's own list + draft program path."""
    from apps.calls import lists
    from apps.calls.models import CallList, CallProgram

    product = Product.objects.get(pk=product_id)
    title = (product.title or "").split("|")[0].strip() or str(product.source_id)
    stamp = timezone.localdate().isoformat()
    if kind == "buyers":
        name, filter_params, ids = f"خریداران {title} ({stamp})", {"products": str(product.pk)}, None
        list_kind, source = CallList.KIND_FIXED, CallList.SOURCE_FILTERS
    else:
        metrics = ProductMetrics.objects.filter(product_id=product_id).first()
        ids = sorted(prospect_ids(product_id, metrics.category_id if metrics else None))
        name, filter_params = f"مستعد {title} ({stamp})", None
        list_kind, source = CallList.KIND_FIXED, CallList.SOURCE_MANUAL
        if not ids:
            return None
    with transaction.atomic():
        row = lists.new_list(user, name[:160], list_kind, source, filter_params)
        program = CallProgram.objects.create(name=name[:160], list=row, created_by=user)
    lists.start_fill(row, ids)
    return {"list_id": row.pk, "program_id": program.pk, "name": row.name}
