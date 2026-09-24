from django.db import migrations, models


def promote_existing_superusers(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    User.objects.filter(is_superuser=True).exclude(role="super_admin").update(role="super_admin")


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0001_initial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="user",
            name="role",
            field=models.CharField(
                choices=[
                    ("super_admin", "Super admin"),
                    ("admin", "Admin"),
                    ("manager", "Manager"),
                    ("analyst", "Analyst"),
                    ("staff", "Staff"),
                ],
                default="admin",
                max_length=32,
            ),
        ),
        migrations.RunPython(promote_existing_superusers, migrations.RunPython.noop),
    ]
