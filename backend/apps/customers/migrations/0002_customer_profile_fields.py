from django.db import migrations, models


def backfill_profile_fields(apps, schema_editor):
    Customer = apps.get_model("customers", "Customer")
    from apps.customers.ingest import extract_profile_fields

    for customer in Customer.objects.exclude(source_payload=None).iterator():
        fields = extract_profile_fields(customer.source_payload)
        if not fields:
            continue
        update = {}
        for key, value in fields.items():
            if key not in {
                "birth_date",
                "card_number",
                "club_level",
                "summary",
                "addresses",
                "email",
                "national_code",
                "gender",
                "first_name",
                "last_name",
                "mobile",
                "status",
                "created_at_source",
                "updated_at_source",
            }:
                continue
            current = getattr(customer, key)
            if key == "addresses":
                if value and not current:
                    update[key] = value
                continue
            if value not in (None, "") and not current:
                update[key] = value
        if update:
            Customer.objects.filter(pk=customer.pk).update(**update)


class Migration(migrations.Migration):
    dependencies = [
        ("customers", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="customer",
            name="birth_date",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="customer",
            name="card_number",
            field=models.CharField(blank=True, max_length=64),
        ),
        migrations.AddField(
            model_name="customer",
            name="club_level",
            field=models.CharField(blank=True, max_length=64),
        ),
        migrations.AddField(
            model_name="customer",
            name="summary",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="customer",
            name="addresses",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AlterField(
            model_name="customer",
            name="order_count",
            field=models.PositiveIntegerField(db_index=True, default=0),
        ),
        migrations.RunPython(backfill_profile_fields, migrations.RunPython.noop),
    ]
