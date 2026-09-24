from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("customers", "0003_core_historical_lookups"),
    ]

    operations = [
        migrations.AddIndex(
            model_name="customer",
            index=models.Index(fields=["-last_order_at", "-source_id"], name="customers_last_src_idx"),
        ),
    ]
