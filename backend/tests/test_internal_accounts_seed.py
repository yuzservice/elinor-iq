import importlib

import pytest
from django.apps import apps as django_apps

from apps.customers.models import Customer, InternalAccount

seed = importlib.import_module("apps.customers.migrations.0009_seed_internal_accounts")


def _customer(source_id):
    return Customer.objects.create(source_id=source_id, first_name="الف", last_name="ب", mobile=f"0938{source_id:07d}")


@pytest.mark.django_db
def test_seed_is_idempotent_skips_missing_and_keeps_existing_rows():
    desk_836 = _customer(836)
    existing = InternalAccount.objects.create(customer=desk_836, kind="desk", note="از migration 0008")
    staff_6672 = _customer(6672)
    inactive_419 = _customer(419)
    old_419 = InternalAccount.objects.create(customer=inactive_419, kind="desk", note="قبلی", is_active=False)

    seed.seed_confirmed_accounts(django_apps, None)
    seed.seed_confirmed_accounts(django_apps, None)

    rows = {row.customer_id: row for row in InternalAccount.objects.all()}
    assert len(rows) == 3  # every other listed source_id is missing here and skipped
    assert InternalAccount.objects.filter(customer=desk_836).count() == 1
    assert (rows[desk_836.pk].kind, rows[desk_836.pk].note, rows[desk_836.pk].is_active) == ("desk", existing.note, True)
    assert (rows[staff_6672.pk].kind, rows[staff_6672.pk].note) == ("staff", seed.SEED_NOTE)
    assert rows[staff_6672.pk].created_by_id is None
    assert (rows[inactive_419.pk].kind, rows[inactive_419.pk].is_active, rows[inactive_419.pk].note) == ("staff", True, old_419.note)

    seed.remove_seeded_accounts(django_apps, None)
    remaining = set(InternalAccount.objects.values_list("customer_id", flat=True))
    assert remaining == {desk_836.pk, inactive_419.pk}



def test_seed_lists_the_15_confirmed_accounts():
    kinds = [kind for _source_id, kind in seed._confirmed()]
    assert len(set(source_id for source_id, _kind in seed._confirmed())) == 15
    assert (kinds.count("staff"), kinds.count("desk")) == (6, 9)
