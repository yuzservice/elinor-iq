"""Moving downloaded covers between environments (local → server), keyed by Instagram shortcode.

Export writes `<shortcode><ext>` files to a folder or a .tar.gz. Import attaches each file to the cover asset of the
post with that shortcode; unknown shortcodes are skipped and an existing ok file is never overwritten."""

import os
import re
import shutil
import tarfile

from django.conf import settings
from django.utils import timezone

from .media import EXTENSIONS, make_small
from .models import IgMediaAsset, IgPost

_NAME = re.compile(r"^([A-Za-z0-9_-]{5,64})(\.(?:jpg|png|webp))$")
_ALLOWED_EXT = set(EXTENSIONS.values())


def export_covers(target):
    """Copy every downloaded cover to `target` (folder, or a path ending in .tar.gz). Returns counts."""
    root = settings.PULSE_MEDIA_ROOT
    assets = IgMediaAsset.objects.filter(kind=IgMediaAsset.KIND_COVER, status=IgMediaAsset.STATUS_OK).order_by("key")
    files = []
    for asset in assets:
        source = os.path.join(root, asset.path)
        ext = os.path.splitext(asset.path)[1].lower()
        if ext in _ALLOWED_EXT and os.path.isfile(source):
            files.append((source, f"{asset.key}{ext}"))
    if target.endswith((".tar.gz", ".tgz")):
        os.makedirs(os.path.dirname(os.path.abspath(target)), exist_ok=True)
        with tarfile.open(target, "w:gz") as tar:
            for source, name in files:
                tar.add(source, arcname=name)
    else:
        os.makedirs(target, exist_ok=True)
        for source, name in files:
            shutil.copyfile(source, os.path.join(target, name))
    return {"exported": len(files), "bytes": sum(os.path.getsize(source) for source, _ in files), "target": target}


def _entries(source):
    """(name, reader) pairs from a folder or a .tar.gz; only plain files with a safe shortcode name."""
    if os.path.isdir(source):
        for name in sorted(os.listdir(source)):
            path = os.path.join(source, name)
            if os.path.isfile(path) and _NAME.match(name):
                yield name, lambda path=path: open(path, "rb")
        return
    with tarfile.open(source, "r:*") as tar:
        for member in tar.getmembers():
            name = os.path.basename(member.name)
            if member.isfile() and name == member.name and _NAME.match(name):
                yield name, lambda member=member: tar.extractfile(member)


def import_covers(source):
    """Attach exported cover files to posts by shortcode. Idempotent."""
    root = settings.PULSE_MEDIA_ROOT
    counts = {"imported": 0, "kept": 0, "unknown": 0, "small": 0}
    known = set(IgPost.objects.values_list("shortcode", flat=True))
    for name, reader in _entries(source):
        shortcode, ext = _NAME.match(name).groups()
        if shortcode not in known:
            counts["unknown"] += 1
            continue
        asset, _ = IgMediaAsset.objects.get_or_create(kind=IgMediaAsset.KIND_COVER, key=shortcode)
        if asset.status == IgMediaAsset.STATUS_OK and asset.path and os.path.isfile(os.path.join(root, asset.path)):
            counts["kept"] += 1
            continue
        relative = f"covers/{shortcode}{ext}"
        target = os.path.join(root, relative)
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with reader() as handle, open(target + ".part", "wb") as out:
            shutil.copyfileobj(handle, out)
        os.replace(target + ".part", target)
        asset.path, asset.status, asset.error, asset.fetched_at = relative, IgMediaAsset.STATUS_OK, "", timezone.now()
        asset.small_path = ""
        asset.save(update_fields=["path", "status", "error", "fetched_at", "small_path"])
        counts["imported"] += 1
        counts["small"] += make_small(asset)
    return counts


def make_missing_small_covers():
    """Backfill the 600 px copy for every ok cover that has none. Idempotent."""
    counts = {"created": 0, "had": 0, "failed": 0}
    for asset in IgMediaAsset.objects.filter(kind=IgMediaAsset.KIND_COVER, status=IgMediaAsset.STATUS_OK).order_by("pk"):
        if asset.small_path and os.path.isfile(os.path.join(settings.PULSE_MEDIA_ROOT, asset.small_path)):
            counts["had"] += 1
        elif make_small(asset):
            counts["created"] += 1
        else:
            counts["failed"] += 1
    return counts
