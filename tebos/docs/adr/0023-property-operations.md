# ADR 0023: Tidy Property Operations

Date: 4 Nov 2026. Status: proposed (built 4 Nov; the migration waits for the founder's "merge it").

## Context

The founder's master build directive (4 Nov 2026) asks for a property-management product for South African landlords
and small managing agents, distributed through TEBOS: portfolio, tenants and leases, rent and arrears, maintenance and
reports, with exact money and a full audit trail, and never holding money. TEBOS had no tenant, lease or rent tables.
The Property Revenue Architecture app showed how a separate product runs on TEBOS (its own `organisations.app`, a
create-account function, its own Vite build).

## Decision

- A separate app, `ops`, with its own sign-in and accounts (`organisations.app = 'ops'`), built from
  `vite.ops.config.ts` into `dist-ops/`. It is not merged into TEBOS, TEPOS or PRA.
- Migration `20261104090000_property_operations.sql`: subscriptions, properties, units, tenants, leases, an
  append-only two-account ledger (rent, deposit), suppliers, maintenance with a guarded state machine, photos in a
  private bucket, and the functions `create_ops_account`, `ops_set_subscription`, `ops_generate_rent`,
  `ops_lease_positions`, `ops_month_summary`.
- Money in integer cents; balances computed, never stored; FIFO allocation; pro-rata half up. The same arithmetic is in
  `src/domain/opsLedger.ts`, kept equal to the database by the parity test.
- Writes need a manager role and a live subscription. Only the owner or an approver approves maintenance spend.
- The audit trail records only the names of changed fields for tenants, leases and suppliers.
- The product records money; it never holds, collects or moves it (Property Practitioners Act boundary).
- Accounts start as manual pilots. No prices are set; plans and limits exist so pricing can be added later.

## Consequences

- Nothing is live until the migration is applied and a host is chosen.
- New tables follow existing permission, state-machine and audit patterns, so TEBOS's checks cover them.
- Editing tenant details, archiving, PDF statements, deposit inspections and drafted messages are later releases
  (`docs/property-operations/IMPLEMENTATION-ROADMAP.md`).
