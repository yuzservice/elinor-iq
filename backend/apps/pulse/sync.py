"""Pulse jobs: CSV import, Zernio sync, daily snapshot, product matching.

Writes only ig_ tables. Reads products/variants. Never calls the Elinor API.
"""

import csv
import re
from contextlib import contextmanager
from datetime import datetime, time, timedelta

from django.conf import settings
from django.db import connection, transaction
from django.utils import timezone

from apps.products.models import Product

from . import media
from .captions import parse_codes
from .codes import rebuild_product_codes
from .models import IgAccount, IgAccountDaily, IgMediaAsset, IgPost, IgPostProduct, IgPostSnapshot, IgProductCode, IgSyncRun
from .zernio import ZernioClient, ZernioError

JOB_SYNC = "sync"
JOB_SNAPSHOT = "snapshot"
JOB_MATCH = "match_products"
JOB_IMPORT = "import_csv"
SYNC_EVERY = timedelta(hours=3)
SNAPSHOT_AFTER = time(0, 30)  # Tehran
POST_WINDOW_DAYS = 30  # metrics and snapshots cover each post's first 30 days
REACH_DAYS = 3
DISABLED = "Pulse is disabled (PULSE_ENABLED=false)."
_SHORTCODE = re.compile(r"instagram\.com/(?:[^/]+/)?(?:p|reel|reels|tv)/([^/?#]+)")


# --- Job runner --------------------------------------------------------------------------------


def last_success(job):
    return IgSyncRun.objects.filter(job=job, status=IgSyncRun.STATUS_SUCCESS).order_by("-started_at").first()


def sync_due(now=None):
    last = last_success(JOB_SYNC)
    return last is None or (now or timezone.now()) - last.started_at >= SYNC_EVERY - timedelta(minutes=1)


def snapshot_due(now=None):
    now = timezone.localtime(now or timezone.now())
    if now.time() < SNAPSHOT_AFTER:
        return False
    last = last_success(JOB_SNAPSHOT)
    return last is None or timezone.localtime(last.started_at).date() < now.date()


def match_due():
    last_sync, last_match = last_success(JOB_SYNC), last_success(JOB_MATCH)
    return last_sync is not None and (last_match is None or last_match.started_at < last_sync.started_at)


@contextmanager
def _job_lock(job):
    with connection.cursor() as cursor:
        cursor.execute("SELECT pg_try_advisory_lock(hashtext(%s))", [f"pulse:{job}"])
        acquired = cursor.fetchone()[0]
    try:
        yield acquired
    finally:
        if acquired:
            with connection.cursor() as cursor:
                cursor.execute("SELECT pg_advisory_unlock(hashtext(%s))", [f"pulse:{job}"])


def run_job(job, work, if_due=False, due=None):
    """Flag check, --if-due, one run at a time, and an ig_sync_runs row. Returns a one-line summary."""
    if not settings.PULSE_ENABLED:
        return DISABLED
    if if_due and due is not None and not due():
        return f"{job}: not due"
    with _job_lock(job) as acquired:
        if not acquired:
            return f"{job}: already running"
        run = IgSyncRun.objects.create(job=job)
        try:
            counts = work()
        except Exception as exc:
            run.status, run.error, run.finished_at = IgSyncRun.STATUS_FAILED, str(exc)[:2000], timezone.now()
            run.save(update_fields=["status", "error", "finished_at"])
            raise
        run.status, run.counts, run.finished_at = IgSyncRun.STATUS_SUCCESS, counts, timezone.now()
        run.save(update_fields=["status", "counts", "finished_at"])
        return f"{job}: {counts}"


# --- Posts ---------------------------------------------------------------------------------------


def shortcode_from_url(url):
    match = _SHORTCODE.search(url or "")
    return match.group(1) if match else None


def account():
    row, _ = IgAccount.objects.get_or_create(handle=settings.PULSE_HANDLE)
    if settings.ZERNIO_ACCOUNT_ID and row.zernio_account_id != settings.ZERNIO_ACCOUNT_ID:
        row.zernio_account_id = settings.ZERNIO_ACCOUNT_ID
        row.save(update_fields=["zernio_account_id"])
    return row


def apply_caption(post):
    """Store the caption's codes in order; replace them only when they changed."""
    found = parse_codes(post.caption)
    wanted = [(row.code, row.line, row.price) for row in found]
    current = list(post.codes.order_by("position").values_list("raw_code", "raw_line", "caption_price"))
    if current != wanted:
        with transaction.atomic():
            post.codes.all().delete()
            IgPostProduct.objects.bulk_create(
                IgPostProduct(post=post, position=index, raw_code=code, raw_line=line, caption_price=price)
                for index, (code, line, price) in enumerate(wanted)
            )
    brand = not found
    if post.is_brand_content != brand:
        post.is_brand_content = brand
        post.save(update_fields=["is_brand_content"])
    return len(found)


def _int(value):
    if value in (None, ""):
        return None
    return int(float(value))


def _float(value):
    return None if value in (None, "") else float(value)


def _zernio_metrics(analytics):
    return {
        "views": _int(analytics.get("views")),
        "reach": _int(analytics.get("reach")),
        "likes": _int(analytics.get("likes")),
        "comments": _int(analytics.get("comments")),
        "shares": _int(analytics.get("shares")),
        "saves": _int(analytics.get("saves")),
        "follows": _int(analytics.get("follows")),
        "profile_views": _int(analytics.get("profileViews")),
        "er": _float(analytics.get("engagementRate")),
        "avg_watch_ms": _int(analytics.get("igReelsAvgWatchTime")),
        "skip_rate": _float(analytics.get("reelsSkipRate")),
    }


def upsert_zernio_post(owner, item):
    """One post of GET /v1/analytics. Returns (post, created) or (None, False) when it has no Instagram URL."""
    platform = next((row for row in item.get("platforms") or [] if row.get("platform") == "instagram"), {})
    url = item.get("platformPostUrl") or platform.get("platformPostUrl") or ""
    shortcode = shortcode_from_url(url)
    if not shortcode:
        return None, False
    analytics = item.get("analytics") or platform.get("analytics") or {}
    defaults = {
        "account": owner,
        "ig_media_id": platform.get("platformPostId") or None,
        "zernio_id": item.get("_id") or None,
        "url": url,
        "product_type": item.get("mediaProductType") or "",
        "media": item.get("mediaType") or "",
        "published_at": datetime.fromisoformat(item["publishedAt"].replace("Z", "+00:00")),
        "caption": item.get("content") or "",
        "duration_s": _int(analytics.get("videoDurationSeconds")),
        "is_ad": bool(item.get("isAd")),
        "cover_url": item.get("thumbnailUrl") or "",
        "metrics_updated_at": timezone.now(),
        "source": IgPost.SOURCE_ZERNIO,
        **_zernio_metrics(analytics),
    }
    post, created = IgPost.objects.update_or_create(shortcode=shortcode, defaults=defaults)
    apply_caption(post)
    media.queue(IgMediaAsset.KIND_COVER, shortcode, post.cover_url)
    return post, created


def import_csv(path):
    """Initial import of a Zernio CSV export. Idempotent on the URL shortcode; never overwrites Zernio data."""
    owner = account()
    counts = {"rows": 0, "created": 0, "updated": 0, "kept_zernio": 0, "with_codes": 0}
    with open(path, encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            counts["rows"] += 1
            shortcode = shortcode_from_url(row["url"])
            existing = IgPost.objects.filter(shortcode=shortcode).first()
            if existing and existing.source != IgPost.SOURCE_CSV:
                counts["kept_zernio"] += 1
                continue
            defaults = {
                "account": owner,
                "url": row["url"],
                "product_type": row["type"],
                "media": row["media"],
                "published_at": datetime.fromisoformat(row["date"].replace("Z", "+00:00")),
                "caption": re.sub(r" ?⏎ ?", "\n", row["caption"]),
                "duration_s": _int(row["dur"]),
                "is_ad": row["is_ad"].strip().lower() == "true",
                "source": IgPost.SOURCE_CSV,
                "views": _int(row["views"]),
                "reach": _int(row["reach"]),
                "likes": _int(row["likes"]),
                "comments": _int(row["comments"]),
                "shares": _int(row["shares"]),
                "saves": _int(row["saves"]),
                "follows": _int(row["follows"]),
                "profile_views": _int(row["profile_views"]),
                "er": _float(row["er"]),
                "avg_watch_ms": _int(row["avg_watch_ms"]),
                "skip_rate": _float(row["skip"]),
            }
            post, created = IgPost.objects.update_or_create(shortcode=shortcode, defaults=defaults)
            counts["created" if created else "updated"] += 1
            counts["with_codes"] += 1 if apply_caption(post) else 0
    return counts


# --- Jobs -----------------------------------------------------------------------------------------


def _zernio_account_id(owner):
    if not owner.zernio_account_id:
        raise ZernioError("ZERNIO_ACCOUNT_ID is not set.")
    return owner.zernio_account_id


def run_sync(client=None):
    """New posts and metrics of posts published in the last 30 days, then covers."""
    client = client or ZernioClient()
    owner = account()
    today = timezone.now().date()
    items, accounts = client.instagram_posts(
        _zernio_account_id(owner), (today - timedelta(days=POST_WINDOW_DAYS + 1)).isoformat(), today.isoformat()
    )
    created = updated = 0
    for item in items:
        post, was_created = upsert_zernio_post(owner, item)
        if post is not None:
            created += was_created
            updated += not was_created
    me = next((row for row in accounts if row.get("_id") == owner.zernio_account_id), None)
    if me and me.get("followersCount") is not None:
        owner.followers_count = int(me["followersCount"])
        owner.followers_updated_at = timezone.now()
        owner.save(update_fields=["followers_count", "followers_updated_at"])
    ok, failed, waiting = media.fetch_pending(IgMediaAsset.KIND_COVER, "covers")
    return {"posts": len(items), "created": created, "updated": updated, "covers_ok": ok, "covers_failed": failed,
            "covers_waiting": waiting, "requests": client.requests_made}


def run_snapshot(client=None, now=None):
    """Yesterday's (Tehran) numbers per post in its first 30 days, and the account's daily followers and reach.

    Runs after 00:30, so the stored post metrics (synced every 3 hours) stand for the day that just ended."""
    now = now or timezone.now()
    day = timezone.localtime(now).date() - timedelta(days=1)
    owner = account()
    snapshots = 0
    for post in IgPost.objects.filter(published_at__gte=now - timedelta(days=POST_WINDOW_DAYS + 2)):
        age = (day - timezone.localtime(post.published_at).date()).days
        if not 0 <= age < POST_WINDOW_DAYS:
            continue
        values = {field: getattr(post, field) for field in IgPost.METRIC_FIELDS}
        IgPostSnapshot.objects.update_or_create(post=post, date=day, defaults={**values, "captured_at": now})
        snapshots += 1
    if owner.followers_count is not None:
        IgAccountDaily.objects.update_or_create(account=owner, date=day, defaults={"followers": owner.followers_count})
    counts = {"date": day.isoformat(), "post_snapshots": snapshots, "reach_days": 0}
    try:
        client = client or ZernioClient()
        reach = client.daily_reach(_zernio_account_id(owner), (day - timedelta(days=REACH_DAYS - 1)).isoformat(), day.isoformat())
        for date, value in reach.items():
            IgAccountDaily.objects.update_or_create(account=owner, date=date, defaults={"reach": _int(value)})
        counts["reach_days"] = len(reach)
    except ZernioError as exc:  # post snapshots are kept; account reach waits for the next day
        counts["reach_error"] = str(exc)[:300]
    return counts


def run_match():
    """Rebuild code -> product from titles, then cache the small image of products seen in posts."""
    title_codes = rebuild_product_codes()
    caption_codes = set(IgPostProduct.objects.values_list("raw_code", flat=True))
    links = IgProductCode.objects.filter(code__in=caption_codes)
    matched = set(links.values_list("code", flat=True))
    images = Product.objects.filter(pk__in=links.values("product_id")).values_list(
        "source_id", "source_payload__major_image__conversions__sm"
    )
    for source_id, url in images:
        if isinstance(url, str) and url:
            media.queue(IgMediaAsset.KIND_PRODUCT, str(source_id), url)
    ok, failed, waiting = media.fetch_pending(IgMediaAsset.KIND_PRODUCT, "products")
    return {"title_codes": title_codes, "caption_codes": len(caption_codes), "matched": len(matched),
            "unmatched": sorted(caption_codes - matched), "thumbs_ok": ok, "thumbs_failed": failed, "thumbs_waiting": waiting}
