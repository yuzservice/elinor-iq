import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("customers", "0003_core_historical_lookups"),
        ("products", "0002_core_historical_catalog"),
        ("sales", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="order",
            name="receiver_first_name",
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name="order",
            name="receiver_last_name",
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name="order",
            name="receiver_city",
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name="order",
            name="receiver_province",
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name="order",
            name="items_quantity",
            field=models.IntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="order",
            name="is_digify",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="order",
            name="shipping_title",
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name="order",
            name="canceled_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="order",
            name="updated_at_source",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.CreateModel(
            name="Store",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("source_id", models.BigIntegerField(unique=True)),
                ("label", models.CharField(max_length=255)),
                ("is_main", models.BooleanField(default=False)),
                ("address", models.TextField(blank=True)),
                ("mobile", models.CharField(blank=True, max_length=64)),
            ],
            options={"db_table": "stores", "ordering": ["source_id"]},
        ),
        migrations.CreateModel(
            name="PosSale",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("source_id", models.BigIntegerField(unique=True)),
                ("store_source_id", models.IntegerField(db_index=True)),
                ("sales_line", models.CharField(db_index=True, max_length=16)),
                ("type", models.CharField(db_index=True, max_length=16)),
                ("confirmed", models.CharField(blank=True, max_length=32)),
                ("discount_amount", models.BigIntegerField(default=0)),
                ("cash_amount", models.BigIntegerField(default=0)),
                ("card_by_card_amount", models.BigIntegerField(default=0)),
                ("from_wallet_amount", models.BigIntegerField(default=0)),
                ("digipay_cashier_amount", models.BigIntegerField(default=0)),
                ("snappay_cashier_amount", models.BigIntegerField(default=0)),
                ("tracking_code", models.CharField(blank=True, max_length=255)),
                ("transaction_id", models.BigIntegerField(blank=True, null=True)),
                ("is_cancelled", models.BooleanField(default=False)),
                ("deleted_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(db_index=True)),
                ("updated_at_source", models.DateTimeField(blank=True, null=True)),
                (
                    "customer",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="pos_sales",
                        to="customers.customer",
                    ),
                ),
                (
                    "store",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="pos_sales",
                        to="sales.store",
                    ),
                ),
            ],
            options={"db_table": "pos_sales", "ordering": ["-created_at"]},
        ),
        migrations.AddIndex(
            model_name="possale",
            index=models.Index(fields=["sales_line", "created_at"], name="pos_sales_sales_l_idx"),
        ),
        migrations.AddIndex(
            model_name="possale",
            index=models.Index(fields=["type"], name="pos_sales_type_idx"),
        ),
        migrations.CreateModel(
            name="PosSaleItem",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("source_id", models.BigIntegerField(unique=True)),
                ("product_source_id", models.BigIntegerField(blank=True, null=True)),
                ("variant_source_id", models.BigIntegerField(blank=True, null=True)),
                ("quantity", models.IntegerField(default=1)),
                ("amount", models.BigIntegerField(default=0)),
                ("discount_amount", models.BigIntegerField(default=0)),
                ("real_amount", models.BigIntegerField(blank=True, null=True)),
                ("type", models.CharField(db_index=True, max_length=16)),
                ("store_source_id", models.IntegerField(blank=True, null=True)),
                ("reference_item_source_id", models.BigIntegerField(blank=True, null=True)),
                ("deleted_at", models.DateTimeField(blank=True, null=True)),
                ("created_at_source", models.DateTimeField(blank=True, null=True)),
                (
                    "pos_sale",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="items",
                        to="sales.possale",
                    ),
                ),
                (
                    "product",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="pos_sale_items",
                        to="products.product",
                    ),
                ),
                (
                    "variant",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="pos_sale_items",
                        to="products.variant",
                    ),
                ),
            ],
            options={"db_table": "pos_sale_items"},
        ),
    ]
