# ADR 0001 — Build the durable control plane before any interface work

Date: 2026-09-24 · Status: accepted

## Context

The TEBOS Master Product & Operating Dossier (v1.0, 24 Sep 2026) makes the persistent data model, evidence
graph, action lifecycle, capability layer, permissions and audit trail the P0 priority (§59, §60). It warns
against polishing the interface while these are immature (§61, §69).

Before building anything, we checked what already exists:

- **The TEBOS app's source is not in this repository.** The live build (`tebos-os-*.manus.space`) is a
  Manus-hosted single-page app. The only copy we have is a saved browser snapshot of the compiled page. It
  shows the product spine (Home / Businesses / Scans / Actions / Integrations / System) and real scan records
  with `completed` / `partial` / `failed` states, target counts and confidence. It contains no backend,
  schema or business logic that could be preserved.
- `TEBOS10/tebos-worker-staging-*` holds only generated artefacts (a blueprint JSON and a manifest). There is
  no source there either.
- This repository contains `bame/`, a BAME-specific Next.js + Supabase app. Per the dossier (§28, §32), BAME
  is a client *configuration* of TEBOS, so the TEBOS core must not be built inside it.

## Decision

Create `tebos/` as a standalone, UI-free control-plane core:

1. **Postgres schema (Supabase-compatible) as the system of record** — `supabase/migrations/`.
   The trust rules live in the database, so no client, agent or future UI can bypass them:
   - *Tenant isolation*: row-level security on every tenant table, plus composite foreign keys that carry
     `org_id` / `business_id` down the chain, plus frozen tenant keys. A finding cannot cite another
     business's evidence, even within the same organisation.
   - *Explicit state machines*: one `state_transitions` table; every status column is guarded by it.
   - *Honest scans*: a scan cannot be `completed` unless every target was acquired. It cannot be `failed`
     while it holds acquired evidence. It cannot finish with targets still pending. A target that was not
     acquired must record why.
   - *Evidence before assertion*: evidence content is immutable. "Unavailable" evidence cannot carry a fact
     (not found ≠ does not exist). An `active` finding needs at least one piece of obtained supporting
     evidence, checked at commit.
   - *Action lifecycle*: every action comes from an active finding. Tier ≥ 2 always requires approval. The
     risk tier is never below the capability's tier. Approvals must be valid (approved, not expired, not yet
     used) and are used up once execution starts. Dependencies must be met. `completed` requires a
     succeeded run. `verified` requires a verified run or a verified outcome. Runs carry idempotency keys.
   - *Approvals*: decided only by approvers or org admins, and always recorded as the signed-in user.
     Tier 3 cannot be self-approved. Decided approvals cannot be rewritten.
   - *Capabilities*: a global registry (what TEBOS knows how to use) is kept separate from per-tenant
     `connection_instances` (what an organisation actually connected). `connected` requires a fresh
     verification and a credential reference. Secrets are only ever referenced, and clients cannot read the
     reference.
   - *Audit*: every write to business or governance state is recorded automatically by trigger, attributed
     to the user, agent or system that made it, and hash-chained per tenant. The trail is append-only, even
     for the service role.
2. **Framework-agnostic TypeScript domain** — `src/domain/`: it mirrors the database rules so callers can
   explain and pre-check a transition. It also adds the confidence model (visible components and limiting
   factors, no opaque score), scan outcome derivation, the evidence-graph explainer ("why did TEBOS say
   this?"), the action engine, and capability routing (by capability, preferring structured APIs over
   browser automation, never treating an unverified connection as usable).
3. **SSRF-safe URL policy** — `src/security/url-safety.ts`: it checks scheme, credentials, port, host,
   every resolved address and every redirect hop. The caller then connects to the vetted address.

## Consequences

- The UI will be rebuilt or ported onto this core later. The visual system from the Manus build (dark
  green-black surfaces, Manrope + DM Mono) should be preserved when that happens, but not before the P0/P1
  foundations are in place.
- Migrations target a **dedicated TEBOS Supabase project**, not the existing `bame-os` project. They
  were applied to `tebos-core` (`jjibuvqpidimckmrhlqa`) on 2026-09-24. A hardening migration then
  cleared the advisor findings: pinned search paths, no anonymous `create_organisation`, and per-command
  policies.
- Tenant deletion is intentionally blocked by the audit trail (`on delete restrict`). Retention and erasure
  need an explicit policy (dossier §24) before they are allowed.

## Update — acquisition worker (2026-09-24)

`src/acquisition/` implements pipeline stages 2–5 (acquisition → evidence) on top of `url-safety`. The
design is deliberately deterministic: no model is involved in fetching, planning or extracting (§48).
Interpretation into findings is the next layer's job.

## Deferred (tracked, not forgotten)

The following are not built yet, in roadmap order:

- **P1:** report/export generation, and the `recommendations` / `assumptions` tables. Actions currently link
  directly to findings.
- **P2:** workflow definitions and runs, schedules and rescans, change events and snapshots, agent
  orchestration, and outcome-to-economic-impact rollups.
- **Runtime pieces:**
  - a server/API layer using the user's Supabase session
  - a secret vault integration behind `credential_references.vault_ref`
