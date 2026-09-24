"""Customer 360 payload. Not a revenue, VIP, RFM, or CLV layer."""

from collections import defaultdict

from django.db.models import Count, Max, Min, Sum

from apps.core.metrics import STATUS_LABELS
from apps.customers.ingest import addresses_for
from apps.customers.presentation import (
    UNNAMED_CUSTOMER,
    customer_status_label,
    gender_label,
    is_incomplete,
)
from apps.customers.purchases import (
    SALES_LINE_LABELS,
    behavior_for,
    channel_for,
    qualifying_orders,
    qualifying_pos,
)
from apps.customers.tiers import metrics_for_customers
from apps.sales.models import OrderItem, PosSaleItem, SalesLine

POS_TYPE_LABELS = {
    "sell": "فروش",
    "refund": "مرجوعی",
    "both": "فروش و مرجوعی",
}
HISTORY_PER_PAGE = 20


def customer_360_payload(customer, history_page=1, history_per_page=HISTORY_PER_PAGE):
    online_qs = qualifying_orders(customer.orders.all())
    pos_qs = qualifying_pos(customer.pos_sales.all())
    online_count = online_qs.count()
    pos_count = pos_qs.count()
    purchase_count = online_count + pos_count
    first_at, last_at = _purchase_bounds(customer)
    sales_lines = _sales_line_usage(customer, online_count)
    items_sold = _units_purchased(customer)
    behavior_key, behavior_label = behavior_for(purchase_count)
    channel_key, channel_label = channel_for(online_count, pos_count)
    tier = metrics_for_customers([customer.pk]).get(customer.pk) or {}
    name = (customer.full_name or "").strip()
    status_label = customer_status_label(customer.status)
    return {
        "id": customer.source_id,
        "name": name or UNNAMED_CUSTOMER,
        "name_is_fallback": not bool(name),
        "incomplete": is_incomplete(customer),
        "mobile": customer.mobile or "",
        "email": customer.email or "",
        "status": customer.status or "",
        "status_label": status_label,
        "first_purchase_at": first_at,
        "last_purchase_at": last_at,
        "purchase_count": purchase_count,
        "online_count": online_count,
        "pos_count": pos_count,
        "items_sold": items_sold,
        "sales_line_count": sum(1 for row in sales_lines if row["purchase_count"] > 0),
        "is_purchasing": purchase_count > 0,
        "purchase_behavior": behavior_key,
        "purchase_behavior_label": behavior_label,
        "tier_code": tier.get("tier_code"),
        "tier_label": tier.get("tier_label"),
        "channel": channel_key,
        "channel_label": channel_label,
        "profile": _profile_payload(customer, status_label),
        "sales_lines": sales_lines,
        "purchases": purchase_history(customer, history_page, history_per_page),
        "addresses": addresses_for(customer),
        "discounts": _discounts(customer),
    }


def purchase_history(customer, page=1, per_page=HISTORY_PER_PAGE):
    events = _purchase_events(customer)
    total = len(events)
    start = (page - 1) * per_page
    page_rows = events[start : start + per_page]
    _hydrate_purchase_items(page_rows)
    return {
        "page": page,
        "per_page": per_page,
        "total": total,
        "results": page_rows,
    }


def _purchase_events(customer):
    events = []
    for row in customer.orders.order_by("-created_at", "-source_id").values(
        "id",
        "source_id",
        "created_at",
        "status",
        "total_amount",
        "discount_amount",
        "items_count",
        "items_quantity",
    ):
        events.append(
            {
                "key": f"online:{row['source_id']}",
                "pk": row["id"],
                "kind": "online",
                "sales_line": SalesLine.ONLINE,
                "sales_line_label": SALES_LINE_LABELS[SalesLine.ONLINE],
                "source_id": row["source_id"],
                "created_at": row["created_at"],
                "type": "order",
                "type_label": "سفارش آنلاین",
                "item_count": int(row["items_quantity"] or row["items_count"] or 0),
                "status": row["status"] or "",
                "status_label": STATUS_LABELS.get(row["status"], row["status"] or "—"),
                "value": row["total_amount"],
                "value_kind": "online_total",
                "value_label": "مبلغ سفارش آنلاین",
                "discount_amount": row["discount_amount"] or 0,
                "is_cancelled": row["status"] in {"canceled", "failed", "canceled_by_user"},
                "items": [],
            }
        )
    for row in customer.pos_sales.order_by("-created_at", "-source_id").values(
        "id",
        "source_id",
        "created_at",
        "sales_line",
        "type",
        "is_cancelled",
        "deleted_at",
        "discount_amount",
    ):
        events.append(
            {
                "key": f"pos:{row['source_id']}",
                "pk": row["id"],
                "kind": "pos",
                "sales_line": row["sales_line"],
                "sales_line_label": SALES_LINE_LABELS.get(row["sales_line"], row["sales_line"]),
                "source_id": row["source_id"],
                "created_at": row["created_at"],
                "type": row["type"] or "sell",
                "type_label": POS_TYPE_LABELS.get(row["type"], row["type"] or "فروش"),
                "item_count": 0,
                "status": _pos_status(row),
                "status_label": _pos_status_label(row),
                "value": None,
                "value_kind": None,
                "value_label": None,
                "discount_amount": row["discount_amount"] or 0,
                "is_cancelled": bool(row["is_cancelled"] or row["deleted_at"]),
                "items": [],
            }
        )
    events.sort(key=lambda row: (row["created_at"], row["kind"], row["source_id"]), reverse=True)
    return events


def _hydrate_purchase_items(events):
    online_ids = [row["pk"] for row in events if row["kind"] == "online"]
    pos_ids = [row["pk"] for row in events if row["kind"] == "pos"]
    online_items = defaultdict(list)
    if online_ids:
        for item in (
            OrderItem.objects.filter(order_id__in=online_ids)
            .select_related("product", "variant")
            .order_by("id")
        ):
            online_items[item.order_id].append(_item_payload(item, kind="online"))
    pos_items = defaultdict(list)
    if pos_ids:
        for item in (
            PosSaleItem.objects.filter(pos_sale_id__in=pos_ids, deleted_at__isnull=True)
            .select_related("product", "variant")
            .order_by("id")
        ):
            pos_items[item.pos_sale_id].append(_item_payload(item, kind="pos"))
    for row in events:
        if row["kind"] == "online":
            row["items"] = online_items.get(row["pk"], [])
            if row["items"] and not row["item_count"]:
                row["item_count"] = len(row["items"])
        else:
            row["items"] = pos_items.get(row["pk"], [])
            row["item_count"] = len(row["items"])
        row.pop("pk", None)


def _item_payload(item, kind):
    product = item.product.title if item.product and item.product.title else ""
    variant = item.variant
    variant_label = ""
    color = ""
    size = ""
    if variant:
        variant_label = (variant.title or variant.name or "").strip()
        color = (variant.color_name or "").strip()
        size = (variant.size or "").strip()
    if kind == "online":
        title = item.display_title
        item_type = ""
        type_label = ""
    else:
        title = variant.display_name if variant else (product or "کالا")
        item_type = item.type or ""
        type_label = POS_TYPE_LABELS.get(item_type, item_type)
    if not product:
        product = title
    return {
        "id": item.source_id,
        "product": product,
        "variant": variant_label,
        "quantity": item.quantity,
        "color": color,
        "size": size,
        "amount": item.amount,
        "discount_amount": item.discount_amount or 0,
        "type": item_type,
        "type_label": type_label,
    }


def product_history(customer):
    results = _product_history(customer)
    return {"total": len(results), "results": results}


def _product_history(customer):
    buckets = {}
    for row in (
        OrderItem.objects.filter(order__customer=customer)
        .exclude(order__status__in=("canceled", "failed", "wait_for_payment"))
        .values(
            "order_id",
            "order__created_at",
            "quantity",
            "product_id",
            "product__title",
            "product_source_id",
            "title",
            "variant__color_name",
            "variant__size",
        )
    ):
        _add_product_row(
            buckets,
            key=_product_key(row["product_id"], row["product_source_id"], row["product__title"] or row["title"]),
            title=row["product__title"] or row["title"] or "کالا",
            quantity=row["quantity"] or 0,
            event_id=f"online:{row['order_id']}",
            created_at=row["order__created_at"],
            color=row["variant__color_name"],
            size=row["variant__size"],
        )
    for row in (
        PosSaleItem.objects.filter(
            pos_sale__customer=customer,
            pos_sale__deleted_at__isnull=True,
            pos_sale__is_cancelled=False,
            deleted_at__isnull=True,
            type="sell",
        )
        .exclude(pos_sale__type="refund")
        .values(
            "pos_sale_id",
            "pos_sale__created_at",
            "quantity",
            "product_id",
            "product__title",
            "product_source_id",
            "variant__color_name",
            "variant__size",
        )
    ):
        _add_product_row(
            buckets,
            key=_product_key(row["product_id"], row["product_source_id"], row["product__title"]),
            title=row["product__title"] or "کالا",
            quantity=row["quantity"] or 0,
            event_id=f"pos:{row['pos_sale_id']}",
            created_at=row["pos_sale__created_at"],
            color=row["variant__color_name"],
            size=row["variant__size"],
        )
    results = []
    for bucket in buckets.values():
        results.append(
            {
                "product": bucket["product"],
                "total_quantity": bucket["total_quantity"],
                "purchase_count": len(bucket["event_ids"]),
                "last_purchase_at": bucket["last_purchase_at"],
                "colors": sorted(color for color in bucket["colors"] if color),
                "sizes": sorted(size for size in bucket["sizes"] if size),
            }
        )
    results.sort(key=lambda row: (-row["total_quantity"], -row["purchase_count"], row["product"]))
    return results


def _add_product_row(buckets, key, title, quantity, event_id, created_at, color, size):
    bucket = buckets.get(key)
    if bucket is None:
        bucket = {
            "product": title or "کالا",
            "total_quantity": 0,
            "event_ids": set(),
            "last_purchase_at": None,
            "colors": set(),
            "sizes": set(),
        }
        buckets[key] = bucket
    bucket["total_quantity"] += int(quantity or 0)
    bucket["event_ids"].add(event_id)
    if created_at and (bucket["last_purchase_at"] is None or created_at > bucket["last_purchase_at"]):
        bucket["last_purchase_at"] = created_at
    if color:
        bucket["colors"].add(color)
    if size:
        bucket["sizes"].add(size)


def _product_key(product_id, product_source_id, title):
    if product_id:
        return ("id", product_id)
    if product_source_id:
        return ("src", product_source_id)
    return ("title", title or "کالا")


def _sales_line_usage(customer, online_count):
    pos_counts = {
        row["sales_line"]: row["c"]
        for row in qualifying_pos(customer.pos_sales.all()).values("sales_line").annotate(c=Count("id"))
    }
    rows = []
    for key, label in SALES_LINE_LABELS.items():
        count = online_count if key == SalesLine.ONLINE else int(pos_counts.get(key) or 0)
        rows.append({"key": key, "label": label, "purchase_count": count, "used": count > 0})
    return rows


def _purchase_bounds(customer):
    online = qualifying_orders(customer.orders.all()).aggregate(first=Min("created_at"), last=Max("created_at"))
    pos = qualifying_pos(customer.pos_sales.all()).aggregate(first=Min("created_at"), last=Max("created_at"))
    firsts = [value for value in (online["first"], pos["first"]) if value]
    lasts = [value for value in (online["last"], pos["last"]) if value]
    return (min(firsts) if firsts else None, max(lasts) if lasts else None)


def _units_purchased(customer):
    online = (
        OrderItem.objects.filter(order__customer=customer)
        .exclude(order__status__in=("canceled", "failed", "wait_for_payment"))
        .aggregate(v=Sum("quantity"))["v"]
        or 0
    )
    pos = (
        PosSaleItem.objects.filter(
            pos_sale__customer=customer,
            pos_sale__deleted_at__isnull=True,
            pos_sale__is_cancelled=False,
            deleted_at__isnull=True,
            type="sell",
        )
        .exclude(pos_sale__type="refund")
        .aggregate(v=Sum("quantity"))["v"]
        or 0
    )
    return int(online) + int(pos)


def _discounts(customer):
    rows = []
    for order in customer.orders.exclude(discount_amount=0).order_by("-created_at"):
        rows.append(
            {
                "source_id": order.source_id,
                "kind": "online",
                "sales_line": SalesLine.ONLINE,
                "sales_line_label": SALES_LINE_LABELS[SalesLine.ONLINE],
                "created_at": order.created_at,
                "discount_amount": order.discount_amount,
                "status": order.status,
                "status_label": STATUS_LABELS.get(order.status, order.status or "—"),
            }
        )
    for sale in customer.pos_sales.exclude(discount_amount=0).order_by("-created_at"):
        rows.append(
            {
                "source_id": sale.source_id,
                "kind": "pos",
                "sales_line": sale.sales_line,
                "sales_line_label": SALES_LINE_LABELS.get(sale.sales_line, sale.sales_line),
                "created_at": sale.created_at,
                "discount_amount": sale.discount_amount,
                "status": _pos_status({"type": sale.type, "is_cancelled": sale.is_cancelled, "deleted_at": sale.deleted_at}),
                "status_label": _pos_status_label(
                    {"type": sale.type, "is_cancelled": sale.is_cancelled, "deleted_at": sale.deleted_at}
                ),
            }
        )
    rows.sort(key=lambda row: (row["created_at"], row["kind"], row["source_id"]), reverse=True)
    return rows[:200]


def _profile_payload(customer, status_label):
    return {
        "gender": customer.gender or "",
        "gender_label": gender_label(customer.gender),
        "national_code": customer.national_code or "",
        "birth_date": customer.birth_date,
        "card_number": customer.card_number or "",
        "club_level": customer.club_level or "",
        "summary": customer.summary or "",
        "email": customer.email or "",
        "status": customer.status or "",
        "status_label": status_label,
        "created_at": customer.created_at_source,
        "updated_at": customer.updated_at_source,
    }


def _pos_status(row):
    if row.get("deleted_at"):
        return "deleted"
    if row.get("is_cancelled"):
        return "cancelled"
    return row.get("type") or "sell"


def _pos_status_label(row):
    if row.get("deleted_at"):
        return "حذف‌شده"
    if row.get("is_cancelled"):
        return "لغو شده"
    return POS_TYPE_LABELS.get(row.get("type"), row.get("type") or "فروش")
