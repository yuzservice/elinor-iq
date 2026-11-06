"""Rule-based morning brief and «۳ کار امروز» (no AI). One brief and up to 3 tasks per Tehran day."""

from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from . import analytics, rules, texts
from .analytics import group_of, local
from .models import IgDailyBrief, IgDailyTask, IgPostSnapshot


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
    """Best non-fresh post of the last WINNER_DAYS days with score >= WINNER_SCORE, not named by this rule on either of
    the previous WINNER_REPEAT_DAYS days. Returns (title, reason, post_id)."""
    today = local(data.now).date()
    used = set(
        IgDailyTask.objects.filter(
            rule="repeat_winner", post__isnull=False,
            date__gte=today - timedelta(days=rules.WINNER_REPEAT_DAYS), date__lt=today,
        ).values_list("post_id", flat=True)
    )
    start = data.now - timedelta(days=rules.WINNER_DAYS)
    candidates = [p for p in data.posts if p.published_at >= start and not data.fresh(p) and p.pk not in used]
    score, post = _best(data, candidates)
    if score is None or score < rules.WINNER_SCORE:
        return None
    return (*texts.task_winner(texts.post_name(post.caption), group_of(post), score, post.skip_rate, post.shares), post.pk)


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
    """[(rule, title, reason, post_id or None)] of the rules that fire, by priority, at most MAX_TASKS."""
    fired = []
    for name in rules.TASK_PRIORITY:
        result = RULES[name](data)
        if result:
            fired.append((name, texts.fa(result[0]), texts.fa(result[1]), result[2] if len(result) > 2 else None))
    return fired[: rules.MAX_TASKS]


# --- Brief ------------------------------------------------------------------------------------------


def same_age_median(data):
    """Median of daily view totals of earlier days, each total read at the same age as yesterday's posts now: the
    snapshot dated the publish day (taken just after that day ended). None with fewer than SAME_AGE_MIN_DAYS days."""
    today = local(data.now).date()
    days = {}
    for post in data.posts:
        day = local(post.published_at).date()
        if 2 <= (today - day).days <= rules.MEDIAN_DAYS + 1:
            days.setdefault(day, []).append(post.pk)
    snapshots = {
        (post_id, day): views
        for post_id, day, views in IgPostSnapshot.objects.filter(post_id__in=[pk for ids in days.values() for pk in ids])
        .values_list("post_id", "date", "views")
    }
    totals = []
    for day, ids in days.items():
        values = [snapshots.get((pk, day)) for pk in ids]
        if all(value is not None for value in values):
            totals.append(sum(values))
    return analytics._median(totals) if len(totals) >= rules.SAME_AGE_MIN_DAYS else None


def _weakest_recent(data):
    """The lowest-scoring non-fresh post of the last WEAK_DAYS days, if it is under the median."""
    start = data.now - timedelta(days=rules.WEAK_DAYS)
    scored = [(data.score(p), p) for p in data.posts if p.published_at >= start and not data.fresh(p) and data.score(p) is not None]
    if not scored:
        return None, None
    score, post = min(scored, key=lambda pair: pair[0])
    return (score, post) if score < 1 else (None, None)


def brief_text(data, tasks):
    sentences = []
    yesterday = _yesterday_posts(data)
    if yesterday:
        total = sum(p.views or 0 for p in yesterday)
        base = same_age_median(data)
        if base:
            sentences.append(texts.brief_day_same_age(len(yesterday), total, round((total / base - 1) * 100), base))
        else:
            sentences.append(texts.brief_day(len(yesterday), total))
        # Yesterday's posts are still fresh at 08:00: the star is the most viewed one, with raw numbers only.
        star = max(yesterday, key=lambda p: p.views or 0)
        sentences.append(texts.brief_star(group_of(star), texts.post_name(star.caption), star.views, star.shares))
    else:
        sentences.append(texts.brief_no_posts())
    weak_score, weakest = _weakest_recent(data)
    if weakest is not None:
        moment = local(weakest.published_at)
        if group_of(weakest) == "reel" and weakest.skip_rate is not None and weakest.skip_rate >= rules.SKIP_TARGET:
            reason = texts.weak_reason_skip(weakest.skip_rate)
        elif moment.hour in rules.NIGHT_HOURS:
            reason = texts.weak_reason_night(texts.clock(moment))
        else:
            reason = None
        sentences.append(texts.brief_weak(group_of(weakest), texts.post_name(weakest.caption), weak_score, reason))
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
            IgDailyTask(date=day, position=index, rule=rule, title=title[:300], reason=reason[:500], post_id=post_id)
            for index, (rule, title, reason, post_id) in enumerate(tasks)
        )
    return {"date": day.isoformat(), "created": True, "tasks": [rule for rule, *_ in tasks]}


def brief_due(now=None):
    now = local(now or timezone.now())
    return now.hour >= rules.BRIEF_AFTER_HOUR and not IgDailyBrief.objects.filter(date=now.date()).exists()

