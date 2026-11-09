"""Persian text helpers and every generated sentence. The owner edits wording here only.

Rules: Persian digits, compact numbers («۲۲۱ هزار»), polite colloquial tone, always a number, no em dash,
«رد شدن» instead of Skip, «ارسال» for shares. A fresh post (under 48 h) never gets a score or «N برابر»."""

import re

_EMOJI = re.compile(
    "[\U0001F000-\U0001FFFF\u2600-\u27BF\u2B00-\u2BFF\u2300-\u23FF\u2190-\u21FF"
    "\u203C\u2049\u2122\u2139\u3030\u303D\uFE0E\uFE0F\u200D\u20E3\u200F\u200E]"
)
_PRICE = re.compile(r"قیمت\s*[:：]?\s*[0-9۰-۹][0-9۰-۹,٬.]*")
_LABELLED_CODE = re.compile(r"کد\s*محصول\s*[:：]?\s*[0-9۰-۹]+")
_TRAILING_CODE = re.compile(r"(?<![0-9۰-۹])[0-9۰-۹]{4}\s*$")

FA_DIGITS = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")
WEEKDAYS = ("شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه")
GROUP_LABEL = {"reel": "ریل", "slide": "اسلاید"}
KIND_LABEL = {"reel": "ریل", "carousel": "اسلاید", "image": "عکس"}


def fa(text):
    """Persian digits and decimal sign; em and en dashes removed."""
    return str(text).translate(FA_DIGITS).replace("—", "،").replace("–", "-")


def number(value, decimals=0):
    if value is None:
        return "—"
    text = f"{value:,.{decimals}f}".replace(",", "٬").replace(".", "٫")
    if decimals and "٫" in text:
        text = text.rstrip("0").rstrip("٫")
    return fa(text)


def compact(value):
    """221000 → «۲۲۱ هزار», 1240000 → «۱٫۲ میلیون»."""
    if value is None:
        return "—"
    value = float(value)
    if abs(value) >= 1_000_000:
        return f"{number(value / 1_000_000, 1)} میلیون"
    if abs(value) >= 1_000:
        return f"{number(value / 1_000, 0 if abs(value) >= 100_000 else 1)} هزار"
    return number(round(value))


def percent(value, decimals=0):
    return f"{number(value, decimals)}٪"


def times(score):
    return f"{number(score, 1)} برابر"


def clock(local_dt):
    return fa(local_dt.strftime("%H:%M"))


def clean_name(line):
    """Caption line without emojis, price, product code (labelled or trailing) and extra spaces."""
    line = _EMOJI.sub("", line)
    line = _PRICE.sub("", line)
    line = _LABELLED_CODE.sub("", line)
    line = _TRAILING_CODE.sub("", line.strip())
    return re.sub(r"\s+", " ", line).strip(" ،,:-")


def post_name(caption, limit=40):
    """First caption line that still has words after clean_name, shortened."""
    for line in (caption or "").splitlines():
        name = clean_name(line)
        if name:
            return fa(name if len(name) <= limit else name[: limit - 1].rstrip() + "…")
    return "بدون کپشن"


# --- Tasks ------------------------------------------------------------------------------------------

def task_night(night, total, noon_median, night_median):
    return (
        "ریل اصلی امروز را ساعت ۱۲ ظهر منتشر کن، نه شب",
        f"{number(night)} ریل از {number(total)} ریل هفته‌ی اخیر شب منتشر شده‌اند؛ میانه‌ی ریل ظهر {compact(noon_median)} است و شب {compact(night_median)}.",
    )


def task_winner(name, group, score, skip, shares):
    detail = f"فقط {percent(skip)} آن را رد کردند" if group == "reel" and skip is not None else f"{number(shares)} بار ارسال شد"
    return (
        f"یک {GROUP_LABEL[group]} دیگر به سبک «{name}» بساز",
        f"این {GROUP_LABEL[group]} در چند روز اخیر {times(score)} یک {GROUP_LABEL[group]} معمولی دیده شد و {detail}.",
    )


def task_first_second(name, skip):
    out_of_five = max(1, min(5, round(skip / 20)))
    return (
        f"روی فریم اول ریل «{name}» متن درشت بگذار و دوباره بساز",
        f"{percent(skip)} رد شدن: حدود {number(out_of_five)} نفر از ۵ نفر در ثانیه‌ی اول رد کردند.",
    )


def task_no_slide(days, ratio):
    return (
        "امروز یک اسلاید آموزشی یا استایلینگ منتشر کن",
        f"{number(days)} روز است اسلایدی منتشر نشده؛ در این پیج میانه‌ی اسلاید حدود {times(ratio)} میانه‌ی ریل است.",
    )


def task_neglected(title, views, days):
    return (
        f"برای «{title}» دوباره محتوا بساز",
        f"جزو ۱۰ محصول پربازدید ماه است ({compact(views)} بازدید سهم‌دار)، ولی {number(days)} روز است پستی نداشته.",
    )


def task_friday(score):
    return (
        "قوی‌ترین محتوای این هفته را برای فردا، جمعه، نگه دار",
        f"جمعه‌ها با میانه‌ی امتیاز {times(score)} بهترین روز هفته‌ی این پیج‌اند.",
    )


# --- Brief ------------------------------------------------------------------------------------------

def brief_day(count, views):
    return f"دیروز {number(count)} پست منتشر شد و تا امروز صبح روی هم {compact(views)} بازدید گرفته‌اند."


def brief_day_same_age(count, views, change_pct, same_age_median):
    direction = "بیشتر" if change_pct >= 0 else "کمتر"
    return (
        f"دیروز {number(count)} پست منتشر شد و تا امروز صبح روی هم {compact(views)} بازدید گرفته‌اند؛ "
        f"{percent(abs(change_pct))} {direction} از روزهای ۳۰ روز اخیر در همین سن ({compact(same_age_median)})."
    )


def brief_no_posts():
    return "دیروز پستی منتشر نشد."


def brief_star(group, name, views, shares):
    """Yesterday's posts are still fresh: raw numbers only, never a score."""
    return f"پربازدیدترینش {GROUP_LABEL[group]} «{name}» بود با {compact(views)} بازدید و {number(shares)} ارسال تا الان؛ عددها هنوز بالا می‌روند."


def brief_weak(group, name, score, reason=None):
    because = f"، چون {reason}" if reason else ""
    return f"ضعیف‌ترین پست چند روز اخیر {GROUP_LABEL[group]} «{name}» بود با {times(score)} یک {GROUP_LABEL[group]} معمولی{because}."


def weak_reason_skip(skip):
    return f"{percent(skip)} در ثانیه‌ی اول رد کردند"


def weak_reason_night(local_clock):
    return f"ساعت {local_clock} شب منتشر شد"


def brief_today(title):
    return f"امروز: {title}."


# --- Autopsy ----------------------------------------------------------------------------------------

def autopsy_fresh():
    return "کمتر از ۴۸ ساعت از انتشار گذشته؛ عددها هنوز بالا می‌روند."


def autopsy_skip_good(skip, page_median):
    return f"فقط {percent(skip)} در ثانیه‌ی اول رد کردند؛ میانه‌ی پیج {percent(page_median)} است. ثانیه‌ی اول کار کرده."


def autopsy_skip_bad(skip):
    return f"{percent(skip)} در ثانیه‌ی اول رد کردند. ثانیه‌ی اول بیننده را نگه نداشته."


def autopsy_slide(ratio):
    return f"اسلاید است؛ اسلایدها در این پیج حدود {times(ratio)} ریل دیده می‌شوند."


def autopsy_noon(local_clock):
    return f"ساعت {local_clock} منتشر شد، در بازه‌ی خوب ظهر."


def autopsy_night(local_clock, gap_pct):
    return f"ساعت {local_clock} منتشر شد؛ ریل‌های شب در این پیج حدود {percent(gap_pct)} کمتر دیده می‌شوند."


def autopsy_brand():
    return "محتوای برند است، بدون محصول؛ ارزشش در ارسال و رسیدن به مخاطب جدید است."


def autopsy_many_products(count):
    return f"{number(count)} محصول در کپشن آمده؛ بیننده نمی‌داند روی کدام تمرکز کند."
