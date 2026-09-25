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
| `src/acquisition/` | The acquisition worker: safe fetcher, robots.txt, target planning, evidence extraction, Postgres store |
| `src/intelligence/` | The intelligence worker: provider-neutral reasoning port, Claude provider, findings validation, Postgres store |
| `src/main.ts` | The worker process (both stages); `Dockerfile` + `railway.json` deploy it |
| `web/` | The operator interface (stage 3): React app on the signed-in user's Supabase session — see `web/README.md` |
| `eval/` | Finding-quality check against the real model (`npm run eval:findings`, billed) |
| `docs/ROADMAP.md` | Stages to autonomy and the gate for each |
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
| Connection health, scopes and credentials are written only by TEBOS's server; secrets live in Supabase Vault and no client can read them | `guard_connection_client`, `set_connection_secret`, `read_credential` |
| A provider action's input is frozen once approval is requested, and an approval covers only the input it saw | `guard_action_execution`, `bind_approval_input` |
| Runs through a provider, and the provider's confirmations, are recorded only by the execution worker | `guard_run_origin`, `guard_action_execution` |
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
the integration tests (acquisition, then intelligence, against the real schema) in a second fresh database, and
finally drops both databases.

## Acquisition worker

The worker reads a business's public website into evidence. It is stage 2–5 of the intelligence pipeline;
it never interprets what it reads.

It runs inside the worker process (`npm run worker`, see [Deploying on Railway](#deploying-on-railway)). It polls for `queued` scans and claims one at a time with `for update skip locked`, so several workers can
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

## Intelligence worker

The intelligence worker turns a finished scan's evidence into findings (pipeline stages 6–7). It runs in the
same process as acquisition, and only when `ANTHROPIC_API_KEY` is set.

1. It claims a `completed` or `partial` scan that has no findings run yet. The claim is atomic, and a scan is
   retried at most 3 times after failures.
2. It gives the model only what the task needs: the business, the objective, user-supplied context (labelled
   unverified), and the scan's evidence under short references (`E1`, `E2`, …). No database ids reach the
   model. Website text is passed as quoted data and treated as untrusted.
3. **The model proposes; TEBOS decides.** Claude (`claude-opus-5` by default, via `TEBOS_REASONING_MODEL`)
   answers in a fixed JSON schema. TEBOS then validates every proposal deterministically:
   - a finding needs at least one reference to evidence that was actually obtained;
   - invented references, and references to pages that weren't read, are dropped;
   - findings left without support are rejected, with the reason recorded;
   - claims that something is absent are reclassified as hypotheses, and what would confirm them is
     recorded;
   - confidence is computed from the evidence (corroboration, extraction quality, coverage, contradiction).
     It is never self-reported, and hypotheses are capped at 50%.
4. Accepted findings are stored as `active` with `finding_evidence` links, in one transaction. The database
   independently refuses any active finding without obtained supporting evidence.
5. The run records the provider, the model that actually answered, tokens, the rejections with reasons,
   and any adjustments.

If a scan obtained no evidence, no model is called. If the model declines, times out or is unavailable, the
run is recorded as failed and no findings are invented.

Requests use adaptive thinking, a cached system prompt, and Anthropic's server-side refusal fallback
(`fallbacks: "default"`): if a safety classifier declines, Anthropic's recommended fallback model answers,
and `agent_runs.model` shows which model did.

Before relying on it, run `ANTHROPIC_API_KEY=… npm run eval:findings`. It checks finding quality on fictional
fixtures. It makes real, billed calls; expect a few cents per run at current prices.

## Execution worker (stage 4)

`src/execution/` runs approved actions through verified providers. The first provider is Resend
(`email.send_transactional`). See `docs/adr/0002-provider-execution.md` for the trust model.

1. **Verify.** When an admin saves a key or clicks "Check now", the worker calls Resend. Only a working key
   moves the connection to `connected`, with the scopes it proved: a full-access key gets `emails:read`, so
   TEBOS can check delivery itself. A send-only key gets `emails:send`, and delivery is confirmed by webhook.
2. **Execute.** A queued `api` action is routed to a usable connection (`routeCapability`). If none can run
   it, the action is blocked, with the reason. Otherwise one run is created per approval. The run's
   idempotency key is derived from the approval and is sent to Resend, so the email can't be sent twice.
3. **Resume.** A send whose outcome is unknown (timeout, 5xx, 429) stays `running` and is retried with the
   same key. After 23 hours it fails as "outcome unknown", never as success.
4. **Confirm.** The action becomes `verified` only when Resend reports delivery, by polling or by a signed
   webhook. A bounce or complaint fails it with `verification_failed`.

Webhooks: when `PORT` is set (Railway sets it), the worker serves `POST /webhooks/resend/<connection id>` and
`GET /health`. Give Resend that URL on the worker's public domain, and paste its signing secret into the
connection. Unsigned, stale, forged or replayed events change nothing. Set `TEBOS_EXECUTION=off` to disable
the stage.

## Deploying on Railway

The worker (acquisition, intelligence and execution) deploys as one Railway service from this repository.

1. Railway → **New Project** → **Deploy from GitHub repo** → `TEBOS10/TEBOS-`. Pick the branch that holds
   this code.
2. In the service's **Settings**, set **Root Directory** to `tebos`. Railway then uses `tebos/railway.json`
   and `tebos/Dockerfile`.
3. In **Variables**, set:

   | Variable | Value |
   |---|---|
   | `TEBOS_DATABASE_URL` | The Supabase **session pooler** connection string (Supabase → the project → **Connect**), with the database password filled in. The pooler is reachable over IPv4. |
   | `TEBOS_DATABASE_CA` | Supabase's CA certificate (Supabase → Database settings → SSL → download), pasted as text. With it, the worker verifies the database's certificate. |
   | `ANTHROPIC_API_KEY` | A key from console.anthropic.com. Leave it unset to run acquisition only. |

4. Deploy. The logs should show `worker.started` with `"stages":{"acquisition":true,"intelligence":true,"execution":true,"webhooks":true}`.
5. For delivery webhooks, generate a public domain for the service (**Settings → Networking**). Then set
   `VITE_TEBOS_WORKER_URL` to it in the web app, so admins see the URL to give Resend.

Live deployment: Railway project `tebos`, service `tebos-worker`
(`https://tebos-worker-production.up.railway.app`). It connects through the Supabase session pooler as a
dedicated login, `tebos_worker`: it can log in and bypasses row-level security, inherits `service_role`,
and allows at most 10 connections with a 60-second statement timeout. Every trigger, rule and audit still
applies to it. The role was created outside the migrations, so its password never enters the repository.
Rotate it with `alter role tebos_worker password '…'` and update `TEBOS_DATABASE_URL` in Railway.

All three values are secrets. They live only in Railway's variables, never in the repository or a browser.

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
