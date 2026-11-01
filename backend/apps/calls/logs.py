"""Saving and editing a call log: all effects in one transaction on the locked task."""

import re
from datetime import date, datetime, time, timedelta
from decimal import Decimal, InvalidOperation

from django.core.cache import cache
from django.db import transaction
from django.utils import timezone

from . import forms
from .models import (
    CallAnswerFact,
    CallEscalation,
    CallLog,
    CallSettings,
    CallTask,
    CustomerCallStatus,
    CustomerCallTag,
)

EDIT_WINDOW = timedelta(hours=24)
UNREACHABLE_TITLE = "در دسترس نبود"
FOLLOWUP_HOUR = 10
_TIME = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


class LogError(Exception):
    def __init__(self, message, code=400, errors=None):
        super().__init__(message)
        self.code = code
        self.errors = errors or {}


def counts_cache_key(user_id):
    return f"calls-counts:{user_id}"


def _clean_value(field, raw):
    """Returns (value, option_ids) or raises ValueError. None means empty."""
    kind = field["type"]
    if raw in (None, "", []):
        return None, []
    if kind in ("text", "long_text"):
        return str(raw).strip()[:4000] or None, []
    if kind == "toggle":
        return bool(raw), []
    if kind == "number":
        number = Decimal(str(raw))
        if not number.is_finite() or abs(number) >= Decimal("1e12"):
            raise ValueError
        return float(number), []
    if kind == "rating":
        rating = int(raw)
        if not 1 <= rating <= 5:
            raise ValueError
        return rating, []
    if kind == "date":
        return date.fromisoformat(str(raw)).isoformat(), []
    if kind == "time":
        if not _TIME.match(str(raw)):
            raise ValueError
        return str(raw), []
    active = {option["id"] for option in field.get("options") or [] if option.get("is_active", True)}
    selected = [raw] if kind == "single" else list(raw)
    if not selected or set(selected) - active:
        raise ValueError
    return raw, selected


def clean_answers(outcome, raw_answers):
    """(snapshot, facts, tag_ids, followup_date), or LogError listing invalid fields."""
    snapshot, facts, errors = {}, [], {}
    tag_ids = list(outcome.get("tag_ids") or [])
    followup = None
    raw_answers = raw_answers if isinstance(raw_answers, dict) else {}
    for field in outcome.get("fields") or []:
        kind = field["type"]
        try:
            value, option_ids = _clean_value(field, raw_answers.get(field["id"]))
        except (TypeError, ValueError, InvalidOperation):
            errors[field["id"]] = "مقدار نامعتبر است."
            continue
        if value is None or (kind == "toggle" and value is None):
            if field.get("required") and kind != "toggle":
                errors[field["id"]] = "این فیلد اجباری است."
            continue
        titles = {option["id"]: option for option in field.get("options") or []}
        entry = {"type": kind, "title": field["title"], "value": value}
        if option_ids:
            entry["labels"] = [titles[option_id]["title"] for option_id in option_ids]
            for option_id in option_ids:
                tag_ids.extend(titles[option_id].get("tag_ids") or [])
                facts.append({"field_id": field["id"], "option_id": option_id, "number_value": None})
        elif kind == "toggle":
            facts.append({"field_id": field["id"], "option_id": None, "number_value": Decimal(1 if value else 0)})
        elif kind in ("number", "rating"):
            facts.append({"field_id": field["id"], "option_id": None, "number_value": Decimal(str(value))})
        if kind == "date" and field.get("creates_followup"):
            followup = date.fromisoformat(value)
        snapshot[field["id"]] = entry
    if errors:
        raise LogError("فرم کامل نیست.", errors=errors)
    return snapshot, facts, sorted(set(tag_ids)), followup


def _check_note(outcome, note, settings):
    if outcome.get("connected") and len(note) < settings.note_min_chars:
        raise LogError(f"یادداشت حداقل {settings.note_min_chars} حرف لازم است.", errors={"note": "کوتاه است."})


def _write_facts(log, facts):
    CallAnswerFact.objects.bulk_create(
        [CallAnswerFact(log=log, program_id=log.program_id, created_at=log.created_at, **fact) for fact in facts]
    )


def _close(task, status, now):
    task.status = status
    task.closed_at = now


def save_log(task_id, user, outcome_id, answers, note):
    note = (note or "").strip()
    with transaction.atomic():
        task = CallTask.objects.select_for_update().filter(pk=task_id, assignee=user).first()
        if task is None:
            raise LogError("کار پیدا نشد.", 404)
        if task.status != CallTask.STATUS_OPEN:
            raise LogError("این کار دیگر باز نیست.", 409)
        form = forms.published_form(task.program)
        if form is None:
            raise LogError("فرم این برنامه منتشر نشده است.", 409)
        outcome = next(
            (row for row in form.schema.get("outcomes") or [] if row.get("id") == outcome_id and row.get("is_active", True)),
            None,
        )
        if outcome is None:
            raise LogError("نتیجه تماس نامعتبر است.")
        settings = CallSettings.load()
        snapshot, facts, tag_ids, followup = clean_answers(outcome, answers)
        _check_note(outcome, note, settings)

        now = timezone.now()
        connected = bool(outcome.get("connected"))
        log = CallLog.objects.create(
            task=task,
            customer_id=task.customer_id,
            agent=user,
            program_id=task.program_id,
            form_version=form,
            outcome_id=outcome["id"],
            outcome_title=outcome["title"],
            connected=connected,
            answers=snapshot,
            tag_ids=tag_ids,
            note=note,
            created_at=now,
        )
        _write_facts(log, facts)

        task.last_outcome_title = outcome["title"]
        task.last_tag_ids = tag_ids
        after = outcome.get("after_save") or "close"
        result = "done"
        if after == "retry":
            if task.attempt <= int(outcome.get("retry_times") or 0):
                unit = timedelta(hours=1) if outcome.get("retry_unit") == "hour" else timedelta(days=1)
                task.due_at = now + unit * int(outcome.get("retry_gap") or 1)
                task.attempt += 1
                task.source = CallTask.SOURCE_RETRY
                result = "retry"
            else:
                _close(task, CallTask.STATUS_UNREACHABLE, now)
                task.last_outcome_title = UNREACHABLE_TITLE
                result = "unreachable"
        elif after == "dnc":
            _close(task, CallTask.STATUS_CANCELLED, now)
            result = "dnc"
        else:
            _close(task, CallTask.STATUS_DONE, now)

        status, _created = CustomerCallStatus.objects.select_for_update().get_or_create(customer_id=task.customer_id)
        status.last_outcome_title = task.last_outcome_title
        status.last_call_at = now
        no_call_days = outcome.get("no_call_days")
        if connected or no_call_days not in (None, ""):
            days = settings.default_gap_days if no_call_days in (None, "") else int(no_call_days)
            status.next_call_allowed_at = now + timedelta(days=days)
        if after == "dnc":
            status.do_not_call = True
        status.save()

        followup_at = None
        if followup is not None and after != "dnc":
            followup_at = timezone.make_aware(datetime.combine(followup, time(FOLLOWUP_HOUR)), timezone.get_current_timezone())
            if task.status == CallTask.STATUS_OPEN:
                # The one open task per customer stays; it simply moves to the follow-up date.
                task.due_at = followup_at
                task.source = CallTask.SOURCE_FOLLOWUP
        task.save()
        if followup_at is not None and task.status != CallTask.STATUS_OPEN:
            CallTask.objects.create(
                program_id=task.program_id,
                customer_id=task.customer_id,
                assignee=user,
                due_at=followup_at,
                source=CallTask.SOURCE_FOLLOWUP,
                customer_value=task.customer_value,
                last_outcome_title=task.last_outcome_title,
                last_tag_ids=tag_ids,
            )
        if outcome.get("escalate"):
            CallEscalation.objects.create(log=log, customer_id=task.customer_id)
        for tag_id in tag_ids:
            CustomerCallTag.objects.update_or_create(
                customer_id=task.customer_id,
                tag_id=tag_id,
                defaults={"program_id": task.program_id, "log": log, "tagged_at": now, "resolved_at": None},
            )
    cache.delete(counts_cache_key(user.pk))
    return log, {"result": result, "due_at": task.due_at if result == "retry" else None, "followup_at": followup_at}


def update_log(log_id, user, answers, note):
    note = (note or "").strip()
    with transaction.atomic():
        log = CallLog.objects.select_for_update().select_related("form_version").filter(pk=log_id, agent=user).first()
        if log is None:
            raise LogError("تماس پیدا نشد.", 404)
        if timezone.now() - log.created_at > EDIT_WINDOW:
            raise LogError("مهلت ۲۴ ساعته ویرایش تمام شده است.", 403)
        outcome = next((row for row in log.form_version.schema.get("outcomes") or [] if row.get("id") == log.outcome_id), None)
        if outcome is None:
            raise LogError("نتیجه این تماس پیدا نشد.", 409)
        snapshot, facts, tag_ids, _followup = clean_answers(outcome, answers)
        _check_note(outcome, note, CallSettings.load())
        log.answers = snapshot
        log.tag_ids = tag_ids
        log.note = note
        log.save(update_fields=["answers", "tag_ids", "note"])
        log.facts.all().delete()
        _write_facts(log, facts)
    return log
