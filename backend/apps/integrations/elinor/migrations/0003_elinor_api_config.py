from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("elinor", "0002_importrun"),
    ]

    operations = [
        migrations.CreateModel(
            name="ElinorApiConfig",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("base_url", models.CharField(blank=True, max_length=255)),
                ("username", models.CharField(blank=True, max_length=255)),
                ("password", models.CharField(blank=True, max_length=255)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={"db_table": "elinor_api_config"},
        ),
    ]
