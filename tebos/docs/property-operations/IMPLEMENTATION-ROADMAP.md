# Tidy Property Operations: implementation roadmap

Each release has to pass its gate before the next starts. "Done" means persistence, guarded state changes,
permissions, failure states, audit events and tests, not only a working screen (ADR 0001). Nothing reaches
customers until the founder approves it.

## Release 0: foundations and research (done, 4 Nov 2026)

- Audit of the repository: no tenant, lease or rent structures existed; the PRA pattern (an app value, a
  create-account RPC, a separate Vite app) is reused.
- Documents: PRODUCT-VISION, COMPETITOR-ANALYSIS, PRODUCT-REQUIREMENTS, SYSTEM-ARCHITECTURE, this roadmap,
  SECURITY-AND-COMPLIANCE; venture-studio feasibility kept separate (`docs/venture-studio/FEASIBILITY.md`).
- Gate: the founder reads the documents. **Open:** the pricing hypothesis is not a price.

## Release 1: rental operations control (built; not live)

Portfolio, tenants and leases, the rent ledger (charges, payments, credits, refunds, reversals), arrears ageing,
statements, CSV import and export, maintenance with quotes, approval and photos, dashboard and monthly property report.

- Built: migration `20261104090000_property_operations.sql`; `src/domain/opsLedger.ts`; `web/src/ops/*`.
- Tested: `supabase/tests/99zzm_property_operations.sql` (database rules, roles, isolation, audit privacy),
  `test/opsLedger.test.ts` (arithmetic, CSV), `test/schema-parity.test.ts` (lists and pro-rata match the database),
  `web/e2e/ops.spec.ts` (journeys, roles in the interface, phone width).
- Gate to go live, all needed:
  1. the founder's "merge it" on the migration, then it is applied to the live database;
  2. a hosting decision for `dist-ops` (no added spend);
  3. one pilot landlord, opened manually as a pilot account, using it for one full month with real records;
  4. the pilot's month reconciled by hand against their bank statement, with zero unexplained differences.

## Release 2: tenant-facing documents (next)

- PDF statements and a monthly owner pack generated from the same figures.
- Lease document storage (private bucket, same path rule as photos).
- Deposit lifecycle: inspection records at move-in and move-out (Rental Housing Act s5), interest recorded on the
  deposit account, refund-due date shown (s5(3)(g) and (i): 14 days from restoration of the dwelling, or 7 days when nothing is owed; legal review to confirm the current text). Recording only: the landlord pays.
- Gate: a pilot's move-out handled end to end on the record; legal review of any wording shown to tenants.

## Release 3: communication drafts

- Draft arrears reminders and maintenance updates for a person to send from their own email or phone.
- Nothing is sent by the system (REEDS rule). If sending is ever added, it needs the founder's approval, consent
  records, opt-out and a provider chosen with no unplanned spend.
- Gate: founder approves the wording; POPIA direct-marketing rules checked (these are service messages, not marketing).

## Release 4: subscription and billing

- Plans, limits and trials already exist in the data model; Release 4 adds self-service sign-up limits, trial expiry
  handling and an invoice record, reusing TEBOS's billing where it fits.
- **No prices until the founder sets them.** No payment provider until the founder approves one.
- Gate: founder's pricing decision; terms of service and privacy notice reviewed by a lawyer.

## Release 5: integrations (only free or already-paid)

- Bank statement import already works from CSV; bank feeds only through a provider the founder approves.
- Accounting export as CSV (works now); direct accounting integrations later.
- Fallback for every integration: manual CSV. An integration is never presented as working until it is live and
  tested end to end.

## Known gaps in Release 1

- No editing of a tenant's details after creation (add a new record or correct through a later release).
- Unit and property archiving is in the schema (`archived_at`) but has no button yet.
- The monthly report prints from the browser; there is no PDF file yet.
- Hold back uses the browser's prompt box for the reason; it works but is plain.
