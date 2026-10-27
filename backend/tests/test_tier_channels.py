import copy
import importlib
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

import pytest
from django.apps import apps as django_apps
from django.contrib.auth import get_user_model
from django.db import connection

from apps.customers.models import Customer, CustomerTierHistory, InternalAccount, TierRuleSet
from apps.customers.tier_rule_admin import preview_draft, save_draft
from apps.customers.tier_rules import (
    VERSION_1_RULES,
    TierRulesError,
    customer_channel,
    evaluate_tier,
    tier_case_sql,
    validate_rules,
)
from apps.customers.tiers import _fact_params, _facts_sql, metrics_for_customers, refresh_stored_tiers
from apps.sales.models import Order, PosSale, SalesLine

migration = importlib.import_module("apps.customers.migrations.0007_tier_channels")

TEHRAN = ZoneInfo("Asia/Tehran")
REF = date(2026, 6, 15)
DESK_MOBILE = "09362506974"
_ids = iter(range(60_000, 99_999))


def _at(days_before):
    return datetime.combine(REF, time(12, 0), tzinfo=TEHRAN) - timedelta(days=days_before)


def _customer(source_id, mobile=None):
    return Customer.objects.create(source_id=source_id, first_name="لیلا", last_name="کاظمی", mobile=mobile or f"0936{source_id:07d}")


def _online(customer, days, amount=1_000_000, shopino=False):
    Order.objects.create(
        source_id=next(_ids), customer=customer, status="delivered", total_amount=amount, is_shopino=shopino, created_at=_at(days)
    )


def _pos(customer, days, line=SalesLine.SARI):
    PosSale.objects.create(
        source_id=next(_ids), customer=customer, store_source_id=3, sales_line=line, type="sell", is_cancelled=False, created_at=_at(days)
    )


def _channel_rules(rules=None):
    """The channel version migration 0007 builds from `rules` (pos = same codes, online = ONLINE_ codes)."""
    base = copy.deepcopy(rules or VERSION_1_RULES)
    online = copy.deepcopy(base["tiers"])
    for tier in online:
        tier["code"] = f"ONLINE_{tier['code']}"
    return {"channels": {"online": {"tiers": online}, "pos": {"tiers": base["tiers"]}}}


def _activate_channels(rules=None):
    TierRuleSet.objects.filter(status=TierRuleSet.STATUS_ACTIVE).update(status=TierRuleSet.STATUS_ARCHIVED)
    return TierRuleSet.objects.create(version=50, status=TierRuleSet.STATUS_ACTIVE, rules=rules or _channel_rules())


def _facts_rows(rules):
    facts_sql, _exclusion = _facts_sql()
    case_sql, case_params = tier_case_sql(rules)
    with connection.cursor() as cursor:
        cursor.execute(
            f"{facts_sql} SELECT customer_id, channel, online_count, pos_count, purchase_count, "
            f"days_since_last_purchase, lifetime_purchase_amount, {case_sql} FROM facts ORDER BY customer_id",
            _fact_params(REF) + case_params,
        )
        return {row[0]: row[1:] for row in cursor.fetchall()}


@pytest.fixture
def super_admin(db):
    return get_user_model().objects.create_user(username="root", password="secret-pass", role="super_admin")


# --- Channel assignment ----------------------------------------------------------------------


def test_customer_channel_rule():
    assert customer_channel(1, 0) == "online"
    assert customer_channel(0, 1) == "pos"
    assert customer_channel(3, 2) == "online"
    assert customer_channel(2, 2) == "pos"  # tie -> in-store
    assert customer_channel(0, 0) is None


@pytest.mark.django_db
def test_channel_in_facts_and_metrics():
    online_only = _customer(1)
    _online(online_only, 10)
    pos_only = _customer(2)
    _pos(pos_only, 10)
    mostly_online = _customer(3)
    for days in (10, 20, 30):
        _online(mostly_online, days)
    for days in (40, 50):
        _pos(mostly_online, days)
    tie = _customer(4)
    for days in (10, 20):
        _online(tie, days)
        _pos(tie, days + 5)
    shopino = _customer(5)
    _online(shopino, 10, shopino=True)
    _online(shopino, 20, shopino=True)
    _pos(shopino, 30)
    desk = _customer(6, mobile=DESK_MOBILE)
    InternalAccount.objects.create(customer=desk, kind="desk")  # main excludes internal accounts by id
    _online(desk, 5)
    nobody = _customer(7)

    rows = _facts_rows(VERSION_1_RULES)
    expected = {online_only: "online", pos_only: "pos", mostly_online: "online", tie: "pos", shopino: "online"}
    for customer, channel in expected.items():
        assert rows[customer.pk][0] == channel, customer.source_id
    assert rows[mostly_online.pk][1:3] == (3, 2)
    assert rows[nobody.pk][0] is None
    assert desk.pk not in rows  # desk account excluded from the facts

    metrics = metrics_for_customers([c.pk for c in expected] + [desk.pk], REF, rules=_channel_rules())
    for customer, channel in expected.items():
        assert metrics[customer.pk]["channel"] == channel
        assert metrics[customer.pk]["tier_channel"] == channel
    assert metrics[desk.pk]["tier_code"] is None and metrics[desk.pk]["tier_channel"] is None


# --- Equivalence of the migration draft ------------------------------------------------------


@pytest.mark.django_db
def test_migration_draft_is_equivalent_to_the_current_tiers():
    patterns = [
        (6, 0, 20),  # online, VIP-like volume
        (0, 5, 60),
        (2, 3, 100),
        (1, 1, 400),
        (4, 0, 200),
        (0, 1, 10),
        (3, 3, 35),
    ]
    customers = []
    for index, (online, pos, days) in enumerate(patterns, start=1):
        customer = _customer(index)
        for n in range(online):
            _online(customer, days + n, amount=3_000_000)
        for n in range(pos):
            _pos(customer, days + n + 1)
        customers.append(customer)
    refresh_stored_tiers(reference_date=REF)

    migration.create_channel_draft(django_apps, None)
    migration.create_channel_draft(django_apps, None)  # idempotent: one draft only
    draft = TierRuleSet.objects.get(status=TierRuleSet.STATUS_DRAFT)
    rules = validate_rules(draft.rules)
    assert [t["code"] for t in rules["channels"]["pos"]["tiers"]] == [t["code"] for t in VERSION_1_RULES["tiers"]]
    assert all(t["code"].startswith("ONLINE_") for t in rules["channels"]["online"]["tiers"])

    rows = _facts_rows(rules)
    stored = dict(Customer.objects.values_list("pk", "tier_code"))
    for customer in customers:
        channel, online, pos, count, days, amount, sql_code = rows[customer.pk]
        python_code = evaluate_tier(rules, count, days, amount, channel=channel)
        assert sql_code == python_code
        assert (sql_code or "").removeprefix("ONLINE_") == (stored[customer.pk] or "")
        assert sql_code.startswith("ONLINE_") == (channel == "online")

    preview = preview_draft(reference_date=REF)
    assert {row["channel"]: row["customers"] for row in preview["channels"]} == {"online": 2, "pos": 5}  # ties -> pos
    moves = {(t["from"], t["to"]) for t in preview["transitions"]}
    # Level never changes: online customers get the ONLINE_ twin, in-store customers keep the code (channel set to pos).
    assert all(to in (source, f"ONLINE_{source}") for source, to in moves)
    assert all(t["channel_move"] for t in preview["transitions"])


@pytest.mark.django_db
def test_migration_maps_custom_codes_to_new_custom_codes():
    _customer(1)
    rules = copy.deepcopy(VERSION_1_RULES)
    rules["tiers"].append({**copy.deepcopy(rules["tiers"][-1]), "code": "CUSTOM_4", "title": "سطح ویژه"})
    TierRuleSet.objects.filter(version=1).update(rules=rules)
    migration.create_channel_draft(django_apps, None)
    draft = TierRuleSet.objects.get(status=TierRuleSet.STATUS_DRAFT).rules
    assert draft["channels"]["pos"]["tiers"][-1]["code"] == "CUSTOM_4"
    assert draft["channels"]["online"]["tiers"][-1]["code"] == "CUSTOM_5"
    validate_rules(draft)


@pytest.mark.django_db
def test_no_draft_when_one_exists_or_database_is_empty(super_admin):
    migration.create_channel_draft(django_apps, None)
    assert not TierRuleSet.objects.filter(status=TierRuleSet.STATUS_DRAFT).exists()  # no customers
    _customer(1)
    save_draft(super_admin, rules=VERSION_1_RULES)
    migration.create_channel_draft(django_apps, None)
    assert TierRuleSet.objects.get(status=TierRuleSet.STATUS_DRAFT).rules == VERSION_1_RULES


# --- Re-evaluation and history ---------------------------------------------------------------


@pytest.mark.django_db
def test_channel_switch_on_refresh_writes_history():
    rule_set = _activate_channels()
    customer = _customer(1)
    _pos(customer, 20)
    _pos(customer, 25)
    refresh_stored_tiers(reference_date=REF, reason="daily")
    customer.refresh_from_db()
    assert (customer.tier_code, customer.tier_channel) == ("GOLD_2", "pos")

    for days in (5, 6, 7):
        _online(customer, days)
    refresh_stored_tiers(reference_date=REF, reason="daily")
    customer.refresh_from_db()
    assert customer.tier_channel == "online"
    assert customer.tier_code == "ONLINE_GOLD_2"
    row = CustomerTierHistory.objects.filter(customer=customer).order_by("-pk").first()
    assert (row.previous_tier_code, row.previous_channel, row.tier_code, row.channel, row.reason, row.rule_set_id) == (
        "GOLD_2",
        "pos",
        "ONLINE_GOLD_2",
        "online",
        "daily",
        rule_set.pk,
    )


@pytest.mark.django_db
def test_channel_only_change_counts_and_sync_path_writes_history():
    rules = _channel_rules()
    rules["channels"]["online"]["tiers"] = copy.deepcopy(VERSION_1_RULES["tiers"])
    for tier in rules["channels"]["online"]["tiers"]:
        tier["code"] = f"ONLINE_{tier['code']}"
    _activate_channels(rules)
    customer = _customer(1)
    _pos(customer, 10)
    refresh_stored_tiers([customer.pk], reference_date=REF)
    customer.refresh_from_db()
    assert (customer.tier_code, customer.tier_channel) == ("BRONZE_1", "pos")
    Customer.objects.filter(pk=customer.pk).update(tier_channel="online")  # same code, other channel

    refresh_stored_tiers([customer.pk], reference_date=REF)
    customer.refresh_from_db()
    assert customer.tier_channel == "pos"
    row = CustomerTierHistory.objects.filter(customer=customer, reason="sync").order_by("-pk").first()
    assert (row.previous_tier_code, row.previous_channel, row.tier_code, row.channel) == ("BRONZE_1", "online", "BRONZE_1", "pos")


@pytest.mark.django_db
def test_legacy_rules_leave_the_channel_empty():
    customer = _customer(1)
    _online(customer, 10)
    refresh_stored_tiers(reference_date=REF)
    customer.refresh_from_db()
    assert (customer.tier_code, customer.tier_channel) == ("BRONZE_1", None)


# --- Validation, warnings, API ---------------------------------------------------------------


def _errors(rules):
    with pytest.raises(TierRulesError) as caught:
        validate_rules(rules)
    return caught.value.errors


def test_channel_validation():
    rules = _channel_rules()
    rules["channels"]["online"]["tiers"][0]["code"] = "VIP"  # also used by pos
    assert _errors(rules)["channels"]["pos"]["tiers"][0]["code"]  # reported on the later channel

    rules = _channel_rules()
    rules["channels"]["pos"]["tiers"][1]["title"] = "vip"
    assert _errors(rules)["channels"]["pos"]["tiers"][1]["title"]
    validate_rules(_channel_rules())  # the same titles in both channels are fine

    rules = _channel_rules()
    for tier in rules["channels"]["online"]["tiers"]:
        tier["enabled"] = False
    assert _errors(rules)["channels"]["online"]["_"]

    rules = _channel_rules()
    extra = rules["channels"]["pos"]["tiers"][-1]
    rules["channels"]["pos"]["tiers"] += [{**copy.deepcopy(extra), "code": f"CUSTOM_{n}", "title": f"سطح {n}"} for n in range(5)]
    assert "۱۲" in _errors(rules)["channels"]["pos"]["_"] or "12" in _errors(rules)["channels"]["pos"]["_"]

    assert _errors({"channels": {"pos": {"tiers": VERSION_1_RULES["tiers"]}}})["_"]


@pytest.mark.django_db
def test_campaign_warnings_for_channel_drafts(super_admin):
    vip = _customer(1)
    for days in range(5, 10):
        _online(vip, days, amount=3_000_000)
    silver = _customer(2)
    _pos(silver, 60)
    refresh_stored_tiers(reference_date=REF)
    vip.refresh_from_db()
    assert vip.tier_code == "VIP"

    rules = _channel_rules()
    rules["channels"]["pos"]["tiers"] = [t for t in rules["channels"]["pos"]["tiers"] if t["code"] != "SILVER"]
    save_draft(super_admin, rules=rules)
    warnings = preview_draft(reference_date=REF)["warnings"]
    kinds = {(w["kind"], w["tier_code"]) for w in warnings}
    assert ("campaign", "SILVER") in kinds
    assert ("held", "SILVER") in kinds
    moved = next(w for w in warnings if w["kind"] == "campaign_channel")
    assert moved["count"] == 2  # VIP -> ONLINE_VIP and SILVER -> another code


@pytest.mark.django_db
def test_api_groups_by_channel_and_writes_stay_super_admin(api, auth_api, super_admin):
    _activate_channels()
    groups = auth_api.get("/api/customers/tiers/").data["results"]
    assert [(g["channel"], g["channel_label"]) for g in groups] == [("online", "اینترنتی"), ("pos", "حضوری")]
    assert groups[0]["tiers"][0]["code"] == "ONLINE_VIP" and groups[1]["tiers"][0]["code"] == "VIP"

    assert auth_api.put("/api/customers/tier-rules/draft/", {"rules": _channel_rules()}, format="json").status_code == 403
    api.force_login(super_admin)
    rules = _channel_rules()
    rules["channels"]["online"]["tiers"].append(
        {"title": "سطح تازه", "enabled": True, "conditions": {"purchase_count": {"enabled": True, "operator": "gte", "value": 1}}}
    )
    created = api.put("/api/customers/tier-rules/draft/", {"rules": rules}, format="json")
    assert created.status_code == 200
    assert created.data["draft"]["rules"]["channels"]["online"]["tiers"][-1]["code"] == "CUSTOM_1"


@pytest.mark.django_db
def test_list_payload_and_channel_filter(auth_api):
    _activate_channels()
    online = _customer(1)
    _online(online, 10)
    store = _customer(2)
    _pos(store, 10)
    refresh_stored_tiers(reference_date=REF)

    rows = {row["id"]: row for row in auth_api.get("/api/customers/").data["results"]}
    assert (rows[1]["tier_channel"], rows[1]["tier_channel_label"]) == ("online", "اینترنتی")
    assert rows[2]["tier_channel_label"] == "حضوری"
    filtered = auth_api.get("/api/customers/?tier_channel=pos").data["results"]
    assert [row["id"] for row in filtered] == [2]
    detail = auth_api.get("/api/customers/1/").data
    assert (detail["tier_code"], detail["tier_channel"]) == ("ONLINE_BRONZE_1", "online")
