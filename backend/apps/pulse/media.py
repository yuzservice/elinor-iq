"""Post covers and product thumbnails on the pulse_media volume. Best effort: a failure is recorded, never raised."""

import os
import tempfile
from urllib.parse import urlparse

import requests
from django.conf import settings
from django.utils import timezone

from .models import IgMediaAsset

MAX_BYTES = 5 * 1024 * 1024
MAX_ATTEMPTS = 5  # per source URL
MAX_CONSECUTIVE_FAILURES = 3  # an unreachable host stops the batch instead of timing out on every file
TIMEOUT = (10, 30)
EXTENSIONS = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
# Instagram's CDN is filtered from the server (checked 2026-11-06). Without a proxy we wait until Zernio serves
# the cover from its own storage, which it does once the Meta link expires.
META_CDN_SUFFIXES = ("cdninstagram.com", "fbcdn.net")


def is_meta_cdn(url):
    host = (urlparse(url).hostname or "").lower()
    return host.endswith(META_CDN_SUFFIXES)


def can_fetch(url):
    return bool(url) and (bool(settings.PULSE_MEDIA_PROXY) or not is_meta_cdn(url))


def _proxies(url):
    proxy = settings.PULSE_MEDIA_PROXY
    return {"http": proxy, "https": proxy} if proxy and is_meta_cdn(url) else None


def download(url, relative_path, session=requests):
    """Write url to PULSE_MEDIA_ROOT/relative_path(+ext). Returns the relative path with extension."""
    response = session.get(url, timeout=TIMEOUT, stream=True, proxies=_proxies(url))
    if response.status_code != 200:
        raise ValueError(f"HTTP {response.status_code}")
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


def queue(kind, key, url):
    """Remember the newest source URL; a changed URL makes a failed asset worth retrying."""
    asset, created = IgMediaAsset.objects.get_or_create(kind=kind, key=key, defaults={"source_url": url or ""})
    if not created and url and asset.source_url != url and asset.status != IgMediaAsset.STATUS_OK:
        asset.source_url, asset.status, asset.attempts = url, IgMediaAsset.STATUS_PENDING, 0
        asset.save(update_fields=["source_url", "status", "attempts"])
    return asset


def fetch_pending(kind, folder, limit=200, session=requests):
    """Download pending assets of one kind. Returns (ok, failed, waiting)."""
    ok = failed = waiting = streak = 0
    pending = (
        IgMediaAsset.objects.filter(kind=kind, attempts__lt=MAX_ATTEMPTS)
        .exclude(status=IgMediaAsset.STATUS_OK)
        .order_by("id")[:limit]
    )
    for asset in pending:
        if not can_fetch(asset.source_url):
            waiting += 1
            continue
        asset.attempts += 1
        try:
            asset.path = download(asset.source_url, f"{folder}/{asset.key}", session=session)
            asset.status, asset.error, asset.fetched_at = IgMediaAsset.STATUS_OK, "", timezone.now()
            ok += 1
            streak = 0
        except Exception as exc:  # noqa: BLE001 - best effort, recorded on the row
            asset.status, asset.error = IgMediaAsset.STATUS_FAILED, str(exc)[:500]
            failed += 1
            streak += 1
        asset.save(update_fields=["attempts", "path", "status", "error", "fetched_at"])
        if streak >= MAX_CONSECUTIVE_FAILURES:
            break
    return ok, failed, waiting
