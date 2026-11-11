"""Products page report from the summary tables (never the raw sales tables). Rules: docs/business-rules/products.md.

Ranges are Tehran calendar days, inclusive. A comparison is shown only where every included sales line has history for
the whole comparison range (in-store history starts 2025-05-31, online 2022-01-12); otherwise its change is None («—»)."""

from datetime import date, timedelta

from django.conf import settings
from django.db import connection
from django.utils import timezone

from .categories import product_ids_in, tree

LINES = ("ONLINE", "SARI", "GORGAN", "CAPRI")
LINE_START = {"ONLINE": date(2022, 1, 12), "SARI": date(2025, 5, 31), "GORGAN": date(2025, 5, 31), "CAPRI": date(2025, 5, 31)}
PERIOD_DAYS = {"7": 7, "30": 30, "90": 90, "365": 365}
STATUSES = ("driver", "growth", "normal", "slow", "stale")
AGE_BUCKETS = {"30": (0, 30), "90": (31, 90), "365": (91, 365), "old": (366, 100000)}
SCOPE_DAYS = 365  # products whose last sale is older than this are retired, not «راکد»
SORTS = {"title": "title", "units": "units", "revenue": "revenue", "speed": "speed", "first14": "first14", "ratio": "ratio",
         "change": "change", "age": "age", "discount": "discount_share", "returns": "return_rate"}
PAGE_SIZE = 20
TOP = 10
EXPORT_LIMIT = 5000


def _plain(params):
    """QueryDict → {key: last value}; plain dicts pass through."""
    return params.dict() if hasattr(params, "dict") else dict(params)


def _date(value):
    try:
        return date.fromisoformat(str(value))
    except (TypeError, ValueError):
        return None


def _csv(params, key, allowed=None):
    values = [v for v in str(params.get(key) or "").split(",") if v]
    return [v for v in values if allowed is None or v in allowed]


def resolve_ranges(params, today=None):
    """(from, to, compare_from, compare_to, compare_kind); compare dates are None for «بدون مقایسه»."""
    today = today or timezone.localdate()
    period = params.get("period") or "30"
    start, end = _date(params.get("from")), _date(params.get("to"))
    if period != "custom" or not start or not end:
        period = period if period in PERIOD_DAYS else "30"
        end, start = today, today - timedelta(days=PERIOD_DAYS[period] - 1)
    start, end = min(start, end), max(start, end)
    kind = params.get("compare") or "prev"
    days = (end - start).days + 1
    if kind == "none":
        return start, end, None, None, kind
    if kind == "custom" and _date(params.get("cfrom")) and _date(params.get("cto")):
        cs, ce = sorted([_date(params["cfrom"]), _date(params["cto"])])
        return start, end, cs, ce, kind
    if kind == "year":
        try:
            return start, end, start.replace(year=start.year - 1), end.replace(year=end.year - 1), kind
        except ValueError:  # 29 Feb
            return start, end, start - timedelta(days=365), end - timedelta(days=365), kind
    return start, end, start - timedelta(days=days), start - timedelta(days=1), "prev"


def comparable(lines, cfrom):
    return cfrom is not None and all(cfrom >= LINE_START[line] for line in lines)


def stock_enabled():
    """Owner switch (2026-11-11): stock is off until the Elinor warehouse API exists; products run on sales speed only."""
    return settings.PRODUCTS_STOCK_ENABLED


class Scope:
    """Product-level filters shared by the table, the cards, the branch strip and bundles."""

    def __init__(self, params, today=None):
        self.today = today or timezone.localdate()
        self.start, self.end, self.cfrom, self.cto, self.compare = resolve_ranges(params, self.today)
        self.lines = _csv(params, "lines", LINES) or list(LINES)
        self.statuses = _csv(params, "status", STATUSES)
        # Stock filters exist only while stock is enabled; old URLs keep working because the param is then ignored.
        self.stock = _csv(params, "stock", ("charge", "out", "ok")) if stock_enabled() else []
        self.ages = _csv(params, "age", AGE_BUCKETS)
        self.discount = _csv(params, "discount", ("yes", "no"))
        self.q = str(params.get("q") or "").strip()
        self.category_ids = [int(i) for i in _csv(params, "category_ids") if i.isdigit()]
        self.filtered = bool(self.q or self.category_ids or self.statuses or self.stock or self.ages or self.discount or len(self.lines) < len(LINES))

    def where(self, alias="m"):
        """SQL conditions on product_metrics (alias) and products (p), with params."""
        sql, params = [f"{alias}.last_sale_date >= %s"], [self.today - timedelta(days=SCOPE_DAYS)]
        if self.category_ids:
            sql.append(f"{alias}.product_id = ANY(%s)")
            params.append(product_ids_in(self.category_ids) or [0])
        if self.q:
            sql.append("(p.title ILIKE %s OR p.sku ILIKE %s OR p.source_id::text = %s)")
            params += [f"%{self.q}%", f"%{self.q}%", self.q]
        if self.statuses:
            sql.append(f"{alias}.status = ANY(%s)")
            params.append(self.statuses)
        if self.stock:
            parts = []
            if "charge" in self.stock:
                parts.append(f"{alias}.stock_flag = 'charge'")
            if "out" in self.stock:
                parts.append(f"{alias}.stock_flag = 'out'")
            if "ok" in self.stock:
                parts.append(f"({alias}.stock_flag = '' AND {alias}.central_stock > 0)")
            sql.append("(" + " OR ".join(parts) + ")")
        if self.ages:
            parts = []
            for key in self.ages:
                low, high = AGE_BUCKETS[key]
                parts.append(f"(%s - {alias}.first_sale_date BETWEEN %s AND %s)")
                params += [self.today, low, high]
            sql.append("(" + " OR ".join(parts) + ")")
        return " AND ".join(sql), params

    @property
    def needs_sales(self):
        """Without a status or stock filter the list holds products that sold in the range."""
        return not (self.statuses or self.stock)


def _fetch(sql, params):
    with connection.cursor() as cursor:
        cursor.execute(sql, params)
        columns = [c.name for c in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]


def _period_cte(scope, lines):
    """CTE `cur` (and `prev` when comparing) aggregated per product over the given lines."""
    line_units = ", ".join(f"COALESCE(SUM(units) FILTER (WHERE sales_line = '{line}'), 0)::bigint AS u_{line.lower()}" for line in LINES)
    sql = f"""cur AS (
        SELECT product_id, SUM(units)::bigint AS units, SUM(net_units)::bigint AS net_units, SUM(revenue)::bigint AS revenue,
               SUM(discounted_units)::bigint AS discounted, {line_units}
        FROM product_daily_sales WHERE day BETWEEN %s AND %s AND sales_line = ANY(%s) GROUP BY product_id),
    prev AS (
        SELECT product_id, SUM(net_units)::bigint AS net_units, SUM(revenue)::bigint AS revenue
        FROM product_daily_sales WHERE day BETWEEN %s AND %s AND sales_line = ANY(%s) GROUP BY product_id)"""
    cfrom, cto = (scope.cfrom, scope.cto) if comparable(lines, scope.cfrom) else (date(1900, 1, 1), date(1900, 1, 1))
    return sql, [scope.start, scope.end, lines, cfrom, cto, lines]


def _rows_sql(scope):
    """Per-product rows for the scope (lines filter applied) with every sortable column."""
    period_sql, period_params = _period_cte(scope, scope.lines)
    where, where_params = scope.where()
    days = (scope.end - scope.start).days + 1
    has_compare = comparable(scope.lines, scope.cfrom)
    sql = f"""WITH {period_sql},
    rows AS (
        SELECT m.product_id AS id, split_part(p.title, '|', 1) AS title, COALESCE(NULLIF(p.sku, ''), p.source_id::text) AS code,
            m.category_id, m.status, m.stock_flag, m.central_stock, m.first_sale_date, m.last_sale_date, m.category_ratio AS ratio,
            m.units_first14 AS first14, m.full_price_speed, m.weekly_speed AS speed_28, m.trend_pct AS trend,
            COALESCE(c.units, 0) AS units, COALESCE(c.net_units, 0) AS net_units, COALESCE(c.revenue, 0) AS revenue,
            c.u_online, c.u_sari, c.u_gorgan, c.u_capri,
            (COALESCE(c.net_units, 0) / (GREATEST(LEAST(%s, %s - m.first_sale_date + 1), 7) / 7.0))::float AS speed,
            CASE WHEN c.units > 0 THEN c.discounted::float / c.units END AS discount_share,
            CASE WHEN c.units > 0 THEN (c.units - c.net_units)::float / c.units END AS return_rate,
            CASE WHEN %s AND pr.net_units > 0 THEN ((COALESCE(c.net_units, 0) - pr.net_units) * 100.0 / pr.net_units)::float END AS change,
            pr.revenue AS prev_revenue, pr.net_units AS prev_units,
            %s - m.first_sale_date AS age
        FROM product_metrics m JOIN products p ON p.id = m.product_id
        LEFT JOIN cur c ON c.product_id = m.product_id LEFT JOIN prev pr ON pr.product_id = m.product_id
        WHERE {where} {"AND c.units > 0" if scope.needs_sales else ""}
    )"""
    return sql, period_params + [days, scope.end, has_compare, scope.end] + where_params


def _labels():
    return {node["id"]: node["label"] for node in tree(include_inactive=True)}


def _row(row, labels):
    stock = ("stock_flag", "central_stock") if stock_enabled() else ()
    return {key: row[key] for key in ("id", "title", "code", "status", *stock, "units", "net_units", "revenue",
                                      "speed", "first14", "ratio", "change", "trend", "age", "discount_share", "return_rate")} | {
        "title": row["title"].strip(), "category": labels.get(row["category_id"], ""), "first_sale_date": row["first_sale_date"],
        "last_sale_date": row["last_sale_date"],
        "lines": {line: row[f"u_{line.lower()}"] or 0 for line in LINES},
    }


def _sparks(ids, scope):
    """Eight equal buckets of net units over the range for the given products (oldest first)."""
    if not ids:
        return {}
    days = (scope.end - scope.start).days + 1
    rows = _fetch(
        """SELECT product_id, LEAST(7, ((day - %s) * 8) / %s) AS bucket, SUM(net_units)::bigint AS n FROM product_daily_sales
           WHERE product_id = ANY(%s) AND day BETWEEN %s AND %s AND sales_line = ANY(%s) GROUP BY 1, 2""",
        [scope.start, days, ids, scope.start, scope.end, scope.lines],
    )
    out = {pid: [0] * 8 for pid in ids}
    for row in rows:
        out[row["product_id"]][row["bucket"]] = row["n"]
    return out


def products_table(params, today=None):
    params = _plain(params)
    scope = Scope(params, today)
    sort = SORTS.get(params.get("sort"), "revenue")
    direction = "ASC" if params.get("dir") == "asc" else "DESC"
    full = scope.filtered or params.get("all") == "1"
    page = max(1, int(params.get("page") or 1)) if full else 1
    limit = PAGE_SIZE if full else TOP
    if params.get("export") == "1":  # «خروجی اکسل»: the whole list in one response
        page, limit = 1, EXPORT_LIMIT
    rows_sql, rows_params = _rows_sql(scope)
    rows = _fetch(
        f"{rows_sql} SELECT *, COUNT(*) OVER () AS total FROM rows ORDER BY {sort} {direction} NULLS LAST, id LIMIT %s OFFSET %s",
        rows_params + [limit, (page - 1) * limit],
    )
    labels = _labels()
    sparks = _sparks([r["id"] for r in rows], scope)
    return {
        "full": full, "page": page, "page_size": limit,
        "total": rows[0]["total"] if rows else _fetch(f"{rows_sql} SELECT COUNT(*) AS n FROM rows", rows_params)[0]["n"],
        "sort": next(k for k, v in SORTS.items() if v == sort), "dir": direction.lower(),
        "results": [_row(r, labels) | {"spark": sparks.get(r["id"], [])} for r in rows],
    }


def products_summary(params, today=None):
    """Range, the four cards and the branch strip for the scope."""
    params = _plain(params)
    scope = Scope(params, today)
    rows_sql, rows_params = _rows_sql(scope)
    labels = _labels()
    has_compare = comparable(scope.lines, scope.cfrom)
    totals = _fetch(
        f"""{rows_sql} SELECT COUNT(*) FILTER (WHERE units > 0) AS products, COALESCE(SUM(revenue), 0)::bigint AS revenue,
            COALESCE(SUM(net_units), 0)::bigint AS net_units, SUM(prev_revenue)::bigint AS prev_revenue, SUM(prev_units)::bigint AS prev_units FROM rows""",
        rows_params,
    )[0]

    # Cards list every product of the scope with that status, sold in the range or not.
    card_sql, card_params = rows_sql.replace("AND c.units > 0", ""), rows_params

    def card(condition, order):
        found = _fetch(f"{card_sql} SELECT *, COUNT(*) OVER () AS total FROM rows WHERE {condition} ORDER BY {order} LIMIT 3", card_params)
        return {"count": found[0]["total"] if found else 0, "top": [_row(r, labels) for r in found]}

    def change(now, before):
        return (float(now) - float(before)) * 100.0 / float(before) if has_compare and before else None

    branches = []
    strip_scope = Scope({**params, "lines": ""}, today)
    strip_where, strip_where_params = strip_scope.where()
    strip = _fetch(
        f"""SELECT d.sales_line, SUM(d.revenue) FILTER (WHERE d.day BETWEEN %s AND %s)::bigint AS revenue,
                   SUM(d.revenue) FILTER (WHERE d.day BETWEEN %s AND %s)::bigint AS prev
            FROM product_daily_sales d JOIN product_metrics m ON m.product_id = d.product_id JOIN products p ON p.id = d.product_id
            WHERE d.day BETWEEN LEAST(%s, %s) AND GREATEST(%s, %s) AND {strip_where} GROUP BY d.sales_line""",
        [scope.start, scope.end, scope.cfrom or scope.start, scope.cto or scope.start, scope.start, scope.cfrom or scope.start,
         scope.end, scope.cto or scope.end] + strip_where_params,
    )
    by_line = {row["sales_line"]: row for row in strip}
    total_revenue = sum((row["revenue"] or 0) for row in strip) or 0
    for line in LINES:
        row = by_line.get(line, {})
        revenue = row.get("revenue") or 0
        ok = comparable([line], scope.cfrom)
        branches.append({"line": line, "revenue": revenue, "share": revenue / total_revenue if total_revenue else 0,
                         "change": (float(revenue) - float(row["prev"])) * 100.0 / float(row["prev"]) if ok and row.get("prev") else None})
    return {
        "range": {"from": scope.start, "to": scope.end, "compare_from": scope.cfrom, "compare_to": scope.cto, "compare": scope.compare,
                  "comparable": has_compare, "as_of": _as_of()},
        "filtered": scope.filtered,
        "products": totals["products"],
        "sales": {"revenue": totals["revenue"], "net_units": totals["net_units"],
                  "avg_price": float(totals["revenue"]) / totals["net_units"] if totals["net_units"] else None,
                  "revenue_change": change(totals["revenue"], totals["prev_revenue"]), "units_change": change(totals["net_units"], totals["prev_units"])},
        "stock_enabled": stock_enabled(),
        "drivers": card("status = 'driver'", "full_price_speed DESC"),
        **({"charge": card("stock_flag = 'charge'", "speed_28 DESC")} if stock_enabled()
           else {"growth": card("status = 'growth'", "trend DESC NULLS LAST")}),
        "slow": card("status IN ('slow', 'stale')", "status = 'stale' DESC, last_sale_date DESC"),
        "branches": branches,
    }


def _as_of():
    rows = _fetch("SELECT MAX(as_of) AS d FROM product_metrics", [])
    return rows[0]["d"] if rows else None


def bundles(params, today=None):
    """Co-purchase pairs for the range: baskets, confidence (share of the first item's baskets), lift, trend."""
    params = _plain(params)
    rules = settings.PRODUCTS_RULES
    scope = Scope(params, today)
    level = "category" if params.get("level") == "category" else "product"
    channel = params.get("channel") if params.get("channel") in ("online", "store") else "all"
    channels = ["online", "store"] if channel == "all" else [channel]
    line_set = ["ONLINE"] if channel == "online" else (["SARI"] if channel == "store" else ["ONLINE", "SARI"])
    has_compare = comparable(line_set, scope.cfrom)
    keys = None
    if scope.category_ids:
        from .categories import descendant_ids

        keys = list(descendant_ids(scope.category_ids)) if level == "category" else (product_ids_in(scope.category_ids) or [0])
    product_id = params.get("product_id")
    if product_id and str(product_id).isdigit():
        keys = [int(product_id)]
    key_filter = "AND (x.a = ANY(%s) OR x.b = ANY(%s))" if keys is not None else ""
    key_params = [keys, keys] if keys is not None else []
    cfrom, cto = (scope.cfrom, scope.cto) if has_compare else (date(1900, 1, 1), date(1900, 1, 1))
    rows = _fetch(
        f"""WITH pairs AS (
                SELECT x.a, x.b, SUM(x.baskets)::bigint AS n FROM product_basket_pairs_daily x
                WHERE x.level = %s AND x.channel = ANY(%s) AND x.day BETWEEN %s AND %s {key_filter}
                GROUP BY x.a, x.b HAVING SUM(x.baskets) >= %s),
            items AS (
                SELECT key, SUM(baskets)::bigint AS n FROM product_basket_items_daily
                WHERE level = %s AND channel = ANY(%s) AND day BETWEEN %s AND %s
                  AND key IN (SELECT a FROM pairs UNION SELECT b FROM pairs UNION SELECT 0) GROUP BY key),
            prev AS (
                SELECT x.a, x.b, SUM(x.baskets)::bigint AS n FROM product_basket_pairs_daily x JOIN pairs USING (a, b)
                WHERE x.level = %s AND x.channel = ANY(%s) AND x.day BETWEEN %s AND %s GROUP BY x.a, x.b)
            SELECT pairs.a, pairs.b, pairs.n, ia.n AS na, ib.n AS nb, total.n AS total, prev.n AS prev
            FROM pairs JOIN items ia ON ia.key = pairs.a JOIN items ib ON ib.key = pairs.b JOIN items total ON total.key = 0
            LEFT JOIN prev ON prev.a = pairs.a AND prev.b = pairs.b
            ORDER BY pairs.n DESC LIMIT 200""",
        [level, channels, scope.start, scope.end] + key_params + [rules["bundle_min_baskets"], level, channels, scope.start, scope.end,
                                                                   level, channels, cfrom, cto],
    )
    names = _labels() if level == "category" else {
        r["id"]: r["title"].strip() for r in _fetch("SELECT id, split_part(title, '|', 1) AS title FROM products WHERE id = ANY(%s)",
                                                     [list({r["a"] for r in rows} | {r["b"] for r in rows}) or [0]])}
    out = []
    for r in rows:
        first, second, n_first = (r["a"], r["b"], r["na"]) if r["na"] <= r["nb"] else (r["b"], r["a"], r["nb"])
        if keys is not None and len(keys) == 1 and second == keys[0]:  # Product 360: the product comes first
            first, second, n_first = second, first, (r["nb"] if second == r["b"] else r["na"])
        lift = r["n"] * r["total"] / (r["na"] * r["nb"])
        trend = (r["n"] - r["prev"]) * 100.0 / r["prev"] if has_compare and r["prev"] else None
        fresh = has_compare and (r["prev"] is None or (trend is not None and trend >= rules["bundle_fresh_trend_pct"]))
        if params.get("fresh") == "1" and not fresh:
            continue
        out.append({"a": first, "b": second, "a_name": names.get(first, ""), "b_name": names.get(second, ""), "baskets": r["n"],
                    "confidence": r["n"] / n_first, "lift": lift, "trend": trend, "new": has_compare and r["prev"] is None,
                    "early": r["n"] < rules["bundle_early_baskets"] and lift >= rules["bundle_early_lift"]})
    return {"level": level, "channel": channel, "comparable": has_compare, "results": out[:30]}
