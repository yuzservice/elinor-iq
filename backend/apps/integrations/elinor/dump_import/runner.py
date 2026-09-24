from __future__ import annotations

import json
import time
from pathlib import Path

from django.utils import timezone

from apps.integrations.elinor.models import ImportRun

from .audit import audit_imported
from .extract import extract_dump
from .load import load_extracted
from .mapping import domains_for_tables, tables_for_domains
from .parser import iter_insert_tuples

DEFAULT_DUMP = "/source/elinor_new13-septamber-2026.sql"
DEFAULT_WORK = "/tmp/elinor_iq_core_import"


def run_core_import(
    dump_path,
    work_dir=DEFAULT_WORK,
    only=None,
    dry_run=False,
    resume=False,
    stdout=None,
):
    dump_path = str(Path(dump_path).resolve())
    work_dir = str(Path(work_dir))
    domains = domains_for_tables(only)
    started = time.monotonic()
    run = ImportRun.objects.create(kind=ImportRun.KIND_CORE, dump_path=dump_path, report={"domains": domains})
    log = stdout.write if stdout else (lambda *_: None)
    try:
        if dry_run:
            counts = _count_only(dump_path, domains, log)
            report = {
                "dry_run": True,
                "extract_counts": counts,
                "domains": domains,
            }
            _finish(run, ImportRun.STATUS_SUCCESS, report, started)
            return run

        extract_marker = Path(work_dir) / "_extract_done.json"
        extract_counts = {}
        if resume and extract_marker.exists():
            extract_counts = json.loads(extract_marker.read_text()).get("counts") or {}
            log("Resume: reusing extracted CSV files")
        else:
            log("Extracting dump (single pass)…")
            extracted = extract_dump(dump_path, work_dir, domains=only, stdout=stdout)
            extract_counts = extracted["counts"]
            extract_marker.write_text(json.dumps(extracted, default=str), encoding="utf-8")

        log(f"Loading domains: {', '.join(domains)}")
        loaded = load_extracted(work_dir, domains=only, stdout=stdout)
        log("Auditing…")
        audit = audit_imported(extract_counts)
        report = {
            "dry_run": False,
            "dump_path": dump_path,
            "extract_counts": extract_counts,
            "loaded_staging": loaded,
            "completed_domains": domains,
            "audit": _jsonable(audit),
            "existing_data_strategy": "upsert_by_source_id",
        }
        _finish(run, ImportRun.STATUS_SUCCESS, report, started)
        return run
    except Exception as exc:
        _finish(run, ImportRun.STATUS_FAILED, {"error": str(exc), "domains": domains}, started, error=str(exc))
        raise


def _count_only(dump_path, domains, log):
    tables = tables_for_domains(domains)
    counts = {table: 0 for table in tables}
    log("Dry-run: counting source tuples…")
    for table, _fields in iter_insert_tuples(dump_path, tables):
        counts[table] += 1
    return counts


def _finish(run, status, report, started, error=""):
    run.status = status
    run.finished_at = timezone.now()
    run.elapsed_seconds = round(time.monotonic() - started, 2)
    run.report = report
    run.error_message = error
    run.save(update_fields=["status", "finished_at", "elapsed_seconds", "report", "error_message"])


def _jsonable(value):
    if hasattr(value, "isoformat"):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: _jsonable(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_jsonable(v) for v in value]
    return value
