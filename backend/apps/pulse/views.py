"""Elinor Pulse API. Read-only except the task tick. Explicit fields only: never source_payload or purchase_price."""

import os
from datetime import date, timedelta

from django.conf import settings
from django.db.models import Count, Min
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from . import analytics, rules
from .analytics import group_of, kind_of, local
from .models import IgDailyBrief, IgDailyTask, IgMediaAsset, IgPost, IgPostProduct, IgPostSnapshot, IgSyncRun
from .permissions import PulseAccess
from .shares import shares
from .sync import JOB_SYNC, last_success

PER_PAGE = 30
POST_SORTS = {"new": lambda p, s: -p.published_at.timestamp(), "score": lambda p, s: -(s or 0),
              "saves": lambda p, s: -(p.saves or 0), "shares": lambda p, s: -(p.shares or 0)}


def _media_url(asset_id):
    return f"/api/pulse/media/{asset_id}/" if asset_id else None


def _post_card(data, post, thumb, codes=None):
    score = data.score(post)
    moment = local(post.published_at)
    return {
        "id": post.pk,
        "url": post.url,
        "caption": post.caption,
        "kind": kind_of(post),
        "group": group_of(post),
        "published_at": post.published_at,
        "local_date": moment.date().isoformat(),
        "hour": moment.hour,
        "minute": moment.minute,
        "weekday": analytics.weekday_index(moment.date()),
        "views": post.views,
        "reach": post.reach,
        "saves": post.saves,
        "shares": post.shares,
        "skip_rate": post.skip_rate,
        "duration_s": post.duration_s,
        "score": score,
        "band": analytics.band(score),
        "fresh": data.fresh(post),
        "brand": post.is_brand_content,
        "codes": codes if codes is not None else [],
        "thumb": _media_url(thumb),
    }


def _codes_by_post(posts):
    codes = {}
    for post_id, code in IgPostProduct.objects.filter(post__in=posts).order_by("position").values_list("post_id", "raw_code"):
        codes.setdefault(post_id, []).append(code)
    return codes


def _cards(data, posts):
    thumbs = analytics.thumbs_for(posts)
    codes = _codes_by_post(posts)
    return [_post_card(data, post, thumbs.get(post.pk), codes.get(post.pk, [])) for post in posts]


def _cover_status():
    from .media import STATUS_EXPIRED, STATUS_SKIPPED, relay_configured

    counts = dict(IgMediaAsset.objects.filter(kind=IgMediaAsset.KIND_COVER).values_list("status").annotate(n=Count("pk")))
    last_failed = (
        IgMediaAsset.objects.filter(kind=IgMediaAsset.KIND_COVER, status=IgMediaAsset.STATUS_FAILED)
        .exclude(error="").order_by("-pk").values_list("error", flat=True).first()
    )
    return {
        "ok": counts.get(IgMediaAsset.STATUS_OK, 0),
        "pending": counts.get(IgMediaAsset.STATUS_PENDING, 0),
        "failed": counts.get(IgMediaAsset.STATUS_FAILED, 0),
        "expired": counts.get(STATUS_EXPIRED, 0),
        "skipped": counts.get(STATUS_SKIPPED, 0),
        "relay_configured": relay_configured(),
        "last_relay_error": last_failed or "",
    }


def _status():
    last = last_success(JOB_SYNC)
    latest = IgSyncRun.objects.filter(job=JOB_SYNC).order_by("-started_at").first()
    age_hours = (timezone.now() - last.finished_at).total_seconds() / 3600 if last and last.finished_at else None
    return {
        "last_sync_at": last.finished_at if last else None,
        "hours_since_sync": round(age_hours, 1) if age_hours is not None else None,
        "stale": age_hours is None or age_hours > rules.STALE_HOURS,
        "last_error": latest.error if latest and latest.status == IgSyncRun.STATUS_FAILED else "",
        "covers": _cover_status(),
        "has_data": IgPost.objects.exists(),
        "ai_enabled": settings.PULSE_AI_ENABLED,
        "handle": settings.PULSE_HANDLE,
    }


@api_view(["GET"])
@permission_classes([PulseAccess])
def status(request):
    return Response(_status())


@api_view(["GET"])
@permission_classes([PulseAccess])
def home(request):
    data = analytics.load()
    today = local(data.now).date()
    yesterday = today - timedelta(days=1)
    posts = [p for p in data.posts if local(p.published_at).date() == yesterday]
    cards = sorted(_cards(data, posts), key=lambda card: -(card["score"] or 0))
    star = max(cards, key=lambda card: card["views"] or 0) if cards else None  # most viewed: yesterday's posts are fresh
    brief = IgDailyBrief.objects.filter(date=today).first()
    tasks = IgDailyTask.objects.filter(date=today).select_related("done_by")
    return Response({
        "date": today.isoformat(),
        "brief": {"text": brief.text, "created_at": brief.created_at, "source": brief.source} if brief else None,
        "kpis": analytics.kpis(data),
        "tasks": [{"id": t.pk, "title": t.title, "reason": t.reason, "rule": t.rule, "done": t.done,
                   "done_by": t.done_by.username if t.done_by else None, "done_at": t.done_at} for t in tasks],
        "star": star,
        "yesterday": cards,
        "medians": data.medians,
        "status": _status(),
    })


@api_view(["POST"])
@permission_classes([PulseAccess])
def toggle_task(request, task_id):
    task = get_object_or_404(IgDailyTask, pk=task_id)
    task.done = not task.done
    task.done_by, task.done_at = (request.user, timezone.now()) if task.done else (None, None)
    task.save(update_fields=["done", "done_by", "done_at"])
    return Response({"id": task.pk, "done": task.done, "done_by": request.user.username if task.done else None, "done_at": task.done_at})


def _kind_match(post, kind):
    if kind == "reel":
        return group_of(post) == "reel"
    if kind == "slide":
        return group_of(post) == "slide"
    if kind == "brand":
        return post.is_brand_content
    return True


def _parse_date(value):
    try:
        return date.fromisoformat(value) if value else None
    except ValueError:
        return None


@api_view(["GET"])
@permission_classes([PulseAccess])
def posts(request):
    data = analytics.load()
    params = request.query_params
    kind = params.get("kind") or "all"
    if kind not in {"all", "reel", "slide", "brand"}:
        return Response({"detail": "نوع نامعتبر است."}, status=400)
    sort = params.get("sort") or "new"
    if sort not in POST_SORTS:
        return Response({"detail": "مرتب‌سازی نامعتبر است."}, status=400)
    date_from, date_to = _parse_date(params.get("from")), _parse_date(params.get("to"))
    hour = params.get("hour")
    code = (params.get("code") or "").strip()
    with_code = set(IgPostProduct.objects.filter(raw_code=code).values_list("post_id", flat=True)) if code else None
    counts = {name: sum(1 for p in data.posts if _kind_match(p, name)) for name in ("all", "reel", "slide", "brand")}
    selected = [
        p for p in data.posts
        if _kind_match(p, kind)
        and (date_from is None or local(p.published_at).date() >= date_from)
        and (date_to is None or local(p.published_at).date() <= date_to)
        and (not hour or (hour.isdigit() and local(p.published_at).hour == int(hour)))
        and (with_code is None or p.pk in with_code)
    ]
    selected.sort(key=lambda p: POST_SORTS[sort](p, data.score(p)))
    try:
        page = max(1, int(params.get("page") or 1))
    except ValueError:
        page = 1
    chunk = selected[(page - 1) * PER_PAGE : page * PER_PAGE]
    return Response({"results": _cards(data, chunk), "total": len(selected), "page": page, "per_page": PER_PAGE,
                     "counts": counts, "medians": data.medians})


@api_view(["GET"])
@permission_classes([PulseAccess])
def post_detail(request, post_id):
    data = analytics.load()
    post = next((p for p in data.posts if p.pk == post_id), None)
    if post is None:
        raise Http404
    card = _cards(data, [post])[0]
    codes = list(IgPostProduct.objects.filter(post=post).order_by("position").values_list("position", "raw_code", "raw_line", "caption_price"))
    info = analytics.product_info({code for _, code, _, _ in codes})
    weights = shares(len(codes))
    page = analytics.page_medians(data)
    first = local(post.published_at).date()
    snaps = list(post.snapshots.order_by("date"))
    growth = [
        {"day": (snap.date - first).days, "date": snap.date.isoformat(), "views": snap.views}
        for snap in snaps
        if 0 <= (snap.date - first).days < rules.MEDIAN_DAYS
    ]
    # The chart needs the first days; otherwise the UI says from when growth is recorded.
    first_snapshot = snaps[0].date if snaps else IgPostSnapshot.objects.aggregate(first=Min("date"))["first"]
    return Response({
        **card,
        "reach": post.reach, "likes": post.likes, "comments": post.comments, "follows": post.follows,
        "profile_views": post.profile_views, "er": post.er, "avg_watch_ms": post.avg_watch_ms,
        "is_ad": post.is_ad, "metrics_updated_at": post.metrics_updated_at,
        "group_median": data.medians.get(group_of(post)),
        "page_medians": page,
        "skip_target": rules.SKIP_TARGET,
        "growth": growth,
        "growth_complete": bool(growth) and growth[0]["day"] <= 1,
        "tracking_since": first_snapshot.isoformat() if first_snapshot else None,
        "autopsy": analytics.autopsy(data, post, len(codes), page),
        "products": [
            {"position": position, "code": code, "line": line, "caption_price": price, "share": weights[position],
             "weighted_views": round((post.views or 0) * weights[position]),
             "matched": code in info, "title": (info.get(code) or {}).get("title"),
             "price": (info.get(code) or {}).get("price"), "dupes": (info.get(code) or {}).get("dupes"),
             "thumb": _media_url((info.get(code) or {}).get("thumb"))}
            for position, code, line, price in codes
        ],
    })


def _product_row(row):
    return {
        "code": row["code"], "title": row.get("title"), "price": row.get("price"), "thumb": _media_url(row.get("thumb")),
        "dupes": row.get("dupes"), "posts": row["posts"], "primary_posts": row["primary_posts"],
        "weighted_views": row["views"], "weighted_saves": row["saves"], "best": row["best"], "line": row["line"],
    }


@api_view(["GET"])
@permission_classes([PulseAccess])
def products(request):
    data = analytics.load()
    matched, unmatched = analytics.products(data)
    return Response({
        "matched": [_product_row(row) for row in matched],
        "unmatched": [_product_row(row) for row in unmatched],
        "posts_with_codes": sum(1 for p in data.posts if not p.is_brand_content),
    })


@api_view(["GET"])
@permission_classes([PulseAccess])
def product_detail(request, code):
    data = analytics.load()
    matched, unmatched = analytics.products(data)
    row = next((r for r in matched + unmatched if r["code"] == code), None)
    if row is None:
        raise Http404
    positions = dict(IgPostProduct.objects.filter(raw_code=code).values_list("post_id", "position"))
    posts = [p for p in data.posts if p.pk in positions]
    cards = _cards(data, posts)
    for card in cards:
        card["primary"] = positions[card["id"]] == 0
    cards.sort(key=lambda card: -(card["score"] or 0))
    return Response({**_product_row(row), "matched": row in matched, "post_cards": cards})


@api_view(["GET"])
@permission_classes([PulseAccess])
def golden_hours(request):
    group = request.query_params.get("group") or "reel"
    if group not in {"reel", "all"}:
        return Response({"detail": "گروه نامعتبر است."}, status=400)
    return Response(analytics.hours(analytics.load(), None if group == "all" else "reel"))


@api_view(["GET"])
@permission_classes([PulseAccess])
def media(request, asset_id):
    asset = get_object_or_404(IgMediaAsset, pk=asset_id, status=IgMediaAsset.STATUS_OK)
    root = os.path.realpath(settings.PULSE_MEDIA_ROOT)
    path = os.path.realpath(os.path.join(root, asset.path))
    if not path.startswith(root + os.sep) or not os.path.isfile(path):
        raise Http404
    response = FileResponse(open(path, "rb"))
    response["Cache-Control"] = "private, max-age=86400"
    return response

