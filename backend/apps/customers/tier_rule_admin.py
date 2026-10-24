"""Draft, preview and activation of customer tier rule versions (super admin only).

The active version stays in force until an activation recomputes every tier
with the draft in one transaction. A failed activation leaves rules and tiers
as they were.
"""

import logging
import re
import threading

from django.db import connection, transaction
from django.db.models import Max
from django.utils import timezone

from apps.customers.models import CustomerTierHistory, TierRuleSet
from apps.customers.tier_refresh import _claim, _finish, tier_refresh_status
from apps.customers.tier_rules import (
    BASE_TIER_CODES,
    CAMPAIGN_TIER_CODES,
    CONDITION_LABELS,
    CONDITIONS,
    CUSTOM_CODE_PREFIX,
    FIXED_OPERATOR,
    MAX_TIERS,
    TierRulesError,
    default_rules,
    enabled_tiers,
    tier_case_sql,
    tier_summary,
    validate_rules,
)
from apps.customers.tiers import (
    _fact_params,
    _facts_sql,
    _lock_tier_writes,
    _rules_of,
    tier_label,
    tier_title_map,
    write_all_tiers,
)
from apps.integrations.elinor.models import SyncCursor

logger = logging.getLogger(__name__)

SAMPLES_PER_TRANSITION = 10
SAMPLES_TOTAL = 100
CODE_SEQUENCE_KEY = "customer_tier_custom_code"
EMPTY_TIER_WARNING = "هیچ مشتری‌ای در این سطح قرار نمی‌گیرد"
CAMPAIGN_TIER_WARNING = "گزارش کمپین‌های این سطح خالی می‌شود"
_CUSTOM_CODE = re.compile(rf"^{CUSTOM_CODE_PREFIX}(\d+)$")


class TierRuleConflict(Exception):
    """The request cannot run now (no draft, stale preview, job running)."""


def active_version():
    return TierRuleSet.objects.filter(status=TierRuleSet.STATUS_ACTIVE).first()


def draft_version():
    return TierRuleSet.objects.filter(status=TierRuleSet.STATUS_DRAFT).first()


def preview_is_current(rule_set):
    return bool(rule_set and rule_set.previewed_at and rule_set.previewed_at >= rule_set.updated_at)


def activation_running(draft=None):
    draft = draft if draft is not None else draft_version()
    return bool(
        draft
        and draft.activation_status == TierRuleSet.ACTIVATION_RUNNING
        and tier_refresh_status()["running"]
    )


def rules_state():
    active = active_version()
    draft = draft_version()
    versions = TierRuleSet.objects.exclude(status=TierRuleSet.STATUS_DRAFT).select_related("activated_by")
    return {
        "active": _rule_set_payload(active),
        "draft": _rule_set_payload(draft),
        "versions": [
            {
                "version": item.version,
                "status": item.status,
                "activated_at": item.activated_at,
                "activated_by": _username(item.activated_by),
                "note": item.note,
            }
            for item in versions
        ],
        "activation": _activation_payload(draft, active),
        "conditions": [
            {
                "key": key,
                "label": CONDITION_LABELS[key],
                "operators": list(operators),
                "fixed_operator": FIXED_OPERATOR.get(key),
            }
            for key, (_column, operators) in CONDITIONS.items()
        ],
        "max_tiers": MAX_TIERS,
    }


def public_tiers():
    """Enabled tiers of the active version, for filters and badges (any signed-in user)."""
    from apps.customers.tier_rules import active_rule_set

    rules = _rules_of(active_rule_set())
    return [
        {"code": tier["code"], "title": tier["title"], "priority": index, "summary": tier_summary(tier)}
        for index, tier in enumerate(enabled_tiers(rules), start=1)
    ]


def _activation_payload(draft, active):
    if draft is not None and draft.activation_status:
        status = draft.activation_status
        error = draft.activation_error
        running = activation_running(draft)
        if status == TierRuleSet.ACTIVATION_RUNNING and not running:
            status = TierRuleSet.ACTIVATION_FAILED
            error = error or "فعال‌سازی ناتمام ماند. قوانین قبلی همچنان فعال است."
        return {"running": running, "status": status, "error": error or ""}
    if active is not None:
        return {"running": False, "status": active.activation_status, "error": ""}
    return {"running": False, "status": "", "error": ""}


def _rule_set_payload(rule_set):
    if rule_set is None:
        return None
    return {
        "version": rule_set.version,
        "status": rule_set.status,
        "rules": rule_set.rules,
        "note": rule_set.note,
        "created_by": _username(rule_set.created_by),
        "created_at": rule_set.created_at,
        "updated_at": rule_set.updated_at,
        "previewed_at": rule_set.previewed_at,
        "preview_current": preview_is_current(rule_set),
        "activated_by": _username(rule_set.activated_by),
        "activated_at": rule_set.activated_at,
        "activation_status": rule_set.activation_status,
        "activation_error": rule_set.activation_error,
    }


def _username(user):
    return user.username if user is not None else None


def save_draft(user, rules=None, note=None):
    """Create the draft (a copy of the active rules when none are sent) or update it."""
    with transaction.atomic():
        draft = TierRuleSet.objects.select_for_update().filter(status=TierRuleSet.STATUS_DRAFT).first()
        if draft is not None and activation_running(draft):
            raise TierRuleConflict("فعال‌سازی در حال انجام است؛ پیش‌نویس قابل تغییر نیست.")
        if rules is None:
            source = draft or active_version()
            rules = source.rules if source is not None else default_rules()
        normalized = validate_rules(_assign_codes(rules))
        if draft is None:
            latest = TierRuleSet.objects.aggregate(top=Max("version"))["top"] or 0
            draft = TierRuleSet(version=latest + 1, status=TierRuleSet.STATUS_DRAFT, created_by=user)
        draft.rules = normalized
        if note is not None:
            draft.note = str(note)
        draft.previewed_at = None
        draft.activation_status = ""
        draft.activation_error = ""
        draft.save()
    return draft


def _assign_codes(rules):
    """Give new tiers (no code) a fresh CUSTOM_<n> code; reject codes the server never issued."""
    if not isinstance(rules, dict) or not isinstance(rules.get("tiers"), list):
        return rules
    issued = _issued_codes()
    tiers = []
    errors = {}
    for index, tier in enumerate(rules["tiers"]):
        if not isinstance(tier, dict):
            tiers.append(tier)
            continue
        tier = dict(tier)
        code = tier.get("code")
        if code in (None, ""):
            tier["code"] = _next_custom_code()
        elif code not in issued:
            errors[index] = {"code": "کد سطح را سرور تعیین می‌کند؛ این کد معتبر نیست."}
        tiers.append(tier)
    if errors:
        raise TierRulesError({"tiers": errors})
    return {**rules, "tiers": tiers}


def _issued_codes():
    codes = set(BASE_TIER_CODES)
    for rules in TierRuleSet.objects.values_list("rules", flat=True):
        codes.update(tier.get("code") for tier in (rules or {}).get("tiers", []) if isinstance(tier, dict))
    return codes


def _next_custom_code():
    """Next CUSTOM_<n>; n only grows, so a code is never reused across versions."""
    cursor = SyncCursor.objects.select_for_update().filter(key=CODE_SEQUENCE_KEY).first()
    if cursor is None:
        cursor = SyncCursor.objects.create(key=CODE_SEQUENCE_KEY, value={"last": 0})
    last = int((cursor.value or {}).get("last") or 0)
    for code in _issued_codes() | set(
        CustomerTierHistory.objects.values_list("tier_code", flat=True).distinct()
    ):
        match = _CUSTOM_CODE.match(code or "")
        if match:
            last = max(last, int(match.group(1)))
    cursor.value = {"last": last + 1}
    cursor.save(update_fields=["value", "updated_at"])
    return f"{CUSTOM_CODE_PREFIX}{last + 1}"


def delete_draft():
    with transaction.atomic():
        draft = TierRuleSet.objects.select_for_update().filter(status=TierRuleSet.STATUS_DRAFT).first()
        if draft is None:
            return False
        if activation_running(draft):
            raise TierRuleConflict("فعال‌سازی در حال انجام است؛ پیش‌نویس قابل حذف نیست.")
        draft.delete()
    return True


def restore_version(user, version):
    source = TierRuleSet.objects.filter(version=version).exclude(status=TierRuleSet.STATUS_DRAFT).first()
    if source is None:
        return None
    return save_draft(user, rules=source.rules, note=f"بازگردانی از نسخه {version}")


def preview_draft(reference_date=None):
    """Compare stored tiers with the draft rules. Writes only draft.previewed_at."""
    draft = draft_version()
    if draft is None:
        raise TierRuleConflict("پیش‌نویسی برای پیش‌نمایش وجود ندارد.")
    rules = validate_rules(draft.rules)
    scored_sql, params = _scored_sql(rules, reference_date)

    with connection.cursor() as cursor:
        cursor.execute(
            f"""
            {scored_sql}
            SELECT current_code,
                   draft_code,
                   COUNT(*)::int,
                   COUNT(*) FILTER (WHERE purchase_count > 0 AND days_since_last_purchase IS NOT NULL)::int
            FROM scored
            GROUP BY 1, 2
            """,
            params,
        )
        pairs = cursor.fetchall()
        cursor.execute(
            f"""
            {scored_sql},
            ranked AS (
                SELECT scored.*,
                       ROW_NUMBER() OVER (
                           PARTITION BY current_code, draft_code
                           ORDER BY lifetime_purchase_amount DESC, customer_id
                       ) AS rn
                FROM scored
                WHERE current_code IS DISTINCT FROM draft_code
            )
            SELECT r.current_code, r.draft_code, c.source_id, c.first_name, c.last_name, c.mobile,
                   r.purchase_count, r.days_since_last_purchase, r.lifetime_purchase_amount
            FROM ranked r
            JOIN customers c ON c.id = r.customer_id
            WHERE r.rn <= %s
            ORDER BY r.rn
            """,
            params + [SAMPLES_PER_TRANSITION],
        )
        sample_rows = cursor.fetchall()

    TierRuleSet.objects.filter(pk=draft.pk).update(previewed_at=timezone.now())
    return _preview_payload(draft, rules, pairs, sample_rows)


def _scored_sql(rules, reference_date):
    facts_sql, _mobiles = _facts_sql()
    case_sql, case_params = tier_case_sql(rules)
    sql = f"""
        {facts_sql},
        scored AS (
            SELECT customer_id, current_code, purchase_count, days_since_last_purchase,
                   lifetime_purchase_amount, {case_sql} AS draft_code
            FROM (
                SELECT f.*, cur.tier_code AS current_code
                FROM facts f
                JOIN customers cur ON cur.id = f.customer_id
            ) current_facts
        )
    """
    return sql, _fact_params(reference_date) + case_params


def _preview_payload(draft, rules, pairs, sample_rows):
    titles = {**tier_title_map(), **{tier["code"]: tier["title"] for tier in rules["tiers"]}}
    draft_codes = [tier["code"] for tier in rules["tiers"]]
    enabled_codes = {tier["code"] for tier in enabled_tiers(rules)}
    current = {}
    proposed = {}
    unmatched = 0
    transitions = []
    for from_code, to_code, count, purchasing in pairs:
        current[from_code] = current.get(from_code, 0) + count
        proposed[to_code] = proposed.get(to_code, 0) + count
        if to_code is None:
            unmatched += purchasing
        if from_code != to_code:
            transitions.append({"from": from_code, "to": to_code, "count": count})
    order = draft_codes + sorted(code for code in current if code and code not in draft_codes)
    transitions.sort(key=lambda item: (-item["count"], _order(order, item["from"]), _order(order, item["to"])))

    by_pair = {}
    for from_code, to_code, source_id, first, last, mobile, count, days, amount in sample_rows:
        by_pair.setdefault((from_code, to_code), []).append(
            {
                "source_id": source_id,
                "full_name": f"{first or ''} {last or ''}".strip(),
                "mobile": mobile,
                "purchase_count": count,
                "days_since_last_purchase": days,
                "lifetime_purchase_amount": amount,
                "from": from_code,
                "to": to_code,
            }
        )
    samples = []
    for item in transitions:
        room = SAMPLES_TOTAL - len(samples)
        if room <= 0:
            break
        samples.extend(by_pair.get((item["from"], item["to"]), [])[: min(SAMPLES_PER_TRANSITION, room)])

    return {
        "version": draft.version,
        "tiers": [
            {
                "tier_code": code,
                "label": tier_label(code, titles) if code else None,
                "enabled": code in enabled_codes,
                "in_draft": code in draft_codes,
                "current": current.get(code, 0),
                "draft": proposed.get(code, 0),
                "delta": proposed.get(code, 0) - current.get(code, 0),
            }
            for code in [*order, None]
        ],
        "transitions": transitions,
        "samples": samples,
        "moved": sum(item["count"] for item in transitions),
        "warnings": _preview_warnings(rules, titles, enabled_codes, current, proposed, unmatched),
    }


def _preview_warnings(rules, titles, enabled_codes, current, proposed, unmatched):
    warnings = []
    if unmatched:
        warnings.append(
            {
                "kind": "unmatched",
                "tier_code": None,
                "label": None,
                "count": unmatched,
                "message": f"{_fa_count(unmatched)} مشتری خریدار در هیچ سطحی قرار نمی‌گیرد",
            }
        )
    draft_codes = {tier["code"] for tier in rules["tiers"]}
    removed = [
        code
        for code in dict.fromkeys([*(tier["code"] for tier in rules["tiers"]), *BASE_TIER_CODES, *current])
        if code and code not in enabled_codes
    ]
    for code in removed:
        state = "غیرفعال" if code in draft_codes else "حذف"
        held = current.get(code, 0)
        if held:
            warnings.append(
                {
                    "kind": "held",
                    "tier_code": code,
                    "label": titles.get(code, code),
                    "count": held,
                    "message": f"{_fa_count(held)} مشتری اکنون در این سطح هستند و این سطح {state} می‌شود",
                }
            )
        if code in CAMPAIGN_TIER_CODES:
            warnings.append(
                {
                    "kind": "campaign",
                    "tier_code": code,
                    "label": titles.get(code, code),
                    "count": None,
                    "message": CAMPAIGN_TIER_WARNING,
                }
            )
    for tier in enabled_tiers(rules):
        if not proposed.get(tier["code"]):
            warnings.append(
                {
                    "kind": "empty",
                    "tier_code": tier["code"],
                    "label": tier["title"],
                    "count": 0,
                    "message": EMPTY_TIER_WARNING,
                }
            )
    return warnings


def _fa_count(value):
    return f"{value:,}".replace(",", "٬").translate(str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹"))


def _order(order, code):
    return order.index(code) if code in order else len(order)


def start_activation(user):
    """Validate the draft, claim the tier job and run the activation in the background."""
    draft = _check_activatable()
    if not _claim():
        raise TierRuleConflict("محاسبه سطح‌ها در حال انجام است. بعد از پایان آن دوباره تلاش کنید.")
    TierRuleSet.objects.filter(pk=draft.pk).update(
        activation_status=TierRuleSet.ACTIVATION_RUNNING, activation_error=""
    )
    threading.Thread(
        target=run_activation,
        args=(draft.pk, user.pk if user else None),
        kwargs={"close_connection": True},
        name="customer-tier-activation",
        daemon=True,
    ).start()
    return draft


def _check_activatable():
    draft = draft_version()
    if draft is None:
        raise TierRuleConflict("پیش‌نویسی برای فعال‌سازی وجود ندارد.")
    validate_rules(draft.rules)
    if not preview_is_current(draft):
        raise TierRuleConflict("ابتدا پیش‌نمایش آخرین تغییرات پیش‌نویس را بگیرید.")
    if tier_refresh_status()["running"]:
        raise TierRuleConflict("محاسبه سطح‌ها در حال انجام است. بعد از پایان آن دوباره تلاش کنید.")
    return draft


def run_activation(draft_id, user_id, reference_date=None, close_connection=False):
    """Recompute every tier with the draft and switch versions, all in one transaction.

    The caller must hold the customer_tiers claim; it is released here.
    """
    success = False
    try:
        with transaction.atomic():
            with connection.cursor() as cursor:
                _lock_tier_writes(cursor)
            draft = TierRuleSet.objects.select_for_update().get(pk=draft_id, status=TierRuleSet.STATUS_DRAFT)
            rules = validate_rules(draft.rules)
            write_all_tiers(rules, draft.pk, CustomerTierHistory.REASON_ACTIVATION, reference_date)
            TierRuleSet.objects.filter(status=TierRuleSet.STATUS_ACTIVE).update(
                status=TierRuleSet.STATUS_ARCHIVED
            )
            TierRuleSet.objects.filter(pk=draft.pk).update(
                status=TierRuleSet.STATUS_ACTIVE,
                activated_by_id=user_id,
                activated_at=timezone.now(),
                activation_status=TierRuleSet.ACTIVATION_SUCCEEDED,
                activation_error="",
            )
        success = True
    except Exception as exc:
        logger.exception("Customer tier rule activation failed")
        message = exc.errors if isinstance(exc, TierRulesError) else exc
        TierRuleSet.objects.filter(pk=draft_id, status=TierRuleSet.STATUS_DRAFT).update(
            activation_status=TierRuleSet.ACTIVATION_FAILED,
            activation_error=(str(message) or exc.__class__.__name__)[:2000],
        )
    finally:
        _finish(success=success)
        if close_connection:
            connection.close()
    return success
