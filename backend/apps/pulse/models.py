"""Elinor Pulse tables. All `ig_`; core tables (products, variants) are only read, never written."""

from django.db import models
from django.utils import timezone


class IgAccount(models.Model):
    handle = models.CharField(max_length=64, unique=True)
    zernio_account_id = models.CharField(max_length=64, unique=True, null=True, blank=True)
    is_active = models.BooleanField(default=True)
    followers_count = models.BigIntegerField(null=True, blank=True)
    followers_updated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "ig_accounts"

    def __str__(self):
        return self.handle


class PostMetrics(models.Model):
    views = models.BigIntegerField(null=True, blank=True)
    reach = models.BigIntegerField(null=True, blank=True)
    likes = models.BigIntegerField(null=True, blank=True)
    comments = models.BigIntegerField(null=True, blank=True)
    shares = models.BigIntegerField(null=True, blank=True)
    saves = models.BigIntegerField(null=True, blank=True)
    follows = models.IntegerField(null=True, blank=True)
    profile_views = models.IntegerField(null=True, blank=True)
    er = models.FloatField(null=True, blank=True)  # percent, as Zernio's engagementRate
    avg_watch_ms = models.IntegerField(null=True, blank=True)
    skip_rate = models.FloatField(null=True, blank=True)  # percent 0-100

    METRIC_FIELDS = (
        "views", "reach", "likes", "comments", "shares", "saves",
        "follows", "profile_views", "er", "avg_watch_ms", "skip_rate",
    )

    class Meta:
        abstract = True


class IgPost(PostMetrics):
    SOURCE_CSV = "csv"
    SOURCE_ZERNIO = "zernio"

    account = models.ForeignKey(IgAccount, on_delete=models.CASCADE, related_name="posts")
    shortcode = models.CharField(max_length=64, unique=True)
    ig_media_id = models.CharField(max_length=64, unique=True, null=True, blank=True)
    zernio_id = models.CharField(max_length=64, unique=True, null=True, blank=True)
    url = models.URLField(max_length=500)
    product_type = models.CharField(max_length=16, blank=True)  # FEED / REELS
    media = models.CharField(max_length=16, blank=True)  # video / carousel / image
    published_at = models.DateTimeField(db_index=True)
    caption = models.TextField(blank=True)
    duration_s = models.IntegerField(null=True, blank=True)
    is_ad = models.BooleanField(default=False)
    is_brand_content = models.BooleanField(default=False)
    cover_url = models.TextField(blank=True)
    metrics_updated_at = models.DateTimeField(null=True, blank=True)
    source = models.CharField(max_length=16, default=SOURCE_ZERNIO)
    first_seen_at = models.DateTimeField(default=timezone.now)
    timeline_backfilled_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "ig_posts"

    def __str__(self):
        return self.shortcode


class IgPostSnapshot(PostMetrics):
    """The post's numbers for one Tehran day; only the first 30 days after publishing."""

    SOURCE_DAILY = "daily"  # our own pulse_snapshot run
    SOURCE_TIMELINE = "timeline"  # Zernio post-timeline backfill; never replaces a daily row

    post = models.ForeignKey(IgPost, on_delete=models.CASCADE, related_name="snapshots")
    date = models.DateField()
    captured_at = models.DateTimeField(default=timezone.now)
    source = models.CharField(max_length=16, default=SOURCE_DAILY)

    class Meta:
        db_table = "ig_post_snapshots"
        constraints = [models.UniqueConstraint(fields=["post", "date"], name="ig_post_snapshot_unique")]


class IgAccountDaily(models.Model):
    account = models.ForeignKey(IgAccount, on_delete=models.CASCADE, related_name="daily")
    date = models.DateField()
    followers = models.BigIntegerField(null=True, blank=True)
    reach = models.BigIntegerField(null=True, blank=True)
    views = models.BigIntegerField(null=True, blank=True)  # Instagram has no daily account views; stays empty for now

    class Meta:
        db_table = "ig_account_daily"
        constraints = [models.UniqueConstraint(fields=["account", "date"], name="ig_account_daily_unique")]


class IgProductCode(models.Model):
    """4-digit code from `products.title` -> product. Rebuilt from titles; a code may map to several products."""

    code = models.CharField(max_length=4, db_index=True)
    # No database constraint: the core keeps full control over `products` rows (deletes, dump reloads).
    product = models.ForeignKey(
        "products.Product", on_delete=models.DO_NOTHING, db_constraint=False, related_name="+"
    )
    title = models.CharField(max_length=512, blank=True)
    built_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "ig_product_codes"
        constraints = [models.UniqueConstraint(fields=["code", "product"], name="ig_product_code_unique")]


class IgPostProduct(models.Model):
    """A code in a caption, in caption order. Products resolve through IgProductCode on read."""

    post = models.ForeignKey(IgPost, on_delete=models.CASCADE, related_name="codes")
    position = models.PositiveSmallIntegerField()  # 0 = first code = primary product
    raw_code = models.CharField(max_length=4, db_index=True)
    raw_line = models.CharField(max_length=512, blank=True)  # the caption line that names the product
    caption_price = models.BigIntegerField(null=True, blank=True)  # display only, Toman

    class Meta:
        db_table = "ig_post_products"
        ordering = ["post", "position"]
        constraints = [models.UniqueConstraint(fields=["post", "position"], name="ig_post_product_unique")]


class IgMediaAsset(models.Model):
    KIND_COVER = "post_cover"
    KIND_PRODUCT = "product_thumb"
    STATUS_PENDING = "pending"
    STATUS_OK = "ok"
    STATUS_FAILED = "failed"

    kind = models.CharField(max_length=16)
    key = models.CharField(max_length=64)  # shortcode or product source_id
    source_url = models.TextField(blank=True)
    path = models.CharField(max_length=255, blank=True)  # relative to PULSE_MEDIA_ROOT
    status = models.CharField(max_length=8, default=STATUS_PENDING)
    error = models.TextField(blank=True)
    attempts = models.PositiveIntegerField(default=0)
    fetched_at = models.DateTimeField(null=True, blank=True)
    url_checked_at = models.DateTimeField(null=True, blank=True)  # last single-post Zernio read for a fresh URL

    class Meta:
        db_table = "ig_media_assets"
        constraints = [models.UniqueConstraint(fields=["kind", "key"], name="ig_media_asset_unique")]


class IgSyncRun(models.Model):
    STATUS_RUNNING = "running"
    STATUS_SUCCESS = "success"
    STATUS_FAILED = "failed"

    job = models.CharField(max_length=32)
    started_at = models.DateTimeField(default=timezone.now)
    finished_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=8, default=STATUS_RUNNING)
    counts = models.JSONField(default=dict, blank=True)
    error = models.TextField(blank=True)

    class Meta:
        db_table = "ig_sync_runs"
        indexes = [models.Index(fields=["job", "-started_at"], name="ig_sync_run_job_started")]


class IgDailyBrief(models.Model):
    """The morning brief for one Tehran day. source = "rules" until an AI layer exists."""

    date = models.DateField(unique=True)
    text = models.TextField()
    source = models.CharField(max_length=16, default="rules")
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "ig_daily_briefs"


class IgDailyTask(models.Model):
    date = models.DateField()
    position = models.PositiveSmallIntegerField()
    rule = models.CharField(max_length=32)
    title = models.CharField(max_length=300)
    reason = models.CharField(max_length=500)
    source = models.CharField(max_length=16, default="rules")
    done = models.BooleanField(default=False)
    done_by = models.ForeignKey("accounts.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    done_at = models.DateTimeField(null=True, blank=True)
    post = models.ForeignKey(IgPost, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")  # repeat_winner

    class Meta:
        db_table = "ig_daily_tasks"
        ordering = ["date", "position"]
        constraints = [models.UniqueConstraint(fields=["date", "position"], name="ig_daily_task_unique")]
