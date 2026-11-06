"""Rule-based morning brief and «۳ کار امروز» (no AI). One brief and up to 3 tasks per Tehran day."""

from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from . import analytics, rules, texts
from .analytics import group_of, local
from .models import IgDailyBrief, IgDailyTask


def _yesterday_posts(data):
    yesterday = local(data.now).date() - timedelta(days=1)
    return [p for p in data.posts if local(p.published_at).date() == yesterday]


def _best(data, posts):
    scored = [(data.score(p), p) for p in posts if data.score(p) is not None]
    return max(scored, key=lambda pair: pair[0]) if scored else (None, None)


# --- Task rules (each returns (title, reason) or None) ----------------------------------------------


def rule_first_second(data):
    start = data.now - timedelta(days=rules.SKIP_FIX_DAYS)
    candidates = [
        p for p in data.posts
        if group_of(p) == "reel" and p.published_at >= start and not data.fresh(p)
        and p.skip_rate is not None and p.skip_rate >= rules.SKIP_FIX
    ]
    if not candidates:
        return None
    worst = max(candidates, key=lambda p: p.skip_rate)
    return texts.task_first_second(texts.post_name(worst.caption), worst.skip_rate)


def rule_repeat_winner(data):
    score, post = _best(data, _yesterday_posts(data))
    if score is None or score < rules.WINNER_SCORE:
        return None
    return texts.task_winner(texts.post_name(post.caption), group_of(post), score, post.skip_rate, post.shares)


def rule_night_posting(data):
    week = [p for p in data.posts if group_of(p) == "reel" and p.published_at >= data.now - timedelta(days=7)]
    night = [p for p in week if local(p.published_at).hour in rules.NIGHT_HOURS]
    if not week or len(night) <= len(week) * rules.NIGHT_SHARE:
        return None
    noon_median, night_median = analytics.noon_night(data)
    if not noon_median or not night_median or noon_median < night_median * (1 + rules.NIGHT_GAP):
        return None
    return texts.task_night(len(night), len(week), noon_median, night_median)


def rule_no_slide(data):
    start = data.now - timedelta(days=rules.NO_SLIDE_DAYS)
    if any(p.media == "carousel" and p.published_at >= start for p in data.posts):
        return None
    ratio = analytics.slide_reel_ratio(data)
    last = next((p for p in data.posts if p.media == "carousel"), None)
    days = (data.now - last.published_at).days if last else rules.NO_SLIDE_DAYS
    return texts.task_no_slide(days, ratio) if ratio else None


def rule_neglected_product(data):
    month, _ = analytics.products(data, since=data.now - timedelta(days=30))
    for row in month[: rules.TOP_PRODUCTS]:
        quiet = (data.now - row["last_post_at"]).days
        if quiet >= rules.NEGLECT_DAYS:
            return texts.task_neglected(texts.fa(row["title"]), row["views"], quiet)
    return None


def rule_friday(data):
    if analytics.weekday_index(local(data.now).date()) != 5:  # Thursday
        return None
    days = [day for day in analytics.hours(data, group=None)["weekdays"] if day["score"] is not None]
    if not days:
        return None
    best = max(days, key=lambda day: day["score"])
    return texts.task_friday(best["score"]) if best["weekday"] == 6 else None


RULES = {
    "first_second": rule_first_second,
    "repeat_winner": rule_repeat_winner,
    "night_posting": rule_night_posting,
    "no_slide": rule_no_slide,
    "neglected_product": rule_neglected_product,
    "friday": rule_friday,
}


def tasks_for(data):
    """[(rule, title, reason)] of the rules that fire, by priority, at most MAX_TASKS."""
    fired = []
    for name in rules.TASK_PRIORITY:
        result = RULES[name](data)
        if result:
            fired.append((name, texts.fa(result[0]), texts.fa(result[1])))
    return fired[: rules.MAX_TASKS]


# --- Brief ------------------------------------------------------------------------------------------


def brief_text(data, tasks):
    sentences = []
    yesterday = _yesterday_posts(data)
    if yesterday:
        total = sum(p.views or 0 for p in yesterday)
        today = local(data.now).date()
        daily = []
        for offset in range(2, 32):  # the 30 days before yesterday, days with posts only
            day = today - timedelta(days=offset)
            posts = [p for p in data.posts if local(p.published_at).date() == day]
            if posts:
                daily.append(sum(p.views or 0 for p in posts))
        daily_median = analytics._median(daily)
        if daily_median:
            sentences.append(texts.brief_day(len(yesterday), total, round((total / daily_median - 1) * 100), daily_median))
        score, star = _best(data, yesterday)
        if star is not None:
            sentences.append(texts.brief_star(group_of(star), texts.post_name(star.caption), star.views, star.shares, score))
        weak = [p for p in yesterday if not data.fresh(p) and p is not star]
        weak_score, weakest = min(((data.score(p), p) for p in weak if data.score(p) is not None), default=(None, None), key=lambda pair: pair[0])
        if weakest is not None and weak_score < 1:
            moment = local(weakest.published_at)
            if group_of(weakest) == "reel" and weakest.skip_rate is not None and weakest.skip_rate >= rules.SKIP_TARGET:
                reason = texts.weak_reason_skip(weakest.skip_rate)
            elif moment.hour in rules.NIGHT_HOURS:
                reason = texts.weak_reason_night(texts.clock(moment))
            else:
                reason = None
            if reason:
                sentences.append(texts.brief_weak(texts.post_name(weakest.caption), reason))
    else:
        sentences.append(texts.brief_no_posts())
    if tasks:
        sentences.append(texts.brief_today(tasks[0][1]))
    return texts.fa(" ".join(sentences[:4]))


def run_daily_brief(now=None, force=False):
    now = now or timezone.now()
    day = local(now).date()
    if IgDailyBrief.objects.filter(date=day).exists() and not force:
        return {"date": day.isoformat(), "created": False}
    data = analytics.load(now)
    tasks = tasks_for(data)
    text = brief_text(data, tasks)
    with transaction.atomic():
        IgDailyBrief.objects.update_or_create(date=day, defaults={"text": text, "created_at": now, "source": "rules"})
        IgDailyTask.objects.filter(date=day).delete()
        IgDailyTask.objects.bulk_create(
            IgDailyTask(date=day, position=index, rule=rule, title=title[:300], reason=reason[:500])
            for index, (rule, title, reason) in enumerate(tasks)
        )
    return {"date": day.isoformat(), "created": True, "tasks": [rule for rule, *_ in tasks]}


def brief_due(now=None):
    now = local(now or timezone.now())
    return now.hour >= rules.BRIEF_AFTER_HOUR and not IgDailyBrief.objects.filter(date=now.date()).exists()

