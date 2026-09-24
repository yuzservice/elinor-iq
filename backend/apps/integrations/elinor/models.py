from django.db import models


class SyncRun(models.Model):
    KIND_BOOTSTRAP = "bootstrap"
    KIND_RECENT = "recent"
    KIND_DETAILS = "details"
    KIND_CUSTOMERS = "customers"
    KIND_POS = "pos"
    KIND_HOURLY = "hourly"
    STATUS_RUNNING = "running"
    STATUS_SUCCESS = "success"
    STATUS_FAILED = "failed"
    STATUS_PAUSED = "paused"

    kind = models.CharField(max_length=32)
    status = models.CharField(max_length=32, default=STATUS_RUNNING)
    started_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    window_start = models.DateTimeField(null=True, blank=True)
    window_end = models.DateTimeField(null=True, blank=True)
    requests_made = models.PositiveIntegerField(default=0)
    orders_seen = models.PositiveIntegerField(default=0)
    orders_upserted = models.PositiveIntegerField(default=0)
    customers_upserted = models.PositiveIntegerField(default=0)
    items_upserted = models.PositiveIntegerField(default=0)
    products_upserted = models.PositiveIntegerField(default=0)
    variants_upserted = models.PositiveIntegerField(default=0)
    error_message = models.TextField(blank=True)
    report = models.JSONField(null=True, blank=True)

    class Meta:
        db_table = "sync_runs"
        ordering = ["-started_at"]


class SyncCursor(models.Model):
    key = models.CharField(max_length=64, unique=True)
    value = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "sync_cursors"


class ElinorApiConfig(models.Model):
    """Panel-managed Elinor API credentials. Environment values are only a fallback."""

    base_url = models.CharField(max_length=255, blank=True)
    username = models.CharField(max_length=255, blank=True)
    password = models.CharField(max_length=255, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "elinor_api_config"


class ImportRun(models.Model):
    KIND_CORE = "core_historical"
    STATUS_RUNNING = "running"
    STATUS_SUCCESS = "success"
    STATUS_FAILED = "failed"

    kind = models.CharField(max_length=32, default=KIND_CORE)
    status = models.CharField(max_length=32, default=STATUS_RUNNING)
    dump_path = models.CharField(max_length=512, blank=True)
    started_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    elapsed_seconds = models.FloatField(null=True, blank=True)
    error_message = models.TextField(blank=True)
    report = models.JSONField(null=True, blank=True)

    class Meta:
        db_table = "import_runs"
        ordering = ["-started_at"]
