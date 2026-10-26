import copy
import re

from django.db import migrations, models

# Frozen copies (this migration must not import app code that may change later).
CHANNELS = ("online", "pos")
ONLINE_CODE_PREFIX = "ONLINE_"
BASE_TIER_CODES = ("VIP", "DIAMOND", "GOLD_1", "GOLD_2", "BRONZE_1", "SILVER", "BRONZE_2", "BRONZE_3")
CODE_SEQUENCE_KEY = "customer_tier_custom_code"
CUSTOM_CODE = re.compile(r"^CUSTOM_(\d+)$")
DRAFT_NOTE = "پیش‌نویس سطح‌بندی کانالی (اینترنتی / حضوری) از روی نسخه فعال — migration 0007_tier_channels"


def _tiers_of(rules):
    if "channels" in rules:
        return [tier for channel in CHANNELS for tier in rules["channels"][channel]["tiers"]]
    return list(rules.get("tiers", []))


def create_channel_draft(apps, schema_editor):
    """A draft channel version from the active one: pos = same tiers, online = ONLINE_ codes. Never activated here."""
    TierRuleSet = apps.get_model("customers", "TierRuleSet")
    CustomerTierHistory = apps.get_model("customers", "CustomerTierHistory")
    SyncCursor = apps.get_model("elinor", "SyncCursor")
    Customer = apps.get_model("customers", "Customer")
    if TierRuleSet.objects.filter(status="draft").exists():
        return
    # Empty databases (fresh test databases) get no draft; real data always has customers.
    if not Customer.objects.exists():
        return
    active = TierRuleSet.objects.filter(status="active").first()
    if active is None or "channels" in (active.rules or {}):
        return

    issued = set()
    for rules in TierRuleSet.objects.values_list("rules", flat=True):
        issued.update(tier.get("code") for tier in _tiers_of(rules or {}))
    issued.update(CustomerTierHistory.objects.values_list("tier_code", flat=True).distinct())
    cursor, _created = SyncCursor.objects.get_or_create(key=CODE_SEQUENCE_KEY, defaults={"value": {"last": 0}})
    last = int((cursor.value or {}).get("last") or 0)
    for code in issued:
        match = CUSTOM_CODE.match(code or "")
        if match:
            last = max(last, int(match.group(1)))

    pos = copy.deepcopy(active.rules["tiers"])
    online = []
    for tier in copy.deepcopy(active.rules["tiers"]):
        if CUSTOM_CODE.match(tier["code"]) or tier["code"] not in BASE_TIER_CODES:
            last += 1
            tier["code"] = f"CUSTOM_{last}"
        else:
            tier["code"] = f"{ONLINE_CODE_PREFIX}{tier['code']}"
        online.append(tier)
    cursor.value = {**(cursor.value or {}), "last": last}
    cursor.save(update_fields=["value", "updated_at"])

    latest = TierRuleSet.objects.order_by("-version").values_list("version", flat=True).first() or 0
    TierRuleSet.objects.create(
        version=latest + 1,
        status="draft",
        rules={"channels": {"online": {"tiers": online}, "pos": {"tiers": pos}}},
        note=DRAFT_NOTE,
    )


def remove_channel_draft(apps, schema_editor):
    TierRuleSet = apps.get_model("customers", "TierRuleSet")
    TierRuleSet.objects.filter(status="draft", note=DRAFT_NOTE).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("customers", "0006_tier_rule_sets"),
        ("elinor", "0005_pos_day_sync_api_count"),
    ]

    operations = [
        migrations.AddField(
            model_name="customer",
            name="tier_channel",
            field=models.CharField(blank=True, db_index=True, max_length=8, null=True),
        ),
        migrations.AddField(
            model_name="customertierhistory",
            name="previous_channel",
            field=models.CharField(blank=True, max_length=8, null=True),
        ),
        migrations.AddField(
            model_name="customertierhistory",
            name="channel",
            field=models.CharField(blank=True, max_length=8, null=True),
        ),
        migrations.RunPython(create_channel_draft, remove_channel_draft),
    ]
