from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("elinor", "0003_elinor_api_config"),
    ]

    operations = [
        migrations.CreateModel(
            name="PosDaySync",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("day", models.DateField()),
                ("branch", models.CharField(max_length=16)),
                ("status", models.CharField(default="partial", max_length=16)),
                ("next_page", models.PositiveIntegerField(default=1)),
                ("sales_upserted", models.PositiveIntegerField(default=0)),
                ("completed_at", models.DateTimeField(blank=True, null=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={"db_table": "pos_day_syncs"},
        ),
        migrations.AddConstraint(
            model_name="posdaysync",
            constraint=models.UniqueConstraint(fields=("day", "branch"), name="pos_day_sync_day_branch"),
        ),
    ]
