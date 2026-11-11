"""60-second cache for home payloads. Keys carry a version so a target edit invalidates every cached home payload."""

from django.core.cache import cache

TTL = 60
VERSION_KEY = "home:version"


def _version():
    return cache.get_or_set(VERSION_KEY, 1, None)


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
