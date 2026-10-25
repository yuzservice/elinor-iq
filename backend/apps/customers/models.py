from django.conf import settings
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
    tier_code = models.CharField(max_length=16, blank=True, null=True, db_index=True)
    tier_refreshed_at = models.DateTimeField(null=True, blank=True)
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


class TierRuleSet(models.Model):
    """One version of the tier thresholds. At most one active and one draft."""

    STATUS_DRAFT = "draft"
    STATUS_ACTIVE = "active"
    STATUS_ARCHIVED = "archived"
    STATUS_CHOICES = [
        (STATUS_DRAFT, "Draft"),
        (STATUS_ACTIVE, "Active"),
        (STATUS_ARCHIVED, "Archived"),
    ]
    ACTIVATION_RUNNING = "running"
    ACTIVATION_SUCCEEDED = "succeeded"
    ACTIVATION_FAILED = "failed"
    ACTIVATION_CHOICES = [
        ("", "None"),
        (ACTIVATION_RUNNING, "Running"),
        (ACTIVATION_SUCCEEDED, "Succeeded"),
        (ACTIVATION_FAILED, "Failed"),
    ]

    version = models.PositiveIntegerField(unique=True)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES)
    rules = models.JSONField()
    note = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        related_name="+",
        on_delete=models.SET_NULL,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    previewed_at = models.DateTimeField(null=True, blank=True)
    activated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        related_name="+",
        on_delete=models.SET_NULL,
    )
    activated_at = models.DateTimeField(null=True, blank=True)
    activation_status = models.CharField(max_length=16, choices=ACTIVATION_CHOICES, blank=True, default="")
    activation_error = models.TextField(blank=True)

    class Meta:
        db_table = "customer_tier_rule_sets"
        ordering = ["-version"]
        constraints = [
            models.UniqueConstraint(
                fields=["status"],
                condition=models.Q(status="active"),
                name="tier_rule_sets_one_active",
            ),
            models.UniqueConstraint(
                fields=["status"],
                condition=models.Q(status="draft"),
                name="tier_rule_sets_one_draft",
            ),
        ]


class CustomerTierHistory(models.Model):
    """One row per actual change of Customer.tier_code."""

    REASON_BASELINE = "baseline"
    REASON_ACTIVATION = "activation"
    REASON_DAILY = "daily"
    REASON_MANUAL = "manual"
    REASON_SYNC = "sync"
    REASON_CHOICES = [
        (REASON_BASELINE, "Baseline"),
        (REASON_ACTIVATION, "Activation"),
        (REASON_DAILY, "Daily"),
        (REASON_MANUAL, "Manual"),
        (REASON_SYNC, "Sync"),
    ]

    customer = models.ForeignKey(Customer, related_name="tier_history", on_delete=models.CASCADE)
    previous_tier_code = models.CharField(max_length=16, null=True, blank=True)
    previous_tier_title = models.CharField(max_length=40, blank=True)
    tier_code = models.CharField(max_length=16, null=True, blank=True)
    tier_title = models.CharField(max_length=40, blank=True)
    rule_set = models.ForeignKey(
        TierRuleSet,
        null=True,
        blank=True,
        related_name="history",
        on_delete=models.SET_NULL,
    )
    reason = models.CharField(max_length=16, choices=REASON_CHOICES)
    changed_at = models.DateTimeField(db_index=True)

    class Meta:
        db_table = "customer_tier_history"
        ordering = ["-changed_at", "-id"]
        indexes = [
            models.Index(fields=["customer", "changed_at"], name="tier_history_cust_at_idx"),
        ]


class CustomerRfm(models.Model):
    """Current RFM of a purchasing, non-operator customer. Refreshed daily by apps.customers.rfm."""

    customer = models.OneToOneField(Customer, related_name="rfm", on_delete=models.CASCADE)
    r_score = models.PositiveSmallIntegerField()
    f_score = models.PositiveSmallIntegerField()
    m_score = models.PositiveSmallIntegerField()
    segment = models.CharField(max_length=16)
    purchase_count = models.PositiveIntegerField()
    days_since_last_purchase = models.IntegerField()
    lifetime_amount = models.BigIntegerField()
    purchase_count_12m = models.PositiveIntegerField(default=0)
    amount_12m = models.BigIntegerField(default=0)
    computed_at = models.DateTimeField()

    class Meta:
        db_table = "customer_rfm"
        indexes = [
            models.Index(fields=["segment"], name="customer_rfm_segment_idx"),
            models.Index(fields=["r_score", "f_score"], name="customer_rfm_rf_idx"),
        ]


class CustomerRfmSnapshot(models.Model):
    """RFM of a purchasing customer at the end of a Jalali month (month = "1405-08")."""

    month = models.CharField(max_length=7)
    customer = models.ForeignKey(Customer, related_name="rfm_snapshots", on_delete=models.CASCADE)
    r_score = models.PositiveSmallIntegerField()
    f_score = models.PositiveSmallIntegerField()
    m_score = models.PositiveSmallIntegerField()
    segment = models.CharField(max_length=16)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "customer_rfm_snapshots"
        constraints = [
            models.UniqueConstraint(fields=["month", "customer"], name="customer_rfm_snapshot_month_customer"),
        ]
        indexes = [
            models.Index(fields=["month", "segment"], name="rfm_snapshot_month_seg_idx"),
        ]
