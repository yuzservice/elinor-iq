import copy
from datetime import date, datetime, time, timedelta
from unittest.mock import patch
from zoneinfo import ZoneInfo

import pytest
from django.contrib.auth import get_user_model
from django.db import connection
from django.utils import timezone

from apps.customers.models import Customer, CustomerTierHistory, InternalAccount, TierRuleSet
from apps.customers.tier_refresh import _claim, tier_refresh_status
from apps.customers.tier_rule_admin import preview_draft, run_activation, save_draft
from apps.customers.tier_rules import (
    MAX_TIERS,
    VERSION_1_RULES,
    TierRulesError,
    evaluate_tier,
    tier_case_sql,
    tier_summary,
    validate_rules,
)
from apps.customers.tiers import refresh_stored_tiers, tier_code_for, tier_label
from apps.sales.models import Order

TEHRAN = ZoneInfo("Asia/Tehran")
REF = date(2026, 6, 15)
OPERATOR_MOBILE = "09362506974"

COUNTS = range(0, 7)
DAYS = (None, *range(-1, 401))
AMOUNTS = (0, 4_999_999, 5_000_000, 9_999_999, 10_000_000, 20_000_000)
GRID = [(count, days, amount) for count in COUNTS for days in DAYS for amount in AMOUNTS]


def _legacy_tier(count, days, amount):
    """The hard-coded rules before rule versions existed, kept verbatim as a test-only reference."""
    count = int(count or 0)
    amount = int(amount or 0)
    if count <= 0 or days is None:
        return None
    days = int(days)
    if count >= 4 and days <= 45 and amount >= 10_000_000:
        return "VIP"
    if count >= 3 and days <= 90 and amount >= 5_000_000:
        return "DIAMOND"
    if count >= 4 and 90 <= days <= 365 and amount >= 10_000_000:
        return "GOLD_1"
    if count >= 2 and days <= 90:
        return "GOLD_2"
    if count >= 1 and 30 <= days <= 90:
        return "SILVER"
    if count >= 1 and days <= 30:
        return "BRONZE_1"
    if 90 <= days < 180:
        return "BRONZE_2"
    if days >= 180:
        return "BRONZE_3"
    return None


def _sql_tiers(rules, grid):
    case_sql, case_params = tier_case_sql(rules)
    rows = ", ".join(["(%s::int, %s::int, %s::int, %s::bigint)"] * len(grid))
    params = []
    for index, (count, days, amount) in enumerate(grid):
        params.extend([index, count, days, amount])
    sql = f"""
        SELECT idx, {case_sql}
        FROM (VALUES {rows}) AS facts(idx, purchase_count, days_since_last_purchase, lifetime_purchase_amount)
        ORDER BY idx
    """
    with connection.cursor() as cursor:
        cursor.execute(sql, case_params + params)
        return [code for _idx, code in cursor.fetchall()]


def _rules():
    return copy.deepcopy(VERSION_1_RULES)


def _tier(rules, code):
    return next(tier for tier in rules["tiers"] if tier["code"] == code)


def _set(rules, code, condition, **changes):
    _tier(rules, code)["conditions"][condition].update(changes)
    return rules


def _stricter_gold_2():
    """GOLD_2 needs 3 purchases: a 2-purchase recent buyer falls to BRONZE_1."""
    return _set(_rules(), "GOLD_2", "purchase_count", value=3)


def _at(days_before):
    return datetime.combine(REF, time(12, 0), tzinfo=TEHRAN) - timedelta(days=days_before)


def _customer(source_id, mobile=None):
    return Customer.objects.create(
        source_id=source_id,
        first_name="آوا",
        last_name="رضایی",
        mobile=mobile or f"0912{source_id:07d}",
        status="active",
    )


def _orders(customer, first_source_id, *, count, days, amount):
    for offset in range(count):
        Order.objects.create(
            source_id=first_source_id + offset,
            customer=customer,
            status="delivered",
            total_amount=amount,
            created_at=_at(days),
        )


@pytest.fixture
def super_admin(db):
    return get_user_model().objects.create_user(
        username="root", password="secret-pass", role="super_admin", is_staff=True
    )


@pytest.fixture
def super_api(api, super_admin):
    api.force_login(super_admin)
    return api


def _activate(user, rules):
    draft = save_draft(user, rules=rules)
    preview_draft(reference_date=REF)
    assert _claim()
    assert run_activation(draft.pk, user.pk, reference_date=REF) is True
    draft.refresh_from_db()
    return draft


# --- Version 1 equivalence -------------------------------------------------------------------


def test_version_one_python_matches_legacy_logic_over_grid():
    for count, days, amount in GRID:
        assert evaluate_tier(VERSION_1_RULES, count, days, amount) == _legacy_tier(count, days, amount), (
            count,
            days,
            amount,
        )


@pytest.mark.django_db
def test_version_one_sql_matches_legacy_logic_over_grid():
    expected = [_legacy_tier(count, days, amount) for count, days, amount in GRID]
    assert _sql_tiers(VERSION_1_RULES, GRID) == expected


def test_three_argument_call_without_database_uses_version_one():
    assert tier_code_for(4, 45, 10_000_000) == "VIP"
    assert tier_code_for(1, 29, 0) == "BRONZE_1"
    assert tier_code_for(1, 30, 0) == "SILVER"
    assert tier_code_for(1, 180, 0) == "BRONZE_3"


@pytest.mark.django_db
def test_migration_stores_version_one_as_active():
    active = TierRuleSet.objects.get(status=TierRuleSet.STATUS_ACTIVE)
    assert active.version == 1
    # Stored before the «از» day bound existed; normalizing adds it disabled.
    assert validate_rules(active.rules) == VERSION_1_RULES
    assert [tier["code"] for tier in active.rules["tiers"]][4:6] == ["BRONZE_1", "SILVER"]


# --- Engine ----------------------------------------------------------------------------------


@pytest.mark.django_db
def test_lte_operator_disabled_condition_and_sql_parity():
    rules = _rules()
    _set(rules, "VIP", "lifetime_amount", operator="lte", value=1_000_000)
    _set(rules, "GOLD_2", "days_since_last", enabled=False)
    assert evaluate_tier(rules, 4, 10, 500_000) == "VIP"
    assert evaluate_tier(rules, 4, 10, 2_000_000) == "GOLD_2"
    assert evaluate_tier(rules, 2, 300, 0) == "GOLD_2"
    python = [evaluate_tier(rules, count, days, amount) for count, days, amount in GRID[::7]]
    assert _sql_tiers(rules, GRID[::7]) == python


@pytest.mark.django_db
def test_disabled_tier_falls_through_and_deleted_tier_is_skipped():
    rules = _rules()
    _tier(rules, "VIP")["enabled"] = False
    assert evaluate_tier(rules, 4, 10, 20_000_000) == "DIAMOND"
    rules["tiers"] = [tier for tier in rules["tiers"] if tier["code"] != "DIAMOND"]
    assert evaluate_tier(rules, 4, 10, 20_000_000) == "GOLD_1"
    assert _sql_tiers(rules, [(4, 10, 20_000_000)]) == ["GOLD_1"]


def test_reordering_changes_the_first_match():
    rules = _rules()
    assert evaluate_tier(rules, 1, 30, 0) == "SILVER"
    codes = [tier["code"] for tier in rules["tiers"]]
    silver = rules["tiers"].pop(codes.index("SILVER"))
    rules["tiers"].insert(0, silver)
    assert evaluate_tier(rules, 1, 10, 0) == "SILVER"
    assert evaluate_tier(VERSION_1_RULES, 1, 10, 0) == "BRONZE_1"


def test_sql_values_and_codes_are_bound_parameters():
    rules = _set(_rules(), "VIP", "lifetime_amount", value=123_456_789)
    sql, params = tier_case_sql(rules)
    assert "123456789" not in sql
    assert "VIP" not in sql
    assert "الماس" not in sql
    assert 123_456_789 in params and "VIP" in params


def test_summary_text():
    assert tier_summary(_tier(VERSION_1_RULES, "VIP")) == "۴+ خرید · حداکثر ۴۵ روز از آخرین خرید · +۱۰ میلیون"
    assert tier_summary(_tier(VERSION_1_RULES, "BRONZE_2")) == "حداکثر ۱۷۹ روز از آخرین خرید"
    rules = _set(_rules(), "GOLD_2", "lifetime_amount", enabled=True, operator="lte", value=500_000)
    assert tier_summary(_tier(rules, "GOLD_2")) == "۲+ خرید · حداکثر ۹۰ روز از آخرین خرید · حداکثر ۵۰۰٬۰۰۰ تومان"


# --- Validation ------------------------------------------------------------------------------


def _errors(rules):
    with pytest.raises(TierRulesError) as caught:
        validate_rules(rules)
    return caught.value.errors


def test_validation_accepts_version_one():
    assert validate_rules(VERSION_1_RULES) == VERSION_1_RULES


def test_validation_rejects_bad_titles():
    rules = _rules()
    rules["tiers"][1]["title"] = "  vip "
    rules["tiers"][2]["title"] = "   "
    rules["tiers"][3]["title"] = "ط" * 41
    errors = _errors(rules)["tiers"]
    assert errors[1]["title"] and errors[2]["title"] and errors[3]["title"]


def test_validation_limits_and_enabled_tiers():
    rules = _rules()
    for index in range(MAX_TIERS - len(rules["tiers"]) + 1):
        extra = copy.deepcopy(rules["tiers"][-1])
        extra["code"] = f"CUSTOM_{index + 1}"
        extra["title"] = f"سطح {index}"
        rules["tiers"].append(extra)
    assert _errors(rules)["_"]

    rules = _rules()
    for tier in rules["tiers"]:
        tier["enabled"] = False
    assert _errors(rules)["_"] == "دست‌کم یک سطح باید فعال باشد."


@pytest.mark.parametrize(
    ("condition", "payload"),
    [
        ("purchase_count", {"enabled": True, "operator": "gte", "value": None}),
        ("purchase_count", {"enabled": True, "operator": "gt", "value": 1}),
        ("purchase_count", {"enabled": True, "operator": "gte", "value": -1}),
        ("lifetime_amount", {"enabled": True, "operator": "gte", "value": "5"}),
        ("days_since_last", {"enabled": True, "operator": "lte", "value": 45}),
    ],
)
def test_validation_rejects_bad_conditions(condition, payload):
    rules = _rules()
    _tier(rules, "VIP")["conditions"][condition] = payload
    assert _errors(rules)["tiers"][0][condition]


def test_validation_rejects_tier_without_conditions_and_unknown_keys():
    rules = _rules()
    for condition in _tier(rules, "BRONZE_3")["conditions"].values():
        condition["enabled"] = False
    _tier(rules, "VIP")["conditions"]["branch"] = {"enabled": True, "value": 1}
    errors = _errors(rules)["tiers"]
    assert errors[7]["_"]
    assert errors[0]["conditions"]


# --- API -------------------------------------------------------------------------------------


TIER_RULE_CALLS = [
    ("get", "/api/customers/tier-rules/"),
    ("put", "/api/customers/tier-rules/draft/"),
    ("delete", "/api/customers/tier-rules/draft/"),
    ("post", "/api/customers/tier-rules/draft/preview/"),
    ("post", "/api/customers/tier-rules/draft/activate/"),
    ("post", "/api/customers/tier-rules/1/restore/"),
]


@pytest.mark.django_db
@pytest.mark.parametrize(("method", "url"), TIER_RULE_CALLS)
def test_admin_role_gets_403_on_every_tier_rules_endpoint(auth_api, method, url):
    response = getattr(auth_api, method)(url, {}, format="json")
    assert response.status_code == 403


@pytest.mark.django_db
def test_public_tiers_endpoint_lists_enabled_active_tiers(auth_api):
    response = auth_api.get("/api/customers/tiers/")
    assert response.status_code == 200
    # Grouped by channel since tier channels; a legacy (general) version is one group with channel None.
    groups = response.data["results"]
    assert [(group["channel"], group["channel_label"]) for group in groups] == [(None, None)]
    results = groups[0]["tiers"]
    assert [row["code"] for row in results] == [tier["code"] for tier in VERSION_1_RULES["tiers"]]
    assert results[0] == {
        "code": "VIP",
        "title": "VIP",
        "priority": 1,
        "summary": "۴+ خرید · حداکثر ۴۵ روز از آخرین خرید · +۱۰ میلیون",
        "customers": 0,
    }


@pytest.mark.django_db
def test_super_admin_draft_with_new_tier_preview_restore_flow(super_api):
    state = super_api.get("/api/customers/tier-rules/")
    assert state.status_code == 200
    assert state.data["active"]["version"] == 1
    assert state.data["draft"] is None

    rules = _rules()
    rules["tiers"].append(
        {
            "title": "سطح ویژه",
            "enabled": True,
            "conditions": {"purchase_count": {"enabled": True, "operator": "gte", "value": 1}},
        }
    )
    created = super_api.put("/api/customers/tier-rules/draft/", {"rules": rules}, format="json")
    assert created.status_code == 200
    new_tier = created.data["draft"]["rules"]["tiers"][-1]
    assert new_tier["code"] == "CUSTOM_1"
    assert new_tier["conditions"]["days_since_last"] == {"enabled": False, "value": None}

    forged = _rules()
    forged["tiers"][0]["code"] = "CUSTOM_99"
    rejected = super_api.put("/api/customers/tier-rules/draft/", {"rules": forged}, format="json")
    assert rejected.status_code == 400
    assert rejected.data["errors"]["tiers"][0]["code"]

    preview = super_api.post("/api/customers/tier-rules/draft/preview/", {}, format="json")
    assert preview.status_code == 200
    assert {"tiers", "transitions", "samples", "warnings"} <= set(preview.data)

    restored = super_api.post("/api/customers/tier-rules/1/restore/", {}, format="json")
    assert restored.status_code == 200
    assert restored.data["draft"]["rules"] == VERSION_1_RULES
    assert restored.data["draft"]["previewed_at"] is None

    deleted = super_api.delete("/api/customers/tier-rules/draft/")
    assert deleted.status_code == 200
    assert deleted.data["draft"] is None


@pytest.mark.django_db
def test_custom_codes_are_never_reused(super_admin):
    def with_new_tier(title):
        rules = _rules()
        rules["tiers"].append(
            {
                "title": title,
                "enabled": True,
                "conditions": {"purchase_count": {"enabled": True, "operator": "gte", "value": 1}},
            }
        )
        return rules

    first = save_draft(super_admin, rules=with_new_tier("اول"))
    assert first.rules["tiers"][-1]["code"] == "CUSTOM_1"
    first.delete()
    second = save_draft(super_admin, rules=with_new_tier("دوم"))
    assert second.rules["tiers"][-1]["code"] == "CUSTOM_2"
    preview_draft(reference_date=REF)
    assert _claim()
    assert run_activation(second.pk, super_admin.pk, reference_date=REF)
    third = save_draft(super_admin, rules=with_new_tier("سوم"))
    assert third.rules["tiers"][-1]["code"] == "CUSTOM_3"


# --- Labels and history ----------------------------------------------------------------------


@pytest.mark.django_db
def test_tier_label_uses_active_then_archived_then_code(super_admin):
    rules = _rules()
    _tier(rules, "VIP")["title"] = "پلاتینیوم"
    rules["tiers"] = [tier for tier in rules["tiers"] if tier["code"] != "GOLD_2"]
    _activate(super_admin, rules)
    assert tier_label("VIP") == "پلاتینیوم"
    assert tier_label("GOLD_2") == "طلایی سطح ۲"
    assert tier_label("CUSTOM_42") == "CUSTOM_42"
    assert tier_label(None) is None


@pytest.mark.django_db
def test_activation_writes_title_snapshots(super_admin):
    loyal = _customer(1)
    _orders(loyal, 100, count=2, days=10, amount=100_000)
    refresh_stored_tiers(reference_date=REF)
    rules = _stricter_gold_2()
    _tier(rules, "BRONZE_1")["title"] = "برنزی تازه"
    _activate(super_admin, rules)
    row = CustomerTierHistory.objects.filter(customer=loyal, reason="activation").get()
    assert (row.previous_tier_code, row.previous_tier_title, row.tier_code, row.tier_title) == (
        "GOLD_2",
        "طلایی سطح ۲",
        "BRONZE_1",
        "برنزی تازه",
    )


# --- Preview ---------------------------------------------------------------------------------


@pytest.mark.django_db
def test_preview_reports_moves_and_writes_nothing(super_admin):
    loyal = _customer(1)
    _orders(loyal, 100, count=2, days=10, amount=100_000)
    fresh = _customer(2)
    _orders(fresh, 200, count=1, days=10, amount=100_000)
    refresh_stored_tiers(reference_date=REF)
    loyal.refresh_from_db()
    assert loyal.tier_code == "GOLD_2"
    history_before = CustomerTierHistory.objects.count()
    stored_before = dict(Customer.objects.values_list("pk", "tier_code"))

    draft = save_draft(super_admin, rules=_stricter_gold_2())
    payload = preview_draft(reference_date=REF)

    by_code = {row["tier_code"]: row for row in payload["tiers"]}
    assert by_code["GOLD_2"]["current"] == 1
    assert by_code["GOLD_2"]["draft"] == 0
    assert by_code["BRONZE_1"]["delta"] == 1
    assert [(t["from"], t["to"], t["count"]) for t in payload["transitions"]] == [("GOLD_2", "BRONZE_1", 1)]
    assert payload["samples"][0]["source_id"] == loyal.source_id
    assert any(w["kind"] == "empty" and w["tier_code"] == "VIP" for w in payload["warnings"])

    assert dict(Customer.objects.values_list("pk", "tier_code")) == stored_before
    assert CustomerTierHistory.objects.count() == history_before
    draft.refresh_from_db()
    assert draft.previewed_at is not None and draft.previewed_at >= draft.updated_at


@pytest.mark.django_db
def test_preview_warns_about_held_campaign_and_unmatched(super_admin):
    silver = _customer(1)
    _orders(silver, 100, count=1, days=60, amount=100_000)
    cold = _customer(2)
    _orders(cold, 200, count=1, days=300, amount=100_000)
    refresh_stored_tiers(reference_date=REF)
    silver.refresh_from_db()
    assert silver.tier_code == "SILVER"

    rules = _rules()
    _tier(rules, "SILVER")["enabled"] = False
    rules["tiers"] = [tier for tier in rules["tiers"] if tier["code"] != "BRONZE_3"]
    save_draft(super_admin, rules=rules)
    warnings = preview_draft(reference_date=REF)["warnings"]
    kinds = {(w["kind"], w["tier_code"]) for w in warnings}

    assert ("held", "SILVER") in kinds
    assert ("campaign", "SILVER") in kinds
    assert ("held", "BRONZE_3") in kinds
    assert ("campaign", "BRONZE_3") not in kinds
    unmatched = next(w for w in warnings if w["kind"] == "unmatched")
    assert unmatched["count"] == 1
    assert unmatched["message"] == "۱ مشتری خریدار در هیچ سطحی قرار نمی‌گیرد"


# --- Activation ------------------------------------------------------------------------------


@pytest.mark.django_db
def test_activation_switches_versions_and_records_only_changes(super_admin):
    loyal = _customer(1)
    _orders(loyal, 100, count=2, days=10, amount=100_000)
    steady = _customer(2)
    _orders(steady, 200, count=1, days=10, amount=100_000)
    refresh_stored_tiers(reference_date=REF)
    CustomerTierHistory.objects.all().delete()

    draft = _activate(super_admin, _stricter_gold_2())

    loyal.refresh_from_db()
    steady.refresh_from_db()
    assert loyal.tier_code == "BRONZE_1"
    assert steady.tier_code == "BRONZE_1"
    history = list(CustomerTierHistory.objects.all())
    assert [(row.customer_id, row.previous_tier_code, row.tier_code, row.reason) for row in history] == [
        (loyal.pk, "GOLD_2", "BRONZE_1", "activation")
    ]
    assert history[0].rule_set_id == draft.pk
    assert draft.status == TierRuleSet.STATUS_ACTIVE
    assert draft.activation_status == TierRuleSet.ACTIVATION_SUCCEEDED
    assert draft.activated_by_id == super_admin.pk
    assert TierRuleSet.objects.get(version=1).status == TierRuleSet.STATUS_ARCHIVED
    assert tier_code_for(2, 10, 0) == "BRONZE_1"
    assert tier_refresh_status()["running"] is False


@pytest.mark.django_db
def test_failed_activation_keeps_old_rules_and_tiers(super_admin):
    loyal = _customer(1)
    _orders(loyal, 100, count=2, days=10, amount=100_000)
    refresh_stored_tiers(reference_date=REF)
    history_before = CustomerTierHistory.objects.count()

    draft = save_draft(super_admin, rules=_stricter_gold_2())
    preview_draft(reference_date=REF)
    from apps.customers import tier_rule_admin

    real_write = tier_rule_admin.write_all_tiers

    def write_then_fail(*args, **kwargs):
        real_write(*args, **kwargs)
        raise RuntimeError("boom")

    assert _claim()
    with patch.object(tier_rule_admin, "write_all_tiers", side_effect=write_then_fail):
        assert run_activation(draft.pk, super_admin.pk, reference_date=REF) is False

    loyal.refresh_from_db()
    assert loyal.tier_code == "GOLD_2"
    assert CustomerTierHistory.objects.count() == history_before
    assert TierRuleSet.objects.get(version=1).status == TierRuleSet.STATUS_ACTIVE
    draft.refresh_from_db()
    assert draft.status == TierRuleSet.STATUS_DRAFT
    assert draft.activation_status == TierRuleSet.ACTIVATION_FAILED
    assert "boom" in draft.activation_error
    assert tier_refresh_status()["running"] is False


@pytest.mark.django_db
def test_activation_rejected_without_current_preview_or_while_job_runs(super_api, super_admin):
    no_draft = super_api.post("/api/customers/tier-rules/draft/activate/", {}, format="json")
    assert no_draft.status_code == 409

    save_draft(super_admin, rules=_stricter_gold_2())
    stale = super_api.post("/api/customers/tier-rules/draft/activate/", {}, format="json")
    assert stale.status_code == 409

    preview_draft(reference_date=REF)
    save_draft(super_admin, rules=_set(_rules(), "GOLD_2", "purchase_count", value=4))
    edited = super_api.post("/api/customers/tier-rules/draft/activate/", {}, format="json")
    assert edited.status_code == 409

    preview_draft(reference_date=REF)
    assert _claim()
    busy = super_api.post("/api/customers/tier-rules/draft/activate/", {}, format="json")
    assert busy.status_code == 409


@pytest.mark.django_db
def test_activation_endpoint_starts_background_job(super_api, super_admin):
    save_draft(super_admin, rules=_stricter_gold_2())
    preview_draft(reference_date=REF)
    with patch("apps.customers.tier_rule_admin.threading.Thread") as thread:
        response = super_api.post("/api/customers/tier-rules/draft/activate/", {}, format="json")
    assert response.status_code == 202
    assert thread.return_value.start.called
    state = super_api.get("/api/customers/tier-rules/")
    assert state.data["activation"] == {"running": True, "status": "running", "error": ""}
    edit = super_api.put("/api/customers/tier-rules/draft/", {}, format="json")
    assert edit.status_code == 409


# --- Writers and filters ---------------------------------------------------------------------


@pytest.mark.django_db
def test_incremental_refresh_uses_active_rules_and_writes_sync_history(super_admin):
    loyal = _customer(1)
    _orders(loyal, 100, count=2, days=10, amount=100_000)
    TierRuleSet.objects.filter(version=1).update(status=TierRuleSet.STATUS_ARCHIVED)
    TierRuleSet.objects.create(version=2, status=TierRuleSet.STATUS_ACTIVE, rules=_stricter_gold_2())

    refresh_stored_tiers([loyal.pk], reference_date=REF)
    loyal.refresh_from_db()
    assert loyal.tier_code == "BRONZE_1"
    row = CustomerTierHistory.objects.get(customer=loyal)
    assert (row.previous_tier_code, row.tier_code, row.tier_title, row.reason, row.rule_set.version) == (
        None,
        "BRONZE_1",
        "برنزی سطح ۱",
        "sync",
        2,
    )

    refresh_stored_tiers([loyal.pk], reference_date=REF)
    assert CustomerTierHistory.objects.filter(customer=loyal).count() == 1


@pytest.mark.django_db
def test_full_refresh_writes_history_with_reason():
    buyer = _customer(1)
    _orders(buyer, 100, count=1, days=10, amount=100_000)
    refresh_stored_tiers(reference_date=REF, reason="daily")
    row = CustomerTierHistory.objects.get(customer=buyer)
    assert (row.previous_tier_code, row.tier_code, row.tier_title, row.reason, row.rule_set.version) == (
        None,
        "BRONZE_1",
        "برنزی سطح ۱",
        "daily",
        1,
    )
    refresh_stored_tiers(reference_date=REF, reason="daily")
    assert CustomerTierHistory.objects.filter(customer=buyer).count() == 1


@pytest.mark.django_db
def test_list_filter_accepts_only_enabled_active_codes(auth_api, super_admin):
    buyer = _customer(1)
    _orders(buyer, 100, count=1, days=10, amount=100_000)
    refresh_stored_tiers(reference_date=REF)
    assert auth_api.get("/api/customers/?tier=BRONZE_1").data["total"] == 1

    rules = _rules()
    _tier(rules, "BRONZE_1")["enabled"] = False
    _activate(super_admin, rules)
    buyer.refresh_from_db()
    assert buyer.tier_code == "SILVER"
    assert auth_api.get("/api/customers/?tier=SILVER").data["total"] == 1
    assert auth_api.get("/api/customers/?tier=BRONZE_1").data["total"] == 1  # ignored filter → everyone


@pytest.mark.django_db
def test_operator_accounts_stay_null_after_activation(super_admin):
    desk = _customer(1, mobile=OPERATOR_MOBILE)
    InternalAccount.objects.create(customer=desk, kind="desk")  # as migration 0008 does
    _orders(desk, 100, count=5, days=5, amount=5_000_000)
    Customer.objects.filter(pk=desk.pk).update(tier_code="VIP")

    rules = _set(_rules(), "VIP", "purchase_count", value=1)
    draft = save_draft(super_admin, rules=rules)
    preview = preview_draft(reference_date=REF)
    assert all(sample["source_id"] != desk.source_id for sample in preview["samples"])
    assert _claim()
    assert run_activation(draft.pk, super_admin.pk, reference_date=REF) is True

    desk.refresh_from_db()
    assert desk.tier_code is None
    row = CustomerTierHistory.objects.get(customer=desk)
    assert (row.previous_tier_code, row.previous_tier_title, row.tier_code, row.reason) == (
        "VIP",
        "VIP",
        None,
        "activation",
    )

    refresh_stored_tiers([desk.pk], reference_date=timezone.localdate())
    desk.refresh_from_db()
    assert desk.tier_code is None


# --- Day range («از» / «تا») -----------------------------------------------------------------


def _with_day_range(low, high):
    rules = _rules()
    conditions = _tier(rules, "SILVER")["conditions"]
    conditions["days_since_last_min"] = {"enabled": low is not None, "value": low}
    conditions["days_since_last"] = {"enabled": high is not None, "value": high}
    return rules


@pytest.mark.django_db
def test_days_from_bound_filters_and_sql_matches_python():
    rules = _with_day_range(60, 90)
    assert evaluate_tier(rules, 1, 59, 0) == "BRONZE_2"
    assert evaluate_tier(rules, 1, 60, 0) == "SILVER"
    assert evaluate_tier(rules, 1, 90, 0) == "SILVER"
    grid = GRID[::5]
    assert _sql_tiers(rules, grid) == [evaluate_tier(rules, c, d, a) for c, d, a in grid]
    assert tier_summary(_tier(rules, "SILVER")) == "۱+ خرید · ۶۰ تا ۹۰ روز از آخرین خرید"
    only_low = _with_day_range(200, None)
    assert tier_summary(_tier(only_low, "SILVER")) == "۱+ خرید · حداقل ۲۰۰ روز از آخرین خرید"


def test_days_from_must_not_exceed_to():
    errors = _errors(_with_day_range(100, 90))["tiers"]
    silver_index = [tier["code"] for tier in VERSION_1_RULES["tiers"]].index("SILVER")
    assert errors[silver_index]["days_since_last"]


@pytest.mark.django_db
def test_rules_stored_without_the_from_bound_still_evaluate():
    legacy = _rules()
    for tier in legacy["tiers"]:
        tier["conditions"].pop("days_since_last_min")
    assert evaluate_tier(legacy, 1, 30, 0) == "SILVER"
    assert _sql_tiers(legacy, [(1, 30, 0), (4, 45, 10_000_000)]) == ["SILVER", "VIP"]
    assert validate_rules(legacy) == VERSION_1_RULES
