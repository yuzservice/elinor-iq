from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("sales", "0002_core_historical_pos"),
    ]

    operations = [
        migrations.RenameIndex(
            model_name="possale",
            new_name="pos_sales_sales_l_d262b1_idx",
            old_name="pos_sales_sales_l_idx",
        ),
        migrations.RenameIndex(
            model_name="possale",
            new_name="pos_sales_type_e11ac9_idx",
            old_name="pos_sales_type_idx",
        ),
        migrations.RemoveIndex(
            model_name="possale",
            name="pos_sales_sales_l_d262b1_idx",
        ),
        migrations.RemoveIndex(
            model_name="possale",
            name="pos_sales_type_e11ac9_idx",
        ),
    ]
