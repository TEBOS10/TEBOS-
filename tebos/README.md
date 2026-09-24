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
| `src/acquisition/` | The acquisition worker: safe fetcher, robots.txt, target planning, evidence extraction, Postgres store, process entry point |
| `test/` | Unit tests, including parity tests that fail if the TS state machines or rule codes drift from the SQL; `test/integration` runs the worker against the real schema |

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
PGHOST=localhost PGUSER=postgres npm run test:db   # needs a Postgres 15+ server
```

`test:db` creates a throwaway database and loads a minimal stand-in for Supabase's `auth` schema
(`supabase/tests/00_supabase_stub.sql`). It then applies every migration and runs the rule tests. Next it runs
the integration tests (the acquisition worker against the real schema), and finally drops the database.

## Acquisition worker

The worker reads a business's public website into evidence. It is stage 2–5 of the intelligence pipeline;
it never interprets what it reads.

```bash
TEBOS_DATABASE_URL=postgres://… npm run worker
```

It polls for `queued` scans and claims one at a time with `for update skip locked`, so several workers can
run safely. For each scan:

1. It reads robots.txt, then the start page. The start page is `scans.scope.url`, or else the business
   website.
2. It picks up to `target_limit − 1` further same-site pages, preferring contact, about, services and
   pricing pages.
3. It fetches each page with `safeFetch`:
   - every URL and every redirect hop is vetted by `url-safety`;
   - the connection is pinned to the vetted IP, so the host name is never re-resolved (no DNS rebinding);
   - responses are capped at 2 MB after decompression;
   - requests time out after 15 s;
   - only text content is accepted.
4. Every target ends in an honest state, and each state is recorded as evidence:

   | Outcome | Target status | Failure class |
   |---|---|---|
   | Page read | `acquired` | — |
   | Page read but truncated | `partially_acquired` | — |
   | HTTP error | `unavailable` | `acquisition` |
   | 401 / 403 response | `unavailable` | `permission` |
   | Nothing readable in the page | `unavailable` | `extraction` |
   | Unsafe URL | `blocked` | `validation` |
   | Disallowed by robots.txt | `blocked` | `permission` |

   Pages that were not read become `unavailable` evidence that says what is missing.
5. Evidence is limited to observed facts, each with an excerpt and its location on the page:
   - title and meta description;
   - H1/H2 headings;
   - published email addresses and phone numbers;
   - WhatsApp and social links;
   - forms and their fields;
   - the page text.

   Absence is never recorded as a fact.
6. The scan finishes as `completed`, `partial` or `failed`, derived from its targets. Its confidence
   components are visible, with `method: acquisition.v1`.

Every run is recorded as an `agent_runs` row (role `acquisition`) plus one `tool_calls` row per fetch. Every
row written is audited as `actor_type = agent`, with `actor_id` set to the run id. If the worker crashes
mid-scan, pending targets are resolved as `unavailable` / `internal`, and the evidence already acquired is
kept.

`TEBOS_DATABASE_URL` is a server-side Postgres connection string: the Supabase direct or session-pooler
string. It must never reach a browser. Optional settings: `TEBOS_POLL_MS` (default 5000),
`TEBOS_POLITENESS_MS` (the delay between page requests, default 500) and `TEBOS_WORKER_ID`.

**Network requirement.** The worker needs direct outbound HTTP(S). If it is routed through a forward proxy,
the proxy resolves the host names instead of the worker, which defeats address pinning. Run it where it can
connect directly, and keep egress to private ranges blocked at the network layer as defence in depth.

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
