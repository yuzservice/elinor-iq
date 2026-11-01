from django.db import migrations


def seed(apps, schema_editor):
    CallTag = apps.get_model("calls", "CallTag")
    CallSettings = apps.get_model("calls", "CallSettings")
    CallSettings.objects.get_or_create(pk=1)
    CallTag.objects.get_or_create(
        title="فرصت فروش", defaults={"color": "#34d399", "needs_action": True, "open_until_purchase": True}
    )
    CallTag.objects.get_or_create(title="نارضایتی", defaults={"color": "#fb7185", "needs_action": True})


class Migration(migrations.Migration):
    dependencies = [("calls", "0001_initial")]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
