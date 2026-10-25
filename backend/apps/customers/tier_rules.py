"""Configurable, ordered customer tiers.

A rule version is {"tiers": [...]}: array order is evaluation priority and the
first matching enabled tier wins. The purchase facts, the global guard (no
purchase -> no tier) and operator-account exclusion stay fixed in tiers.py.
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


def validate_rules(rules):
    """Return normalized rules or raise TierRulesError with Persian messages.

    Every tier must already carry a code; tier_rule_admin assigns codes to new tiers.
    """
    if not isinstance(rules, dict) or set(rules) != {"tiers"} or not isinstance(rules.get("tiers"), list):
        raise TierRulesError({"_": "ساختار قوانین معتبر نیست؛ فهرست سطح‌ها لازم است."})
    tiers = rules["tiers"]
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
    if errors:
        raise TierRulesError(errors)
    return {"tiers": normalized}


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


def enabled_tiers(rules):
    return [tier for tier in rules["tiers"] if tier.get("enabled")]


def _enabled_conditions(tier):
    for key, (column, _operators) in CONDITIONS.items():
        # Versions stored before a condition existed simply lack its key.
        condition = tier["conditions"].get(key)
        if condition and condition["enabled"]:
            operator = FIXED_OPERATOR.get(key) or condition["operator"]
            yield key, column, OPERATOR_SQL[operator], int(condition["value"])


def tier_case_sql(rules):
    """SQL CASE over the facts columns. Thresholds and codes are bound parameters.

    Returns (sql, params). Operators come from the OPERATOR_SQL whitelist; titles never reach SQL.
    """
    lines = ["CASE", "    WHEN purchase_count <= 0 OR days_since_last_purchase IS NULL THEN NULL"]
    params = []
    for tier in enabled_tiers(rules):
        conditions = []
        for _key, column, operator, value in _enabled_conditions(tier):
            conditions.append(f"{column} {operator} %s")
            params.append(value)
        lines.append(f"    WHEN {' AND '.join(conditions)} THEN %s")
        params.append(tier["code"])
    lines.extend(["    ELSE NULL", "END"])
    return "\n".join(lines), params


def evaluate_tier(rules, purchase_count, days_since_last_purchase, lifetime_purchase_amount):
    """Python twin of tier_case_sql. First matching enabled tier wins."""
    count = int(purchase_count or 0)
    if count <= 0 or days_since_last_purchase is None:
        return None
    facts = {
        "purchase_count": count,
        "days_since_last_purchase": int(days_since_last_purchase),
        "lifetime_purchase_amount": int(lifetime_purchase_amount or 0),
    }
    for tier in enabled_tiers(rules):
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
