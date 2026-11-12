"""Home summary on synthetic data: real figures only, «—» without comparison history, each attention rule and its roles."""

from datetime import datetime, time, timedelta
from itertools import count

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from apps.calls.models import CallProgram, CallTask
from apps.core import home
from apps.customers.models import Customer, CustomerTierHistory, InternalAccount
from apps.integrations.elinor.models import SyncRun
from apps.products.models import Product, ProductStatusChange
from apps.sales.models import Order, PosSale, PosSaleItem, SalesLine, SalesTarget
from apps.sales.targets import progress

_ids = count(5000)
NOW = timezone.make_aware(datetime(2026, 11, 12, 15, 30))


def _user(role, name=None):
    return get_user_model().objects.create_user(username=name or role, password="secret-pass", role=role)


def _customer():
    return Customer.objects.create(source_id=next(_ids), first_name="الف", last_name="ب", mobile=f"0912{next(_ids):07d}")


def _order(customer, amount, at, status="delivered"):
    return Order.objects.create(source_id=next(_ids), customer=customer, status=status, total_amount=amount, created_at=at)


def _pos(customer, amount, at, line=SalesLine.SARI, quantity=1):
    sale = PosSale.objects.create(source_id=next(_ids), customer=customer, store_source_id=3, sales_line=line, type="sell", created_at=at)
    PosSaleItem.objects.create(source_id=next(_ids), pos_sale=sale, quantity=quantity, amount=amount, type="sell")
    return sale


@pytest.mark.django_db
def test_period_figures_from_semantics_and_internal_accounts_not_buyers():
    a, b, desk = _customer(), _customer(), _customer()
    InternalAccount.objects.create(customer=desk, kind="desk", is_active=True)
    day = NOW - timedelta(days=2)
    _order(a, 1_000_000, day)
    _order(a, 9_999_999, day, status="canceled")  # not a sale, not an invoice
    _order(desk, 500_000, day)  # a sale and an invoice, but not a buyer
    _pos(b, 200_000, day, quantity=3)
    data = home.summary({"period": "7"}, now=NOW)
    cards = data["cards"]
    assert cards["sales"]["value"] == 1_000_000 + 500_000 + 600_000
    assert cards["invoices"]["value"] == 3 and cards["invoices"]["online"] == 2 and cards["invoices"]["in_store"] == 1
    assert cards["buyers"]["value"] == 2
    assert cards["basket"]["value"] == pytest.approx(2_100_000 / 3)
    assert cards["sales"]["online_share"] == pytest.approx(1_500_000 / 2_100_000)
    assert cards["sales"]["change"] is None  # nothing in the previous 7 days
    branches = {b["line"]: b for b in data["branches"]}
    assert branches["SARI"]["sales"] == 600_000 and branches["SARI"]["invoices"] == 1
    assert sum(p["sales"] for p in data["trend"]["current"]) == 2_100_000 and len(data["trend"]["current"]) == 7


@pytest.mark.django_db
def test_no_comparison_before_in_store_history_and_no_fake_numbers():
    empty = home.summary({"period": "custom", "from": "2025-06-01", "to": "2025-06-30"}, now=NOW)
    assert empty["range"]["comparable"] is False and empty["trend"]["compare"] == []
    assert all(card["change"] is None for card in empty["cards"].values())
    assert empty["cards"]["sales"]["value"] == 0 and empty["cards"]["basket"]["value"] is None
    assert empty["today"]["sales"] == 0 and empty["today"]["sales_change"] is None
    assert not {"metric_cards", "recent_orders", "needs_attention", "metrics"} & set(empty)


@pytest.mark.django_db
def test_today_vs_same_weekday_last_week_and_last_hour():
    c = _customer()
    _order(c, 300, NOW - timedelta(minutes=20))
    _order(c, 100, NOW.replace(hour=9))
    _order(c, 200, NOW.replace(hour=9) - timedelta(days=7))
    _order(c, 999, NOW.replace(hour=18) - timedelta(days=7))  # later in the day than now: not compared
    today = home.summary({"period": "today"}, now=NOW)["today"]
    assert today["sales"] == 400 and today["last_hour_sales"] == 300
    assert today["sales_change"] == pytest.approx(100) and today["compare_day"] == (NOW - timedelta(days=7)).date()


def _facts(**over):
    base = {"drivers": {"count": 0, "names": []}, "calls": {"overdue": 0, "escalations": 0},
            "tier_drop": {"count": 0, "since": "2026-10-13"}, "sync_failed": None}
    return {**base, **over}


@pytest.mark.django_db
def test_attention_hidden_when_empty_and_roles():
    analyst, manager, boss = _user("analyst"), _user("manager"), _user("super_admin")
    assert home.attention(analyst, targets=None, facts=_facts()) == []
    facts = _facts(calls={"overdue": 4, "escalations": 1}, sync_failed={"started_at": NOW, "kind": "hourly"})
    assert [i["kind"] for i in home.attention(analyst, facts=facts)] == []  # neither calls nor sync for an analyst
    assert [i["kind"] for i in home.attention(manager, facts=facts)] == ["calls"]
    assert [i["kind"] for i in home.attention(boss, facts=facts)] == ["calls", "sync_failed"]


@pytest.mark.django_db
def test_attention_target_behind_links_by_role():
    SalesTarget.objects.create(year=1405, month=8, sales_line="ONLINE", amount=3_000_000)
    targets = progress("month", now=timezone.make_aware(datetime(2026, 11, 12, 12)), actuals={"ONLINE": 100, "SARI": 0, "GORGAN": 0, "CAPRI": 0})
    viewer, editor = _user("analyst"), _user("admin")
    item = home.attention(viewer, targets=targets, facts=_facts())[0]
    assert item["kind"] == "target" and item["lines"] == ["ONLINE"] and item["link"] == "/#home-targets"
    assert item["required_daily"] == pytest.approx((3_000_000 - 100) / targets["remaining_days"])
    assert home.attention(editor, targets=targets, facts=_facts())[0]["link"] == "/settings#targets"


@pytest.mark.django_db
def test_attention_facts_each_rule():
    p = Product.objects.create(source_id=1, title="مانتو ۱۰۷ | الینور")
    ProductStatusChange.objects.create(product_id=p.pk, old_status="normal", new_status="driver", day=NOW.date() - timedelta(days=2))
    ProductStatusChange.objects.create(product_id=p.pk, old_status="normal", new_status="driver", day=NOW.date() - timedelta(days=20))
    agent, c = _user("sales_agent"), _customer()
    program = CallProgram.objects.create(name="p")
    CallTask.objects.create(program=program, customer=c, assignee=agent, due_at=NOW - timedelta(days=1))
    CallTask.objects.create(program=program, customer=_customer(), assignee=agent, due_at=NOW + timedelta(days=1))
    CustomerTierHistory.objects.create(customer=c, previous_tier_code="VIP", tier_code="BRONZE_1", reason="daily", changed_at=NOW - timedelta(days=3))
    CustomerTierHistory.objects.create(customer=_customer(), previous_tier_code="VIP", tier_code="BRONZE_1", reason="activation", changed_at=NOW - timedelta(days=3))
    SyncRun.objects.create(kind="hourly", status=SyncRun.STATUS_SUCCESS, finished_at=NOW - timedelta(hours=3))
    failed = SyncRun.objects.create(kind="hourly", status=SyncRun.STATUS_FAILED)
    SyncRun.objects.filter(pk=failed.pk).update(started_at=NOW - timedelta(hours=1))  # failed after the last success
    facts = home.attention_facts(now=NOW)
    assert facts["drivers"] == {"count": 1, "names": ["مانتو ۱۰۷"]}
    assert facts["calls"] == {"overdue": 1, "escalations": 0}
    assert facts["tier_drop"]["count"] == 1  # the activation row is not customer behaviour
    assert facts["sync_failed"]["kind"] == "hourly"
    SyncRun.objects.filter(pk=failed.pk).update(started_at=NOW - timedelta(hours=5))  # an older failure was followed by a success
    assert home.attention_facts(now=NOW)["sync_failed"] is None


@pytest.mark.django_db
def test_summary_endpoint_role_filtered_and_bad_range():
    analyst = _user("analyst")
    client = APIClient(HTTP_HOST="localhost")
    client.force_authenticate(analyst)
    data = client.get("/api/home/summary/?period=today").json()
    assert {"range", "sync", "today", "trend", "branches", "cards", "attention"} <= set(data)
    assert not any(item["kind"] in ("calls", "sync_failed") for item in data["attention"])
    assert client.get("/api/home/summary/?period=custom&from=bad&to=2026-01-01").status_code == 400
    agent = APIClient(HTTP_HOST="localhost")
    agent.force_login(_user("sales_agent", "agent2"))  # the role middleware reads the session user
    assert agent.get("/api/home/summary/").status_code == 403


def _drop(customer, previous, new, reason="daily", days=3, previous_channel=None, channel=None):
    CustomerTierHistory.objects.create(customer=customer, previous_tier_code=previous, tier_code=new, reason=reason,
                                       previous_channel=previous_channel, channel=channel, changed_at=NOW - timedelta(days=days))


@pytest.mark.django_db
def test_tier_drop_item_counts_only_drops_from_top_tiers(settings):
    settings.HOME_TIER_DROP_TOP_N = 3
    top = home.top_tiers()
    assert [code for code, _ in top] == ["VIP", "DIAMOND", "GOLD_1"]  # the active (default) rules, by rank
    vip, gold1, gold2, old, activated, desk, gone = (_customer() for _ in range(7))
    _drop(vip, "VIP", "BRONZE_1")
    _drop(gold1, "GOLD_1", "GOLD_2")
    _drop(gold2, "GOLD_2", "SILVER")  # not a top tier
    _drop(old, "VIP", "SILVER", days=45)  # outside 30 days
    _drop(activated, "DIAMOND", "BRONZE_1", reason="activation")  # rule change, not behaviour
    _drop(desk, "VIP", "BRONZE_1")
    InternalAccount.objects.create(customer=desk, kind="desk", is_active=True)
    _drop(gone, "VIP", None)  # to no tier: not a drop
    facts = home.attention_facts(now=NOW)
    assert facts["tier_drop"]["count"] == 2 and facts["tier_drop"]["from"] == "VIP,DIAMOND,GOLD_1"
    assert facts["tier_drop"]["titles"] == [title for _, title in top]
    settings.HOME_TIER_DROP_TOP_N = 1
    assert home.attention_facts(now=NOW)["tier_drop"]["count"] == 1  # VIP only


@pytest.mark.django_db
def test_tier_drop_link_returns_the_counted_customers(settings, auth_api):
    from urllib.parse import parse_qs, urlsplit

    a, b, c = _customer(), _customer(), _customer()
    _drop(a, "VIP", "BRONZE_1")
    _drop(b, "DIAMOND", "GOLD_2")
    _drop(c, "SILVER", "BRONZE_2")
    boss = _user("super_admin")
    item = next(i for i in home.attention(boss, facts=home.attention_facts(now=timezone.now())) if i["kind"] == "tier_drop")
    query = {key: values[0] for key, values in parse_qs(urlsplit(item["link"]).query).items()}
    ids = {row["id"] for row in auth_api.get("/api/customers/", query).data["results"]}
    assert item["count"] == 2 and ids == {a.source_id, b.source_id}
    full = auth_api.get("/api/customers/", {"tier_change": "down"}).data
    assert {row["id"] for row in full["results"]} == {a.source_id, b.source_id, c.source_id}  # the full filter is unchanged


@pytest.mark.django_db
def test_top_tiers_per_channel(settings, monkeypatch):
    from apps.customers import tier_rules

    lists = [("online", [{"code": "ON_VIP", "title": "VIP آنلاین", "enabled": True}, {"code": "ON_OFF", "title": "x", "enabled": False},
                         {"code": "ON_GOLD", "title": "طلایی آنلاین", "enabled": True}, {"code": "ON_SILVER", "title": "نقره‌ای", "enabled": True}]),
             ("store", [{"code": "ST_VIP", "title": "VIP حضوری", "enabled": True}, {"code": "ST_GOLD", "title": "طلایی حضوری", "enabled": True}])]
    monkeypatch.setattr(tier_rules, "tier_lists", lambda rules: lists)
    settings.HOME_TIER_DROP_TOP_N = 2
    assert [code for code, _ in home.top_tiers()] == ["ON_VIP", "ON_GOLD", "ST_VIP", "ST_GOLD"]  # disabled skipped, per channel
