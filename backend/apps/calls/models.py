"""Call Center: lists, programs, versioned forms, tasks, logs. Rules: docs/business-rules/call-center.md."""

from django.conf import settings
from django.contrib.postgres.fields import ArrayField
from django.db import models
from django.db.models import Q

JOB_IDLE = "idle"
JOB_RUNNING = "running"
JOB_DONE = "done"
JOB_FAILED = "failed"
JOB_CHOICES = [(JOB_IDLE, "Idle"), (JOB_RUNNING, "Running"), (JOB_DONE, "Done"), (JOB_FAILED, "Failed")]


class CallSettings(models.Model):
    """Singleton (pk=1), read with CallSettings.load()."""

    buy_window_days = models.PositiveIntegerField(default=30)
    default_gap_days = models.PositiveIntegerField(default=30)
    note_min_chars = models.PositiveIntegerField(default=20)

    class Meta:
        db_table = "call_settings"

    @classmethod
    def load(cls):
        return cls.objects.get_or_create(pk=1)[0]


class CallTag(models.Model):
    title = models.CharField(max_length=80)
    color = models.CharField(max_length=16, default="#34d399")
    needs_action = models.BooleanField(default=False)
    open_until_purchase = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "call_tags"
        ordering = ["id"]


class CallList(models.Model):
    KIND_FIXED = "fixed"
    KIND_DYNAMIC = "dynamic"
    SOURCE_FILTERS = "filters"
    SOURCE_MANUAL = "manual"
    SOURCE_EXCEL = "excel"

    name = models.CharField(max_length=160)
    kind = models.CharField(max_length=16, choices=[(KIND_FIXED, "Fixed"), (KIND_DYNAMIC, "Dynamic")])
    filter_params = models.JSONField(default=dict, blank=True)
    source = models.CharField(
        max_length=16, choices=[(SOURCE_FILTERS, "Filters"), (SOURCE_MANUAL, "Manual"), (SOURCE_EXCEL, "Excel")]
    )
    customer_count = models.PositiveIntegerField(default=0)
    job_status = models.CharField(max_length=16, choices=JOB_CHOICES, default=JOB_IDLE)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "call_lists"
        ordering = ["-id"]


class CallListMember(models.Model):
    """Members of fixed lists only; dynamic lists store filters."""

    list = models.ForeignKey(CallList, on_delete=models.CASCADE, related_name="members")
    customer = models.ForeignKey("customers.Customer", on_delete=models.CASCADE, related_name="+")

    class Meta:
        db_table = "call_list_members"
        constraints = [models.UniqueConstraint(fields=["list", "customer"], name="call_list_member_unique")]


class CallProgram(models.Model):
    STATUS_DRAFT = "draft"
    STATUS_ACTIVE = "active"
    STATUS_PAUSED = "paused"
    STATUS_ENDED = "ended"
    SHARE_EQUAL = "equal"
    SHARE_CUSTOM = "custom"

    name = models.CharField(max_length=160)
    status = models.CharField(
        max_length=16,
        choices=[(STATUS_DRAFT, "Draft"), (STATUS_ACTIVE, "Active"), (STATUS_PAUSED, "Paused"), (STATUS_ENDED, "Ended")],
        default=STATUS_DRAFT,
    )
    list = models.ForeignKey(CallList, null=True, blank=True, on_delete=models.PROTECT, related_name="programs")
    share_mode = models.CharField(max_length=16, choices=[(SHARE_EQUAL, "Equal"), (SHARE_CUSTOM, "Custom")], default=SHARE_EQUAL)
    job_status = models.CharField(max_length=16, choices=JOB_CHOICES, default=JOB_IDLE)
    job_started_at = models.DateTimeField(null=True, blank=True)
    job_done = models.PositiveIntegerField(default=0)
    job_total = models.PositiveIntegerField(default=0)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "call_programs"
        ordering = ["-id"]


class CallProgramAgent(models.Model):
    program = models.ForeignKey(CallProgram, on_delete=models.CASCADE, related_name="agents")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    share_percent = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "call_program_agents"
        ordering = ["id"]
        constraints = [models.UniqueConstraint(fields=["program", "user"], name="call_program_agent_unique")]


class CallFormVersion(models.Model):
    """TierRuleSet pattern: at most one draft and one published version per program."""

    STATUS_DRAFT = "draft"
    STATUS_PUBLISHED = "published"
    STATUS_ARCHIVED = "archived"

    program = models.ForeignKey(CallProgram, on_delete=models.CASCADE, related_name="forms")
    version = models.PositiveIntegerField()
    status = models.CharField(
        max_length=16, choices=[(STATUS_DRAFT, "Draft"), (STATUS_PUBLISHED, "Published"), (STATUS_ARCHIVED, "Archived")]
    )
    schema = models.JSONField(default=dict)
    published_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "call_form_versions"
        ordering = ["-version"]
        constraints = [
            models.UniqueConstraint(fields=["program", "version"], name="call_form_version_unique"),
            models.UniqueConstraint(fields=["program"], condition=Q(status="draft"), name="call_form_one_draft"),
            models.UniqueConstraint(fields=["program"], condition=Q(status="published"), name="call_form_one_published"),
        ]


class CallTask(models.Model):
    STATUS_OPEN = "open"
    STATUS_DONE = "done"
    STATUS_UNREACHABLE = "unreachable"
    STATUS_CANCELLED = "cancelled"
    SOURCE_NEW = "new"
    SOURCE_RETRY = "retry"
    SOURCE_FOLLOWUP = "followup"

    program = models.ForeignKey(CallProgram, on_delete=models.CASCADE, related_name="tasks")
    customer = models.ForeignKey("customers.Customer", on_delete=models.CASCADE, related_name="+")
    assignee = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    due_at = models.DateTimeField()
    attempt = models.PositiveIntegerField(default=1)
    is_priority = models.BooleanField(default=False)
    source = models.CharField(
        max_length=16, choices=[(SOURCE_NEW, "New"), (SOURCE_RETRY, "Retry"), (SOURCE_FOLLOWUP, "Follow-up")], default=SOURCE_NEW
    )
    status = models.CharField(
        max_length=16,
        choices=[
            (STATUS_OPEN, "Open"),
            (STATUS_DONE, "Done"),
            (STATUS_UNREACHABLE, "Unreachable"),
            (STATUS_CANCELLED, "Cancelled"),
        ],
        default=STATUS_OPEN,
    )
    last_outcome_title = models.CharField(max_length=160, blank=True)
    # Snapshots so the agent list sorts and filters without touching sales tables.
    last_tag_ids = ArrayField(models.IntegerField(), default=list, blank=True)
    customer_value = models.BigIntegerField(default=0)
    closed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "call_tasks"
        constraints = [
            models.UniqueConstraint(fields=["customer"], condition=Q(status="open"), name="call_task_one_open_per_customer"),
        ]
        indexes = [
            models.Index(fields=["assignee", "due_at"], condition=Q(status="open"), name="call_task_open_assignee_due"),
            models.Index(fields=["assignee", "-closed_at"], condition=~Q(status="open"), name="call_task_closed_assignee"),
            models.Index(fields=["program", "customer"], name="call_task_program_customer"),
            models.Index(fields=["due_at"], condition=Q(status="open"), name="call_task_open_due"),
        ]


class CallLog(models.Model):
    task = models.ForeignKey(CallTask, on_delete=models.PROTECT, related_name="logs")
    customer = models.ForeignKey("customers.Customer", on_delete=models.CASCADE, related_name="+")
    agent = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    program = models.ForeignKey(CallProgram, on_delete=models.PROTECT, related_name="logs")
    form_version = models.ForeignKey(CallFormVersion, on_delete=models.PROTECT, related_name="+")
    outcome_id = models.CharField(max_length=64)
    outcome_title = models.CharField(max_length=160)
    connected = models.BooleanField(default=False)
    answers = models.JSONField(default=dict, blank=True)
    tag_ids = ArrayField(models.IntegerField(), default=list, blank=True)
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(db_index=False)

    class Meta:
        db_table = "call_logs"
        indexes = [
            models.Index(fields=["customer", "-created_at"], name="call_log_customer_created"),
            models.Index(fields=["program", "-created_at"], name="call_log_program_created"),
            models.Index(fields=["agent", "-created_at"], name="call_log_agent_created"),
            models.Index(fields=["created_at"], condition=Q(connected=True), name="call_log_connected_created"),
        ]


class CallAnswerFact(models.Model):
    """Single/multi/toggle/rating/number answers, written with the log. Reports read this, never the JSON."""

    log = models.ForeignKey(CallLog, on_delete=models.CASCADE, related_name="facts")
    program = models.ForeignKey(CallProgram, on_delete=models.CASCADE, related_name="+")
    field_id = models.CharField(max_length=64)
    option_id = models.CharField(max_length=64, null=True, blank=True)
    number_value = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    created_at = models.DateTimeField()

    class Meta:
        db_table = "call_answer_facts"
        indexes = [models.Index(fields=["program", "field_id", "option_id"], name="call_fact_program_field_opt")]


class CallLogPurchase(models.Model):
    """Filled by the nightly job only. One row per log: its attributed purchases (first date, total)."""

    log = models.OneToOneField(CallLog, on_delete=models.CASCADE, related_name="purchase")
    purchased_at = models.DateTimeField()
    amount = models.BigIntegerField(default=0)
    purchase_count = models.PositiveIntegerField(default=1)

    class Meta:
        db_table = "call_log_purchases"
        indexes = [models.Index(fields=["purchased_at"], name="call_log_purchase_at")]


class CustomerCallStatus(models.Model):
    customer = models.OneToOneField("customers.Customer", on_delete=models.CASCADE, related_name="call_status")
    do_not_call = models.BooleanField(default=False)
    next_call_allowed_at = models.DateTimeField(null=True, blank=True)
    last_outcome_title = models.CharField(max_length=160, blank=True)
    last_call_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "customer_call_status"
        indexes = [models.Index(fields=["-last_call_at"], name="call_status_last_call")]


class CustomerCallTag(models.Model):
    """Current needs-action state per (customer, tag); backs the report cards without reading log arrays."""

    customer = models.ForeignKey("customers.Customer", on_delete=models.CASCADE, related_name="+")
    tag = models.ForeignKey(CallTag, on_delete=models.CASCADE, related_name="+")
    program = models.ForeignKey(CallProgram, on_delete=models.CASCADE, related_name="+")
    log = models.ForeignKey(CallLog, on_delete=models.CASCADE, related_name="+")
    tagged_at = models.DateTimeField()
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "customer_call_tags"
        constraints = [models.UniqueConstraint(fields=["customer", "tag"], name="customer_call_tag_unique")]
        indexes = [
            models.Index(fields=["tag", "program", "-tagged_at"], condition=Q(resolved_at__isnull=True), name="call_tag_open"),
        ]


class CallEscalation(models.Model):
    STATUS_OPEN = "open"
    STATUS_CLOSED = "closed"

    log = models.ForeignKey(CallLog, on_delete=models.CASCADE, related_name="escalations")
    customer = models.ForeignKey("customers.Customer", on_delete=models.CASCADE, related_name="+")
    status = models.CharField(max_length=16, choices=[(STATUS_OPEN, "Open"), (STATUS_CLOSED, "Closed")], default=STATUS_OPEN)
    closed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    closed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "call_escalations"
        indexes = [models.Index(fields=["-id"], condition=Q(status="open"), name="call_escalation_open")]
