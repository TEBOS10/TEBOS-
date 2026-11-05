# Tidy Property Operations: product requirements

Release 1, "Rental operations control". Each requirement has acceptance criteria that a test proves. Where a criterion
is enforced by the database, the database test (`supabase/tests/99zzm_property_operations.sql`) proves it; interface
criteria are proved by the e2e spec (`web/e2e/ops.spec.ts`); arithmetic by unit tests (`test/opsLedger.test.ts`).

Conventions: money is stored in **integer cents** (ZAR); dates are calendar dates in **Africa/Johannesburg**; a "month"
is a calendar month.

## R1. Accounts and access

- An operator opens a Property Operations account (its own organisation, `app = 'ops'`) and becomes its owner.
- Roles: **owner** (`org_admin`), **property manager** (`operator`), **approver** (`approver`: approves maintenance
  spend), **viewer** (`viewer`: read-only, e.g. an owner's accountant).
- Acceptance:
  - No one reads or writes another organisation's records (row-level security), whatever the interface shows.
  - Viewers and approvers can't create or change properties, tenants, leases or ledger entries.
  - A suspended account can be read but not written.
  - The account has a subscription record (plan, status, unit limit, user limit); a new account starts as a manual
    pilot. Only Tidy's platform staff change it.

## R2. Portfolio

- Properties: name, address (street, suburb, city, province, postal code), kind (residential, commercial, mixed).
- Units within a property: label, type (bachelor, 1-bed, 2-bed, 3-bed+, house, room, shop, office, other), market rent.
- A unit can be marked **held back** (off the market, e.g. under renovation), with a reason.
- Acceptance:
  - Occupancy is **derived**: a unit is occupied when it has an active lease today; otherwise vacant (or held back).
  - Unit labels are unique within a property.
  - Creating a unit beyond the subscription's unit limit is refused.
  - Monthly potential rental income = the sum of each unit's rent: the lease rent where let, the market rent where
    vacant (labelled *estimated*).

## R3. Tenants and leases

- Tenant: full name, email, phone, notes (no ID numbers in Release 1: data minimisation).
- Lease: unit, tenant, start date, end date (or month-to-month), monthly rent, rent due day (1–28), deposit agreed,
  where the deposit is held (bank and account name, never an account number), a stable **payment reference** (`L-0001`).
- A lease ends with a date and a reason; it can't be deleted.
- Acceptance:
  - A unit has at most one active lease covering any date (no overlaps).
  - Ending a lease needs an end date on or after its start and a reason.
  - Tenant history: every lease a tenant has had, and every tenant a unit has had.

## R4. Rental operations (the ledger)

- Entry kinds: **charge** (rent, deposit, utilities, damage, other), **payment** (EFT, cash, debit order, card,
  other), **credit** (a concession), **refund** (deposit paid back), **reversal** (cancels one entry, with a reason).
- Monthly rent charges are generated per month for every lease active in that month, once.
- Payments are recorded with date, method and the bank reference; the platform never moves money.
- Allocation rule (published, deterministic): payments and credits settle the **oldest outstanding charge first**,
  rent account and deposit account kept apart.
- Acceptance:
  - Entries are append-only: no update or delete; a mistake is corrected by a reversal naming the original and a reason.
  - An entry can be reversed once; a reversal can't be reversed.
  - Generating rent twice for the same month creates nothing new.
  - Balance, overdue amount and ageing (current, 1–30, 31–60, 61–90, 90+ days) are computed from entries, never typed.
  - A statement per lease lists every entry with a running balance; the deposit is shown separately.
  - Payments reconciliation: payments in a period, by method and reference, exportable as CSV.
  - CSV import of payments (date, reference, amount): shows a preview matching each line to a lease by its payment
    reference, flags unmatched lines, and imports only what the user confirms.
  - Money arithmetic is in integer cents end to end; no floating point.

## R5. Maintenance

- A request: property, optional unit, title, description, priority, photos.
- Lifecycle: reported → quoted → approved → in progress → done; or declined or cancelled at the right points.
- Suppliers: name, trade, phone, email.
- Acceptance:
  - Quoted needs a supplier and an amount; approved needs an owner or approver (not the person who requested it, when
    another approver exists — Release 2); done needs the actual cost and completion date.
  - Every change of status records who and when (audit trail).
  - Photos are private to the organisation (storage policy by organisation).
  - History per property and per unit.

## R6. Reporting

- Dashboard: properties, units, occupied, vacant, held back, occupancy %, expected rent this month, billed this month,
  received this month, outstanding, overdue (arrears), maintenance spend this month, estimated vacancy loss.
- Monthly property performance report per property, printable.
- Acceptance:
  - Every metric is computed from records in the database for the selected month.
  - Each figure is labelled with its basis: expected, billed, received, estimated.
  - Deposits are never counted as income.

## Non-functional

- Phone-first layout; works at 390 px wide without sideways scrolling.
- Dark interface: black, charcoal, white, subtle navy.
- Every button does what it says; no placeholder features.
- Errors explain what to do next in plain words.

## R7. Needs attention (directive v2, part 7)

The overview lists what a manager should act on, ranked, from the account's own records only. It suggests; it never
acts, sends or decides.

| Rule | Severity | Threshold |
|---|---|---|
| Overdue rent | serious if any of it is over 30 days, otherwise needs action | any overdue amount |
| This month's rent not charged | needs action | expected > billed (current month only) |
| Fixed term ending | needs action within 30 days; to complete within 60 | `ends_on` |
| Vacant unit (not held back) | needs action | no lease covers today |
| Quote waiting for approval | needs action | status quoted |
| Repair open too long | serious if urgent; needs action if open more than 14 days | `reported_on` |
| Deposit not fully received | to complete | more than 7 days after the lease starts |
| Where the deposit is held not recorded | to complete | deposit agreed |
| No contact details for a tenant on an active lease | to complete | no email and no phone |

- Acceptance: each line links to the record and states what it was computed from; most serious first, then the
  largest amount; six shown, the rest one press away; a clear message when nothing needs attention.
- Proved by `test/opsAttention.test.ts` and `web/e2e/ops.spec.ts`.

