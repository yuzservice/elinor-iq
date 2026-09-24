from django.db.models import Count, F, Max, Min, Q

from apps.customers.models import Customer
from apps.customers.presentation import customer_status_label, list_payload
from apps.customers.purchases import (
    SALES_LINE_LABELS,
    channel_for,
    qualifying_order_exists,
    qualifying_orders,
    qualifying_pos,
    qualifying_pos_exists,
)
from apps.customers.tiers import (
    filter_customers_by_tier,
    metrics_for_customers,
    tier_last_purchase_expression,
    tier_purchase_count_expression,
)
from apps.sales.models import SalesLine
from apps.sales.services import _parse_bound

LIST_DEFER = ("source_payload", "addresses", "summary")
VALID_SALES_LINES = {SalesLine.ONLINE, SalesLine.SARI, SalesLine.GORGAN, SalesLine.CAPRI}


def customer_list_queryset(params):
    qs = Customer.objects.defer(*LIST_DEFER)
    population = (params.get("population") or "all").strip()
    tier = (params.get("tier") or "").strip().upper()
    channel = (params.get("channel") or "").strip()
    sales_lines = parse_sales_lines_filter(params)
    search = (params.get("search") or "").strip()
    sort = (params.get("sort") or "last_purchase").strip()

    if population == "purchasing":
        qs = qs.filter(qualifying_order_exists() | qualifying_pos_exists())
    elif population in {"registered", "no_purchase"}:
        qs = qs.filter(~qualifying_order_exists() & ~qualifying_pos_exists())

    if channel == "online":
        qs = qs.filter(qualifying_order_exists()).filter(~qualifying_pos_exists())
    elif channel == "physical":
        qs = qs.filter(qualifying_pos_exists()).filter(~qualifying_order_exists())
    elif channel == "both":
        qs = qs.filter(qualifying_order_exists(), qualifying_pos_exists())

    if sales_lines:
        line_q = Q()
        for sales_line in sales_lines:
            if sales_line == SalesLine.ONLINE:
                line_q |= Q(qualifying_order_exists())
            else:
                line_q |= Q(qualifying_pos_exists(sales_line=sales_line))
        qs = qs.filter(line_q)

    if search:
        qs = _apply_search(qs, search)

    if tier:
        qs = filter_customers_by_tier(qs, tier)

    min_count = _as_int(params.get("min_purchases"))
    max_count = _as_int(params.get("max_purchases"))
    if min_count is not None or max_count is not None:
        qs = qs.annotate(purchase_count=tier_purchase_count_expression())
        if min_count is not None:
            qs = qs.filter(purchase_count__gte=min_count)
        if max_count is not None:
            qs = qs.filter(purchase_count__lte=max_count)

    last_from = _parse_bound(params.get("last_from") or "", end_of_day=False) if params.get("last_from") else None
    last_to = _parse_bound(params.get("last_to") or "", end_of_day=True) if params.get("last_to") else None
    if last_from or last_to:
        qs = qs.annotate(last_qualifying_at=tier_last_purchase_expression())
        if last_from:
            qs = qs.filter(last_qualifying_at__gte=last_from)
        if last_to:
            qs = qs.filter(last_qualifying_at__lte=last_to)

    return _apply_sort(qs, sort)


def parse_sales_lines_filter(params):
    raw_values = []
    if hasattr(params, "getlist"):
        raw_values.extend(params.getlist("sales_lines"))
    raw = params.get("sales_lines")
    if raw:
        raw_values.append(raw)
    legacy = params.get("sales_line")
    if legacy:
        raw_values.append(legacy)

    lines = []
    for value in raw_values:
        for part in str(value).split(","):
            normalized = part.strip().upper()
            if normalized and normalized not in lines and normalized in VALID_SALES_LINES:
                lines.append(normalized)
    return lines


def paginate_customers(qs, page, per_page):
    total = qs.count()
    start = (page - 1) * per_page
    rows = list(qs[start : start + per_page])
    return total, hydrate_customer_rows(rows)


def hydrate_customer_rows(customers):
    ids = [customer.pk for customer in customers]
    if not ids:
        return []

    online = {
        row["customer_id"]: row
        for row in qualifying_orders()
        .filter(customer_id__in=ids)
        .values("customer_id")
        .annotate(c=Count("id"), first_at=Min("created_at"), last_at=Max("created_at"))
    }
    pos = {
        row["customer_id"]: row
        for row in qualifying_pos()
        .filter(customer_id__in=ids)
        .values("customer_id")
        .annotate(c=Count("id"), first_at=Min("created_at"), last_at=Max("created_at"))
    }
    pos_lines = {pk: set() for pk in ids}
    for row in qualifying_pos().filter(customer_id__in=ids).values("customer_id", "sales_line").distinct():
        pos_lines[row["customer_id"]].add(row["sales_line"])
    tiers = metrics_for_customers(ids)

    payloads = []
    for customer in customers:
        online_row = online.get(customer.pk) or {}
        pos_row = pos.get(customer.pk) or {}
        online_count = int(online_row.get("c") or 0)
        pos_count = int(pos_row.get("c") or 0)
        tier = tiers.get(customer.pk) or {}
        lines = []
        if online_count:
            lines.append(SalesLine.ONLINE)
        lines.extend(sorted(line for line in pos_lines.get(customer.pk, set()) if line))
        channel_key, channel_label = channel_for(online_count, pos_count)
        payload = list_payload(customer)
        payload.update(
            {
                "order_count": int(tier.get("purchase_count") or 0),
                "online_count": online_count,
                "pos_count": pos_count,
                "first_purchase_at": tier.get("first_purchase_at"),
                "last_purchase_at": tier.get("last_purchase_at"),
                "lifetime_purchase_amount": int(tier.get("lifetime_purchase_amount") or 0),
                "days_since_last_purchase": tier.get("days_since_last_purchase"),
                "tier_code": tier.get("tier_code"),
                "tier_label": tier.get("tier_label"),
                "channel": channel_key,
                "channel_label": channel_label,
                "sales_lines": lines,
                "sales_line_labels": [SALES_LINE_LABELS.get(line, line) for line in lines],
                "is_purchasing": online_count + pos_count > 0,
                "status_label": customer_status_label(customer.status) or "—",
            }
        )
        payloads.append(payload)
    return payloads


def _apply_search(qs, search):
    translated = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")
    normalized = search.translate(translated).strip()
    digits = "".join(ch for ch in normalized if ch.isdigit())
    name_tokens = [token for token in normalized.split() if token and not token.isdigit()]
    clauses = []
    if name_tokens:
        name_q = None
        for token in name_tokens:
            token_q = Q(first_name__icontains=token) | Q(last_name__icontains=token)
            name_q = token_q if name_q is None else name_q & token_q
        clauses.append(name_q)
    if digits:
        clauses.append(Q(mobile__startswith=digits) | Q(mobile__contains=digits))
    elif normalized and not name_tokens:
        clauses.append(Q(mobile__icontains=normalized))
    if not clauses:
        return qs
    combined = clauses[0]
    for clause in clauses[1:]:
        combined |= clause
    return qs.filter(combined)


def _apply_sort(qs, sort):
    if sort == "purchase_count":
        if "purchase_count" not in qs.query.annotations:
            qs = qs.annotate(purchase_count=tier_purchase_count_expression())
        return qs.order_by(F("purchase_count").desc(), F("last_order_at").desc(nulls_last=True), "-source_id")
    if sort == "name":
        return qs.order_by(F("last_name").asc(nulls_last=True), F("first_name").asc(nulls_last=True), "-source_id")
    return qs.order_by(F("last_order_at").desc(nulls_last=True), "-source_id")


def _as_int(value):
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None
