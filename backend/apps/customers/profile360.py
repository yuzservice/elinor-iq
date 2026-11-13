"""Customer 360 summary: value cards, tier comparison, purchase rhythm, taste, call header, timeline.

Amounts follow CustomerMetrics (online total_amount + signed POS item lines, refund headers included).
Rules: docs/business-rules/customer-360.md.
"""

from collections import Counter
from statistics import median

from django.core.cache import cache
from django.db.models import Count, F, Max, Sum, Value
from django.db.models.functions import TruncDate
from django.utils import timezone

from apps.customers.models import CustomerMetrics, CustomerTierHistory
from apps.customers.operators import is_operator_account
from apps.customers.tiers import _signed_line_sql, tier_label
from apps.sales.models import OnlinePayment, PosSaleItem, SalesLine
from apps.sales.semantics import (
    SALES_LINE_LABELS,
    qualifying_online_items,
    qualifying_online_orders,
    qualifying_pos_items,
    qualifying_pos_sales,
    sales_line_label,
)

TIER_AVERAGES_SECONDS = 24 * 60 * 60
MIN_PURCHASES_FOR_RHYTHM = 3
TIMELINE_PER_PAGE = 20
BRANCH_LABELS = {**SALES_LINE_LABELS, SalesLine.ONLINE: "سایت"}
POS_TENDERS = (  # first match wins, so an installment payment is not reported as cash
    ("snappay_cashier_amount", "اسنپ‌پی"),
    ("digipay_cashier_amount", "دیجی‌پی"),
    ("from_wallet_amount", "کیف پول"),
    ("card_by_card_amount", "کارت به کارت"),
    ("cash_amount", "نقد / کارتخوان"),
)
ONLINE_GATEWAYS = {"snapppay": "اسنپ‌پی", "digipay": "دیجی‌پی"}


# --- Value cards ------------------------------------------------------------------------------


def value_summary(customer, desk=None):
    desk = is_operator_account(customer) if desk is None else desk
    online = qualifying_online_orders(customer.orders.all())
    pos = qualifying_pos_sales(customer.pos_sales.all())
    online_row = online.aggregate(count=Count("pk"), amount=Sum("total_amount"), last=Max("created_at"))
    pos_row = pos.aggregate(count=Count("pk"), last=Max("created_at"))
    pos_amount = (
        PosSaleItem.objects.filter(
            deleted_at__isnull=True,
            pos_sale__customer=customer,
            pos_sale__deleted_at__isnull=True,
            pos_sale__is_cancelled=False,
            pos_sale__type__in=("sell", "both", "refund"),
        ).aggregate(total=Sum(_signed_line_sql()))["total"]
        or 0
    )
    invoices = online_row["count"] + pos_row["count"]
    total = int(online_row["amount"] or 0) + int(pos_amount)
    basket = int(round(total / invoices)) if invoices else None
    last = max([value for value in (online_row["last"], pos_row["last"]) if value], default=None)
    days_since = (timezone.localdate() - timezone.localtime(last).date()).days if last else None
    rhythm = purchase_rhythm(online, pos, invoices)
    comparison = None if desk or not customer.tier_code else tier_comparison(customer.tier_code, total, basket)
    return {
        "total_amount": total,
        "avg_basket": basket,
        "invoice_count": invoices,
        "online_count": online_row["count"],
        "pos_count": pos_row["count"],
        "last_purchase_at": last,
        "days_since_last": days_since,
        "usual_gap_days": rhythm,
        "overdue": rhythm is not None and days_since is not None and days_since > rhythm,
        "comparison": comparison,
    }


def purchase_rhythm(online, pos, invoices):
    """Median gap in days between distinct purchase days; None under MIN_PURCHASES_FOR_RHYTHM invoices."""
    if invoices < MIN_PURCHASES_FOR_RHYTHM:
        return None
    tz = timezone.get_current_timezone()
    days = set(online.annotate(day=TruncDate("created_at", tzinfo=tz)).values_list("day", flat=True))
    days |= set(pos.annotate(day=TruncDate("created_at", tzinfo=tz)).values_list("day", flat=True))
    ordered = sorted(days)
    gaps = [(later - earlier).days for earlier, later in zip(ordered, ordered[1:])]
    return int(round(median(gaps))) if gaps else None


def tier_averages():
    """tier_code -> {total, basket, customers}, from CustomerMetrics (internal accounts excluded). Cached for the day."""
    key = f"customer-360-tier-averages:{timezone.localdate().isoformat()}"
    data = cache.get(key)
    if data is None:
        rows = (
            CustomerMetrics.objects.filter(customer__tier_code__isnull=False)
            .exclude(customer__internal_account__is_active=True)
            .values("customer__tier_code")
            .annotate(customers=Count("pk"), total=Sum("total_amount"), invoices=Sum("invoice_count"))
        )
        data = {
            row["customer__tier_code"]: {
                "customers": row["customers"],
                "total": int(round(row["total"] / row["customers"])) if row["customers"] else None,
                "basket": int(round(row["total"] / row["invoices"])) if row["invoices"] else None,
            }
            for row in rows
        }
        cache.set(key, data, TIER_AVERAGES_SECONDS)
    return data


def _percent(value, base):
    if value is None or not base:
        return None
    return int(round((value / base - 1) * 100))


def tier_comparison(tier_code, total, basket):
    average = tier_averages().get(tier_code)
    if not average:
        return None
    return {
        "tier_label": tier_label(tier_code),
        "total_percent": _percent(total, average["total"]),
        "basket_percent": _percent(basket, average["basket"]),
    }


# --- Taste -----------------------------------------------------------------------------------


def _most_common(values):
    """Most frequent non-empty value; ties go to the value seen most recently, then the alphabetically first."""
    counts = Counter()
    latest = {}
    for value, at in values:
        value = (value or "").strip()
        if not value:
            continue
        counts[value] += 1
        latest[value] = max(latest.get(value, at), at) if at else latest.get(value, at)
    if not counts:
        return None
    min_time = timezone.datetime.min.replace(tzinfo=timezone.get_current_timezone())
    return sorted(counts, key=lambda value: (-counts[value], -(latest.get(value) or min_time).timestamp(), value))[0]


def customer_taste(customer):
    """Most frequent category, size, color, branch, payment method, and the share of discounted invoices."""
    online_items = qualifying_online_items().filter(order__customer=customer).values_list(
        "product__categories__title", "variant__size", "variant__color_name", "order__created_at"
    )
    pos_items = qualifying_pos_items().filter(pos_sale__customer=customer).values_list(
        "product__categories__title", "variant__size", "variant__color_name", "pos_sale__created_at"
    )
    items = list(online_items) + list(pos_items)
    online = list(qualifying_online_orders(customer.orders.all()).values_list("pk", "created_at", "discount_amount", "is_shopino"))
    pos = list(
        qualifying_pos_sales(customer.pos_sales.all()).values_list(
            "created_at", "sales_line", "discount_amount", *[field for field, _label in POS_TENDERS]
        )
    )
    gateways = dict(
        OnlinePayment.objects.filter(status="success", invoice__status="success", invoice__order_id__in=[row[0] for row in online])
        .values_list("invoice__order_id", "gateway")
    )
    payments = [(("شاپینو" if shopino else ONLINE_GATEWAYS.get(gateways.get(pk), "درگاه آنلاین")), at) for pk, at, _discount, shopino in online]
    for row in pos:
        tenders = row[3:]
        label = next((name for (_field, name), amount in zip(POS_TENDERS, tenders) if amount and amount > 0), None)
        payments.append((label, row[0]))
    invoices = len(online) + len(pos)
    discounted = sum(1 for row in online if row[2]) + sum(1 for row in pos if row[2])
    return {
        "category": _most_common((row[0], row[3]) for row in items),
        "size": _most_common((row[1], row[3]) for row in items),
        "color": _most_common((row[2], row[3]) for row in items),
        "branch": _most_common([(BRANCH_LABELS[SalesLine.ONLINE], row[1]) for row in online] + [(sales_line_label(row[1], BRANCH_LABELS), row[0]) for row in pos]),
        "payment": _most_common(payments),
        "discount_percent": int(round(discounted * 100 / invoices)) if invoices else None,
    }


def invoice_payments(order_ids, sale_ids):
    """Payment label per invoice: {("online", pk) | ("pos", pk): label}. Same rules as the taste row."""
    from apps.sales.models import Order, PosSale

    gateways = dict(
        OnlinePayment.objects.filter(status="success", invoice__status="success", invoice__order_id__in=order_ids)
        .values_list("invoice__order_id", "gateway")
    )
    labels = {
        ("online", pk): "شاپینو" if shopino else ONLINE_GATEWAYS.get(gateways.get(pk), "درگاه آنلاین")
        for pk, shopino in Order.objects.filter(pk__in=order_ids).values_list("pk", "is_shopino")
    }
    for pk, *tenders in PosSale.objects.filter(pk__in=sale_ids).values_list("pk", *[field for field, _label in POS_TENDERS]):
        labels[("pos", pk)] = next((name for (_field, name), amount in zip(POS_TENDERS, tenders) if amount and amount > 0), None)
    return labels


def pos_amounts(sale_ids):
    """Signed item-line total per POS sale, as in CustomerMetrics."""
    return dict(
        PosSaleItem.objects.filter(pos_sale_id__in=sale_ids, deleted_at__isnull=True)
        .values("pos_sale_id")
        .annotate(total=Sum(_signed_line_sql()))
        .values_list("pos_sale_id", "total")
    )


def invoice_products(order_ids, sale_ids):
    """Product titles per invoice, in line order: {("online", pk) | ("pos", pk): [title, ...]}."""
    from apps.sales.models import OrderItem

    products = {}
    for pk, product, title in OrderItem.objects.filter(order_id__in=order_ids).order_by("id").values_list("order_id", "product__title", "title"):
        products.setdefault(("online", pk), []).append(product or title or "کالا")
    for pk, product in PosSaleItem.objects.filter(pos_sale_id__in=sale_ids, deleted_at__isnull=True).order_by("id").values_list("pos_sale_id", "product__title"):
        products.setdefault(("pos", pk), []).append(product or "کالا")
    return products


# --- Call header -------------------------------------------------------------------------------


def call_header(customer):
    from apps.calls.models import CallLog, CallTask, CustomerCallTag

    last = CallLog.objects.filter(customer=customer).select_related("agent").only("outcome_title", "created_at", "connected", "agent__username").order_by("-created_at").first()
    followup = CallTask.objects.filter(customer=customer, status=CallTask.STATUS_OPEN, source=CallTask.SOURCE_FOLLOWUP).order_by("due_at").first()
    tags = CustomerCallTag.objects.filter(customer=customer, resolved_at__isnull=True, tag__is_active=True).select_related("tag").order_by("-tagged_at")
    return {
        "tags": [{"id": row.tag_id, "title": row.tag.title, "color": row.tag.color} for row in tags],
        "followup_at": followup.due_at if followup else None,
        "last_call": {"outcome_title": last.outcome_title, "at": last.created_at, "agent": last.agent.username, "connected": last.connected} if last else None,
    }


# --- Timeline ------------------------------------------------------------------------------------

TIMELINE_TYPES = ("invoice", "call", "tier", "discount")


def _timeline_sources(customer):
    from apps.calls.models import CallLog

    online = customer.orders.all().annotate(kind=Value(1), at=F("created_at"), ref=F("pk")).values("kind", "at", "ref")
    pos = customer.pos_sales.all().annotate(kind=Value(2), at=F("created_at"), ref=F("pk")).values("kind", "at", "ref")
    calls = CallLog.objects.filter(customer=customer).annotate(kind=Value(3), at=F("created_at"), ref=F("pk")).values("kind", "at", "ref")
    tiers = CustomerTierHistory.objects.filter(customer=customer).annotate(kind=Value(4), at=F("changed_at"), ref=F("pk")).values("kind", "at", "ref")
    return {"online": online, "pos": pos, "call": calls, "tier": tiers}


def timeline(customer, kind="all", page=1, per_page=TIMELINE_PER_PAGE):
    """Invoices (all, with status), call logs and tier changes, newest first. «discount» = invoices with a discount."""
    from apps.calls.agent import log_payload
    from apps.calls.models import CallLog
    from apps.sales.models import Order, PosSale

    sources = _timeline_sources(customer)
    if kind == "invoice":
        parts = [sources["online"], sources["pos"]]
    elif kind == "discount":
        parts = [sources["online"].filter(discount_amount__gt=0), sources["pos"].filter(discount_amount__gt=0)]
    elif kind == "call":
        parts = [sources["call"]]
    elif kind == "tier":
        parts = [sources["tier"]]
    else:
        parts = list(sources.values())
    parts = [part.order_by() for part in parts]
    total = sum(part.count() for part in parts)
    union = parts[0].union(*parts[1:], all=True) if len(parts) > 1 else parts[0]
    start = (page - 1) * per_page
    rows = list(union.order_by("-at", "-ref")[start : start + per_page])

    by_kind = {}
    for row in rows:
        by_kind.setdefault(row["kind"], []).append(row["ref"])
    orders = {row.pk: row for row in Order.objects.filter(pk__in=by_kind.get(1, [])).only("source_id", "status", "total_amount", "discount_amount", "created_at")}
    sales = {row.pk: row for row in PosSale.objects.filter(pk__in=by_kind.get(2, [])).only("source_id", "sales_line", "type", "is_cancelled", "deleted_at", "discount_amount", "created_at")}
    logs = {row.pk: row for row in CallLog.objects.filter(pk__in=by_kind.get(3, [])).select_related("agent", "program", "form_version")}
    tier_rows = {row.pk: row for row in CustomerTierHistory.objects.filter(pk__in=by_kind.get(4, []))}
    sale_amounts = pos_amounts(by_kind.get(2, []))
    payments = invoice_payments(by_kind.get(1, []), by_kind.get(2, []))
    products = invoice_products(by_kind.get(1, []), by_kind.get(2, []))
    qualifying_online = set(qualifying_online_orders(Order.objects.filter(pk__in=by_kind.get(1, []))).values_list("pk", flat=True))
    qualifying_pos = set(qualifying_pos_sales(PosSale.objects.filter(pk__in=by_kind.get(2, []))).values_list("pk", flat=True))

    events = []
    for row in rows:
        ref = row["ref"]
        if row["kind"] == 1:
            order = orders[ref]
            events.append({"type": "invoice", "at": order.created_at, "channel": "online", "branch": BRANCH_LABELS[SalesLine.ONLINE], "source_id": order.source_id, "amount": order.total_amount, "discount_amount": order.discount_amount, "qualifying": ref in qualifying_online, "status": order.status, "payment": payments.get(("online", ref)), "products": products.get(("online", ref), [])})
        elif row["kind"] == 2:
            sale = sales[ref]
            events.append({"type": "invoice", "at": sale.created_at, "channel": "pos", "branch": sales_line_label(sale.sales_line, BRANCH_LABELS), "source_id": sale.source_id, "amount": int(sale_amounts.get(ref) or 0), "discount_amount": sale.discount_amount, "qualifying": ref in qualifying_pos, "status": sale.type, "payment": payments.get(("pos", ref)), "products": products.get(("pos", ref), [])})
        elif row["kind"] == 3:
            events.append({"type": "call", "at": logs[ref].created_at, "call": log_payload(logs[ref])})
        else:
            change = tier_rows[ref]
            events.append(
                {
                    "type": "tier",
                    "at": change.changed_at,
                    "from": change.previous_tier_title or tier_label(change.previous_tier_code) if change.previous_tier_code else None,
                    "to": change.tier_title or tier_label(change.tier_code) if change.tier_code else None,
                    "reason": change.reason,
                }
            )
    return {"results": events, "total": total, "page": page, "per_page": per_page}
