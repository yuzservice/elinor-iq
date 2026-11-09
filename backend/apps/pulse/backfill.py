"""Fill ig_post_snapshots from Zernio's post-timeline for each post's first 30 days.

Inserts only dates that have no row yet, so our own daily snapshots are never replaced. Zernio has no history before
the account was connected, so older posts only get the days from then on."""

from datetime import date, timedelta

from django.utils import timezone

from . import rules
from .analytics import local
from .models import IgPost, IgPostSnapshot
from .sync import _int
from .zernio import ZernioClient

TIMELINE_FIELDS = {"views": "views", "reach": "reach", "likes": "likes", "comments": "comments", "shares": "shares",
                   "saves": "saves", "follows": "follows", "profile_views": "profileViews"}


def needs_backfill(post, today):
    last_day = local(post.published_at).date() + timedelta(days=rules.MEDIAN_DAYS - 1)
    if post.timeline_backfilled_at is None:
        return True
    # Window still open on the last pass: Zernio may have new days since.
    return local(post.timeline_backfilled_at).date() <= last_day and local(post.timeline_backfilled_at).date() < today


def run_backfill(client=None, now=None):
    client = client or ZernioClient()
    now = now or timezone.now()
    today = local(now).date()
    counts = {"posts": 0, "no_id": 0, "created": 0, "kept": 0, "requests": 0}
    for post in IgPost.objects.order_by("published_at"):
        if not needs_backfill(post, today):
            continue
        post_id = post.zernio_id or post.ig_media_id
        if not post_id:
            counts["no_id"] += 1
            continue
        first = local(post.published_at).date()
        last = min(first + timedelta(days=rules.MEDIAN_DAYS - 1), today)
        rows = client.post_timeline(post_id, first.isoformat(), last.isoformat())
        existing = set(IgPostSnapshot.objects.filter(post=post).values_list("date", flat=True))
        new = []
        for row in rows:
            day = date.fromisoformat(row["date"][:10])
            if not first <= day <= last:
                continue
            if day in existing:
                counts["kept"] += 1
                continue
            existing.add(day)
            new.append(IgPostSnapshot(post=post, date=day, captured_at=now, source=IgPostSnapshot.SOURCE_TIMELINE,
                                      **{name: _int(row.get(key)) for name, key in TIMELINE_FIELDS.items()}))
        IgPostSnapshot.objects.bulk_create(new, ignore_conflicts=True)
        counts["created"] += len(new)
        counts["posts"] += 1
        post.timeline_backfilled_at = now
        post.save(update_fields=["timeline_backfilled_at"])
    counts["requests"] = client.requests_made
    return counts


def backfill_due(now=None):
    from .sync import last_success

    last = last_success("backfill")
    return last is None or local(last.started_at).date() < local(now or timezone.now()).date()
