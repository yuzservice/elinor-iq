"""Customer lists and the eligibility rules shared by preview, activation and the daily job."""

import csv
import io
import logging
import threading
import xml.etree.ElementTree as ET
import zipfile

from django.db import connection
from django.db.models import Count, Exists, OuterRef, Q
from django.http import QueryDict
from django.utils import timezone

from apps.customers.list_query import customer_list_queryset
from apps.customers.models import Customer, InternalAccount
from apps.customers.operators import canonical_mobile

from .models import JOB_DONE, JOB_FAILED, JOB_RUNNING, CallList, CallListMember, CallTask, CustomerCallStatus

logger = logging.getLogger(__name__)
BATCH = 1000
MAX_UPLOAD_BYTES = 5 * 1024 * 1024


def _query_params(filter_params):
    params = QueryDict(mutable=True)
    for key, value in (filter_params or {}).items():
        if key in ("page", "per_page") or value in (None, ""):
            continue
        params.setlist(key, [str(item) for item in value] if isinstance(value, list) else [str(value)])
    return params


def filtered_customer_ids(filter_params):
    return customer_list_queryset(_query_params(filter_params)).order_by().values("pk")


def list_customers(call_list):
    if call_list.kind == CallList.KIND_DYNAMIC:
        return Customer.objects.filter(pk__in=filtered_customer_ids(call_list.filter_params))
    return Customer.objects.filter(pk__in=call_list.members.values("customer_id"))


def _annotated(call_list, program=None):
    status = CustomerCallStatus.objects.filter(customer_id=OuterRef("pk"))
    qs = list_customers(call_list).order_by().annotate(
        is_internal=Exists(InternalAccount.objects.filter(customer_id=OuterRef("pk"), is_active=True)),
        is_dnc=Exists(status.filter(do_not_call=True)),
        is_recent=Exists(status.filter(next_call_allowed_at__gt=timezone.now())),
        has_open=Exists(CallTask.objects.filter(customer_id=OuterRef("pk"), status=CallTask.STATUS_OPEN)),
    )
    if program is not None:
        qs = qs.annotate(in_program=Exists(CallTask.objects.filter(program=program, customer_id=OuterRef("pk"))))
    return qs


def eligible_customers(call_list, program):
    """Customers a new task may be created for. NOT EXISTS on the program keeps every run idempotent."""
    return _annotated(call_list, program).filter(
        is_internal=False,
        is_dnc=False,
        is_recent=False,
        has_open=False,
        in_program=False,
    ).exclude(mobile="")


def preview_counts(call_list, program=None):
    """Counts only; each customer falls in the first exclusion that applies."""
    internal = Q(is_internal=True)
    dnc = Q(is_dnc=True) & ~internal
    recent = Q(is_recent=True) & ~internal & ~Q(is_dnc=True)
    has_open = Q(has_open=True) & ~internal & ~Q(is_dnc=True) & ~Q(is_recent=True)
    excluded = internal | Q(is_dnc=True) | Q(is_recent=True) | Q(has_open=True)
    row = _annotated(call_list).aggregate(
        total=Count("pk"),
        internal=Count("pk", filter=internal),
        do_not_call=Count("pk", filter=dnc),
        recent=Count("pk", filter=recent),
        open_task=Count("pk", filter=has_open),
        eligible=Count("pk", filter=~excluded),
    )
    row["excluded"] = row["total"] - row["eligible"]
    return row


# --- Creating lists ---------------------------------------------------------------------------


def new_list(user, name, kind, source, filter_params=None):
    return CallList.objects.create(
        name=name, kind=kind, source=source, filter_params=filter_params or {}, created_by=user, job_status=JOB_RUNNING
    )


def start_fill(call_list, customer_ids=None):
    """Call after the creating transaction commits: the thread uses its own connection."""
    threading.Thread(target=_fill_list, args=(call_list.pk, customer_ids), name="call-list-fill", daemon=True).start()


def create_list(user, name, kind, source, filter_params=None, customer_ids=None):
    call_list = new_list(user, name, kind, source, filter_params)
    start_fill(call_list, customer_ids)
    return call_list


def _fill_list(list_id, customer_ids=None, close_connection=True):
    call_list = CallList.objects.get(pk=list_id)
    try:
        if call_list.kind == CallList.KIND_DYNAMIC:
            call_list.customer_count = list_customers(call_list).count()
        else:
            ids = customer_ids if customer_ids is not None else filtered_customer_ids(call_list.filter_params).values_list("pk", flat=True).iterator(chunk_size=BATCH)
            call_list.customer_count = _insert_members(call_list, ids)
        call_list.job_status = JOB_DONE
    except Exception:
        logger.exception("Call list fill failed")
        call_list.job_status = JOB_FAILED
    finally:
        call_list.save(update_fields=["customer_count", "job_status"])
        if close_connection:
            connection.close()


def _insert_members(call_list, customer_ids):
    batch, total = [], 0
    for customer_id in customer_ids:
        batch.append(CallListMember(list=call_list, customer_id=customer_id))
        total += 1
        if len(batch) >= BATCH:
            CallListMember.objects.bulk_create(batch, ignore_conflicts=True)
            batch = []
    if batch:
        CallListMember.objects.bulk_create(batch, ignore_conflicts=True)
    return total


# --- Excel upload (stdlib only: .xlsx is zipped XML) --------------------------------------------


def _xlsx_cells(data):
    ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    with zipfile.ZipFile(io.BytesIO(data)) as book:
        names = book.namelist()
        shared = []
        if "xl/sharedStrings.xml" in names:
            root = ET.fromstring(book.read("xl/sharedStrings.xml"))
            shared = ["".join(t.text or "" for t in item.iter(f"{{{ns['s']}}}t")) for item in root.findall("s:si", ns)]
        sheet = sorted(name for name in names if name.startswith("xl/worksheets/sheet") and name.endswith(".xml"))[0]
        for cell in ET.fromstring(book.read(sheet)).iter(f"{{{ns['s']}}}c"):
            value = cell.find("s:v", ns)
            if value is None or value.text is None:
                inline = "".join(t.text or "" for t in cell.iter(f"{{{ns['s']}}}t"))
                if inline:
                    yield inline
                continue
            yield shared[int(value.text)] if cell.get("t") == "s" else value.text


def _csv_cells(data):
    for row in csv.reader(io.StringIO(data.decode("utf-8-sig", errors="ignore"))):
        yield from row


def parse_mobiles(filename, data):
    """Ordered unique canonical mobiles found in the file. Raises ValueError on an unreadable file."""
    cells = _xlsx_cells(data) if filename.lower().endswith(".xlsx") else _csv_cells(data)
    try:
        found = {}
        for cell in cells:
            mobile = canonical_mobile(cell.split(".")[0] if cell.replace(".", "").isdigit() else cell)
            if len(mobile) == 11 and mobile.startswith("09"):
                found[mobile] = True
        return list(found)
    except (zipfile.BadZipFile, ET.ParseError, IndexError, KeyError) as exc:
        raise ValueError("فایل خوانده نشد.") from exc


def match_mobiles(mobiles):
    """(customer_ids, unknown_mobiles). Customer.mobile may be stored without the leading zero."""
    matched, known = [], set()
    for start in range(0, len(mobiles), BATCH):
        chunk = mobiles[start : start + BATCH]
        variants = chunk + [mobile[1:] for mobile in chunk]
        for pk, mobile in Customer.objects.filter(mobile__in=variants).values_list("pk", "mobile"):
            matched.append(pk)
            known.add(canonical_mobile(mobile))
    return matched, [mobile for mobile in mobiles if mobile not in known]
