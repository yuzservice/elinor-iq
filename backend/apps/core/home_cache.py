"""60-second cache for home payloads. Keys carry a version so a target edit invalidates every cached home payload."""

from django.core.cache import cache

TTL = 60
VERSION_KEY = "home:version"


def _version():
    return cache.get_or_set(VERSION_KEY, 1, None)


def summary_key(params, now=None):
    """Home summary cache key: the Tehran date is part of it, so «امروز», «دیروز» and the rolling ranges roll over at
    midnight instead of serving yesterday's window for up to a minute."""
    from django.utils import timezone

    day = timezone.localtime(now or timezone.now()).date().isoformat()
    return f"summary:{day}:" + ":".join(str(params.get(k)) for k in ("period", "from", "to", "compare", "line"))


def cached(key, build):
    full = f"home:{_version()}:{key}"
    value = cache.get(full)
    if value is None:
        value = build()
        cache.set(full, value, TTL)
    return value


def clear():
    try:
        cache.incr(VERSION_KEY)
    except ValueError:
        cache.set(VERSION_KEY, 2, None)
