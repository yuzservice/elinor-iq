from django.db import migrations

# Internal accounts confirmed by the owner on 1405/08/04 after reviewing the accounts with the most invoices.
# Listed by Customer.source_id only.
STAFF_SOURCE_IDS = (6672, 6752, 21299, 67479, 1010, 419)
DESK_SOURCE_IDS = (17741, 836, 79278, 20030, 71442, 93527, 36486, 29, 2)
SEED_NOTE = "تأیید مالک — بررسی بیشترین تعداد فاکتور، ۱۴۰۵/۰۸/۰۴"


def _confirmed():
    return [(source_id, "staff") for source_id in STAFF_SOURCE_IDS] + [(source_id, "desk") for source_id in DESK_SOURCE_IDS]


def seed_confirmed_accounts(apps, schema_editor):
    Customer = apps.get_model("customers", "Customer")
    InternalAccount = apps.get_model("customers", "InternalAccount")
    customers = dict(
        Customer.objects.filter(source_id__in=[source_id for source_id, _kind in _confirmed()]).values_list("source_id", "pk")
    )
    for source_id, kind in _confirmed():
        customer_id = customers.get(source_id)
        if customer_id is None:
            continue  # not present (e.g. test databases)
        account = InternalAccount.objects.filter(customer_id=customer_id).first()
        if account is None:
            InternalAccount.objects.create(customer_id=customer_id, kind=kind, note=SEED_NOTE, is_active=True)
            continue
        # Pre-existing row (e.g. the desk row from 0008): reactivate and set the kind; keep its note and history.
        if not account.is_active or account.kind != kind:
            account.is_active = True
            account.kind = kind
            account.save(update_fields=["is_active", "kind", "updated_at"])


def remove_seeded_accounts(apps, schema_editor):
    InternalAccount = apps.get_model("customers", "InternalAccount")
    InternalAccount.objects.filter(note=SEED_NOTE, created_by__isnull=True).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("customers", "0008_internal_accounts"),
    ]

    operations = [
        migrations.RunPython(seed_confirmed_accounts, remove_seeded_accounts),
    ]
