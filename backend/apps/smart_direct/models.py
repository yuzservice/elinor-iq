from django.db import models
from django.utils import timezone


class SmartDirectSession(models.Model):
    """Permanent conversation outcome. Instagram remains the chat store; no transcript here."""

    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        LINK_SENT = "LINK_SENT", "Link sent"
        ADMIN_HANDOFF = "ADMIN_HANDOFF", "Admin handoff"
        CLOSED = "CLOSED", "Closed"

    instagram_user_id = models.CharField(max_length=64, db_index=True)
    external_conversation_id = models.CharField(max_length=128, blank=True, db_index=True)
    started_at = models.DateTimeField(default=timezone.now, db_index=True)
    last_activity_at = models.DateTimeField(default=timezone.now, db_index=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(
        max_length=32,
        choices=Status.choices,
        default=Status.ACTIVE,
        db_index=True,
    )

    request_summary = models.TextField(blank=True)
    detected_product_type = models.CharField(max_length=255, blank=True)
    detected_color = models.CharField(max_length=128, blank=True)
    detected_size = models.CharField(max_length=64, blank=True)
    detected_budget_min = models.BigIntegerField(null=True, blank=True)
    detected_budget_max = models.BigIntegerField(null=True, blank=True)
    selected_product_source_id = models.BigIntegerField(null=True, blank=True)
    selected_variant_source_id = models.BigIntegerField(null=True, blank=True)
    outcome = models.CharField(max_length=64, blank=True)

    class Meta:
        db_table = "smart_direct_sessions"
        ordering = ["-last_activity_at", "-id"]

    def __str__(self):
        return f"SmartDirectSession {self.pk} ({self.status})"


class SmartDirectEvent(models.Model):
    """Permanent analytics event. Must not store full Instagram message bodies."""

    class EventType(models.TextChoices):
        SESSION_STARTED = "SESSION_STARTED", "Session started"
        PRODUCT_REQUEST = "PRODUCT_REQUEST", "Product request"
        PRODUCT_SUGGESTED = "PRODUCT_SUGGESTED", "Product suggested"
        PRODUCT_SELECTED = "PRODUCT_SELECTED", "Product selected"
        PRODUCT_LINK_SENT = "PRODUCT_LINK_SENT", "Product link sent"
        LINK_CLICKED = "LINK_CLICKED", "Link clicked"
        CUSTOMER_MESSAGE_RECEIVED = "CUSTOMER_MESSAGE_RECEIVED", "Customer message received"
        ADMIN_REPLY_SENT = "ADMIN_REPLY_SENT", "Admin reply sent"
        ADMIN_HANDOFF = "ADMIN_HANDOFF", "Admin handoff"
        SESSION_CLOSED = "SESSION_CLOSED", "Session closed"

    session = models.ForeignKey(
        SmartDirectSession,
        related_name="events",
        on_delete=models.CASCADE,
    )
    event_type = models.CharField(max_length=32, choices=EventType.choices, db_index=True)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)
    product_source_id = models.BigIntegerField(null=True, blank=True)
    variant_source_id = models.BigIntegerField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "smart_direct_events"
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return f"{self.event_type} @ {self.created_at}"


class TemporaryConversationContext(models.Model):
    """Short-lived working memory for an active conversation. Deleted after expiry."""

    session = models.OneToOneField(
        SmartDirectSession,
        related_name="temporary_context",
        on_delete=models.CASCADE,
    )
    recent_messages = models.JSONField(default=list)
    state = models.JSONField(default=dict)
    expires_at = models.DateTimeField(db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "smart_direct_temporary_contexts"

    def __str__(self):
        return f"Temporary context for session {self.session_id}"


class InstagramProcessedEvent(models.Model):
    """Deduplication key only. Never stores message bodies or webhook payloads."""

    class Kind(models.TextChoices):
        INBOUND_MESSAGE = "inbound_message", "Inbound message"
        OUTBOUND_MESSAGE = "outbound_message", "Outbound message"

    external_id = models.CharField(max_length=255, unique=True)
    kind = models.CharField(max_length=32, choices=Kind.choices)
    session = models.ForeignKey(
        SmartDirectSession,
        related_name="processed_instagram_events",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
    )
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        db_table = "smart_direct_processed_events"

    def __str__(self):
        return self.external_id


class SmartDirectRuntimeState(models.Model):
    """Singleton operational status. No secrets and no conversation content."""

    last_webhook_at = models.DateTimeField(null=True, blank=True)
    last_webhook_status = models.CharField(max_length=32, blank=True)
    last_webhook_note = models.CharField(max_length=128, blank=True)
    last_send_at = models.DateTimeField(null=True, blank=True)
    last_send_ok = models.BooleanField(null=True, blank=True)
    last_send_error = models.CharField(max_length=255, blank=True)
    last_send_session_id = models.BigIntegerField(null=True, blank=True)

    class Meta:
        db_table = "smart_direct_runtime_state"

    def __str__(self):
        return "Smart Direct runtime state"
