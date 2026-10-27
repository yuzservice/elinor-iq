from django.db.models import Case, Count, Exists, F, IntegerField, Max, Min, OuterRef, Q, Value, When

from apps.customers.models import Customer, CustomerAddress
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

    if tier and tier in enabled_tier_codes():
        qs = exclude_operator_accounts(qs.filter(tier_code=tier))

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
        tier,
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

    if payment_method:
        qs = _apply_payment_method_filter(qs, payment_method)

    if has_discount in {"yes", "no"}:
        qs = _apply_discount_filter(qs, has_discount)

    if order_behavior:
        qs = _apply_order_behavior_filter(qs, order_behavior)

    if size:
        qs = _apply_size_filter(qs, size)

    if category:
        qs = _apply_category_filter(qs, category)

    if city:
        qs = _apply_city_filter(qs, city)

    if profile_state:
        qs = _apply_profile_state_filter(qs, profile_state)

    if birth_month is not None and 1 <= birth_month <= 12:
        qs = qs.filter(birth_date__month=birth_month)

    return _apply_sort(qs, sort)


def _apply_payment_method_filter(qs, payment_method):
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
        return qs.filter(
            Exists(pos_base.filter(snappay_cashier_amount__gt=0))
            | Exists(online_gw_base.filter(gateway__icontains="snapp"))
        )
    if payment_method == "digipay":
        return qs.filter(
            Exists(pos_base.filter(digipay_cashier_amount__gt=0))
            | Exists(online_gw_base.filter(gateway__icontains="digi"))
        )
    if payment_method == "installment":
        return qs.filter(
            Exists(pos_base.filter(Q(snappay_cashier_amount__gt=0) | Q(digipay_cashier_amount__gt=0)))
            | Exists(online_gw_base.filter(Q(gateway__icontains="snapp") | Q(gateway__icontains="digi")))
        )
    if payment_method == "wallet":
        return qs.filter(Exists(pos_base.filter(from_wallet_amount__gt=0)))
    if payment_method == "shopino":
        return qs.filter(
            Exists(
                qualifying_orders().filter(
                    customer_id=OuterRef("pk"),
                    is_shopino=True,
                )
            )
        )
    return qs


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


def _apply_size_filter(qs, size):
    normalized = size.strip()
    if not normalized:
        return qs
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
    return qs.filter(online_size | pos_size)


def _apply_category_filter(qs, category):
    term = category.strip()
    if not term:
        return qs
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
    return qs.filter(online_cat | pos_cat)


def _apply_city_filter(qs, city):
    term = city.strip()
    if not term:
        return qs
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
    return qs.filter(addr_match | order_city_match)


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
        payload.update(
            {
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
