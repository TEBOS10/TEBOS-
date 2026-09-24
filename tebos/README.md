# TEBOS core

The TEBOS control plane's durable core: schema, domain rules and security primitives. There is deliberately
no UI here yet. See [ADR 0001](docs/adr/0001-foundations-first.md) for why, and what exists so far.

```
source → evidence → finding → action → approval → run → verification → outcome
                      every step persisted, guarded, audited
```

## Layout

| Path | What |
|---|---|
| `supabase/migrations/` | Postgres schema for a dedicated TEBOS Supabase project: tenancy, businesses, scans, evidence graph, findings, actions, approvals, runs, outcomes, capability registry, connections, agent runs, audit trail, RLS |
| `supabase/tests/` | SQL tests that try to break each rule (cross-tenant access, fake completion, unsupported findings, self-approval, unverified "connected", audit tampering, …) |
| `src/domain/` | Pure TypeScript mirror of the rules, plus confidence model, scan outcome, evidence-graph explainer, action engine, capability routing |
| `src/security/url-safety.ts` | SSRF-safe URL and redirect policy for public acquisition |
| `test/` | Unit tests, including parity tests that fail if the TS state machines or rule codes drift from the SQL |

## Core rules the database enforces

| Rule | Where |
|---|---|
| Tenant isolation (RLS + composite FKs + frozen tenant keys) | `…_rls.sql`, `…_hardening.sql`, all tables |
| Legal state transitions only | `state_transitions` + `enforce_state_machine` triggers |
| Scan status must match what was acquired | `guard_scan_outcome` |
| Evidence is immutable; "unavailable" never asserts a fact | `evidence` checks + `guard_evidence_immutable` |
| Active findings need obtained supporting evidence | `finding_supported` constraint triggers |
| Actions come from active findings; tier ≥ 2 needs approval; no completion without a succeeded run; no verification without proof | `guard_action` |
| Approvals: approvers only, self-attributed, no tier-3 self-approval, used up once executed | `guard_approval`, `guard_action` |
| "Connected" only after a fresh verification with credentials | `guard_connection` |
| Every write audited, attributed, hash-chained, append-only | `audit_row`, `write_audit` |

Database errors carry a `TEBOS_*` hint. `ruleFromDatabaseError()` maps it to a structured `RuleViolation`, so
the interface can show an actionable state rather than a raw error string.

## Running the tests

```bash
npm install
npm run typecheck
npm test                                   # unit + schema-parity tests
TEBOS_TEST_PG="-h localhost -U postgres" npm run test:db   # needs a Postgres 15+ server
```

`test:db` creates a throwaway database and loads a minimal stand-in for Supabase's `auth` schema
(`supabase/tests/00_supabase_stub.sql`). It then applies every migration, runs the rule tests and drops the
database.

## Live project

The schema is applied to the dedicated Supabase project **`tebos-core`** (ref `jjibuvqpidimckmrhlqa`,
region `eu-west-1`, in TEBOS10's org). It is separate from `bame-os`. Migration file names match the
versions recorded in the project, so `supabase db push` sees them as already applied.

To add a schema change:

1. Add a migration to `supabase/migrations/`.
2. Run `npm test` and `npm run test:db` locally.
3. Apply the migration to the project.
4. Rename the file to the version the project records.
5. Re-run the Supabase security advisor.

The only open advisor warning is intentional: signed-in users can execute `create_organisation`, which is
how an organisation gets its first admin.

Workers and agents use the service role and identify themselves per transaction:

```sql
set local tebos.actor_type = 'agent';
set local tebos.actor_id   = '<agent_run id>';
```

User sessions are always attributed to `auth.uid()` and cannot override this.
