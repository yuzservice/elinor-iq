"""Read-side numbers for Elinor Pulse: groups, medians, scores, KPI windows, golden hours, products, autopsy.

Posts are few (under 1,000 a year), so one query loads them and the rest is computed in Python.
Stored times are UTC; every "day" and "hour" here is Asia/Tehran (settings.TIME_ZONE)."""

import re
from dataclasses import dataclass, field
from datetime import timedelta
from statistics import median

from django.db.models import Min
from django.db.models.functions import Coalesce
from django.utils import timezone

from apps.products.models import Product, Variant

from . import rules, texts
from .models import IgMediaAsset, IgPost, IgPostProduct, IgProductCode
from .shares import shares

_TRAILING_CODE = re.compile(r"\s*(?:\|\s*الینور\s*)?$")


def group_of(post):
    """reel = video published as REELS; carousels, images and anything else form the slide group."""
    return "reel" if post.media == "video" and post.product_type == "REELS" else "slide"


def kind_of(post):
    if group_of(post) == "reel":
        return "reel"
    return "carousel" if post.media == "carousel" else "image"


def band(score):
    if score is None:
        return None
    if score >= rules.SCORE_GREAT:
        return "great"
    if score >= rules.SCORE_GOOD:
        return "good"
    if score >= rules.SCORE_MID:
        return "mid"
    return "bad"


def _median(values):
    values = [value for value in values if value is not None]
    return median(values) if values else None


def local(dt):
    return timezone.localtime(dt)


def weekday_index(day):
    """Saturday = 0 ... Friday = 6."""
    return (day.weekday() + 2) % 7


@dataclass
class Snapshot:
    """All posts with their group, freshness, Tehran time and score at `now`."""

    now: object
    posts: list
    medians: dict = field(default_factory=dict)
    median_window: dict = field(default_factory=dict)

    def score(self, post):
        base = self.medians.get(group_of(post))
        if not base or post.views is None:
            return None
        return round(post.views / base, 2)

    def fresh(self, post):
        return self.now - post.published_at < timedelta(hours=rules.FRESH_HOURS)


def load(now=None):
    now = now or timezone.now()
    posts = list(IgPost.objects.filter(published_at__lte=now).order_by("-published_at"))
    data = Snapshot(now=now, posts=posts)
    for group in ("reel", "slide"):
        for days in (rules.MEDIAN_DAYS, rules.MEDIAN_FALLBACK_DAYS):
            start = now - timedelta(days=days)
            views = [p.views for p in posts if group_of(p) == group and p.published_at >= start and not data.fresh(p) and p.views is not None]
            if len(views) >= rules.MEDIAN_MIN_POSTS or days == rules.MEDIAN_FALLBACK_DAYS:
                data.medians[group] = _median(views)
                data.median_window[group] = days
                break
    return data


def recent_non_fresh(data, days=rules.MEDIAN_DAYS):
    start = data.now - timedelta(days=days)
    return [p for p in data.posts if p.published_at >= start and not data.fresh(p)]


def page_medians(data):
    posts = recent_non_fresh(data)
    reels = [p for p in posts if group_of(p) == "reel"]
    return {
        "comments": _median(p.comments for p in posts),
        "shares": _median(p.shares for p in posts),
        "saves": _median(p.saves for p in posts),
        "skip": _median(p.skip_rate for p in reels),
    }


def noon_night(data, group="reel", days=rules.MEDIAN_DAYS):
    """Median views of non-fresh posts published at noon and at night (Tehran hours)."""
    posts = [p for p in recent_non_fresh(data, days) if group is None or group_of(p) == group]
    noon = _median(p.views for p in posts if local(p.published_at).hour in rules.NOON_HOURS)
    night = _median(p.views for p in posts if local(p.published_at).hour in rules.NIGHT_HOURS)
    return noon, night


def slide_reel_ratio(data):
    reel, slide = data.medians.get("reel"), data.medians.get("slide")
    return round(slide / reel, 1) if reel and slide else None


# --- KPI cards --------------------------------------------------------------------------------------


def _day_posts(data, day):
    return [p for p in data.posts if local(p.published_at).date() == day]


def _window(posts):
    reels = [p for p in posts if group_of(p) == "reel"]
    return {
        "views": sum(p.views or 0 for p in posts),
        "reach": sum(p.reach or 0 for p in posts),
        "er": _median(p.er for p in posts),
        "skip": _median(p.skip_rate for p in reels),
        "posts": len(posts),
    }


def kpis(data):
    """Last 7 complete Tehran days (by publication day) vs the 7 before, plus 14 daily points per metric."""
    today = local(data.now).date()
    days = [today - timedelta(days=offset) for offset in range(rules.SPARK_DAYS, 0, -1)]  # oldest first
    by_day = {day: _day_posts(data, day) for day in days}
    current = _window([p for day in days[-rules.KPI_DAYS:] for p in by_day[day]])
    previous = _window([p for day in days[: rules.SPARK_DAYS - rules.KPI_DAYS] for p in by_day[day]])
    cards = []
    for key, lower_better in (("views", False), ("reach", False), ("er", False), ("skip", True)):
        cur, prev = current[key], previous[key]
        change = round((cur - prev) / prev * 100, 1) if cur is not None and prev else None
        good = None if change is None else (change < 0 if lower_better else change > 0)
        cards.append({
            "key": key, "value": cur, "previous": prev, "change_pct": change, "good": good, "lower_better": lower_better,
            "spark": [_window(by_day[day])[key] for day in days],
        })
    return {"cards": cards, "posts": current["posts"], "from": days[-rules.KPI_DAYS].isoformat(), "to": days[-1].isoformat()}


# --- Golden hours -----------------------------------------------------------------------------------


def hours(data, group="reel"):
    posts = [p for p in recent_non_fresh(data, rules.HEATMAP_DAYS) if group is None or group_of(p) == group]
    scored = [(p, data.score(p)) for p in posts]
    scored = [(p, s) for p, s in scored if s is not None]
    cells = {}
    for post, score in scored:
        moment = local(post.published_at)
        cells.setdefault((weekday_index(moment.date()), moment.hour), []).append(score)
    weekdays = []
    for index, name in enumerate(texts.WEEKDAYS):
        values = [s for (wd, _), scores in cells.items() if wd == index for s in scores]
        weekdays.append({"weekday": index, "label": name, "score": _median(values), "posts": len(values)})
    noon, night = noon_night(data, group, rules.HEATMAP_DAYS)
    night_count = sum(1 for p, _ in scored if local(p.published_at).hour in rules.NIGHT_HOURS)
    ranked = [day for day in weekdays if day["score"] is not None]
    best = max(ranked, key=lambda day: day["score"]) if ranked else None
    worst = min(ranked, key=lambda day: day["score"]) if ranked else None
    return {
        "group": group or "all",
        "cells": [
            {"weekday": wd, "hour": hour, "score": round(_median(scores), 2), "posts": len(scores),
             "band": band(_median(scores)), "faded": len(scores) < rules.HEATMAP_MIN_POSTS}
            for (wd, hour), scores in sorted(cells.items())
        ],
        "weekdays": weekdays,
        "headline": {
            "noon_median": noon, "night_median": night,
            "noon_vs_night_pct": round((noon / night - 1) * 100) if noon and night else None,
            "night_posts": night_count, "posts": len(scored),
            "best_weekday": best["label"] if best else None, "worst_weekday": worst["label"] if worst else None,
        },
    }


# --- Products ---------------------------------------------------------------------------------------


def clean_title(title):
    """«بلوز بافت ... 8504 | الینور» → «بلوز بافت ...»."""
    return re.sub(r"\s*\d{4}\s*$", "", _TRAILING_CODE.sub("", title or "")).strip()


def _code_rows(data, since=None):
    """[(code, position, share, post)] for every caption code of the posts in data."""
    posts = {p.pk: p for p in data.posts if since is None or p.published_at >= since}
    rows = list(IgPostProduct.objects.filter(post_id__in=posts).values_list("post_id", "position", "raw_code", "raw_line"))
    counts = {}
    for post_id, *_ in rows:
        counts[post_id] = counts.get(post_id, 0) + 1
    return [(code, position, shares(counts[post_id])[position], posts[post_id], line) for post_id, position, code, line in rows]


def product_info(codes):
    """code → {products, title, price, thumb, dupes}. Explicit fields only: never source_payload."""
    links = list(IgProductCode.objects.filter(code__in=codes).values_list("code", "product_id"))
    product_ids = {pid for _, pid in links}
    titles = dict(Product.objects.filter(pk__in=product_ids).values_list("pk", "title"))
    sources = dict(Product.objects.filter(pk__in=product_ids).values_list("pk", "source_id"))
    prices = dict(
        Variant.objects.filter(product_id__in=product_ids, deleted_at__isnull=True)
        .values("product_id")
        .annotate(price=Min(Coalesce("final_price", "price")))
        .values_list("product_id", "price")
    )
    thumbs = dict(
        IgMediaAsset.objects.filter(kind=IgMediaAsset.KIND_PRODUCT, status=IgMediaAsset.STATUS_OK, key__in=[str(s) for s in sources.values()])
        .values_list("key", "pk")
    )
    info = {}
    for code, pid in links:
        entry = info.setdefault(code, {"product_ids": [], "title": None, "price": None, "thumb": None})
        entry["product_ids"].append(pid)
        entry["title"] = entry["title"] or clean_title(titles.get(pid))
        price = prices.get(pid)
        if price is not None and (entry["price"] is None or price < entry["price"]):
            entry["price"] = price
        entry["thumb"] = entry["thumb"] or thumbs.get(str(sources.get(pid)))
    for entry in info.values():
        entry["dupes"] = len(entry["product_ids"])
    return info


def products(data, since=None):
    rows = _code_rows(data, since)
    info = product_info({code for code, *_ in rows})
    table = {}
    for code, position, share, post, line in rows:
        entry = table.setdefault(code, {"code": code, "posts": 0, "primary_posts": 0, "views": 0.0, "saves": 0.0,
                                        "best": None, "line": line, "last_post_at": None})
        entry["posts"] += 1
        entry["primary_posts"] += position == 0
        entry["views"] += (post.views or 0) * share
        entry["saves"] += (post.saves or 0) * share
        score = data.score(post)
        if score is not None and (entry["best"] is None or score > entry["best"]["score"]):
            entry["best"] = {"post_id": post.pk, "score": score}
        if entry["last_post_at"] is None or post.published_at > entry["last_post_at"]:
            entry["last_post_at"] = post.published_at
    matched, unmatched = [], []
    for code, entry in table.items():
        entry["views"], entry["saves"] = round(entry["views"]), round(entry["saves"])
        details = info.get(code)
        if details:
            matched.append({**entry, "title": details["title"], "price": details["price"], "thumb": details["thumb"], "dupes": details["dupes"]})
        else:
            unmatched.append(entry)
    matched.sort(key=lambda row: -row["views"])
    unmatched.sort(key=lambda row: -row["views"])
    return matched, unmatched


# --- Covers and autopsy -----------------------------------------------------------------------------


def thumbs_for(posts):
    """post id → media asset id: the post's cover, else its first product's cached thumbnail, else None."""
    covers = dict(
        IgMediaAsset.objects.filter(kind=IgMediaAsset.KIND_COVER, status=IgMediaAsset.STATUS_OK, key__in=[p.shortcode for p in posts])
        .values_list("key", "pk")
    )
    firsts = dict(IgPostProduct.objects.filter(post__in=posts, position=0).values_list("post_id", "raw_code"))
    info = product_info(set(firsts.values()))
    return {p.pk: covers.get(p.shortcode) or (info.get(firsts.get(p.pk)) or {}).get("thumb") for p in posts}


def autopsy(data, post, code_count, page=None):
    """2 or 3 rule-based sentences (Phase 2 prompt §5)."""
    if data.fresh(post):
        return texts.autopsy_fresh()
    page = page or page_medians(data)
    moment = local(post.published_at)
    parts = []
    if group_of(post) == "reel" and post.skip_rate is not None:
        if post.skip_rate < rules.SKIP_TARGET:
            parts.append(texts.autopsy_skip_good(post.skip_rate, page["skip"] or rules.SKIP_TARGET))
        else:
            parts.append(texts.autopsy_skip_bad(post.skip_rate))
    elif group_of(post) == "slide" and (ratio := slide_reel_ratio(data)):
        parts.append(texts.autopsy_slide(ratio))
    if moment.hour in rules.NOON_HOURS:
        parts.append(texts.autopsy_noon(texts.clock(moment)))
    elif moment.hour in rules.NIGHT_HOURS:
        noon, night = noon_night(data)
        if noon and night and night < noon:
            parts.append(texts.autopsy_night(texts.clock(moment), round((1 - night / noon) * 100)))
    if code_count == 0:
        parts.append(texts.autopsy_brand())
    elif code_count > 2:
        parts.append(texts.autopsy_many_products(code_count))
    return " ".join(parts[:3])
