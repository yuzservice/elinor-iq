from django.utils import timezone

from apps.smart_direct.models import SmartDirectRuntimeState


def get_runtime_state():
    state, _ = SmartDirectRuntimeState.objects.get_or_create(pk=1)
    return state


def record_webhook_result(*, status, note=""):
    state = get_runtime_state()
    state.last_webhook_at = timezone.now()
    state.last_webhook_status = status
    state.last_webhook_note = (note or "")[:128]
    state.save(update_fields=["last_webhook_at", "last_webhook_status", "last_webhook_note"])
    return state


def record_send_result(*, ok, session_id=None, error=""):
    state = get_runtime_state()
    state.last_send_at = timezone.now()
    state.last_send_ok = ok
    state.last_send_session_id = session_id
    state.last_send_error = (error or "")[:255]
    state.save(
        update_fields=[
            "last_send_at",
            "last_send_ok",
            "last_send_session_id",
            "last_send_error",
        ]
    )
    return state
