from django.db import models


class CustomerQuerySet(models.QuerySet):
    def purchasing(self):
        return self.filter(order_count__gt=0)

    def registered_only(self):
        return self.filter(order_count=0)


class Province(models.Model):
    source_id = models.BigIntegerField(unique=True)
    name = models.CharField(max_length=255)
    status = models.BooleanField(default=True)

    class Meta:
        db_table = "provinces"
        ordering = ["name"]

    def __str__(self):
        return self.name


class City(models.Model):
    source_id = models.BigIntegerField(unique=True)
    province = models.ForeignKey(
        Province,
        null=True,
        blank=True,
        related_name="cities",
        on_delete=models.SET_NULL,
    )
    name = models.CharField(max_length=255)
    status = models.BooleanField(default=True)

    class Meta:
        db_table = "cities"
        ordering = ["name"]

    def __str__(self):
        return self.name


class CustomerLevel(models.Model):
    source_id = models.BigIntegerField(unique=True)
    title = models.CharField(max_length=255)
    status = models.BooleanField(default=True)
    sort_order = models.IntegerField(default=0)

    class Meta:
        db_table = "customer_levels"
        ordering = ["sort_order", "source_id"]


class CustomerRole(models.Model):
    source_id = models.BigIntegerField(unique=True)
    name = models.CharField(max_length=255)

    class Meta:
        db_table = "customer_roles"
        ordering = ["source_id"]


class Customer(models.Model):
    source_id = models.BigIntegerField(unique=True)
    first_name = models.CharField(max_length=255, blank=True)
    last_name = models.CharField(max_length=255, blank=True)
    mobile = models.CharField(max_length=32, blank=True, db_index=True)
    email = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=64, blank=True)
    national_code = models.CharField(max_length=32, blank=True)
    gender = models.CharField(max_length=32, blank=True)
    birth_date = models.DateField(null=True, blank=True)
    card_number = models.CharField(max_length=64, blank=True)
    club_level = models.CharField(max_length=64, blank=True)
    role_name = models.CharField(max_length=64, blank=True)
    level = models.ForeignKey(
        CustomerLevel,
        null=True,
        blank=True,
        related_name="customers",
        on_delete=models.SET_NULL,
    )
    role = models.ForeignKey(
        CustomerRole,
        null=True,
        blank=True,
        related_name="customers",
        on_delete=models.SET_NULL,
    )
    summary = models.TextField(blank=True)
    addresses = models.JSONField(default=list, blank=True)
    first_order_at = models.DateTimeField(null=True, blank=True)
    last_order_at = models.DateTimeField(null=True, blank=True)
    order_count = models.PositiveIntegerField(default=0, db_index=True)
    created_at_source = models.DateTimeField(null=True, blank=True)
    updated_at_source = models.DateTimeField(null=True, blank=True)
    source_payload = models.JSONField(null=True, blank=True)
    synced_at = models.DateTimeField(null=True, blank=True)

    objects = CustomerQuerySet.as_manager()

    class Meta:
        db_table = "customers"
        ordering = ["-last_order_at", "-source_id"]
        indexes = [
            models.Index(fields=["-last_order_at", "-source_id"], name="customers_last_src_idx"),
        ]

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}".strip()

    @property
    def is_purchasing(self):
        return self.order_count > 0


class CustomerAddress(models.Model):
    source_id = models.BigIntegerField(unique=True)
    customer = models.ForeignKey(
        Customer,
        related_name="address_records",
        on_delete=models.CASCADE,
    )
    city = models.ForeignKey(
        City,
        null=True,
        blank=True,
        related_name="addresses",
        on_delete=models.SET_NULL,
    )
    first_name = models.CharField(max_length=255, blank=True)
    last_name = models.CharField(max_length=255, blank=True)
    mobile = models.CharField(max_length=32, blank=True)
    address = models.TextField(blank=True)
    postal_code = models.CharField(max_length=32, blank=True)
    telephone = models.CharField(max_length=64, blank=True)
    province_name = models.CharField(max_length=255, blank=True)
    city_name = models.CharField(max_length=255, blank=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    created_at_source = models.DateTimeField(null=True, blank=True)
    updated_at_source = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "customer_addresses"
        ordering = ["source_id"]

    @property
    def recipient_name(self):
        return f"{self.first_name} {self.last_name}".strip()
