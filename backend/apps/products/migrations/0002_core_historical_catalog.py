import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("products", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="Category",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("source_id", models.BigIntegerField(unique=True)),
                ("title", models.CharField(max_length=255)),
                ("slug", models.CharField(blank=True, max_length=255)),
                ("status", models.BooleanField(default=True)),
                (
                    "parent",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="children",
                        to="products.category",
                    ),
                ),
            ],
            options={"db_table": "categories", "ordering": ["title", "source_id"]},
        ),
        migrations.CreateModel(
            name="Color",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("source_id", models.BigIntegerField(unique=True)),
                ("name", models.CharField(max_length=255)),
                ("code", models.CharField(blank=True, max_length=64)),
                ("status", models.BooleanField(default=True)),
            ],
            options={"db_table": "colors", "ordering": ["name"]},
        ),
        migrations.CreateModel(
            name="ProductAttribute",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("source_id", models.BigIntegerField(unique=True)),
                ("name", models.CharField(max_length=255)),
                ("label", models.CharField(blank=True, max_length=255)),
                ("attr_type", models.CharField(blank=True, max_length=50)),
            ],
            options={"db_table": "product_attributes", "ordering": ["source_id"]},
        ),
        migrations.CreateModel(
            name="ProductAttributeValue",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("source_id", models.BigIntegerField(unique=True)),
                ("value", models.CharField(max_length=255)),
                ("status", models.BooleanField(default=True)),
                (
                    "attribute",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="values",
                        to="products.productattribute",
                    ),
                ),
            ],
            options={"db_table": "product_attribute_values", "ordering": ["attribute_id", "source_id"]},
        ),
        migrations.AddField(
            model_name="product",
            name="sku",
            field=models.CharField(blank=True, max_length=128),
        ),
        migrations.AddField(
            model_name="product",
            name="barcode",
            field=models.CharField(blank=True, max_length=128),
        ),
        migrations.AddField(
            model_name="product",
            name="created_at_source",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="product",
            name="updated_at_source",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="variant",
            name="discount_type",
            field=models.CharField(blank=True, max_length=32),
        ),
        migrations.AddField(
            model_name="variant",
            name="discount",
            field=models.BigIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="variant",
            name="deleted_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="variant",
            name="created_at_source",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="variant",
            name="updated_at_source",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="variant",
            name="color",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="variants",
                to="products.color",
            ),
        ),
        migrations.CreateModel(
            name="ProductCategory",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "category",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="product_links",
                        to="products.category",
                    ),
                ),
                (
                    "product",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="category_links",
                        to="products.product",
                    ),
                ),
            ],
            options={"db_table": "product_categories"},
        ),
        migrations.AddConstraint(
            model_name="productcategory",
            constraint=models.UniqueConstraint(fields=("product", "category"), name="uniq_product_category"),
        ),
        migrations.AddField(
            model_name="product",
            name="categories",
            field=models.ManyToManyField(
                blank=True,
                related_name="products",
                through="products.ProductCategory",
                to="products.category",
            ),
        ),
        migrations.CreateModel(
            name="VariantAttribute",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("value", models.CharField(blank=True, max_length=255)),
                (
                    "attribute",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="variant_links",
                        to="products.productattribute",
                    ),
                ),
                (
                    "attribute_value",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="variant_links",
                        to="products.productattributevalue",
                    ),
                ),
                (
                    "variant",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="attribute_links",
                        to="products.variant",
                    ),
                ),
            ],
            options={"db_table": "variant_attributes"},
        ),
        migrations.AddConstraint(
            model_name="variantattribute",
            constraint=models.UniqueConstraint(fields=("variant", "attribute"), name="uniq_variant_attribute"),
        ),
    ]
