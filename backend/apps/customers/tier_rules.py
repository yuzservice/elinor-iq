"""Configurable, ordered customer tiers.

A rule version is either the legacy general list {"tiers": [...]} or, per channel,
{"channels": {"online": {"tiers": [...]}, "pos": {"tiers": [...]}}}. Each customer's
channel (the one with more invoices; tie -> pos) selects which ordered list is evaluated;
conditions always use the all-channel facts. Array order is priority; first match wins.
The purchase facts, the global guard (no purchase -> no tier) and operator-account
exclusion stay fixed in tiers.py.
"""

import copy
import re

MAX_TIERS = 12
MAX_TITLE_LENGTH = 40
CUSTOM_CODE_PREFIX = "CUSTOM_"
CODE_PATTERN = re.compile(r"^[A-Z][A-Z0-9_]{0,15}$")

GTE = "gte"
LTE = "lte"
OPERATOR_SQL = {GTE: ">=", LTE: "<="}

# condition key -> (fact column, allowed operators). The two day bounds have no operator key:
# days_since_last_min is always ">=" («از») and days_since_last is always "<=" («تا»).
CONDITIONS = {
    "purchase_count": ("purchase_count", (GTE, LTE)),
    "days_since_last_min": ("days_since_last_purchase", (GTE,)),
    "days_since_last": ("days_since_last_purchase", (LTE,)),
    "lifetime_amount": ("lifetime_purchase_amount", (GTE, LTE)),
}
FIXED_OPERATOR = {"days_since_last_min": GTE, "days_since_last": LTE}

CONDITION_LABELS = {
    "purchase_count": "تعداد خرید",
    "days_since_last_min": "روز از آخرین خرید — از",
    "days_since_last": "روز از آخرین خرید — تا",
    "lifetime_amount": "مبلغ کل خرید (تومان)",
}

# Campaign reports (campaigns.py) filter by these codes.
CAMPAIGN_TIER_CODES = ("VIP", "DIAMOND", "GOLD_1", "SILVER")

CHANNEL_ONLINE = "online"
CHANNEL_POS = "pos"
CHANNELS = (CHANNEL_ONLINE, CHANNEL_POS)
CHANNEL_LABELS = {CHANNEL_ONLINE: "اینترنتی", CHANNEL_POS: "حضوری"}
ONLINE_CODE_PREFIX = "ONLINE_"


def _condition(operator=None, value=None, *, days=False):
    condition = {"enabled": value is not None, "value": value}
    if not days:
        condition["operator"] = operator or GTE
    return condition


def _tier(code, title, count=None, days=None, amount=None, count_op=GTE, amount_op=GTE):
    return {
        "code": code,
        "title": title,
        "enabled": True,
        "conditions": {
            "purchase_count": _condition(count_op, count),
            "days_since_last_min": _condition(value=None, days=True),
            "days_since_last": _condition(value=days, days=True),
            "lifetime_amount": _condition(amount_op, amount),
        },
    }


# Version 1 reproduces the hard-coded rules used before versioning. With
# single-bound day conditions, BRONZE_1 (<= 29 days) is evaluated before SILVER,
# and BRONZE_3 is the catch-all for purchasers left (all have >= 180 days).
VERSION_1_RULES = {
    "tiers": [
        _tier("VIP", "VIP", count=4, days=45, amount=10_000_000),
        _tier("DIAMOND", "الماس", count=3, days=90, amount=5_000_000),
        _tier("GOLD_1", "طلایی سطح ۱", count=4, days=365, amount=10_000_000),
        _tier("GOLD_2", "طلایی سطح ۲", count=2, days=90),
        _tier("BRONZE_1", "برنزی سطح ۱", count=1, days=29),
        _tier("SILVER", "نقره‌ای", count=1, days=90),
        _tier("BRONZE_2", "برنزی سطح ۲", days=179),
        _tier("BRONZE_3", "برنزی سطح ۳", count=1),
    ]
}

BASE_TIER_CODES = tuple(tier["code"] for tier in VERSION_1_RULES["tiers"])


class TierRulesError(ValueError):
    """Invalid rules. `errors` holds "_" for the whole version and "tiers" -> {index: {field: message}}."""

    def __init__(self, errors):
        super().__init__("قوانین سطح‌بندی معتبر نیست.")
        self.errors = errors


def default_rules():
    return copy.deepcopy(VERSION_1_RULES)


def is_channel_rules(rules):
    return isinstance(rules, dict) and "channels" in rules


def validate_rules(rules):
    """Return normalized rules or raise TierRulesError with Persian messages.

    Legacy shape: {"tiers": [...]}; errors {"_", "tiers": {index: {field: message}}}.
    Channel shape: {"channels": {...}}; errors {"_", "channels": {channel: {"_", "tiers": {...}}}}.
    Every tier must already carry a code; tier_rule_admin assigns codes to new tiers.
    """
    if is_channel_rules(rules):
        return _validate_channels(rules)
    if not isinstance(rules, dict) or set(rules) != {"tiers"} or not isinstance(rules.get("tiers"), list):
        raise TierRulesError({"_": "ساختار قوانین معتبر نیست؛ فهرست سطح‌ها لازم است."})
    normalized, errors = _validate_tier_list(rules["tiers"])
    if errors:
        raise TierRulesError(errors)
    return {"tiers": normalized}


def _validate_channels(rules):
    channels = rules.get("channels")
    if set(rules) != {"channels"} or not isinstance(channels, dict) or set(channels) != set(CHANNELS):
        raise TierRulesError({"_": "ساختار قوانین معتبر نیست؛ برای هر دو کانال «اینترنتی» و «حضوری» فهرست سطح لازم است."})
    normalized, errors = {}, {}
    codes = {}
    for channel in CHANNELS:
        block = channels[channel]
        if not isinstance(block, dict) or set(block) != {"tiers"} or not isinstance(block.get("tiers"), list):
            errors[channel] = {"_": "ساختار سطح‌های این کانال معتبر نیست."}
            continue
        tiers, channel_errors = _validate_tier_list(block["tiers"])
        for index, tier in enumerate(tiers):
            code = tier.get("code")
            if code and code in codes and codes[code] != channel:
                channel_errors.setdefault("tiers", {}).setdefault(index, {})["code"] = "این کد در کانال دیگر هم هست؛ کد هر سطح فقط در یک کانال مجاز است."
            if code:
                codes[code] = channel
        if channel_errors:
            errors[channel] = channel_errors
        normalized[channel] = {"tiers": tiers}
    if errors:
        raise TierRulesError({"channels": errors})
    return {"channels": normalized}


def _validate_tier_list(tiers):
    """Validate one ordered list: max 12, ≥ 1 enabled, unique codes and titles (case-insensitive)."""
    errors = {}
    tier_errors = {}
    if not tiers:
        errors["_"] = "دست‌کم یک سطح لازم است."
    if len(tiers) > MAX_TIERS:
        errors["_"] = f"حداکثر {MAX_TIERS} سطح مجاز است."

    normalized = []
    seen_codes = set()
    seen_titles = {}
    for index, tier in enumerate(tiers):
        messages = {}
        item = _normalize_tier(tier, messages)
        code = item.get("code")
        if code:
            if code in seen_codes:
                messages["code"] = "کد سطح تکراری است."
            seen_codes.add(code)
        title = item.get("title")
        if title:
            key = title.casefold()
            if key in seen_titles:
                messages["title"] = "عنوان سطح تکراری است."
            seen_titles[key] = index
        if messages:
            tier_errors[index] = messages
        normalized.append(item)
    if tiers and not any(item.get("enabled") for item in normalized):
        errors["_"] = "دست‌کم یک سطح باید فعال باشد."
    if tier_errors:
        errors["tiers"] = tier_errors
    return normalized, errors


def _normalize_tier(tier, errors):
    if not isinstance(tier, dict):
        errors["_"] = "قانون این سطح معتبر نیست."
        return {}
    unknown = sorted(set(tier) - {"code", "title", "enabled", "conditions"})
    if unknown:
        errors["_"] = f"کلید ناشناخته: {', '.join(map(str, unknown))}"

    code = tier.get("code")
    if not isinstance(code, str) or not CODE_PATTERN.match(code):
        errors["code"] = "کد سطح معتبر نیست."
        code = None
    title = tier.get("title")
    title = title.strip() if isinstance(title, str) else ""
    if not title:
        errors["title"] = "عنوان سطح را وارد کنید."
    elif len(title) > MAX_TITLE_LENGTH:
        errors["title"] = f"عنوان سطح حداکثر {MAX_TITLE_LENGTH} نویسه است."
    enabled = tier.get("enabled", True)
    if not isinstance(enabled, bool):
        errors["enabled"] = "وضعیت فعال بودن سطح باید بله یا خیر باشد."
        enabled = False

    raw_conditions = tier.get("conditions")
    if not isinstance(raw_conditions, dict):
        errors["conditions"] = "شرط‌های این سطح معتبر نیست."
        raw_conditions = {}
    unknown = sorted(set(raw_conditions) - set(CONDITIONS))
    if unknown:
        errors["conditions"] = f"شرط ناشناخته: {', '.join(map(str, unknown))}"
    conditions = {}
    for key in CONDITIONS:
        conditions[key] = _normalize_condition(key, raw_conditions.get(key), errors)
    low, high = conditions["days_since_last_min"], conditions["days_since_last"]
    if low["enabled"] and high["enabled"] and low["value"] > high["value"]:
        errors["days_since_last"] = "«تا» روز باید بزرگ‌تر یا مساوی «از» باشد."
    if enabled and not any(condition["enabled"] for condition in conditions.values()):
        errors["_"] = "دست‌کم یک شرط باید فعال باشد؛ وگرنه همه خریداران در این سطح قرار می‌گیرند."
    return {"code": code, "title": title, "enabled": enabled, "conditions": conditions}


def _normalize_condition(key, raw, errors):
    days = key in FIXED_OPERATOR
    empty = _condition(value=None, days=days)
    if raw is None:
        return empty
    allowed_keys = {"enabled", "value"} if days else {"enabled", "value", "operator"}
    if not isinstance(raw, dict) or set(raw) - allowed_keys:
        errors[key] = (
            "برای روز از آخرین خرید عملگر نفرستید؛ «از» و «تا» دو شرط جدا هستند."
            if days and isinstance(raw, dict) and "operator" in raw
            else "ساختار شرط معتبر نیست."
        )
        return empty
    enabled = raw.get("enabled", False)
    if not isinstance(enabled, bool):
        errors[key] = "وضعیت فعال بودن شرط باید بله یا خیر باشد."
        return empty
    value = raw.get("value")
    if value is not None and (isinstance(value, bool) or not isinstance(value, int)):
        errors[key] = "مقدار باید عدد صحیح باشد."
        return empty
    if enabled and value is None:
        errors[key] = "برای شرط فعال، مقدار را وارد کنید."
        return empty
    if value is not None and value < 0:
        errors[key] = "مقدار نمی‌تواند منفی باشد."
        return empty
    condition = {"enabled": enabled, "value": value}
    if not days:
        operator = raw.get("operator", GTE)
        if operator not in CONDITIONS[key][1]:
            errors[key] = "عملگر باید «بیشتر یا مساوی» یا «کمتر یا مساوی» باشد."
            return empty
        condition["operator"] = operator
    return condition


def tier_lists(rules):
    """[(channel, tiers)] in evaluation order; channel is None for the legacy shape."""
    if is_channel_rules(rules):
        return [(channel, rules["channels"][channel]["tiers"]) for channel in CHANNELS]
    return [(None, rules["tiers"])]


def all_tiers(rules):
    """Every tier with its channel, e.g. for titles and issued codes."""
    return [(channel, tier) for channel, tiers in tier_lists(rules) for tier in tiers]


def enabled_tiers(rules, channel=None):
    """Enabled tiers in priority order: of one channel, or of every list when `channel` is None."""
    return [
        tier
        for list_channel, tiers in tier_lists(rules)
        if channel is None or list_channel == channel
        for tier in tiers
        if tier.get("enabled")
    ]


def channel_of_code(rules, code):
    for channel, tier in all_tiers(rules):
        if tier.get("code") == code:
            return channel
    return None


def _enabled_conditions(tier):
    for key, (column, _operators) in CONDITIONS.items():
        # Versions stored before a condition existed simply lack its key.
        condition = tier["conditions"].get(key)
        if condition and condition["enabled"]:
            operator = FIXED_OPERATOR.get(key) or condition["operator"]
            yield key, column, OPERATOR_SQL[operator], int(condition["value"])


def _list_case(tiers, params):
    whens = []
    for tier in tiers:
        if not tier.get("enabled"):
            continue
        conditions = []
        for _key, column, operator, value in _enabled_conditions(tier):
            conditions.append(f"{column} {operator} %s")
            params.append(value)
        whens.append(f"WHEN {' AND '.join(conditions)} THEN %s")
        params.append(tier["code"])
    return f"CASE {' '.join(whens)} ELSE NULL END" if whens else "NULL"


def tier_case_sql(rules):
    """SQL CASE over the facts columns. Thresholds, codes and channels are bound parameters.

    Channel rules branch on the facts `channel` column, then evaluate that channel's list.
    Returns (sql, params). Operators come from the OPERATOR_SQL whitelist; titles never reach SQL.
    """
    params = []
    lines = ["CASE", "    WHEN purchase_count <= 0 OR days_since_last_purchase IS NULL THEN NULL"]
    if is_channel_rules(rules):
        for channel in CHANNELS:
            params.append(channel)
            branch = _list_case(rules["channels"][channel]["tiers"], params)
            lines.append(f"    WHEN channel = %s THEN ({branch})")
        lines.extend(["    ELSE NULL", "END"])
        return "\n".join(lines), params
    for tier in enabled_tiers(rules):
        conditions = []
        for _key, column, operator, value in _enabled_conditions(tier):
            conditions.append(f"{column} {operator} %s")
            params.append(value)
        lines.append(f"    WHEN {' AND '.join(conditions)} THEN %s")
        params.append(tier["code"])
    lines.extend(["    ELSE NULL", "END"])
    return "\n".join(lines), params


def channel_case_sql(rules):
    """SQL for the stored tier_channel: the facts channel when channel rules assign a tier, else NULL."""
    if not is_channel_rules(rules):
        return "NULL::varchar"
    return "channel"


def customer_channel(online_count, pos_count):
    """Channel with more invoices over each channel's full history; tie -> pos; no purchase -> None."""
    online_count, pos_count = int(online_count or 0), int(pos_count or 0)
    if online_count + pos_count <= 0:
        return None
    return CHANNEL_POS if pos_count >= online_count else CHANNEL_ONLINE


def evaluate_tier(rules, purchase_count, days_since_last_purchase, lifetime_purchase_amount, channel=None):
    """Python twin of tier_case_sql. First matching enabled tier (of the customer's channel) wins."""
    count = int(purchase_count or 0)
    if count <= 0 or days_since_last_purchase is None:
        return None
    if is_channel_rules(rules) and channel not in CHANNELS:
        return None
    facts = {
        "purchase_count": count,
        "days_since_last_purchase": int(days_since_last_purchase),
        "lifetime_purchase_amount": int(lifetime_purchase_amount or 0),
    }
    candidates = enabled_tiers(rules, channel) if is_channel_rules(rules) else enabled_tiers(rules)
    for tier in candidates:
        if all(_compare(facts[column], operator, value) for _key, column, operator, value in _enabled_conditions(tier)):
            return tier["code"]
    return None


def _compare(fact, operator, value):
    return fact >= value if operator == ">=" else fact <= value


_PERSIAN_DIGITS = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")


def _fa(text):
    return str(text).translate(_PERSIAN_DIGITS)


def _fa_number(value):
    return _fa(f"{value:,}".replace(",", "٬"))


def _fa_amount(value):
    if abs(value) >= 1_000_000:
        millions = f"{value / 1_000_000:.2f}".rstrip("0").rstrip(".")
        return f"{_fa(millions.replace('.', '٫'))} میلیون"
    return f"{_fa_number(value)} تومان"


def tier_summary(tier):
    """Short Persian text for a tier's enabled conditions, e.g. «۴+ خرید · حداکثر ۴۵ روز از آخرین خرید · +۱۰ میلیون»."""
    parts = []
    conditions = tier["conditions"]
    count = conditions["purchase_count"]
    if count["enabled"]:
        value = _fa_number(count["value"])
        parts.append(f"{value}+ خرید" if count["operator"] == GTE else f"حداکثر {value} خرید")
    low = conditions.get("days_since_last_min") or {}
    high = conditions.get("days_since_last") or {}
    if low.get("enabled") and high.get("enabled"):
        parts.append(f"{_fa_number(low['value'])} تا {_fa_number(high['value'])} روز از آخرین خرید")
    elif low.get("enabled"):
        parts.append(f"حداقل {_fa_number(low['value'])} روز از آخرین خرید")
    elif high.get("enabled"):
        parts.append(f"حداکثر {_fa_number(high['value'])} روز از آخرین خرید")
    amount = conditions["lifetime_amount"]
    if amount["enabled"]:
        value = _fa_amount(amount["value"])
        parts.append(f"+{value}" if amount["operator"] == GTE else f"حداکثر {value}")
    return " · ".join(parts) if parts else "بدون شرط"


def active_rule_set():
    """The active TierRuleSet, or None. One query per call; nothing is cached."""
    from apps.customers.models import TierRuleSet

    try:
        return TierRuleSet.objects.filter(status=TierRuleSet.STATUS_ACTIVE).first()
    except RuntimeError:
        # Database access is blocked (pure unit tests): callers fall back to version 1.
        return None


def active_rules():
    rule_set = active_rule_set()
    return rule_set.rules if rule_set else default_rules()
