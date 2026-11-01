"""Task creation (background, batched, locked) for program activation and the daily dynamic-list job."""

import logging
import threading
from datetime import timedelta

from django.db import connection, transaction
from django.utils import timezone

from apps.customers.tiers import tier_lifetime_amount_expression

from .lists import BATCH, eligible_customers
from .models import JOB_DONE, JOB_FAILED, JOB_RUNNING, CallProgram, CallTask

logger = logging.getLogger(__name__)
STALE_AFTER = timedelta(hours=2)


def _claim(program_id):
    """Row lock + status: two activations cannot run at once; a dead job expires after STALE_AFTER."""
    with transaction.atomic():
        program = CallProgram.objects.select_for_update().get(pk=program_id)
        now = timezone.now()
        if program.job_status == JOB_RUNNING and program.job_started_at and now - program.job_started_at < STALE_AFTER:
            return False
        program.job_status = JOB_RUNNING
        program.job_started_at = now
        program.job_done = 0
        program.job_total = 0
        program.save(update_fields=["job_status", "job_started_at", "job_done", "job_total"])
        return True


def split_targets(agents, share_mode):
    """[(user_id, weight)] for the assignment rule."""
    if share_mode == CallProgram.SHARE_CUSTOM:
        return [(agent.user_id, agent.share_percent) for agent in agents if agent.share_percent > 0]
    return [(agent.user_id, 1) for agent in agents]


def assign(targets, counts):
    """Agent furthest behind their share gets the next customer."""
    user_id = min(targets, key=lambda target: (counts.get(target[0], 0) + 1) / target[1])[0]
    counts[user_id] = counts.get(user_id, 0) + 1
    return user_id


def create_tasks(program):
    targets = split_targets(list(program.agents.all()), program.share_mode)
    if not targets or program.list_id is None:
        return 0
    qs = eligible_customers(program.list, program)
    program.job_total = qs.count()
    program.save(update_fields=["job_total"])
    now = timezone.now()
    counts, batch, created = {}, [], 0
    rows = qs.annotate(value=tier_lifetime_amount_expression()).values_list("pk", "value").iterator(chunk_size=BATCH)
    for customer_id, value in rows:
        batch.append(
            CallTask(program=program, customer_id=customer_id, assignee_id=assign(targets, counts), due_at=now, customer_value=value or 0)
        )
        if len(batch) >= BATCH:
            created += _flush(program, batch)
            batch = []
    if batch:
        created += _flush(program, batch)
    return created


def _flush(program, batch):
    # ignore_conflicts: the partial unique index wins if the customer got an open task meanwhile.
    CallTask.objects.bulk_create(batch, ignore_conflicts=True)
    CallProgram.objects.filter(pk=program.pk).update(job_done=program.job_done + len(batch))
    program.job_done += len(batch)
    return len(batch)


def run_activation(program_id, close_connection=True):
    program = CallProgram.objects.select_related("list").get(pk=program_id)
    try:
        create_tasks(program)
        CallProgram.objects.filter(pk=program_id).update(job_status=JOB_DONE)
    except Exception:
        logger.exception("Call program activation failed")
        CallProgram.objects.filter(pk=program_id).update(job_status=JOB_FAILED)
    finally:
        if close_connection:
            connection.close()


def start_activation(program):
    """False when a run is already in progress."""
    if not _claim(program.pk):
        return False
    CallProgram.objects.filter(pk=program.pk).update(status=CallProgram.STATUS_ACTIVE)
    threading.Thread(target=run_activation, args=(program.pk,), name="call-program-activate", daemon=True).start()
    return True


def _cancel_open_tasks(program_id, close_connection=True):
    try:
        ids = list(CallTask.objects.filter(program_id=program_id, status=CallTask.STATUS_OPEN).values_list("pk", flat=True))
        now = timezone.now()
        for start in range(0, len(ids), BATCH):
            CallTask.objects.filter(pk__in=ids[start : start + BATCH]).update(status=CallTask.STATUS_CANCELLED, closed_at=now)
    finally:
        if close_connection:
            connection.close()


def end_program(program):
    CallProgram.objects.filter(pk=program.pk).update(status=CallProgram.STATUS_ENDED)
    threading.Thread(target=_cancel_open_tasks, args=(program.pk,), name="call-program-end", daemon=True).start()
