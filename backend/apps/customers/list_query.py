from datetime import timedelta
from hashlib import sha1

from django.core.cache import cache
from django.db import connection
from django.db.models import Case, Count, Exists, F, IntegerField, Max, Min, OuterRef, Q, Sum, Value, When
from django.utils import timezone

from apps.customers.models import City, Customer, CustomerAddress, CustomerMetrics, CustomerTierHistory, Province
from apps.customers.operators import active_internal_accounts, exclude_operator_accounts, is_operator_account
from apps.customers.presentation import customer_status_label, list_payload
from apps.customers.purchases import (
    SALES_LINE_LABELS,
    channel_for,
    qualifying_order_exists,
    qualifying_orders,
    qualifying_pos,
    qualifying_pos_exists,
)
from apps.customers.tier_rules import active_rules, all_tiers
from apps.customers.tiers import (
    TIER_ONLINE_EXCLUDED_STATUSES,
    enabled_tier_codes,
    metrics_for_customers,
    tier_first_purchase_expression,
    tier_channel_label,
    tier_label,
    tier_title_map,
    tier_last_purchase_expression,
    tier_lifetime_amount_expression,
    tier_purchase_count_expression,
)
from apps.sales.models import OnlinePayment, Order, OrderItem, PosSale, PosSaleItem, SalesLine
from apps.sales.services import _parse_bound

LIST_DEFER = ("source_payload", "addresses", "summary")
VALID_SALES_LINES = {SalesLine.ONLINE, SalesLine.SARI, SalesLine.GORGAN, SalesLine.CAPRI}
MAX_SELECTED_IDS = 1000
NO_CALL = "none"
# value -> (older than, days)
DAY_WINDOWS = {"30": (False, 30), "90": (False, 90), "gt90": (True, 90), "gt180": (True, 180)}
METRIC_SORTS = {
    "avg_basket": "metrics__avg_basket",
    "invoice_count": "metrics__invoice_count",
    "total_amount": "metrics__total_amount",
    "last_purchase": "metrics__last_purchase_at",
    "first_purchase": "metrics__first_purchase_at",
}
SUMMARY_SECONDS = 5 * 60
OPTIONS_SECONDS = 24 * 60 * 60  # counts and fill rates change with the daily metrics refresh
SUMMARY_IGNORED_PARAMS = {"page", "per_page", "sort", "dir"}


def customer_list_queryset(params):
    qs = Customer.objects.defer(*LIST_DEFER)
    population = (params.get("population") or "all").strip()
    tier = (params.get("tier") or "").strip().upper()
    channel = (params.get("channel") or "").strip()
    sales_lines = parse_sales_lines_filter(params)
    sales_lines_mode = (params.get("sales_lines_mode") or "all").strip().lower()
    search = (params.get("search") or "").strip()
    sort = (params.get("sort") or "last_purchase").strip()
    payment_method = (params.get("payment_method") or "").strip().lower()
    has_discount = (params.get("has_discount") or "").strip().lower()
    order_behavior = (params.get("order_behavior") or "").strip().lower()
    size = (params.get("size") or "").strip()
    category = (params.get("category") or "").strip()
    city = (params.get("city") or "").strip()
    profile_state = (params.get("profile_state") or "").strip().lower()
    birth_month = _as_int(params.get("birth_month"))

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
        if sales_lines_mode == "any" and len(sales_lines) > 1:
            combined_line_q = None
            for sales_line in sales_lines:
                expr = (
                    qualifying_order_exists()
                    if sales_line == SalesLine.ONLINE
                    else qualifying_pos_exists(sales_line=sales_line)
                )
                combined_line_q = expr if combined_line_q is None else (combined_line_q | expr)
            if combined_line_q is not None:
                qs = qs.filter(combined_line_q)
        else:
            for sales_line in sales_lines:
                if sales_line == SalesLine.ONLINE:
                    qs = qs.filter(qualifying_order_exists())
                else:
                    qs = qs.filter(qualifying_pos_exists(sales_line=sales_line))

    if search:
        qs = _apply_search(qs, search)

    tier_codes = [code for code in _split(tier) if code in enabled_tier_codes()]
    if tier_codes:
        qs = exclude_operator_accounts(qs.filter(tier_code__in=tier_codes))

    tier_channel = (params.get("tier_channel") or "").strip().lower()
    if tier_channel in ("online", "pos"):
        qs = exclude_operator_accounts(qs.filter(tier_channel=tier_channel))

    min_count = _as_int(params.get("min_purchases"))
    max_count = _as_int(params.get("max_purchases"))
    min_amount = _as_int(params.get("min_amount"))
    max_amount = _as_int(params.get("max_amount"))

    if not search and _buyer_analytics_filter(
        population,
        channel,
        sales_lines,
        min_count,
        max_count,
        tier_codes[0] if tier_codes else tier,
        min_amount=min_amount,
        max_amount=max_amount,
        payment_method=payment_method,
        has_discount=has_discount,
        order_behavior=order_behavior,
        size=size,
        category=category,
    ):
        qs = exclude_operator_accounts(qs)

    if min_count is not None or max_count is not None:
        qs = qs.annotate(purchase_count=tier_purchase_count_expression())
        if min_count is not None:
            qs = qs.filter(purchase_count__gte=min_count)
        if max_count is not None:
            qs = qs.filter(purchase_count__lte=max_count)

    if min_amount is not None or max_amount is not None:
        qs = qs.annotate(lifetime_amount=tier_lifetime_amount_expression())
        if min_amount is not None:
            qs = qs.filter(lifetime_amount__gte=min_amount)
        if max_amount is not None:
            qs = qs.filter(lifetime_amount__lte=max_amount)

    last_from = _parse_bound(params.get("last_from") or "", end_of_day=False) if params.get("last_from") else None
    last_to = _parse_bound(params.get("last_to") or "", end_of_day=True) if params.get("last_to") else None
    if last_from or last_to:
        qs = qs.annotate(last_qualifying_at=tier_last_purchase_expression())
        if last_from:
            qs = qs.filter(last_qualifying_at__gte=last_from)
        if last_to:
            qs = qs.filter(last_qualifying_at__lte=last_to)

    first_from = _parse_bound(params.get("first_from") or "", end_of_day=False) if params.get("first_from") else None
    first_to = _parse_bound(params.get("first_to") or "", end_of_day=True) if params.get("first_to") else None
    if first_from or first_to:
        qs = qs.annotate(first_qualifying_at=tier_first_purchase_expression())
        if first_from:
            qs = qs.filter(first_qualifying_at__gte=first_from)
        if first_to:
            qs = qs.filter(first_qualifying_at__lte=first_to)

    qs = _any_of(qs, payment_method, _payment_q)

    if has_discount in {"yes", "no"}:
        qs = _apply_discount_filter(qs, has_discount)

    if order_behavior:
        qs = _apply_order_behavior_filter(qs, order_behavior)

    qs = _any_of(qs, size, _size_q)
    qs = _any_of(qs, category, _category_q)
    qs = _any_of(qs, city, _city_q)

    if profile_state:
        qs = _apply_profile_state_filter(qs, profile_state)

    if birth_month is not None and 1 <= birth_month <= 12:
        qs = qs.filter(birth_date__month=birth_month)

    qs = _apply_metric_filters(qs, params)
    qs = _apply_call_filters(qs, params)

    source_ids = [value for value in (_as_int(part) for part in _split(params.get("ids") or "")) if value is not None]
    if source_ids:
        qs = qs.filter(source_id__in=source_ids[:MAX_SELECTED_IDS])

    direction = (params.get("dir") or "").strip().lower()
    if direction in ("asc", "desc"):
        # The redesigned list: internal accounts stay out, except when searching for one by name.
        if not search:
            qs = exclude_operator_accounts(qs)
        return _apply_metric_sort(qs, sort, direction)
    return _apply_sort(qs, sort)


def _split(raw):
    return [part.strip() for part in str(raw or "").split(",") if part.strip()]


def _any_of(qs, raw, build):
    """OR of build(term) for each comma-separated term. A single value behaves as before."""
    combined = None
    for term in _split(raw):
        expr = build(term)
        if expr is not None:
            combined = expr if combined is None else combined | expr
    return qs if combined is None else qs.filter(combined)


def _apply_metric_filters(qs, params):
    """Filters on CustomerMetrics: no request-time joins to sales tables."""
    for param, lookup in (
        ("min_avg_basket", "metrics__avg_basket__gte"),
        ("max_avg_basket", "metrics__avg_basket__lte"),
        ("min_invoices", "metrics__invoice_count__gte"),
        ("max_invoices", "metrics__invoice_count__lte"),
        ("min_total", "metrics__total_amount__gte"),
        ("max_total", "metrics__total_amount__lte"),
    ):
        value = _as_int(params.get(param))
        if value is not None:
            qs = qs.filter(**{lookup: value})
    channels = _split(params.get("channels"))
    if channels:
        qs = qs.filter(metrics__channel__in=channels)
    for param, lookup in (
        ("branches", "metrics__lines__overlap"),
        ("payments", "metrics__payments__overlap"),
        ("sizes", "metrics__sizes__overlap"),
        ("cities", "metrics__cities__overlap"),
    ):
        values = _split(params.get(param))
        if values:
            qs = qs.filter(**{lookup: values})
    qs = _apply_category(qs, params)
    for param, lookup in (("provinces", "metrics__province_ids__overlap"), ("city_ids", "metrics__city_ids__overlap"), ("products", "metrics__product_ids__overlap")):
        ids = _ids(params.get(param))
        if ids:
            qs = qs.filter(**{lookup: ids})
    months = [month for month in _ids(params.get("birth_months")) if 1 <= month <= 12]
    if months:
        qs = qs.filter(metrics__birth_month__in=months)
    genders = _split(params.get("genders"))
    if genders:
        qs = qs.filter(gender__in=genders)
    for param, lookup, end_of_day in (("joined_after", "created_at_source__gte", False), ("joined_before", "created_at_source__lte", True)):
        if params.get(param):
            bound = _parse_bound(params.get(param), end_of_day=end_of_day)
            qs = qs.filter(**{lookup: bound}) if bound else qs
    qs = _apply_tier_change(qs, params)
    discount = (params.get("discount") or "").strip().lower()
    if discount == "yes":
        qs = qs.filter(metrics__has_discount=True)
    elif discount == "no":
        qs = qs.filter(metrics__has_discount=False, metrics__invoice_count__gt=0)
    now = timezone.now()
    for prefix, column in (("last", "metrics__last_purchase_at"), ("first", "metrics__first_purchase_at")):
        days = (params.get(f"{prefix}_days") or "").strip()
        if days in DAY_WINDOWS:
            older, count = DAY_WINDOWS[days]
            qs = qs.filter(**{f"{column}__{'lt' if older else 'gte'}": now - timedelta(days=count)})
        if params.get(f"{prefix}_after"):
            bound = _parse_bound(params.get(f"{prefix}_after"), end_of_day=False)
            qs = qs.filter(**{f"{column}__gte": bound}) if bound else qs
        if params.get(f"{prefix}_before"):
            bound = _parse_bound(params.get(f"{prefix}_before"), end_of_day=True)
            qs = qs.filter(**{f"{column}__lte": bound}) if bound else qs
    return qs


def _apply_category(qs, params):
    """`category_ids` = category ids, each with its descendants (shared tree). The old `categories` = titles maps to the
    exact categories (no descendants), so saved views and call lists made before the tree return the same customers.
    (The older free-text `category` param keeps its own behaviour in `_category_q`.)"""
    from apps.products.categories import ids_for_titles, product_ids_in

    ids = _ids(params.get("category_ids"))
    if ids:
        qs = qs.filter(metrics__product_ids__overlap=product_ids_in(ids) or [0])
    titles = _split(params.get("categories"))
    if titles:
        exact, _unmatched = ids_for_titles(titles)
        qs = qs.filter(metrics__product_ids__overlap=product_ids_in(exact, with_descendants=False) or [0])
    return qs


def _ids(raw):
    return [value for value in (_as_int(part) for part in _split(raw)) if value is not None]


TIER_CHANGE_REASONS = (CustomerTierHistory.REASON_DAILY, CustomerTierHistory.REASON_SYNC)


def _apply_tier_change(qs, params):
    """ارتقا / تنزل in a date range, from CustomerTierHistory. A higher tier has a lower rank.

    Only natural changes count: reason daily or sync (activation, baseline, manual and internal-account rows are rule or
    admin changes, not customer behaviour). Ranks are compared only within one channel (both empty = the same, non-channel
    rules); a channel switch is neither up nor down. A move to no tier is not a drop (internal accounts cleared, rules
    that no longer match); entering a tier from none still counts as up. Rules: docs/business-rules/customer-tiers.md."""
    direction = (params.get("tier_change") or "").strip().lower()
    if direction not in ("up", "down"):
        return qs
    codes = [tier["code"] for _channel, tier in all_tiers(active_rules())]

    def rank(field):
        return Case(*[When(**{field: code}, then=Value(index)) for index, code in enumerate(codes)], default=Value(len(codes)), output_field=IntegerField())

    # Uncorrelated: one pass over the history (hash semi-join), not one probe per customer.
    history = CustomerTierHistory.objects.filter(
        Q(previous_channel=F("channel")) | Q(previous_channel__isnull=True, channel__isnull=True),
        reason__in=TIER_CHANGE_REASONS, tier_code__isnull=False,
    ).annotate(old_rank=rank("previous_tier_code"), new_rank=rank("tier_code"))
    history = history.filter(new_rank__lt=F("old_rank")) if direction == "up" else history.filter(new_rank__gt=F("old_rank"))
    from_codes = [code.strip().upper() for code in _split(params.get("tier_change_from")) if code.strip()]
    if from_codes:
        # «از سطوح …»: only changes that started from these tiers (codes are unique per channel); internal accounts out.
        history = history.filter(previous_tier_code__in=from_codes)
        qs = exclude_operator_accounts(qs)
    after = _parse_bound(params.get("tier_change_after"), end_of_day=False) if params.get("tier_change_after") else None
    before = _parse_bound(params.get("tier_change_before"), end_of_day=True) if params.get("tier_change_before") else None
    if after:
        history = history.filter(changed_at__gte=after)
    if before:
        history = history.filter(changed_at__lte=before)
    return qs.filter(pk__in=history.values("customer_id"))


def _apply_call_filters(qs, params):
    from apps.calls.models import CustomerCallStatus, CustomerCallTag

    results = _split(params.get("call_result"))
    if results:
        status = CustomerCallStatus.objects.filter(customer_id=OuterRef("pk"))
        titles = [value for value in results if value != NO_CALL]
        wanted = Q(Exists(status.filter(last_outcome_title__in=titles))) if titles else None
        if NO_CALL in results:
            never = ~Exists(status.filter(last_call_at__isnull=False))
            wanted = never if wanted is None else wanted | never
        qs = qs.filter(wanted)
    tags = [value for value in (_as_int(part) for part in _split(params.get("call_tag"))) if value is not None]
    if tags:
        qs = qs.filter(Exists(CustomerCallTag.objects.filter(customer_id=OuterRef("pk"), tag_id__in=tags, resolved_at__isnull=True)))
    do_not_call = (params.get("do_not_call") or "").strip().lower()
    if do_not_call == "yes":
        qs = qs.filter(call_status__do_not_call=True)
    elif do_not_call == "no":
        qs = qs.exclude(call_status__do_not_call=True)
    return qs


def _tier_rank():
    codes = [tier["code"] for _channel, tier in all_tiers(active_rules())]
    return Case(*[When(tier_code=code, then=Value(index)) for index, code in enumerate(codes)], default=None, output_field=IntegerField())


def _apply_metric_sort(qs, sort, direction):
    def ordered(column):
        return F(column).asc(nulls_last=True) if direction == "asc" else F(column).desc(nulls_last=True)

    if sort == "name":
        return qs.order_by(ordered("last_name"), ordered("first_name"), "-source_id")
    if sort == "tier":
        return qs.annotate(tier_rank=_tier_rank()).order_by(ordered("tier_rank"), "-source_id")
    return qs.order_by(ordered(METRIC_SORTS.get(sort, METRIC_SORTS["last_purchase"])), "-source_id")


def _payment_q(payment_method):
    payment_method = payment_method.lower()
    pos_base = PosSale.objects.filter(
        customer_id=OuterRef("pk"),
        deleted_at__isnull=True,
        is_cancelled=False,
    )
    online_gw_base = OnlinePayment.objects.filter(
        status="success",
        invoice__order__customer_id=OuterRef("pk"),
    ).exclude(invoice__order__status__in=TIER_ONLINE_EXCLUDED_STATUSES)

    if payment_method == "snappay":
        return Exists(pos_base.filter(snappay_cashier_amount__gt=0)) | Exists(online_gw_base.filter(gateway__icontains="snapp"))
    if payment_method == "digipay":
        return Exists(pos_base.filter(digipay_cashier_amount__gt=0)) | Exists(online_gw_base.filter(gateway__icontains="digi"))
    if payment_method == "installment":
        return Exists(pos_base.filter(Q(snappay_cashier_amount__gt=0) | Q(digipay_cashier_amount__gt=0))) | Exists(
            online_gw_base.filter(Q(gateway__icontains="snapp") | Q(gateway__icontains="digi"))
        )
    if payment_method == "wallet":
        return Q(Exists(pos_base.filter(from_wallet_amount__gt=0)))
    if payment_method == "shopino":
        return Q(Exists(qualifying_orders().filter(customer_id=OuterRef("pk"), is_shopino=True)))
    return None


def _apply_discount_filter(qs, has_discount):
    discounted_order = Exists(
        qualifying_orders().filter(customer_id=OuterRef("pk"), discount_amount__gt=0)
    )
    discounted_pos = Exists(
        qualifying_pos().filter(customer_id=OuterRef("pk"), discount_amount__gt=0)
    )
    if has_discount == "yes":
        return qs.filter(discounted_order | discounted_pos)
    if has_discount == "no":
        return qs.filter(qualifying_order_exists() | qualifying_pos_exists()).filter(
            ~discounted_order & ~discounted_pos
        )
    return qs


def _apply_order_behavior_filter(qs, order_behavior):
    if order_behavior == "has_refund":
        return qs.filter(
            Exists(
                PosSale.objects.filter(
                    customer_id=OuterRef("pk"),
                    deleted_at__isnull=True,
                    is_cancelled=False,
                    type__in=("refund", "both"),
                )
            )
        )
    if order_behavior == "has_canceled":
        return qs.filter(
            Exists(
                Order.objects.filter(
                    customer_id=OuterRef("pk"),
                    status__in=("canceled", "failed", "canceled_by_user"),
                )
            )
        )
    return qs


def _size_q(size):
    normalized = size.strip()
    online_size = Exists(
        OrderItem.objects.filter(
            order__customer_id=OuterRef("pk"),
            variant__size__iexact=normalized,
        ).exclude(order__status__in=TIER_ONLINE_EXCLUDED_STATUSES)
    )
    pos_size = Exists(
        PosSaleItem.objects.filter(
            pos_sale__customer_id=OuterRef("pk"),
            pos_sale__deleted_at__isnull=True,
            pos_sale__is_cancelled=False,
            deleted_at__isnull=True,
            type="sell",
            variant__size__iexact=normalized,
        ).exclude(pos_sale__type="refund")
    )
    return online_size | pos_size


def _category_q(category):
    term = category.strip()
    online_cat = Exists(
        OrderItem.objects.filter(
            order__customer_id=OuterRef("pk"),
        )
        .exclude(order__status__in=TIER_ONLINE_EXCLUDED_STATUSES)
        .filter(
            Q(product__categories__title__icontains=term)
            | Q(product__title__icontains=term)
            | Q(title__icontains=term)
        )
    )
    pos_cat = Exists(
        PosSaleItem.objects.filter(
            pos_sale__customer_id=OuterRef("pk"),
            pos_sale__deleted_at__isnull=True,
            pos_sale__is_cancelled=False,
            deleted_at__isnull=True,
            type="sell",
        )
        .exclude(pos_sale__type="refund")
        .filter(
            Q(product__categories__title__icontains=term)
            | Q(product__title__icontains=term)
            | Q(variant__title__icontains=term)
        )
    )
    return online_cat | pos_cat


def _city_q(city):
    term = city.strip()
    addr_match = Exists(
        CustomerAddress.objects.filter(
            customer_id=OuterRef("pk"),
            deleted_at__isnull=True,
        ).filter(
            Q(city_name__icontains=term)
            | Q(province_name__icontains=term)
            | Q(city__name__icontains=term)
            | Q(city__province__name__icontains=term)
        )
    )
    order_city_match = Exists(
        Order.objects.filter(customer_id=OuterRef("pk")).filter(
            Q(receiver_city__icontains=term) | Q(receiver_province__icontains=term)
        )
    )
    return addr_match | order_city_match


def _apply_profile_state_filter(qs, profile_state):
    incomplete_q = (Q(first_name="") & Q(last_name="")) | Q(mobile="")
    if profile_state == "incomplete":
        return qs.filter(incomplete_q)
    if profile_state == "complete":
        return qs.exclude(incomplete_q)
    if profile_state == "has_birth_date":
        return qs.filter(birth_date__isnull=False)
    return qs


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
    titles = tier_title_map()
    tiers = metrics_for_customers(ids, titles=titles)
    accounts = active_internal_accounts()
    metrics = {row.customer_id: row for row in CustomerMetrics.objects.filter(customer_id__in=ids)}
    cities = {}
    for customer_id, city_name, linked in (
        CustomerAddress.objects.filter(customer_id__in=ids, deleted_at__isnull=True).order_by("id").values_list("customer_id", "city_name", "city__name")
    ):
        cities.setdefault(customer_id, city_name or linked or "")

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
        payload = list_payload(customer, accounts)
        metric = metrics.get(customer.pk)
        payload.update(
            {
                "invoice_count": metric.invoice_count if metric else 0,
                "total_amount": metric.total_amount if metric else 0,
                "avg_basket": metric.avg_basket if metric else None,
                "first_invoice_at": metric.first_purchase_at if metric else None,
                "last_invoice_at": metric.last_purchase_at if metric else None,
                "city": cities.get(customer.pk, ""),
                "order_count": int(tier.get("purchase_count") or 0),
                "online_count": online_count,
                "pos_count": pos_count,
                "first_purchase_at": tier.get("first_purchase_at"),
                "last_purchase_at": tier.get("last_purchase_at"),
                "lifetime_purchase_amount": int(tier.get("lifetime_purchase_amount") or 0),
                "days_since_last_purchase": tier.get("days_since_last_purchase"),
                "tier_code": None if is_operator_account(customer, accounts) else (customer.tier_code or None),
                "tier_label": None if is_operator_account(customer, accounts) else tier_label(customer.tier_code, titles),
                "tier_channel": None if is_operator_account(customer, accounts) else (customer.tier_channel or None),
                "tier_channel_label": (
                    None if is_operator_account(customer, accounts) else tier_channel_label(customer.tier_channel)
                ),
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


def _buyer_analytics_filter(
    population,
    channel,
    sales_lines,
    min_count,
    max_count,
    tier,
    min_amount=None,
    max_amount=None,
    payment_method="",
    has_discount="",
    order_behavior="",
    size="",
    category="",
):
    if tier and tier in enabled_tier_codes():
        return False
    return bool(
        population == "purchasing"
        or channel
        or sales_lines
        or min_count is not None
        or max_count is not None
        or min_amount is not None
        or max_amount is not None
        or payment_method
        or has_discount
        or order_behavior
        or size
        or category
    )


def _operator_rank():
    return Case(
        When(internal_account__is_active=True, then=Value(1)),
        default=Value(0),
        output_field=IntegerField(),
    )


def _apply_sort(qs, sort):
    if sort == "purchase_count":
        if "purchase_count" not in qs.query.annotations:
            qs = qs.annotate(purchase_count=tier_purchase_count_expression())
        return qs.annotate(operator_rank=_operator_rank()).order_by(
            "operator_rank",
            F("purchase_count").desc(),
            F("last_order_at").desc(nulls_last=True),
            "-source_id",
        )
    if sort == "lifetime_amount":
        if "lifetime_amount" not in qs.query.annotations:
            qs = qs.annotate(lifetime_amount=tier_lifetime_amount_expression())
        return qs.annotate(operator_rank=_operator_rank()).order_by(
            "operator_rank",
            F("lifetime_amount").desc(nulls_last=True),
            F("last_order_at").desc(nulls_last=True),
            "-source_id",
        )
    if sort == "churn_risk":
        if "last_qualifying_at" not in qs.query.annotations:
            qs = qs.annotate(last_qualifying_at=tier_last_purchase_expression())
        return qs.annotate(operator_rank=_operator_rank()).order_by(
            "operator_rank",
            F("last_qualifying_at").asc(nulls_last=True),
            "-source_id",
        )
    if sort == "first_purchase":
        if "first_qualifying_at" not in qs.query.annotations:
            qs = qs.annotate(first_qualifying_at=tier_first_purchase_expression())
        return qs.annotate(operator_rank=_operator_rank()).order_by(
            "operator_rank",
            F("first_qualifying_at").desc(nulls_last=True),
            "-source_id",
        )
    if sort == "name":
        return qs.order_by(F("last_name").asc(nulls_last=True), F("first_name").asc(nulls_last=True), "-source_id")
    return qs.order_by(F("last_order_at").desc(nulls_last=True), "-source_id")


def _as_int(value):
    if value in (None, ""):
        return None
    translated = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")
    cleaned = str(value).translate(translated).replace(",", "").replace("_", "").strip()
    try:
        return int(cleaned)
    except (TypeError, ValueError):
        return None


def _summary_key(params):
    items = sorted((key, value) for key in params for value in (params.getlist(key) if hasattr(params, "getlist") else [params[key]]) if key not in SUMMARY_IGNORED_PARAMS)
    return sha1(repr(items).encode()).hexdigest()


def _totals(qs):
    row = qs.order_by().aggregate(count=Count("pk"), total=Sum("metrics__total_amount"), invoices=Sum("metrics__invoice_count"))
    count, total, invoices = row["count"], int(row["total"] or 0), int(row["invoices"] or 0)
    return {
        "count": count,
        "total_amount": total,
        "avg_basket": int(round(total / invoices)) if invoices else None,
        "avg_invoice_count": round(invoices / count, 2) if count else None,
    }


def list_summary(params):
    """Totals of the filtered list plus overall baselines, aggregated in SQL. Cached 5 minutes per (filters, day)."""
    day = timezone.localdate().isoformat()
    key = f"customer-list-summary:{day}:{_summary_key(params)}"
    data = cache.get(key)
    if data is not None:
        return data
    baseline_key = f"customer-list-baseline:{day}"
    baseline = cache.get(baseline_key)
    if baseline is None:
        baseline = _totals(exclude_operator_accounts(Customer.objects.all()))
        cache.set(baseline_key, baseline, SUMMARY_SECONDS)
    scoped = params.copy()
    scoped["dir"] = "desc"  # the same internal-account rule as the redesigned list
    data = {**_totals(customer_list_queryset(scoped)), "baseline": baseline}
    data["share"] = round(data["count"] / baseline["count"] * 100, 1) if baseline["count"] else None
    cache.set(key, data, SUMMARY_SECONDS)
    return data


def _facet_options():
    """The most common real values, from the metrics table, for the filter chips."""
    facets = {}
    with connection.cursor() as cursor:
        for column, key, limit in (("cities", "cities", 12), ("sizes", "sizes", 14)):
            cursor.execute(
                f"SELECT value FROM (SELECT UNNEST({column}) AS value FROM customer_metrics) v GROUP BY value ORDER BY COUNT(*) DESC, value LIMIT %s",
                [limit],
            )
            facets[key] = [row[0] for row in cursor.fetchall()]
    return facets


def _fill_rates():
    """Share of customers (internal accounts excluded) with each optional profile fact, in percent."""
    base = exclude_operator_accounts(Customer.objects.all())
    total = base.count() or 1
    rate = lambda count: round(count * 100 / total, 1)  # noqa: E731
    return {
        "birth_month": rate(base.filter(metrics__birth_month__isnull=False).count()),
        "gender": rate(base.exclude(gender="").count()),
        "joined": rate(base.filter(created_at_source__isnull=False).count()),
        "address": rate(base.exclude(metrics__city_ids=[]).filter(metrics__isnull=False).count()),
        "tier_change": rate(base.filter(Exists(CustomerTierHistory.objects.filter(customer_id=OuterRef("pk")))).count()),
    }


def _geo_options():
    """Active provinces and cities with customer counts from CustomerMetrics; zero-count options go last."""
    counts = {"province": {}, "city": {}}
    with connection.cursor() as cursor:
        for column, key in (("province_ids", "province"), ("city_ids", "city")):
            cursor.execute(
                f"SELECT id, COUNT(*) FROM (SELECT UNNEST(m.{column}) AS id FROM customer_metrics m "
                "WHERE NOT EXISTS (SELECT 1 FROM customer_internal_accounts a WHERE a.customer_id = m.customer_id AND a.is_active)) v GROUP BY id"
            )
            counts[key] = dict(cursor.fetchall())
    order = lambda row: (row["count"] == 0, row["name"])  # noqa: E731
    provinces = [{"id": p.pk, "name": p.name, "count": counts["province"].get(p.pk, 0)} for p in Province.objects.filter(status=True)]
    cities = [
        {"id": c.pk, "name": c.name, "province_id": c.province_id, "count": counts["city"].get(c.pk, 0)}
        for c in City.objects.filter(status=True).only("id", "name", "province_id")
    ]
    return {"provinces": sorted(provinces, key=order), "cities_by_id": sorted(cities, key=order)}


def list_options():
    """Choices for the call filters. Tags and results are not tier- or sales-related, so this is cheap to share."""
    from apps.calls.models import CallTag, CustomerCallStatus

    key = f"customer-list-options:{timezone.localdate().isoformat()}"
    data = cache.get(key)
    if data is None:
        results = CustomerCallStatus.objects.exclude(last_outcome_title="").order_by("last_outcome_title").values_list("last_outcome_title", flat=True).distinct()
        data = {
            **_facet_options(),
            **_geo_options(),
            "fill_rates": _fill_rates(),
            "call_results": list(results),
            "call_tags": list(CallTag.objects.filter(is_active=True).values("id", "title")),
        }
        cache.set(key, data, OPTIONS_SECONDS)
    return data


def product_matches(query, ids=None):
    """Product picker: top 20 title matches, or the titles of already selected ids."""
    from apps.products.models import Product

    if ids:
        rows = Product.objects.filter(pk__in=ids[:100])
    else:
        term = (query or "").strip()
        if len(term) < 2:
            return []
        rows = Product.objects.filter(title__icontains=term).order_by("title")[:20]
    return [{"id": row.pk, "title": row.title or f"کالا {row.source_id}"} for row in rows.only("id", "title", "source_id")]
