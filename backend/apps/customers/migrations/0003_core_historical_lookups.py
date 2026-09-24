import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("customers", "0002_customer_profile_fields"),
    ]

    operations = [
        migrations.CreateModel(
            name="Province",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("source_id", models.BigIntegerField(unique=True)),
                ("name", models.CharField(max_length=255)),
                ("status", models.BooleanField(default=True)),
            ],
            options={"db_table": "provinces", "ordering": ["name"]},
        ),
        migrations.CreateModel(
            name="CustomerLevel",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("source_id", models.BigIntegerField(unique=True)),
                ("title", models.CharField(max_length=255)),
                ("status", models.BooleanField(default=True)),
                ("sort_order", models.IntegerField(default=0)),
            ],
            options={"db_table": "customer_levels", "ordering": ["sort_order", "source_id"]},
        ),
        migrations.CreateModel(
            name="CustomerRole",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("source_id", models.BigIntegerField(unique=True)),
                ("name", models.CharField(max_length=255)),
            ],
            options={"db_table": "customer_roles", "ordering": ["source_id"]},
        ),
        migrations.CreateModel(
            name="City",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("source_id", models.BigIntegerField(unique=True)),
                ("name", models.CharField(max_length=255)),
                ("status", models.BooleanField(default=True)),
                (
                    "province",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="cities",
                        to="customers.province",
                    ),
                ),
            ],
            options={"db_table": "cities", "ordering": ["name"]},
        ),
        migrations.AddField(
            model_name="customer",
            name="role_name",
            field=models.CharField(blank=True, max_length=64),
        ),
        migrations.AddField(
            model_name="customer",
            name="level",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="customers",
                to="customers.customerlevel",
            ),
        ),
        migrations.AddField(
            model_name="customer",
            name="role",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="customers",
                to="customers.customerrole",
            ),
        ),
        migrations.CreateModel(
            name="CustomerAddress",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("source_id", models.BigIntegerField(unique=True)),
                ("first_name", models.CharField(blank=True, max_length=255)),
                ("last_name", models.CharField(blank=True, max_length=255)),
                ("mobile", models.CharField(blank=True, max_length=32)),
                ("address", models.TextField(blank=True)),
                ("postal_code", models.CharField(blank=True, max_length=32)),
                ("telephone", models.CharField(blank=True, max_length=64)),
                ("province_name", models.CharField(blank=True, max_length=255)),
                ("city_name", models.CharField(blank=True, max_length=255)),
                ("deleted_at", models.DateTimeField(blank=True, null=True)),
                ("created_at_source", models.DateTimeField(blank=True, null=True)),
                ("updated_at_source", models.DateTimeField(blank=True, null=True)),
                (
                    "city",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="addresses",
                        to="customers.city",
                    ),
                ),
                (
                    "customer",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="address_records",
                        to="customers.customer",
                    ),
                ),
            ],
            options={"db_table": "customer_addresses", "ordering": ["source_id"]},
        ),
    ]
