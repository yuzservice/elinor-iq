from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("customers", "0004_customer_list_indexes"),
    ]

    operations = [
        migrations.AddField(
            model_name="customer",
            name="tier_code",
            field=models.CharField(blank=True, db_index=True, max_length=16, null=True),
        ),
        migrations.AddField(
            model_name="customer",
            name="tier_refreshed_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
