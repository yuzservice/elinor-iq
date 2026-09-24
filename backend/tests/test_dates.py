from datetime import date, datetime
from zoneinfo import ZoneInfo

from apps.core.dates import format_jalali_date, format_jalali_datetime

TEHRAN = ZoneInfo("Asia/Tehran")


def test_jalali_numeric_and_long_formats():
    dt = datetime(2026, 9, 17, 14, 30, tzinfo=TEHRAN)
    assert format_jalali_date(dt) == "1405/06/26"
    assert format_jalali_date(dt, long=True) == "26 شهریور 1405"
    assert "1405/06/26" in format_jalali_datetime(dt)
    assert format_jalali_date(date(2026, 9, 17)) == "1405/06/26"


def test_jalali_empty_values():
    assert format_jalali_date(None) == ""
    assert format_jalali_datetime(None) == ""
