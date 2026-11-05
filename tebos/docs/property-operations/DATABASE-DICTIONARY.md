# Tidy Property Operations: database dictionary

Source of truth: `supabase/migrations/20261104090000_property_operations.sql` (**not yet applied live**). Tested by
`supabase/tests/99zzm_property_operations.sql`. When this document and the migration disagree, the migration is right
and this document is a bug.

## 1. Conventions

- **Money** is `bigint` **integer cents** of ZAR, bounded 0–R1 000 000 000. Integer minor units are exact (no rounding
  error is possible in addition and subtraction) and are an "appropriate decimal implementation" in the directive's
  terms. Postgres `numeric` would also be exact; cents were chosen because every amount is whole cents, the arithmetic
  stays integer in both SQL and TypeScript, and JSON carries it without precision loss. Division happens only in
  pro-rata, which rounds half up in one documented place (`tebos_private.ops_pro_rata`, mirrored by `proRata`).
- **Dates** are `date` in Africa/Johannesburg. Timestamps are `timestamptz`.
- **Tenancy**: every table has `org_id`. Composite foreign keys `(id, org_id)` make it impossible for a row to point at
  another organisation's row.
- **Nothing is hard-deleted** by the app: there are no delete policies. Corrections are new rows (ledger) or guarded
  status changes.
- **Audit**: every insert and update writes to `audit_events` (hash-chained). For `ops_tenants`, `ops_leases` and
  `ops_suppliers` only the names of the changed fields are recorded, not their values.

## 2. Tables

### ops_subscriptions (one per account)

| Column | Type | Rules |
|---|---|---|
| org_id | uuid PK → organisations | |
| plan | text | pilot, starter, growth, portfolio (default pilot). **No prices attached** |
| status | text | trial, active, suspended, cancelled. Suspended or cancelled = read-only |
| unit_limit / user_limit | integer | default 60 / 5; the unit limit is enforced on insert |
| trial_ends_on, note, updated_at | | changed only by platform staff (`ops_set_subscription`) |

### ops_properties

| Column | Type | Rules |
|---|---|---|
| id, org_id | uuid | |
| name | text | 2–120 |
| street, suburb | text | optional |
| city | text | required, 2–80 |
| province | text | one of the nine provinces |
| postal_code | text | 4 digits |
| kind | text | residential, commercial, mixed |
| archived_at | timestamptz | soft archive (no button yet): an archived property is left out of lists and monthly summaries |

### ops_units

| Column | Type | Rules |
|---|---|---|
| property_id | uuid → ops_properties | same organisation |
| label | text | 1–40; **unique per property**, ignoring case and spaces |
| unit_type | text | bachelor, one_bed, two_bed, three_bed_plus, house, room, shop, office, other |
| market_rent_cents | bigint | optional; the basis of "estimated" vacancy figures |
| held_back, held_back_reason | | off the market; a reason of 3+ characters is required |

Occupancy is **not stored**: a unit is let when a lease covers the day.

### ops_tenants

| Column | Type | Rules |
|---|---|---|
| full_name | text | 2–120 |
| email, phone | text | format-checked, optional |
| notes | text | ≤ 500; refuses text containing an email address, a South African phone number or a 13-digit number such as an ID number (`looks_personal`): contact details have their own fields |

No ID numbers, dates of birth or bank details are stored (data minimisation, POPIA condition 2).

### ops_leases

| Column | Type | Rules |
|---|---|---|
| unit_id, tenant_id | uuid | same organisation; frozen after creation |
| ref | text | `L-0001`…, assigned by the database; the tenant's payment reference |
| starts_on, ends_on | date | ends_on optional (month to month); ends_on ≥ starts_on |
| rent_cents | bigint | ≥ 1 cent |
| due_day | smallint | 1–28 |
| deposit_cents | bigint | agreed deposit |
| deposit_held_at | text | where it is held; refuses runs of 6+ digits (no account numbers) |
| status, ended_on, end_reason | | active → ended once, with a reason of 5+ characters; an ended lease is frozen |

No two leases on one unit may overlap (trigger, `TEBOS_VALIDATION`).

### ops_ledger (append-only)

| Column | Type | Rules |
|---|---|---|
| lease_id | uuid | |
| kind | text | charge, payment, credit, refund, reversal |
| account | text | rent or deposit. Charges with category deposit go to deposit; credits to rent; refunds to deposit |
| category | text | charges only: rent, deposit, utilities, damage, other |
| method | text | payments only: eft, cash, debit_order, card, other |
| amount_cents | bigint | always positive; the kind gives the direction |
| effective_on | date | payments not in the future; nothing > 62 days ahead or > 31 days before the lease starts |
| period | date | rent charges only: the first of the month charged; one unreversed rent charge per period |
| reference, note | text | a reversal needs a note of 5+ characters |
| reverses_id | uuid unique | one reversal per entry; a reversal mirrors the original's amount and account and can't itself be reversed |

No update and no delete, ever (`TEBOS_INPUT_FROZEN`).

### ops_suppliers

name, trade, phone, email, active.

### ops_maintenance

| Column | Type | Rules |
|---|---|---|
| ref | text | `M-0001`…, from the database |
| property_id, unit_id | uuid | unit optional; must belong to the property |
| title, description, priority | | priority: low, normal, urgent |
| status | text | state machine `ops_maintenance` (below) |
| supplier_id, quote_cents, quote_ref | | quoted needs a supplier and an amount; an approved quote is frozen |
| decided_by, decided_at | | set by the database when an owner or approver approves or declines |
| cost_cents, completed_on | | done needs both; completed_on between reported_on and today |
| status_note | text | required to decline or cancel |
| reported_on, reported_by | | |

States: reported → quoted → approved → in_progress → done; quoted → declined → quoted; any open state → cancelled.
Finished requests (done, cancelled) are frozen.

### ops_maintenance_photos

request_id, path (`{org}/maintenance/{request}/{id}`, enforced), file_name. Files live in the private `ops-files`
bucket (10 MB, JPEG/PNG/WebP); the upload policy requires the record to exist first. Index on (request_id, created_at).

## 3. Functions

| Function | Who | What |
|---|---|---|
| `create_ops_account(p_name)` | any signed-in user, once | creates the organisation (app `ops`), owner membership and a pilot/trial subscription |
| `ops_set_subscription(...)` | platform staff | plan, status, limits, trial end |
| `ops_generate_rent(p_org, p_month)` | owner or manager, live subscription | one rent charge per active lease for the month, pro-rated; idempotent; returns the count |
| `ops_lease_positions(p_org, p_as_of)` | members | balance, overdue, ageing buckets, deposit held and last payment per lease (FIFO) |
| `ops_month_summary(p_org, p_month, p_property)` | members | the month's labelled figures (SYSTEM-ARCHITECTURE §2) |
| `tebos_private.ops_writable(org, roles)` | internal | role **and** live subscription |
| `tebos_private.ops_pro_rata(...)` | internal | the one rounding rule |

## 4. Indexes

Every table has an `org_id` index (RLS filters by it). Plus: units (property, label) unique; leases (unit, starts_on),
(tenant), (org, status); ledger (lease, effective_on, created_at), (org, effective_on); maintenance (org, status),
(property, created_at desc); photos (request, created_at).
