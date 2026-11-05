# Tidy Property Operations: system architecture

Status: Release 1 is built and tested locally. The migration is **not applied** to the live database (it waits for
the founder's "merge it"), and the app is **not deployed**.

## 1. Where it sits

Property Operations is a product **distributed through TEBOS**. It reuses TEBOS's foundations instead of copying them:

| Layer | What it reuses | What is new |
|---|---|---|
| Accounts | `organisations`, `memberships`, roles (`org_admin`, `operator`, `approver`, `viewer`) | `organisations.app = 'ops'`; `create_ops_account` |
| Permissions | `tebos_private.has_role`, `is_member`, `is_platform_admin`; row-level security on every table | `tebos_private.ops_writable(org, roles)`: role **and** a live subscription |
| State changes | `state_transitions` + `guard_status(machine)` | machine `ops_maintenance` |
| Audit | `audit_row` / `write_audit` (hash-chained, append-only `audit_events`) | `audit_fields_only` for tables holding personal details |
| Files | Supabase Storage with policies | private bucket `ops-files` |
| Interface | `web/` components, session, router, sign-in, two-step sign-in, account page | its own Vite app (`vite.ops.config.ts` → `dist-ops/`), dark theme (`src/ops/ops.css`) |

It is a separate app with its own sign-in and accounts. It does not merge into the TEBOS, TEPOS or Property Revenue
Architecture apps, and those apps don't see `ops` organisations (each session lists only its own app's organisations).

```
 Browser (dist-ops)                     Supabase (Postgres + Auth + Storage)
 ─────────────────                      ──────────────────────────────────────────────
 OpsApp ─ SessionProvider(app="ops") ─► auth (user's own session, publishable key only)
   ├─ Dashboard     ──── rpc ────────► ops_month_summary, ops_generate_rent
   ├─ Properties    ──── rest ───────► ops_properties, ops_units           ┐
   ├─ Tenants       ──── rest ───────► ops_tenants, ops_leases             │ RLS: member_read,
   ├─ Lease         ──── rest ───────► ops_ledger (insert only)            │ manager_insert/update
   ├─ Rent/arrears  ──── rpc ────────► ops_lease_positions                 │ via ops_writable
   └─ Maintenance   ──── rest ───────► ops_suppliers, ops_maintenance(_photos) ┘
                    ──── storage ────► ops-files/{org}/maintenance/{request}/{photo}
                                         triggers: a_write → guard_ops_* → guard_status → audit
```

## 2. Data model

Migration: `supabase/migrations/20261104090000_property_operations.sql`. All tables carry `org_id`, and every foreign
key stays inside the organisation.

| Table | Purpose | Key rules |
|---|---|---|
| `ops_subscriptions` | plan, status, unit and user limits, trial end | one per organisation; only platform staff change it (`ops_set_subscription`) |
| `ops_properties` | a building or stand | province from a fixed list; 4-digit postal code |
| `ops_units` | a lettable unit | unique label per property; market rent; held back needs a reason; unit limit enforced |
| `ops_tenants` | contact details only | email and phone checks; notes refuse things that look like ID numbers |
| `ops_leases` | unit + tenant + dates + rent + deposit | reference `L-nnnn` from the database; due day 1–28; no two leases on one unit overlap; ended leases are frozen |
| `ops_ledger` | every charge, payment, credit, refund and reversal | **append-only**; corrections are reversals with a reason |
| `ops_suppliers` | contractors | — |
| `ops_maintenance` | a request from report to done | reference `M-nnnn`; state machine; approval by owner or approver only |
| `ops_maintenance_photos` | photo records | the path must be `{org}/maintenance/{request}/{id}` |

### Money

- Integer **cents** (`bigint`), ZAR only. No floating point anywhere in the ledger.
- Each lease has two accounts: **rent** (what the tenant owes) and **deposit** (what is held for the tenant). Deposit
  money is never income and never settles rent.
- A balance is never stored: it is computed from the ledger by `ops_lease_positions` (database) and `position`
  (`src/domain/opsLedger.ts`), which agree by test.
- Payments settle the **oldest charge first** (FIFO). Overdue is what remains of charges whose due date has passed,
  bucketed by age: 1–30, 31–60, 61–90, 90+ days.
- A part month is pro-rated by days, rounded half up: `(rent × days × 2 + days_in_month) div (2 × days_in_month)`.
  `tebos_private.ops_pro_rata` and `proRata` must match (parity test).

### Ledger rules (database-enforced, `guard_ops_ledger`)

- No update or delete, ever (only the cascade when an organisation is removed).
- A reversal mirrors the original's amount and account, on the same lease; one reversal per entry; a reversal can't
  be reversed; a reason of at least 5 characters.
- Payments can't be dated in the future. Nothing more than 62 days ahead or more than 31 days before the lease starts.
- A rent charge must fall inside the lease and there can't be two unreversed charges for one period.

### Rent generation

`ops_generate_rent(org, month)` charges every active lease once for the month, pro-rated where the lease starts or
ends mid-month. It is idempotent: running it twice adds nothing. It runs with the caller's rights (security invoker),
so a viewer can't run it. It is started by a person pressing **Charge rent**; there is no scheduler.

### Figures and their basis

`ops_month_summary` returns figures each labelled by what they are:

| Basis | Meaning |
|---|---|
| expected | from leases: rent due for the month if every lease is charged |
| billed | rent actually charged in the ledger |
| received | payments recorded for the month |
| owed / overdue | computed from the ledger as at a date |
| held | deposits held |
| estimated | market rent of vacant units (an estimate, never income) |
| actual | maintenance cost recorded on finished requests |

The interface never shows a number it didn't get from these records.

## 3. Maintenance lifecycle

`reported → quoted → approved → in_progress → done`, with `declined` (back to `quoted` with a new quote) and
`cancelled` from any open state. Guards: only an owner or approver approves or declines, and approving changes nothing
else; quoted needs a supplier and amount; done needs the actual cost and a completion date between the report date and
today; declined and cancelled need a note; a finished request is frozen.

## 4. Interface

`web/src/ops/`: `OpsApp.tsx` (sign-in gate, account opening, shell, routes), `DashboardPage`, `PropertyPages`,
`TenantPages`, `LeasePages`, `RentPage`, `MaintenancePages`, `util.tsx`; styling from `tokens.css` (the single source of
truth, DESIGN-SYSTEM.md) and `ops.css`; theme choice in `theme.ts`. The overview's "Needs attention" list is computed in
the browser by `src/domain/opsAttention.ts` from records the page already loads (no extra database access). Data access is in
`web/src/lib/opsData.ts`. The interface pre-checks inputs for helpful messages, but **the database is the authority**:
hiding a button is not security, and every rule above holds against a direct API call.

CSV: statement export per lease, arrears export, monthly payments export, and payments import from a bank statement
(previewed, matched by lease reference, saved only when confirmed). Parsing is in `opsLedger.ts`.

## 5. What it deliberately does not do

- Hold, collect or move money (no trust account, no payment processing): see SECURITY-AND-COMPLIANCE §4.
- Send messages to tenants or anyone else.
- Run anything on a schedule.
- Use AI on money or on decisions about tenants.
