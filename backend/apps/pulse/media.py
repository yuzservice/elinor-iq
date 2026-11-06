"""Post covers and product thumbnails on the pulse_media volume. Best effort: a failure is recorded, never raised.

Covers (owner's decision, 2026-11-06): only Instagram's own CDN image, fetched through the Cloudflare relay
(PULSE_COVER_RELAY_URL / _TOKEN) as soon as a post is seen. A Zernio-hosted or any other non-Meta cover URL is never
downloaded. A Meta link expires (`oe`); after that, a post without a file keeps the fallback image for good.
Product thumbnails keep the direct path to api.elinorboutique.com."""

import logging
import os
import tempfile
import time
from urllib.parse import parse_qs, urlparse

import requests
from django.conf import settings
from django.utils import timezone

from .models import IgMediaAsset

logger = logging.getLogger(__name__)

MAX_BYTES = 5 * 1024 * 1024
MAX_ATTEMPTS = 5  # product thumbnails, per source URL; covers retry until their Meta link expires
MAX_CONSECUTIVE_FAILURES = 3  # an unreachable host stops the batch instead of timing out on every file
COVER_MIN_INTERVAL = 0.5  # at most 2 relay downloads per second
TIMEOUT = (10, 30)
EXTENSIONS = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
META_CDN_SUFFIXES = ("cdninstagram.com", "fbcdn.net")
STATUS_EXPIRED = "expired"  # Meta link expired before a file was saved: fallback image for good
STATUS_SKIPPED = "skipped"  # no Meta URL known, only a non-Meta one (never downloaded)
SMALL_WIDTH = 600  # list copy of a cover: 600 px wide, JPEG quality 80, progressive, no metadata
SMALL_QUALITY = 80


def is_meta_cdn(url):
    host = (urlparse(url or "").hostname or "").lower()
    return host.endswith(META_CDN_SUFFIXES)


def meta_expires_at(url):
    """Unix time from Meta's `oe` parameter (hex), or None when the URL has none."""
    value = (parse_qs(urlparse(url or "").query).get("oe") or [""])[0]
    try:
        return int(value, 16) if value else None
    except ValueError:
        return None


def is_expired(url, now=None):
    expires = meta_expires_at(url)
    return expires is not None and expires <= (now or timezone.now()).timestamp()


def relay_configured():
    return bool(settings.PULSE_COVER_RELAY_URL and settings.PULSE_COVER_RELAY_TOKEN)


def _get(url, session, relay=False):
    if relay:
        # The token travels only in the header; never in the URL or an error message.
        return session.get(
            settings.PULSE_COVER_RELAY_URL.rstrip("/") + "/",
            params={"url": url},
            headers={"X-Relay-Token": settings.PULSE_COVER_RELAY_TOKEN},
            timeout=TIMEOUT,
            stream=True,
        )
    return session.get(url, timeout=TIMEOUT, stream=True)


def download(url, relative_path, session=requests, relay=False):
    """Write the image to PULSE_MEDIA_ROOT/relative_path(+ext). Returns the relative path with extension."""
    try:
        response = _get(url, session, relay)
    except requests.RequestException as exc:
        raise ValueError(f"{'relay' if relay else 'download'} unreachable: {type(exc).__name__}") from None
    if response.status_code != 200:
        detail = (getattr(response, "text", "") or "")[:80].strip()
        raise ValueError(f"{'relay' if relay else 'HTTP'} {response.status_code}{': ' + detail if detail else ''}")
    content_type = (response.headers.get("Content-Type") or "").split(";")[0].strip().lower()
    if content_type not in EXTENSIONS:
        raise ValueError(f"not an image: {content_type or 'unknown'}")
    relative = relative_path + EXTENSIONS[content_type]
    target = os.path.join(settings.PULSE_MEDIA_ROOT, relative)
    os.makedirs(os.path.dirname(target), exist_ok=True)
    size = 0
    handle, temp = tempfile.mkstemp(dir=os.path.dirname(target), suffix=".part")
    try:
        with os.fdopen(handle, "wb") as out:
            for chunk in response.iter_content(64 * 1024):
                size += len(chunk)
                if size > MAX_BYTES:
                    raise ValueError("larger than 5 MB")
                out.write(chunk)
        os.replace(temp, target)
    except BaseException:
        if os.path.exists(temp):
            os.remove(temp)
        raise
    return relative


_LOGGED_HOSTS = set()


def small_path_for(path):
    """covers/<shortcode>.jpg -> covers/<shortcode>.sm.jpg (deterministic, next to the original)."""
    return os.path.splitext(path)[0] + ".sm.jpg"


def make_small(asset):
    """Write the 600 px list copy of a downloaded cover and store its path. Failure is noted on `small_error` only;
    the cover stays ok and the original is still served. Returns True when a copy exists afterwards."""
    from PIL import Image, ImageOps

    root = settings.PULSE_MEDIA_ROOT
    relative = small_path_for(asset.path)
    target = os.path.join(root, relative)
    if asset.small_path == relative and os.path.isfile(target):
        return True
    try:
        with Image.open(os.path.join(root, asset.path)) as image:
            image = ImageOps.exif_transpose(image).convert("RGB")
            if image.width > SMALL_WIDTH:
                image = image.resize((SMALL_WIDTH, round(image.height * SMALL_WIDTH / image.width)), Image.LANCZOS)
            temp = target + ".part"
            image.save(temp, "JPEG", quality=SMALL_QUALITY, progressive=True, optimize=True)  # no exif= : metadata dropped
        os.replace(temp, target)
        asset.small_path, asset.small_error = relative, ""
    except Exception as exc:  # noqa: BLE001 - recorded on the asset, original unaffected
        logger.warning("Pulse: small copy failed for %s: %s", asset.key, exc)
        asset.small_path, asset.small_error = "", str(exc)[:300]
    asset.save(update_fields=["small_path", "small_error"])
    return bool(asset.small_path)


def _log_new_host(kind, url):
    """Log each non-Meta cover host once per run, so we learn where Zernio stores re-hosted covers."""
    host = (urlparse(url).hostname or "").lower()
    if not host or is_meta_cdn(url) or host in _LOGGED_HOSTS:
        return
    _LOGGED_HOSTS.add(host)
    logger.warning("Pulse: %s URL on non-Meta host %s (never downloaded)", kind, host)


def queue(kind, key, url):
    """Remember where to fetch an asset from.

    Covers keep the newest Meta URL only: a non-Meta URL never replaces it and is never downloaded."""
    if kind != IgMediaAsset.KIND_COVER:
        asset, created = IgMediaAsset.objects.get_or_create(kind=kind, key=key, defaults={"source_url": url or ""})
        if not created and url and asset.source_url != url and asset.status != IgMediaAsset.STATUS_OK:
            asset.source_url, asset.status, asset.attempts = url, IgMediaAsset.STATUS_PENDING, 0
            asset.save(update_fields=["source_url", "status", "attempts"])
        return asset

    asset, _ = IgMediaAsset.objects.get_or_create(kind=kind, key=key)
    if asset.status == IgMediaAsset.STATUS_OK or not url:
        return asset
    if is_meta_cdn(url):
        if asset.source_url != url:
            asset.source_url, asset.status, asset.attempts, asset.error = url, IgMediaAsset.STATUS_PENDING, 0, ""
            asset.save(update_fields=["source_url", "status", "attempts", "error"])
        return asset
    _log_new_host(kind, url)
    if not is_meta_cdn(asset.source_url):
        asset.status, asset.error = STATUS_SKIPPED, f"non-Meta cover URL ignored ({urlparse(url).hostname})"
        asset.save(update_fields=["status", "error"])
    return asset


def fetch_pending(kind, folder, limit=200, session=requests, sleep=time.sleep, now=None):
    """Download pending assets of one kind. Returns (ok, failed, waiting).

    Covers: Meta URLs only, through the relay, at most 2 per second; an expired link becomes STATUS_EXPIRED; without a
    relay they simply stay pending (no error)."""
    ok = failed = waiting = streak = 0
    pending = IgMediaAsset.objects.filter(kind=kind, status__in=[IgMediaAsset.STATUS_PENDING, IgMediaAsset.STATUS_FAILED])
    if kind == IgMediaAsset.KIND_COVER:
        relay = relay_configured()
        last = 0.0
    else:
        relay = False
        pending = pending.filter(attempts__lt=MAX_ATTEMPTS)
    pending = pending.order_by("id")
    for asset in pending[:limit] if limit else pending:
        if kind == IgMediaAsset.KIND_COVER:
            if not is_meta_cdn(asset.source_url):
                waiting += 1
                continue
            if is_expired(asset.source_url, now):
                asset.status, asset.error = STATUS_EXPIRED, "Meta link expired before download"
                asset.save(update_fields=["status", "error"])
                continue
            if not relay:
                waiting += 1
                continue
            pause = COVER_MIN_INTERVAL - (time.monotonic() - last)
            if pause > 0:
                sleep(pause)
            last = time.monotonic()
        elif not asset.source_url:
            waiting += 1
            continue
        asset.attempts += 1
        try:
            asset.path = download(asset.source_url, f"{folder}/{asset.key}", session=session, relay=relay)
            asset.status, asset.error, asset.fetched_at = IgMediaAsset.STATUS_OK, "", timezone.now()
            ok += 1
            streak = 0
            if kind == IgMediaAsset.KIND_COVER:
                asset.save(update_fields=["attempts", "path", "status", "error", "fetched_at"])
                make_small(asset)
        except Exception as exc:  # noqa: BLE001 - best effort, recorded on the row
            asset.status, asset.error = IgMediaAsset.STATUS_FAILED, str(exc)[:500]
            failed += 1
            streak += 1
        asset.save(update_fields=["attempts", "path", "status", "error", "fetched_at"])
        if streak >= MAX_CONSECUTIVE_FAILURES:
            break
    return ok, failed, waiting
