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


# Summary tables rebuilt by apps.products.daily from apps.sales.semantics (rules: docs/business-rules/products.md).
# Product and variant ids are plain columns, not foreign keys: these tables are derived and fully rebuilt.


class ProductDailySales(models.Model):
    """One row per Tehran day, product, variant and sales line (ONLINE, SARI, GORGAN, CAPRI).

    units: sold units; net_units: sold minus in-store returns; revenue: amount × quantity of sold lines minus returned
    lines (online and POS line prices are both per unit, after discount); discounted_units: sold units with a line
    discount; invoice_count: distinct invoices that sold it."""

    day = models.DateField()
    product_id = models.BigIntegerField()
    variant_id = models.BigIntegerField(null=True)
    sales_line = models.CharField(max_length=16)
    units = models.IntegerField(default=0)
    net_units = models.IntegerField(default=0)
    revenue = models.BigIntegerField(default=0)
    discounted_units = models.IntegerField(default=0)
    invoice_count = models.IntegerField(default=0)

    class Meta:
        db_table = "product_daily_sales"
        constraints = [
            models.UniqueConstraint(fields=["day", "product_id", "variant_id", "sales_line"], nulls_distinct=False, name="uniq_product_daily_sales"),
        ]
        indexes = [models.Index(fields=["product_id", "day"], name="pds_product_day"), models.Index(fields=["day"], name="pds_day")]


class ProductMetrics(models.Model):
    """Per product, as of the refresh day. Speeds are net units per week; comparisons stay within `category`."""

    product_id = models.BigIntegerField(primary_key=True)
    category_id = models.BigIntegerField(null=True, db_index=True)
    as_of = models.DateField()
    first_sale_date = models.DateField(null=True)
    last_sale_date = models.DateField(null=True)
    last_sale_by_line = models.JSONField(default=dict)
    units_7 = models.IntegerField(default=0)
    units_14 = models.IntegerField(default=0)
    units_28 = models.IntegerField(default=0)
    revenue_7 = models.BigIntegerField(default=0)
    revenue_14 = models.BigIntegerField(default=0)
    revenue_28 = models.BigIntegerField(default=0)
    units_first14 = models.IntegerField(default=0)
    weekly_speed = models.FloatField(default=0)
    full_price_speed = models.FloatField(default=0)
    category_median_speed = models.FloatField(null=True)
    category_ratio = models.FloatField(null=True)
    trend_pct = models.FloatField(null=True)
    discount_share = models.FloatField(null=True)
    return_rate = models.FloatField(null=True)
    status = models.CharField(max_length=16, db_index=True)
    central_stock = models.IntegerField(null=True)
    stock_days = models.FloatField(null=True)
    stock_flag = models.CharField(max_length=16, blank=True, db_index=True)

    class Meta:
        db_table = "product_metrics"


class CentralStock(models.Model):
    """`main_balance` of a variety from the Elinor product API: central warehouse only, never branch stock."""

    variant_id = models.BigIntegerField(primary_key=True)
    product_id = models.BigIntegerField(db_index=True)
    balance = models.IntegerField()
    fetched_at = models.DateTimeField()

    class Meta:
        db_table = "product_central_stock"


class BasketItemDaily(models.Model):
    """Invoices per day, channel (online / store) and level (product / category) containing `key`; key 0 = all invoices."""

    day = models.DateField()
    channel = models.CharField(max_length=8)
    level = models.CharField(max_length=8)
    key = models.BigIntegerField()
    baskets = models.IntegerField()

    class Meta:
        db_table = "product_basket_items_daily"
        indexes = [models.Index(fields=["level", "channel", "day"], name="pbi_level_day")]


class BasketPairDaily(models.Model):
    """Invoices per day, channel and level containing both `a` and `b` (a < b)."""

    day = models.DateField()
    channel = models.CharField(max_length=8)
    level = models.CharField(max_length=8)
    a = models.BigIntegerField()
    b = models.BigIntegerField()
    baskets = models.IntegerField()

    class Meta:
        db_table = "product_basket_pairs_daily"
        indexes = [models.Index(fields=["level", "channel", "day"], name="pbp_level_day")]


class ProductStatusChange(models.Model):
    """A product's status changed on a daily refresh (old None = first status). Feeds «پیشران تازه» on the home page."""

    product_id = models.BigIntegerField()
    old_status = models.CharField(max_length=16, null=True)
    new_status = models.CharField(max_length=16)
    day = models.DateField()

    class Meta:
        db_table = "product_status_changes"
        indexes = [models.Index(fields=["new_status", "day"], name="psc_status_day")]
