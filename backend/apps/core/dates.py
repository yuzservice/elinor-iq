"""Jalali presentation helpers. Storage and APIs stay on Gregorian/UTC datetimes."""

from datetime import date, datetime

import jdatetime
from django.utils import timezone

JALALI_MONTHS_FA = (
    "فروردین",
    "اردیبهشت",
    "خرداد",
    "تیر",
    "مرداد",
    "شهریور",
    "مهر",
    "آبان",
    "آذر",
    "دی",
    "بهمن",
    "اسفند",
)


def to_local_datetime(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        dt = value
        if timezone.is_aware(dt):
            return timezone.localtime(dt)
        return timezone.make_aware(dt, timezone.get_current_timezone())
    if isinstance(value, date):
        return datetime(value.year, value.month, value.day, tzinfo=timezone.get_current_timezone())
    return None


def to_jalali(value):
    dt = to_local_datetime(value)
    if dt is None:
        return None
    return jdatetime.datetime.fromgregorian(datetime=dt)


def format_jalali_date(value, *, long=False):
    jalali = to_jalali(value)
    if jalali is None:
        return ""
    if long:
        month = JALALI_MONTHS_FA[jalali.month - 1]
        return f"{jalali.day} {month} {jalali.year}"
    return f"{jalali.year:04d}/{jalali.month:02d}/{jalali.day:02d}"


def format_jalali_datetime(value):
    jalali = to_jalali(value)
    if jalali is None:
        return ""
    return f"{format_jalali_date(value)} {jalali.hour:02d}:{jalali.minute:02d}"
