# Call Center (مرکز تماس)

Status: implemented on `feature/call-center`, not released (2026-11-02). Prototype: `docs/design/call-center-prototype.html` (its numbers and the employee/manager switch are prototype-only). Source: `backend/apps/calls/`, `frontend/src/features/calls/`, `pages/CallCenterPage.tsx`. Decision: `docs/decisions/0007-call-center.md`.

Nothing writes to the Elinor API. Sync-owned `Customer` fields are not changed; call state lives in `CustomerCallStatus`.

## Access
- Role `sales_agent`: `SalesAgentScopeMiddleware` blocks every `/api/` and `/admin/` path except `/api/auth/`, `/api/calls/`, `/api/health/`, `GET /api/customers/tiers/`, and `GET /api/customers/<source_id>/` (+ `purchases/`, `products/`) when a task of that customer is assigned to them (any task status).
- Managers = `super_admin`, `admin`, `manager`. Other roles have no Call Center. Everyone who can see Customer 360 sees its «تماس‌ها» tab.
- Tasks API always filters `assignee = request.user`, for managers too.
- Accounts are created in Settings (role select: ادمین, مدیر, کارمند تماس).

## Lists
- `fixed`: members stored in `CallListMember`. `dynamic`: filters only, re-evaluated with `customer_list_queryset`.
- Sources: filters (customers page), checked rows (fixed manual), Excel/CSV (mobile numbers; the count of unknown numbers is shown before saving; `.xlsx` is read with the standard library).
- Filling runs in a background thread with `job_status`.

## Activation and eligibility
Excluded, each customer in the first that applies: internal account, `do_not_call`, future `next_call_allowed_at`, customer with any open task. Also excluded: no mobile, and customers who already had a task in this program (keeps runs idempotent). Preview uses counts only. Split: equal, or by `share_percent` (must total 100), giving each next customer to the agent furthest behind their share. Runs in the background in batches of 1000; a row lock and `job_status` prevent double runs; a dead run expires after 2 hours. Paused programs hide their tasks from agents (tasks stay open and still hold the customer's single open task). Ending a program cancels its open tasks.

## Saving a log (one transaction, task row locked; 409 if not open)
- Connected: note required, at least `note_min_chars`. Not connected with no fields: one click.
- `retry`: while `attempt <= retry_times`, same task, due later, `attempt + 1`. After that: status `unreachable`, `last_outcome_title` «در دسترس نبود».
- `dnc`: `do_not_call = true`, this task `cancelled` (a customer has at most one open task).
- `close`: `done`.
- `next_call_allowed_at = now + no_call_days`, or `default_gap_days` when empty, set when connected or `no_call_days` is set. `0` means no wait.
- Date field with `creates_followup`: a new followup task on that date at 10:00, same agent. If the task stays open (retry), that task moves to the date instead, because one open task per customer is the rule. `dnc` creates no followup.
- `escalate`: `CallEscalation`. Tags = outcome tags + selected option tags; `CustomerCallTag` holds the current open state per (customer, tag).
- `CallAnswerFact` is written for single, multi, toggle (1/0), rating, number. Text, date and time stay in the JSON snapshot.
- Edit: the author only, within 24 hours, answers and note only. The effects above are not re-run. UI edits the note.

## Forms
One draft, one published per program; publishing archives the previous version; logs keep their version. Used outcomes and options can only be deactivated (publish refuses deletion).

## Purchase attribution (nightly, `calls_daily --if-due`, scheduler loop)
- Purchases: qualifying invoices from `semantics.py` through `overview._events_sql` (internal accounts excluded). Amount as the customers overview: online `total_amount`, POS signed lines. Unit: Toman as stored.
- Each purchase goes once to the latest connected call before it, when within `buy_window_days`. A log's range ends at the customer's next connected call.
- `CallLogPurchase` is one row per log: first purchase date, total amount, purchase count. Only logs younger than window + 2 days are recomputed (idempotent); older rows are final. A changed `buy_window_days` applies only to logs still open.
- A purchase after a tag with `open_until_purchase` resolves the tag (removes the customer from the card).
- Label in the UI: خرید بعد از تماس لزوماً نتیجه تماس نیست.

## Reports
No request-time joins to sales. Sales, answers and team are aggregates cached 15 minutes per (filters, day); escalations and the per-customer list are live and paginated. Text answers are read from the newest 100 logs of the program, for display only.

## Dynamic lists
The daily job creates tasks for new matches only.
