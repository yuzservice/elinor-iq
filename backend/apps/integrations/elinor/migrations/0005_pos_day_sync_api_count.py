from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("elinor", "0004_pos_day_sync"),
    ]

    operations = [
        migrations.AddField(
            model_name="posdaysync",
            name="api_count",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
    ]
