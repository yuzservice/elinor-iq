"""60-second cache for home payloads. Keys carry a version so a target edit invalidates every cached home payload."""

from django.core.cache import cache

TTL = 60
HEATMAP_TTL = 600  # ≥10 min: the busiest-hours heatmap is a separate lazy load, cheap to serve stale a bit longer
VERSION_KEY = "home:version"


def _version():
    return cache.get_or_set(VERSION_KEY, 1, None)


def summary_key(params, now=None):
    """Home summary cache key: the Tehran date is part of it, so «امروز», «دیروز» and the rolling ranges roll over at
    midnight instead of serving yesterday's window for up to a minute."""
    from django.utils import timezone

    day = timezone.localtime(now or timezone.now()).date().isoformat()
    return f"summary:{day}:" + ":".join(str(params.get(k)) for k in ("period", "from", "to", "compare", "line"))


def heatmap_key(params, now=None):
    """Busiest-hours cache key: same day rollover as ``summary_key``, only the inputs the heatmap reads."""
    from django.utils import timezone

    day = timezone.localtime(now or timezone.now()).date().isoformat()
    return f"heatmap:{day}:" + ":".join(str(params.get(k)) for k in ("period", "from", "to", "line"))


def cached(key, build, ttl=TTL):
    from apps.sales.semantics import visible_sales_lines

    full = f"home:{_version()}:{','.join(visible_sales_lines())}:{key}"
    value = cache.get(full)
    if value is None:
        value = build()
        cache.set(full, value, ttl)
    return value


def clear():
    try:
        cache.incr(VERSION_KEY)
    except ValueError:
        cache.set(VERSION_KEY, 2, None)
