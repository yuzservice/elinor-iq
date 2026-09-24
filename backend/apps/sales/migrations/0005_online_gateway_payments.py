from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("sales", "0004_customer_list_indexes"),
    ]

    operations = [
        migrations.CreateModel(
            name="OnlineInvoice",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("source_id", models.BigIntegerField(unique=True)),
                ("order_source_id", models.BigIntegerField(db_index=True)),
                ("amount", models.BigIntegerField(default=0)),
                ("status", models.CharField(db_index=True, max_length=16)),
                ("inv_type", models.CharField(blank=True, max_length=16)),
                ("created_at", models.DateTimeField(db_index=True)),
                ("updated_at_source", models.DateTimeField(blank=True, null=True)),
                (
                    "order",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="online_invoices",
                        to="sales.order",
                    ),
                ),
            ],
            options={
                "db_table": "online_invoices",
                "ordering": ["-created_at"],
            },
        ),
        migrations.CreateModel(
            name="OnlinePayment",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("source_id", models.BigIntegerField(unique=True)),
                ("gateway", models.CharField(db_index=True, max_length=32)),
                ("status", models.CharField(db_index=True, max_length=16)),
                ("amount", models.BigIntegerField(default=0)),
                ("success_at", models.DateTimeField(blank=True, null=True)),
                ("paid_at", models.DateTimeField(db_index=True)),
                ("created_at", models.DateTimeField()),
                ("updated_at_source", models.DateTimeField(blank=True, null=True)),
                (
                    "invoice",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="payments",
                        to="sales.onlineinvoice",
                    ),
                ),
            ],
            options={
                "db_table": "online_payments",
                "ordering": ["-paid_at"],
                "indexes": [
                    models.Index(fields=["gateway", "status", "paid_at"], name="online_pay_gw_st_paid_idx"),
                ],
            },
        ),
    ]
