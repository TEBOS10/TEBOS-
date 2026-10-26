# TEPOS / REEDS: current state (26 October 2026)

This document is phase 0 of the founder's "First Implementation Order". It records what was checked live, what exists
in this repository, what was added for the first working loop, and what still blocks the executive team.

Environment variables appear by name only. No values are recorded here.

## 1. The map

| Product | Repository and path | Vercel project | Address | Database | Status (checked 26 Oct) |
|---|---|---|---|---|---|
| **TEBOS**: the client-facing system, template catalogue and sales | `TEBOS10/TEBOS-`, `tebos/web` (`npm run build`) | `tebos` | tebos-demo.vercel.app | Supabase `tebos-core` (`jjibuvqpidimckmrhlqa`) | Database ACTIVE_HEALTHY. Production deploys from `main` (last: PR #95, `f761ad7`) |
| **TEPOS**: the founder's private app | Same repository and path, built with `npm run build:tepos`, served from `dist-tepos` | `tebos-web` | tebos-web.vercel.app | `tebos-core`, in the founder's *private organisations* only | Production deploys from `main`. **`tebos-web` is TEPOS, not TEBOS**; the split is enforced by the build and the database (below) |
| **REEDS**: the coordinator | Inside TEBOS and TEPOS: `src/reeds` (worker), `web/src/pages/ReedsPage.tsx`, `src/bridge` | — | Pages at `/reeds` (TEPOS) | `tebos-core` | The worker that runs REEDS on Railway is **stopped**: the trial expired (decision 21) |
| **PRA** | A case type in TEPOS: `property_*` tables, `web/src/pages/PropertyPage.tsx` | `tebos-web` | `/property` | `tebos-core`, Tidy Enterprise's private organisation | Live |
| **BAME**: a TEBOS client | `TEBOS10/bame-live`, mirrored from `TEBOS10/TEBOS-` branch `claude/bame-intake-integration-s5ue43`, folder `bame/` | `bame-live` | bamemarketing.site | Supabase `bame-os` (`ugdmvixywmrwwilkcblq`), separate from TEBOS | Live, last production deploy 14 Oct |
| Unused | — | `tebos-ex3f` (builds branches, serves nothing live), `tebos-production-v2` (11 Sep prototype, not linked to Git), `bame-os` (previews only, behind Vercel's team sign-in) | — | — | Deleting them is the founder's choice |

### Corrections to the build specification's audit

- **The "INACTIVE" Supabase project `fhbutorkrbglycrertnb` is not part of this system.** This account holds exactly
  two projects, `tebos-core` and `bame-os`, and both are ACTIVE_HEALTHY. That project is probably in another account
  (the one the assistant that wrote the specification is connected to). Nothing needs restoring.
- **"The available Supabase project" is not TEBOS's database.** TEBOS's is `tebos-core`.
- **The GitHub default branch is `claude/bame-intake-integration-s5ue43`, not `main`.** Both Vercel apps take
  production from `main`. The default branch only decides what GitHub shows first and where new pull requests point.
  Changing it to `main` is a founder setting and was not touched (decision 8 already lists it).
- **The repository is public.** Founder-private *data* is never in it: that lives in the database, behind row
  security and two-step sign-in. The *code and documents* are visible to anyone, including the weekly plan's wording
  and this map. Making the repository private is decision 8.

## 2. What already existed

| Capability | Where | Notes |
|---|---|---|
| Private organisations, one owner, two-step sign-in required | migrations `20261017040000_resilience_money.sql` (`is_private_org`, membership guard), `20261017100000_two_step_resilience.sql` (`two_step()`), `tepos_two_step` | Every TEPOS table uses `has_role(org_id, 'org_admin') and two_step()` |
| TEBOS / TEPOS separation | `web/vite.tepos.config.ts`, `web/scripts` bundle check ("TEBOS carries nothing of TEPOS") | The TEBOS bundle is checked on every build |
| Tenant isolation for clients | `is_member`, `has_role`, `freeze_tenant_keys`, row security on every table | SQL tests `supabase/tests/*` |
| Audit trail, hash-chained per organisation, redacted for private records | `audit_row`, `audit_row_redacted`, `tebos_private.audit_verify()` | 12 chains, all intact (26 Oct) |
| REEDS work ledger: requests planned into tasks, run, independently verified | `work_requests`, `work_tasks` (`20261014200000_work_requests.sql`), `src/reeds` | For work REEDS does itself, not for the founder's commitments |
| REEDS standing requests (the weekly signal brief) | `reeds_standing_requests` (`20261020080000_signal_brief.sql`) | Runs only when the worker runs |
| The model bridge: an AI client claims tasks, hands back results, a person verifies | `src/bridge`, `docs/bridge.md` | Revocable tokens; can't approve, pay, send or deploy |
| Approvals for consequential actions | `approvals`, `actions` (TEBOS) | Clients' actions |
| The agency pipeline (references only, no client details) | `agent_listings`, `agent_contacts`, `/agent` | Real Estate Job portal |
| PRA cases: evidence, figures, pathways, gates, workstreams, outcome reviews | `property_*` tables, `/property` | |
| Money: received, recurring, expected, kept apart | `res_money_items`, `/capital` | |
| The week board: scenes, today's queue, day close, Income · Impact · Intelligence | `tepos_week_*` (`20261026120000_tepos_week.sql`), `/` | On this branch, not yet merged |
| The template catalogue and factory log | `template_catalogue`, `factory_runs` | Live since 26 Oct |

## 3. What was missing, and what this change adds

The specification's first loop was: incoming information → source-linked record → task or decision → follow-up →
evidence-backed completion → founder brief. **It didn't exist.** The work ledger is REEDS's own queue, and nothing
captured what came *in*.

Added on this branch (migration `20261026150000_reeds_intake.sql`, domain `src/domain/reeds-intake.ts`,
sync `src/sources/`, page `/intake`, and the REEDS brief on `/`):

| Required by the order | How |
|---|---|
| A source captured once, with ID, type, time, link, workspace, status and a de-duplication key | `reeds_source_events`, unique `(org_id, dedupe_key)`. The key is the source's own ID, or a hash of the normalised text |
| Triage labels | `triage`: information, commitment, meeting, decision, opportunity, property case, client delivery, restricted |
| Verified, reported, inferred and unknown kept apart | `due_basis` on every commitment. A date is either present with its basis or explicitly unknown or none (a database check) |
| A task only for a real action, with owner, date or "no date", priority and reason, source, next action, approval | `reeds_commitments`, always linked to its source event |
| Conflicts surfaced, not overwritten | `reeds_conflicts`. A later source with a different date or owner is recorded beside the original. The founder keeps one or takes the other |
| Done needs evidence; a draft is not "sent" | A database check and trigger: `done` needs `completion_evidence`, and approval first where it is required. Only the founder approves or decides |
| Failed imports, retries, duplicate suppression, last success visible | `reeds_integrations`. `connected` needs a real `last_success_at`; `failing` needs the error. Only the server writes them (`reeds_report_sync`). The duplicate count rises with each suppressed repeat |
| Daily brief: three priorities, decisions, blockers, next actions, each linked to its source | The REEDS brief on the week board (`/`), from `dailyBrief()`. The full lists are at `/intake` |
| Server-side authorisation; private records invisible to clients; clients invisible to each other | Row security and guards; SQL test `99zu_reeds_intake.sql` |
| An adapter interface; a truthful "not connected" | `src/sources/sync.ts` (`SourceAdapter`, `runSync`) and `src/sources/pg-store.ts`. **No adapter is configured**: no mailbox, WhatsApp or calendar credentials exist on the worker. Every source shows "Not connected" |

## 4. Integrations, as tested

| Source | State in TEPOS | What is needed |
|---|---|---|
| Typed or pasted (manual) | Working: capture, de-duplication, conflicts, evidence | — |
| Email | **Not connected** | The founder's choice of mailbox (Outlook, Hostinger or Gmail) and a read-only credential on the worker, stored as a secret, never in chat. Then an adapter for `SourceAdapter` |
| WhatsApp | **Not connected** | The official WhatsApp Business Platform webhook (needs a Business number and Meta approval), or the founder's own exported chats pasted in. No session scraping |
| Calendar | **Not connected** | The Outlook calendar the specification mentions is connected to *another assistant's* environment, not to TEPOS. TEPOS needs its own read-only credential |
| The worker that would run syncs | **Stopped** (Railway trial expired; decision 21) | The Railway Free plan |

## 5. Environment variables (names only)

- **Worker:** `TEBOS_DATABASE_URL`, `TEBOS_DATABASE_CA`, `TEBOS_WORKER_ID`, `TEBOS_WORKER_MODE`, `TEBOS_BATCH_MAX_MS`,
  `TEBOS_POLL_MS`, `TEBOS_POLITENESS_MS`, `TEBOS_SITE_URL`, `TEBOS_INTELLIGENCE`, `TEBOS_EXECUTION`,
  `TEBOS_REASONING_MODEL`, `TEBOS_GATEWAY_MODEL`, `TEBOS_MODEL_GATEWAY_URL`, `TEBOS_MODEL_GATEWAY_KEY`,
  `ANTHROPIC_API_KEY`, `ANTHROPIC_WORKSPACE_ID`, `RESEND_API_KEY`, `PIPELINE_EMAIL_FROM`, `ENQUIRY_ALERT_FROM`,
  `ENQUIRY_ALERT_TO`, `PAYSTACK_SECRET_KEY`, `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `ELEVENLABS_INTAKE_AGENT_ID`,
  `ELEVENLABS_PHONE_NUMBER_ID`, `ELEVENLABS_TELEPHONY`, `TEBOS_BRIDGE_DATABASE_URL`, `TEBOS_BRIDGE_ALLOWED_ORIGINS`,
  `PORT`.
- **Web apps (public, browser):** `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_TEBOS_WORKER_URL`.
- **CI:** `SUPABASE_DB_URL`, `SUPABASE_DB_CA`. Neither is set, so main's "Apply database migrations" job runs and
  applies nothing. Migrations are applied through the database connector instead.

## 6. Tests (26 Oct, on this branch)

| Suite | Result |
|---|---|
| Core | Typecheck passes; 407 unit tests pass |
| Database (`test:db`, 43 SQL files) | All pass, including `99zt` (the week board) and `99zu` (REEDS intake) |
| Web | Typecheck passes; 63 unit tests and 138 end-to-end tests pass, including `intake.spec.ts` and `week.spec.ts`; both production builds pass |

**`99zu` proves the order's required tests:**
1. A duplicate source creates no duplicate task.
2. The source ID and link survive into the commitment (and the brief, in `intake.spec.ts`).
3. A missing date stays unknown.
4. A conflict is surfaced, not overwritten.
5. Done needs evidence, and approval where required.
6. A failed sync is visible, a success can't be faked, and duplicates are counted.
7. Isolation holds: the founder's records are invisible to two client tenants, and each client sees only its own
   messages.

**Not tested end to end:** a real email, WhatsApp or calendar sync. None is configured.

## 7. Recommended next steps, by founder time saved and revenue

1. **Turn the worker back on (decision 21).** Without it nothing runs on its own: no syncs, no weekly brief, no
   follow-ups.
2. **Connect one mailbox read-only:** the one that receives agency and client mail. Then write its adapter against
   `SourceAdapter`, test it on ten known messages, and compare with the originals.
3. **Use manual capture daily for a week to get a baseline:** how many items, how many become commitments, how many
   are done with evidence. That baseline is the "minutes of admin saved" measure the specification asks for.
4. **Only then:** the calendar (read and check availability first, booking only under a written rule), and the
   WhatsApp Business webhook.

## 8. Deliberately not changed

- Production settings: domains, the default branch, Vercel projects and billing.
- BAME's site and offer.
- No new database project, queue, vector store or CRM: everything uses `tebos-core` and the existing guards and
  audit.
- No message is sent and no meeting is booked automatically. Both are in the specification's amber and red lists,
  and need a written standing rule and a connected source first.
