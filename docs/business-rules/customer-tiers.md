# Customer Tiers — Business Rules

Source of truth in code: `backend/apps/customers/tier_rules.py` (rule shape, evaluation, summary),
`tiers.py` (facts, writers, titles), `tier_rule_admin.py` (versions, preview, activation).
Decisions: [[decisions/0001-configurable-tier-rules]], [[decisions/0002-dynamic-tiers-and-modal]].

## 1. Facts per customer (fixed)
| Fact | Definition |
|---|---|
| `purchase_count` | Online orders with status not in `canceled`, `failed`, `wait_for_payment` + POS sales with `type='sell'`, not deleted, not cancelled. Exchanges (`both`) and refunds do not count. |
| `days_since_last_purchase` | Reference date (Asia/Tehran, today) − local date of the latest qualifying online order or POS sell. |
| `lifetime_purchase_amount` | Online `total_amount` of qualifying orders + signed POS item lines: `sell` lines +, `both` sell lines +, `both` refund lines −, `refund` refund lines −. Not clamped at zero. Same units as stored amounts (no conversion). |

These facts are tier-only. They do not change sales reports or the online/POS revenue semantics.

## 2. Global guard (not configurable)
- `purchase_count <= 0` or no last purchase → no tier (NULL).
- Operator desk accounts (`operators.py`, `OPERATOR_MOBILES`) → always NULL. They are excluded from the facts and cleared after every write.

## 3. Rule shape
A rule version is an ordered list. Array order is evaluation priority; the **first enabled tier whose enabled conditions all match wins**.

```json
{"tiers": [
  {"code": "VIP", "title": "VIP", "enabled": true,
   "conditions": {
     "purchase_count":  {"enabled": true, "operator": "gte", "value": 4},
     "days_since_last": {"enabled": true, "value": 45},
     "lifetime_amount": {"enabled": true, "operator": "gte", "value": 10000000}
   }}
]}
```

| Condition | Comparison |
|---|---|
| `purchase_count` | `gte` (≥) or `lte` (≤) the value |
| `days_since_last` | **Upper bound only**: `days_since_last_purchase <= value`. No operator key; one sent is rejected. UI: «روز از آخرین خرید — تا … روز». |
| `lifetime_amount` | `gte` (≥) or `lte` (≤) the value |

All bounds are inclusive integers ≥ 0. A disabled condition is not evaluated and keeps its value.

### Codes and titles
- `code` is immutable and assigned by the server. The 8 original tiers keep their codes; new tiers get `CUSTOM_<n>`. `n` only grows (counter in `SyncCursor` key `customer_tier_custom_code`), so codes are never reused. A client can send only codes the server has issued.
- `title`: required, trimmed, 1–40 characters, unique within a version (case-insensitive).

### Disable and delete
- **Disabled tier**: kept in the version, not evaluated, hidden from filters and `GET /api/customers/tiers/`. Its customers fall through to the next matching tier, or to NULL.
- **Deleted tier**: absent from the new version. History rows keep its code and title.
- Labels for stored codes: title in the active version, else the newest archived version that has the code, else the code itself.

### Validation
At least 1 enabled tier; at most 12 tiers; each enabled tier needs at least one enabled condition; enabled condition needs an integer value ≥ 0 and a valid operator; no unknown keys; duplicate titles rejected. Messages are Persian, per tier and field.

## 4. Version 1 (identical to the rules before versioning)
| # | code | title | purchase_count | days_since_last (≤) | lifetime_amount |
|---|---|---|---|---|---|
| 1 | VIP | VIP | ≥ 4 | 45 | ≥ 10,000,000 |
| 2 | DIAMOND | الماس | ≥ 3 | 90 | ≥ 5,000,000 |
| 3 | GOLD_1 | طلایی سطح ۱ | ≥ 4 | 365 | ≥ 10,000,000 |
| 4 | GOLD_2 | طلایی سطح ۲ | ≥ 2 | 90 | – |
| 5 | BRONZE_1 | برنزی سطح ۱ | ≥ 1 | 29 | – |
| 6 | SILVER | نقره‌ای | ≥ 1 | 90 | – |
| 7 | BRONZE_2 | برنزی سطح ۲ | – | 179 | – |
| 8 | BRONZE_3 | برنزی سطح ۳ | ≥ 1 | – | – |

Why this equals the old rules:
- **BRONZE_1 before SILVER.** With upper-bound-only days, BRONZE_1 (≤ 29) must be evaluated first; day 30 still goes to SILVER.
- **GOLD_1** has no lower day bound: for days ≤ 90 its count and amount always match VIP or DIAMOND first, so it only catches 91–365.
- **BRONZE_3 is the catch-all** and replaces the old `days >= 180` rule: every purchaser not matched above has days ≥ 180.
- The equivalence is tested against the legacy logic over a grid (`test_customer_tier_rules.py`), in Python and SQL, and was checked on the local database (identical counts per tier).

## 5. Summary text
Generated from enabled conditions, same text in backend (`tier_summary`) and frontend (`tierSummary`):
«۴+ خرید · حداکثر ۴۵ روز از آخرین خرید · +۱۰ میلیون». Days always read «حداکثر N روز از آخرین خرید».

## 6. Versions and activation
- At most one `active` and one `draft` rule set. Earlier versions are `archived` and can be restored into the draft.
- Activation requires a valid draft with a preview taken after its last edit, and no tier job running.
- Activation recomputes every tier with the draft in one transaction; the previous rules stay in force until it succeeds. On failure nothing changes and the draft is marked `failed`.
- Preview warnings: purchasers that match no tier («X مشتری خریدار در هیچ سطحی قرار نمی‌گیرد»), deleted/disabled tiers that customers hold now (with count), deleted/disabled tiers used by campaign reports (VIP, DIAMOND, GOLD_1, SILVER: «گزارش کمپین‌های این سطح خالی می‌شود»), and enabled tiers left with 0 customers.

## 7. Tier history (`customer_tier_history`)
A row is written only when a customer's `tier_code` actually changes, in the same transaction as the update, with title snapshots (`previous_tier_title`, `tier_title`).

| Reason | Writer |
|---|---|
| `baseline` | Migration 0006: one row per customer that had a tier when versioning started (version-1 titles) |
| `daily` | Daily refresh from the hourly sync (`refresh_due_tiers`) |
| `manual` | `POST /api/customers/refresh-tiers/`, `manage.py refresh_customer_tiers --force` |
| `sync` | Incremental refresh of customers touched by a sync |
| `activation` | Activating a new rule version |

Operator clears are recorded with the reason of the run that cleared them.
Campaign reports (`campaigns.py`) still read the current `tier_code` with fixed codes; moving them to historical tiers is a later phase.
