"""Joins the development line (RFM, internal accounts) with channel-based tiers released on production."""

from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("customers", "0007_tier_channels"),
        ("customers", "0009_seed_confirmed_internal_accounts"),
    ]

    operations = []
