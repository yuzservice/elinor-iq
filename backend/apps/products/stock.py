"""Central-warehouse stock (`main_balance` per variety from the read-only Elinor product API).

Central only: the API has no branch stock (docs/SOURCE_STOCK_DISCOVERY.md). `Variant.quantity` is not used."""

import logging
from datetime import timedelta

from django.conf import settings
from django.db.models import Max, Min
from django.utils import timezone

from apps.integrations.elinor.parsers import extract_list

from .models import CentralStock, Product, ProductDailySales, Variant

logger = logging.getLogger(__name__)
STALE_AFTER = timedelta(hours=20)


def _balances(payload):
    """{variety source id: main_balance} from a product payload."""
    out = {}
    for variety in extract_list(payload or {}, ("varieties", "variants", "variations")):
        if isinstance(variety, dict) and variety.get("id") is not None and variety.get("main_balance") is not None:
            try:
                out[int(variety["id"])] = int(float(variety["main_balance"]))
            except (TypeError, ValueError):
                continue
    return out


def _store(product_id, balances, fetched_at):
    variants = dict(Variant.objects.filter(source_id__in=list(balances)).values_list("source_id", "id"))
    rows = [CentralStock(variant_id=variants[s], product_id=product_id, balance=b, fetched_at=fetched_at) for s, b in balances.items() if s in variants]
    CentralStock.objects.bulk_create(rows, update_conflicts=True, unique_fields=["variant_id"], update_fields=["product_id", "balance", "fetched_at"])
    return len(rows)


def seed_from_payloads():
    """Use balances already in stored product payloads where they are newer than what the table has."""
    latest = dict(CentralStock.objects.values("product_id").annotate(at=Max("fetched_at")).values_list("product_id", "at"))
    written = 0
    for product_id, synced_at, payload in Product.objects.exclude(synced_at=None).exclude(source_payload=None).values_list("id", "synced_at", "source_payload"):
        if latest.get(product_id) and latest[product_id] >= synced_at:
            continue
        balances = _balances(payload)
        if balances:
            written += _store(product_id, balances, synced_at)
    return written


def due_products(limit):
    """Products sold in the last 90 days whose central stock is missing or older than STALE_AFTER, oldest first."""
    since = timezone.localdate() - timedelta(days=90)
    selling = set(ProductDailySales.objects.filter(day__gt=since, units__gt=0).values_list("product_id", flat=True).distinct())
    fetched = dict(CentralStock.objects.filter(product_id__in=selling).values("product_id").annotate(at=Min("fetched_at")).values_list("product_id", "at"))
    cutoff = timezone.now() - STALE_AFTER
    due = [pid for pid in selling if fetched.get(pid) is None or fetched[pid] < cutoff]
    due.sort(key=lambda pid: (fetched.get(pid) is not None, fetched.get(pid) or cutoff))
    return due[:limit]


def refresh_central_stock(limit=None, client=None):
    """Seed from payloads, then fetch up to `limit` due products from the API (the client keeps the rate limit).
    Stops at the first API error so a network outage costs one request."""
    limit = settings.PRODUCTS_STOCK_REFRESH_PER_RUN if limit is None else limit
    report = {"seeded": seed_from_payloads(), "fetched": 0, "variants": 0, "error": None}
    due = due_products(limit)
    if not due:
        return report
    if client is None:
        from apps.integrations.elinor.client import ElinorClient

        client = ElinorClient()
    sources = dict(Product.objects.filter(id__in=due).values_list("id", "source_id"))
    for product_id in due:
        try:
            payload = client.get_product(sources[product_id])
        except Exception as exc:  # network or API error: try again next run
            logger.warning("Central stock fetch failed for product %s: %s", product_id, exc)
            report["error"] = type(exc).__name__
            break
        report["fetched"] += 1
        report["variants"] += _store(product_id, _balances(payload), timezone.now())
    return report
