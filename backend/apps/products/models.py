from django.db import models


class Category(models.Model):
    source_id = models.BigIntegerField(unique=True)
    title = models.CharField(max_length=255)
    slug = models.CharField(max_length=255, blank=True)
    parent = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        related_name="children",
        on_delete=models.SET_NULL,
    )
    status = models.BooleanField(default=True)

    class Meta:
        db_table = "categories"
        ordering = ["title", "source_id"]

    def __str__(self):
        return self.title


class Color(models.Model):
    source_id = models.BigIntegerField(unique=True)
    name = models.CharField(max_length=255)
    code = models.CharField(max_length=64, blank=True)
    status = models.BooleanField(default=True)

    class Meta:
        db_table = "colors"
        ordering = ["name"]

    def __str__(self):
        return self.name


class ProductAttribute(models.Model):
    source_id = models.BigIntegerField(unique=True)
    name = models.CharField(max_length=255)
    label = models.CharField(max_length=255, blank=True)
    attr_type = models.CharField(max_length=50, blank=True)

    class Meta:
        db_table = "product_attributes"
        ordering = ["source_id"]

    def __str__(self):
        return self.label or self.name


class ProductAttributeValue(models.Model):
    source_id = models.BigIntegerField(unique=True)
    attribute = models.ForeignKey(
        ProductAttribute,
        related_name="values",
        on_delete=models.CASCADE,
    )
    value = models.CharField(max_length=255)
    status = models.BooleanField(default=True)

    class Meta:
        db_table = "product_attribute_values"
        ordering = ["attribute_id", "source_id"]


class Product(models.Model):
    source_id = models.BigIntegerField(unique=True)
    title = models.CharField(max_length=512, blank=True)
    status = models.CharField(max_length=64, blank=True)
    sku = models.CharField(max_length=128, blank=True)
    barcode = models.CharField(max_length=128, blank=True)
    created_at_source = models.DateTimeField(null=True, blank=True)
    updated_at_source = models.DateTimeField(null=True, blank=True)
    source_payload = models.JSONField(null=True, blank=True)
    synced_at = models.DateTimeField(null=True, blank=True)
    categories = models.ManyToManyField(
        Category,
        through="ProductCategory",
        related_name="products",
        blank=True,
    )

    class Meta:
        db_table = "products"
        ordering = ["title", "source_id"]


class ProductCategory(models.Model):
    product = models.ForeignKey(Product, related_name="category_links", on_delete=models.CASCADE)
    category = models.ForeignKey(Category, related_name="product_links", on_delete=models.CASCADE)

    class Meta:
        db_table = "product_categories"
        constraints = [
            models.UniqueConstraint(fields=["product", "category"], name="uniq_product_category"),
        ]


class Variant(models.Model):
    source_id = models.BigIntegerField(unique=True)
    product = models.ForeignKey(
        Product,
        related_name="variants",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
    )
    name = models.CharField(max_length=512, blank=True)
    title = models.CharField(max_length=512, blank=True)
    sku = models.CharField(max_length=128, blank=True)
    barcode = models.CharField(max_length=128, blank=True)
    price = models.BigIntegerField(null=True, blank=True)
    final_price = models.BigIntegerField(null=True, blank=True)
    discount_type = models.CharField(max_length=32, blank=True)
    discount = models.BigIntegerField(null=True, blank=True)
    quantity = models.IntegerField(null=True, blank=True)
    color = models.ForeignKey(
        Color,
        null=True,
        blank=True,
        related_name="variants",
        on_delete=models.SET_NULL,
    )
    color_name = models.CharField(max_length=128, blank=True)
    size = models.CharField(max_length=64, blank=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    created_at_source = models.DateTimeField(null=True, blank=True)
    updated_at_source = models.DateTimeField(null=True, blank=True)
    source_payload = models.JSONField(null=True, blank=True)

    class Meta:
        db_table = "variants"

    @property
    def display_name(self):
        parts = [self.title or self.name]
        if self.product and self.product.title:
            parts.insert(0, self.product.title)
        extra = " / ".join(part for part in [self.color_name, self.size] if part)
        label = " — ".join(part for part in parts if part)
        if extra:
            return f"{label} ({extra})" if label else extra
        return label or f"تنوع {self.source_id}"


class VariantAttribute(models.Model):
    variant = models.ForeignKey(Variant, related_name="attribute_links", on_delete=models.CASCADE)
    attribute = models.ForeignKey(
        ProductAttribute,
        related_name="variant_links",
        on_delete=models.CASCADE,
    )
    attribute_value = models.ForeignKey(
        ProductAttributeValue,
        null=True,
        blank=True,
        related_name="variant_links",
        on_delete=models.SET_NULL,
    )
    value = models.CharField(max_length=255, blank=True)

    class Meta:
        db_table = "variant_attributes"
        constraints = [
            models.UniqueConstraint(
                fields=["variant", "attribute"],
                name="uniq_variant_attribute",
            ),
        ]
