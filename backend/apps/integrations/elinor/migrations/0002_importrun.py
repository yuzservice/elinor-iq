from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("elinor", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="ImportRun",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("kind", models.CharField(default="core_historical", max_length=32)),
                ("status", models.CharField(default="running", max_length=32)),
                ("dump_path", models.CharField(blank=True, max_length=512)),
                ("started_at", models.DateTimeField(auto_now_add=True)),
                ("finished_at", models.DateTimeField(blank=True, null=True)),
                ("elapsed_seconds", models.FloatField(blank=True, null=True)),
                ("error_message", models.TextField(blank=True)),
                ("report", models.JSONField(blank=True, null=True)),
            ],
            options={"db_table": "import_runs", "ordering": ["-started_at"]},
        ),
    ]
