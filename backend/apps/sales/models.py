from django.db import models


class SalesLine(models.TextChoices):
    ONLINE = "ONLINE", "Online"
    SARI = "SARI", "Sari"
    GORGAN = "GORGAN", "Gorgan"
    CAPRI = "CAPRI", "Capri"


STORE_SALES_LINE = {
    2: SalesLine.GORGAN,
    3: SalesLine.SARI,
    4: SalesLine.CAPRI,
}


class Store(models.Model):
    """Stock-location lookup. Sales line is derived from POS store_id, not from store 1."""

    source_id = models.BigIntegerField(unique=True)
    label = models.CharField(max_length=255)
    is_main = models.BooleanField(default=False)
    address = models.TextField(blank=True)
    mobile = models.CharField(max_length=64, blank=True)

    class Meta:
        db_table = "stores"
        ordering = ["source_id"]

    @property
    def sales_line(self):
        return STORE_SALES_LINE.get(self.source_id, "")


class Order(models.Model):
    """Online order (website / Shopino). Conceptual OnlineOrder. Table remains `orders`."""

    source_id = models.BigIntegerField(unique=True)
    customer = models.ForeignKey(
        "customers.Customer",
        null=True,
        blank=True,
        related_name="orders",
        on_delete=models.SET_NULL,
    )
    status = models.CharField(max_length=64, db_index=True)
    receiver = models.CharField(max_length=255, blank=True)
    receiver_first_name = models.CharField(max_length=255, blank=True)
    receiver_last_name = models.CharField(max_length=255, blank=True)
    receiver_city = models.CharField(max_length=255, blank=True)
    receiver_province = models.CharField(max_length=255, blank=True)
    total_amount = models.BigIntegerField(default=0)
    shipping_amount = models.BigIntegerField(default=0)
    discount_amount = models.BigIntegerField(default=0)
    items_count = models.PositiveIntegerField(default=0)
    items_quantity = models.IntegerField(null=True, blank=True)
    is_shopino = models.BooleanField(default=False)
    is_digify = models.BooleanField(default=False)
    shipping_id = models.IntegerField(null=True, blank=True)
    shipping_title = models.CharField(max_length=255, blank=True)
    canceled_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(db_index=True)
    updated_at_source = models.DateTimeField(null=True, blank=True)
    details_synced_at = models.DateTimeField(null=True, blank=True)
    source_payload = models.JSONField(null=True, blank=True)

    class Meta:
        db_table = "orders"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["customer", "status", "created_at"], name="orders_cust_st_created_idx"),
        ]

    @property
    def sales_line(self):
        return SalesLine.ONLINE


class OrderItem(models.Model):
    """Online order line. Conceptual OnlineOrderItem. Table remains `order_items`."""

    source_id = models.BigIntegerField(unique=True)
    order = models.ForeignKey(Order, related_name="items", on_delete=models.CASCADE)
    product = models.ForeignKey(
        "products.Product",
        null=True,
        blank=True,
        related_name="order_items",
        on_delete=models.SET_NULL,
    )
    variant = models.ForeignKey(
        "products.Variant",
        null=True,
        blank=True,
        related_name="order_items",
        on_delete=models.SET_NULL,
    )
    product_source_id = models.BigIntegerField(null=True, blank=True)
    variant_source_id = models.BigIntegerField(null=True, blank=True)
    quantity = models.IntegerField(default=1)
    amount = models.BigIntegerField(default=0)
    discount_amount = models.BigIntegerField(default=0)
    status = models.IntegerField(default=1)
    title = models.CharField(max_length=512, blank=True)
    source_payload = models.JSONField(null=True, blank=True)

    class Meta:
        db_table = "order_items"

    @property
    def display_title(self):
        if self.title:
            return self.title
        if self.variant and self.variant.display_name:
            return self.variant.display_name
        if self.product and self.product.title:
            return self.product.title
        if self.product_source_id:
            return f"کالا {self.product_source_id}"
        return "کالا"


class PosSale(models.Model):
    source_id = models.BigIntegerField(unique=True)
    customer = models.ForeignKey(
        "customers.Customer",
        null=True,
        blank=True,
        related_name="pos_sales",
        on_delete=models.SET_NULL,
    )
    store = models.ForeignKey(
        Store,
        null=True,
        blank=True,
        related_name="pos_sales",
        on_delete=models.SET_NULL,
    )
    store_source_id = models.IntegerField(db_index=True)
    sales_line = models.CharField(max_length=16, db_index=True)
    type = models.CharField(max_length=16, db_index=True)
    confirmed = models.CharField(max_length=32, blank=True)
    discount_amount = models.BigIntegerField(default=0)
    cash_amount = models.BigIntegerField(default=0)
    card_by_card_amount = models.BigIntegerField(default=0)
    from_wallet_amount = models.BigIntegerField(default=0)
    digipay_cashier_amount = models.BigIntegerField(default=0)
    snappay_cashier_amount = models.BigIntegerField(default=0)
    tracking_code = models.CharField(max_length=255, blank=True)
    transaction_id = models.BigIntegerField(null=True, blank=True)
    is_cancelled = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(db_index=True)
    updated_at_source = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "pos_sales"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["customer", "sales_line", "created_at"], name="pos_cust_line_created_idx"),
        ]


class OnlineInvoice(models.Model):
    """Successful/failed online payment attempts for orders (from Elinor invoices)."""

    source_id = models.BigIntegerField(unique=True)
    order_source_id = models.BigIntegerField(db_index=True)
    order = models.ForeignKey(
        Order,
        null=True,
        blank=True,
        related_name="online_invoices",
        on_delete=models.SET_NULL,
    )
    amount = models.BigIntegerField(default=0)
    status = models.CharField(max_length=16, db_index=True)
    inv_type = models.CharField(max_length=16, blank=True)
    created_at = models.DateTimeField(db_index=True)
    updated_at_source = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "online_invoices"
        ordering = ["-created_at"]


class OnlinePayment(models.Model):
    """Gateway attempt linked to an online invoice (amount denormalized for reporting)."""

    source_id = models.BigIntegerField(unique=True)
    invoice = models.ForeignKey(
        OnlineInvoice,
        related_name="payments",
        on_delete=models.CASCADE,
    )
    gateway = models.CharField(max_length=32, db_index=True)
    status = models.CharField(max_length=16, db_index=True)
    amount = models.BigIntegerField(default=0)
    success_at = models.DateTimeField(null=True, blank=True)
    paid_at = models.DateTimeField(db_index=True)
    created_at = models.DateTimeField()
    updated_at_source = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "online_payments"
        ordering = ["-paid_at"]
        indexes = [
            models.Index(fields=["gateway", "status", "paid_at"], name="online_pay_gw_st_paid_idx"),
        ]


class PosSaleItem(models.Model):
    source_id = models.BigIntegerField(unique=True)
    pos_sale = models.ForeignKey(
        PosSale,
        null=True,
        blank=True,
        related_name="items",
        on_delete=models.SET_NULL,
    )
    product = models.ForeignKey(
        "products.Product",
        null=True,
        blank=True,
        related_name="pos_sale_items",
        on_delete=models.SET_NULL,
    )
    variant = models.ForeignKey(
        "products.Variant",
        null=True,
        blank=True,
        related_name="pos_sale_items",
        on_delete=models.SET_NULL,
    )
    product_source_id = models.BigIntegerField(null=True, blank=True)
    variant_source_id = models.BigIntegerField(null=True, blank=True)
    quantity = models.IntegerField(default=1)
    amount = models.BigIntegerField(default=0)
    discount_amount = models.BigIntegerField(default=0)
    real_amount = models.BigIntegerField(null=True, blank=True)
    type = models.CharField(max_length=16, db_index=True)
    store_source_id = models.IntegerField(null=True, blank=True)
    reference_item_source_id = models.BigIntegerField(null=True, blank=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    created_at_source = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "pos_sale_items"
