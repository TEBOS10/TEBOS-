# Platform audit, 14 Oct 2026: TEBOS, REEDS, Tidy Capital, Tidy Enterprise

Phase 1 of the master build directive. Every statement below was checked against the repository, the live
database (`tebos-core`), Railway, Vercel, GitHub and the Claude session list on 14 Oct 2026. Nothing here is
assumed from documentation alone. The living status of each piece is in [`../REGISTER.md`](../REGISTER.md).

## 1. What exists and works

| Component | Where | Evidence it works |
|---|---|---|
| **TEBOS control plane**: organisations, memberships, roles, row-level security, state machines, audit log | `tebos-core` (Supabase, eu-west-1), 36 migrations | 2,462 audit events; schema tests (`npm run test:db`) pass; parity test keeps rules mirrored in `src/domain` |
| **Action lifecycle**: actions, dependencies, approvals, runs, outcomes, verification status | migrations `execution`, `approval_drives_action`, `provider_execution` | Tested in SQL. Approvals are single-use, expire, and are bound to a hash of the exact input: changing the input invalidates the approval. **Never used live: 0 actions.** |
| **Agent governance**: agent runs and tool calls with purpose, permissions, model, tokens | migration `agent_governance` | 282 runs recorded (281 failed, see section 3) |
| **Capability registry**: 11 capabilities with risk tiers (read, draft, internal, external, consequential) | `public.capabilities` | Used by the guards; money, credentials and deletion are tier 3 |
| **Connectors**: Resend (email), BAME operations snapshot, TEBOS company snapshot | `public.connectors`, `src/monitoring` | BAME and TEBOS snapshots connected and read hourly |
| **Reasoning provider abstraction**: one interface, Anthropic implementation, pause on misconfiguration or outage, bounded retry | `src/intelligence/provider.ts` | Tests pass; live calls fail (key not workspace-scoped) |
| **Worker** (one Node process): pipeline, billing, intake calls, interviews, maintenance, monitoring, intelligence | Railway `tebos-worker` | Deploy `4f4ba7f0` SUCCESS 13 Oct |
| **Client pipeline**: enquiry, screening, payment link, contract, onboarding, delivery plan, diagnostic, monthly billing | `src/pipeline`, `src/billing` | End-to-end integration test passes; blocked live on Paystack and email keys |
| **Web interface**: public site, client app, staff workspace (sales, marketing, maintainer) | `tebos/web` (Vite and React) on Vercel | 75 of 75 e2e tests pass; responsive layouts |
| **Database guard** against data loss | `tebos_guard` schema | Live, and checked with a rolled-back probe |
| **CI**: migration check, core and database, web, apply migrations | `.github/workflows/ci.yml` | Green on main. The migrate job warns: the password in its secret is wrong |
| **Daily build loop**: a scheduled Claude session that picks, builds, tests and ships one item a day | Routine `trig_01BKsFh88EuzwL26VZG5rb8j` | Runs daily; log in `operator-log.md` |
| **BAME** (client): its own app and its own Supabase project (`bame-os`) | repo `TEBOS10/bame-live`, Vercel `bame-live` | Separate project, so its data is already isolated from TEBOS's |

## 2. What was found that isn't what it seems

| Finding | Detail |
|---|---|
| **REEDS has no code** | No repository, table, service or session is named REEDS. In practice "REEDS" today is a Claude Code session opened from the Claude Android app, plus the daily routine. It can do real work, but TEBOS keeps no record of the request, plan, delegation or verification, so nothing can be tracked or audited from inside TEBOS. |
| **Tidy Capital exists, but only in the database** | The `capital` schema (18 tables: providers, instruments, bars, economic series, theses, strategies, backtests, risk policies, trades, journals) and an edge function `capital-ingest` were created on 3 Oct **outside the repository**. The function's code exists only in Supabase. |
| **Tidy Capital ingestion has never run** | A nightly job (`capital-daily-ingest`, 22:30 weekdays) has been blocked on every run since 3 Oct: `Vault secret alpha_vantage_api_key not set`. The only data is a one-off load on 3 Oct: 100 daily USD/ZAR bars and 33 Fed funds readings, from Alpha Vantage. |
| **Two provider statuses overstate access** | `capital.providers` marks `alpha_vantage` and `vanguard` as `connected`. Alpha Vantage has no key, so it is not connected. Vanguard is a model-portfolio lookup in a Claude connector, not an integration the platform can call. Six others (FRED, SARB, Stats SA, JSE, Bloomberg, Investing.com) are correctly marked `placeholder`. |
| **Tidy Capital has no tenant boundary** | Its tables have no workspace or organisation column. Only `postgres` and `service_role` can read them, which is safe today. But a trader or academy edition cannot be offered without a workspace model or a separate project. |
| **Tidy Enterprise's property product doesn't exist** | No code, tables or data for property intelligence ("Tidy Property Revenue Architect") were found anywhere. |
| **Businesses are not separated by company** | One organisation, "Tidy Enterprise", holds three businesses: **TEBOS** (the company), **BAME** (a client) and **rocomamas.com**. The directive requires each company and client in its own environment. Moving them is a data migration that the database deliberately blocks (`freeze_tenant_keys`), so it needs a reviewed migration. |
| **Four Vercel projects build the same repository** | `tebos`, `tebos-ex3f`, `tebos-web`, `tebos-production-v2`. Only one serves `tebos-demo.vercel.app`. The rest duplicate builds and preview links. There are also two stale worker repos (`tebos-worker-staging-*`). |
| **No mobile installation** | The web app has no manifest and no service worker. It is usable in a phone browser but cannot be installed, and it has no push notifications. |

## 3. What must be fixed before expanding

1. **The AI key.** 281 of 282 agent runs failed, because the key is not scoped to a workspace (decision 2b). Until it
   is replaced, nothing that needs a model can run: planning free-text requests, findings, analysis.
2. **Honest provider statuses in Tidy Capital.** Mark Alpha Vantage `blocked (no key)` and Vanguard `not an
   integration`, so no screen or agent reports access that doesn't exist.
3. **Tidy Capital under version control.** Copy the `capital` schema and the `capital-ingest` function into the
   repository, so they are reviewed, tested and reproducible like the rest.
4. **Tenant separation.** One organisation per company and client (TEBOS, Tidy Enterprise, Tidy Capital, BAME). This
   needs a reviewed, founder-approved migration to move the three businesses.
5. **Duplicate deployments.** Keep the one Vercel project that serves the site and retire the other three. Deleting
   them is irreversible, so it is the founder's call.
6. **Security housekeeping already on the list:** repository private (decision 8), CI database secret, and
   leaked-password protection.

## 4. Recommended target architecture

Reuse what exists. Add one new layer, the **request ledger**, and keep each product's data separate.

```
Founder (phone or desktop)
  │  installable web app: inbox, requests, approvals, alerts            ← Layer A (TEBOS web, made a PWA)
  ▼
REEDS: request ledger + planner + dispatcher + verifier + reporter      ← Layer B (new: tables + worker loop)
  │  each request → plan → tasks with acceptance tests → evidence → verified report
  ▼
TEBOS control plane: capabilities, approvals (input-bound), audit,      ← Layer C (exists)
  agent runs, tool calls, providers, connectors, state machines
  ▼
Executors: deterministic TEBOS functions first; models through the     ← Layer D (registry = capabilities)
  provider interface; integrations through connectors
  ▼
Environments, one organisation each, isolated by row-level security:
  TEBOS (own company) · Tidy Enterprise · Tidy Capital · BAME (its own project already) · future clients
```

The decisions behind this:

- **REEDS lives inside TEBOS**, as tables plus a worker loop, not as another app. The control plane already
  provides permissions, approvals bound to inputs, audit and state machines. A separate app would duplicate them.
- **Completion is a database fact, not a claim.** A request cannot be marked complete unless every task in it has a
  passing verification recorded by a separate verifier. This is the same pattern as `actions.verification_status`.
- **Bounded by construction:**
  - a request has a maximum number of tasks and attempts;
  - tasks cannot create requests, so delegation cannot loop;
  - each request has a cost ceiling;
  - anything tier 2 or above goes through the existing approvals table.
- **Deterministic first, models second.** The first request types are answered from TEBOS's own data and checked
  by recomputation. Model-planned requests follow once the key works, through the existing provider interface,
  with the provider and model recorded on each run.
- **Tidy Capital gets its own Supabase project** before any outside user (trader, academy) gets access. Market-data
  licences, client research and paying users must never share a database with TEBOS or its clients. It can stay as
  a founder-only schema until then, read only by the server.
- **The mobile interface is the TEBOS web app made installable** (a manifest, icons, then a service worker and web
  push once tested). No native app is needed.

## 5. The smallest useful first implementation

The milestone: **one legitimate request, taken from receipt to a verified report without the founder.**

Request type 1: **"What needs my attention today?"** It is answered from real data:
- pending approvals;
- failed or blocked work (agent runs, ingestion runs, outbox emails);
- overdue delivery steps;
- open maintainer items;
- new enquiries.

The flow:
1. The founder submits it from the inbox (web or phone). A row is created in `requests` with status `received`.
2. The planner turns it into tasks, each with an acceptance test, for example "count pending approvals; the
   verifier recounts and must match".
3. The worker dispatches each task to its executor, records the run, and stores the evidence (queries and counts,
   never invented).
4. The verifier recomputes each figure independently. A mismatch fails the task, with bounded retries.
5. The reporter writes the report, listing what was found, what couldn't be checked and what needs a decision.
   Only then does the database allow `completed`.
6. The founder sees the report and its evidence in the inbox.

Request type 2 (next): **"Status of <business>"** for TEBOS, BAME and Tidy Capital, from the snapshots and the
ingestion runs. Request type 3 (once the key works): free-text requests, planned by a model into the same task
types, still verified by recomputation.

## 6. Dependencies, credentials, permissions and costs

| Need | For | Status | Cost |
|---|---|---|---|
| Workspace-scoped AI key (decision 2b) | Model planning, findings, analysis | Missing; 281 failed runs | Usage-based |
| Alpha Vantage key in Supabase Vault | Tidy Capital ingestion | Missing; blocked nightly | Free tier: 25 requests a day (the job needs about 16). Premium from about USD 50 a month |
| Separate Supabase project for Tidy Capital | Trader and academy editions | Not yet | About USD 10 a month (Pro compute) |
| Paystack and Resend keys (decisions 1, 2) | Taking payment, client email | Missing | Per transaction / free tier |
| Web push keys (VAPID) | Alerts on the phone | Not yet | Free (generated, stored as a secret) |
| A second model provider (OpenAI or other) | Fallback and comparison | No account connected | Usage-based; only once a task shows it helps |
| n8n or similar | Approved automations | None found | Avoid until a workflow needs it; the worker already runs scheduled jobs |
| Bloomberg, BlackRock, Vanguard data | Tidy Capital | **No access.** The connector interfaces stay as placeholders | Licensed; not assumed |

This session's own cost is visible in the session list: about USD 377 to date. The separate BAME session cost about
USD 1,573. Model work through the platform should be metered per request (`agent_runs` already records tokens), so
cost per outcome can be reported.

## 7. First measurable acceptance tests (Phase 2)

1. **Happy path:** a submitted "attention today" request reaches `completed` within one worker cycle. Its report's
   figures equal an independent recount of the live tables (database test plus integration test).
2. **No false completion:** the database refuses `completed` while any task is unverified or failed (SQL test).
3. **Bounded failure:** an executor that throws is retried at most N times. The request ends `failed` with the
   reason, never `completed` (integration test).
4. **Isolation:**
   - a member of one organisation cannot see or submit requests for another;
   - an executor reading for organisation A returns nothing from organisation B (SQL test with two organisations).
5. **No runaway delegation:**
   - a request cannot exceed its task limit;
   - a task cannot create a request (SQL test).
6. **Approval binding:** a tier-2 task waits for an approval. Changing its input after approval voids the approval
   (reuses the existing input-hash guard).
7. **Phone:**
   - the founder can submit a request and read its report on a phone-width screen (e2e at 390 px);
   - after the PWA work, the app installs, which is checked with a Lighthouse installability audit.

## The order of work

1. **Done 14 Oct:** this audit, the register, and the honest provider statuses (both now `placeholder`, with the reason recorded).
2. **Phase 2:** the request ledger, executors for request type 1, the verifier, and the inbox page (web and phone
   width), with the tests above.
3. **Then:**
   - make the app installable (manifest, then service worker and push once tested);
   - request type 2;
   - Tidy Capital in the repository, with its own project once approved;
   - Tidy Enterprise's property workflow (Phase 3), built on the board, evidence and objectives model;
   - tenant separation migration once approved.
