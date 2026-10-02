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
| Client pipeline: staff decide; paid only on a signed provider confirmation (or an admin-recorded EFT) of the full amount; contracts only from lawyer-approved templates and accepted against the exact text; organisations only after both; payments and accepted contracts immutable | `guard_opportunity`, `guard_payment`, `guard_contract_template`, `guard_contract`, `accept_contract` |
| Invite-only: only TEBOS's platform admins create organisations; everyone else joins by an invitation bound to their confirmed email, and an account with neither sees nothing | `create_organisation` (migration `invite_only`), `accept_invitation`, RLS |
| Only TEBOS's server records connected-system sources and system-generated evidence, or says who created evidence or a finding | `guard_source_origin`, `guard_created_by_actor` |
| An objective's target is fixed once active; it is achieved only on a value the database read from a connected system's evidence; missed only after its due date | `guard_objective`, `guard_measurement` |
| Board pieces and steps marked "observed" cite obtained evidence; automated steps name their tool | `guard_board_basis`, `board_steps` checks |

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

The intelligence worker turns a finished scan's evidence into findings (pipeline stages 6–7), and reviews
each business across all its evidence (below). It runs in the
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

### Business reviews: findings from all the evidence

A scan analysis reads one website scan. A **business review** (`src/intelligence/review.ts`, migration
`business_review`) reads everything TEBOS holds about a business together:
- the latest website scan;
- interview answers and other statements;
- the latest snapshot from each connected system, such as BAME's operations figures.

A finding can then join channels, for example "finance and sales have no deliverable checklists",
measured in BAME and confirmed in an interview. The same validation applies, with these differences:
- **Absence.** An absence stays an interpretation only when a cited connected-system figure records it
  (a zero, or "none are defined for …"). The finding then notes that it was measured in that system only.
  An absence backed only by what someone said, or by web pages, becomes a hypothesis.
- **Confidence.** It uses each source's recorded reliability (connected system 0.95, interview 0.6,
  website 0.7). Coverage is the share of the three channels with evidence. Figures older than 30 days
  count as dated.
- **When a review runs.** A business is due one when:
  - it has statements or connected-system figures;
  - something (those, or a finished scan) is newer than its last review;
  - no review is running;
  - it hasn't failed 3 times since;
  - its last review is at least 6 hours old.
- **Unchanged evidence.** If the evidence is unchanged (for example, a snapshot re-recorded with the same
  figures), the run is recorded and no model is called.
- **Superseding.** A review's findings replace the previous review's (`status = 'superseded'`,
  `superseded_by_run`), except findings an action was proposed from.
- **Server only.** Only the server can set `analysis_run_id` or `superseded_by_run`
  (`TEBOS_SERVER_ONLY`).

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

## Diagnostic interviews

A website scan only sees the outside of a business. Interviews ask the owner what no public source shows,
using an industry playbook (`src/domain/playbooks/`; the first is `marketing-agency` v1, with 16 questions
covering clients, pipeline, scoping, delivery, capacity, results, retention and cash).

- **By phone.** An admin or operator books a call: a number, a time within 30 days, and consent, recorded
  word for word (`CALL_CONSENT_TEXT`). At the booked time the worker has the ElevenLabs voice agent call
  (`src/interviews/`). The agent says it's an AI and that the call is recorded, waits through pauses and
  follows up on vague answers. The worker follows the call to the end and stores the transcript, which
  can't be edited afterwards.
- **In writing.** The same questions as a form. `submit_interview_answers` stores each answer as evidence.
- **Answers are evidence, labelled as the owner's statements** (`user_supplied`, source `user_statement`,
  `interview:<id>`). For calls, Claude matches what was said to the playbook questions. An answer is kept
  only if its quote appears word for word in something the person said. Answers the owner didn't give are
  listed as not covered.
- The database refuses: a booking without consent, a malformed number or a time outside the window; and
  anyone other than the server marking a call as placed or done, or writing a transcript
  (`supabase/tests/40_interviews.sql`).

Worker settings: `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID` (the TEBOS diagnostic interviewer agent) and
`ELEVENLABS_PHONE_NUMBER_ID` (a Twilio or SIP number imported into ElevenLabs; set
`ELEVENLABS_TELEPHONY=sip_trunk` for SIP). Without all three the worker places no calls: bookings stay
booked, and the interface says so once the time has passed.

## Intake calls from meetings

In a meeting, staff open **meeting mode** (`/meet`, staff only, full screen with no other client in sight). It plays
a scenario film (a day in a gym or a sports agency on its TEBOS operating system, each moment a real blueprint
step, labelled as an illustration) or the TEBOS film. Then the prospect types their number and ticks the consent,
and TEBOS rings them on the spot (migration `meeting_intake_calls`, `src/intake/`).

- **A short intake call, not the diagnostic** (that stays paid): what takes their time, and whether they want
  to go ahead.
- `start_meeting_call` is the only way in: staff only, consent word for word, a full number, 20 calls an hour per
  person. The prospect becomes a waiting-list lead owned by whoever met them.
- A call moves forward only, is completed only with what was said, and records their yes or no only from the
  call (the agent's `wants_to_proceed` data-collection result) or from staff, never overwritten.
- The next morning (09:00 Johannesburg) TEBOS queues an outline email: the blueprint's pieces and flows by name
  (no rules, no diagnosis), and their place on the waiting list. It's sent when the client email key is set.

Worker settings: `ELEVENLABS_API_KEY`, `ELEVENLABS_PHONE_NUMBER_ID`, and `ELEVENLABS_INTAKE_AGENT_ID`: a second
agent whose prompt runs the intake (below). Without them, calls stay "requested" and meeting mode says so after a
minute.

The intake agent's set-up:
- First message: "Hi {{prospect_name}}, this is TEBOS, an AI assistant, calling as you asked. This call is recorded
  so we can follow up. Is now still a good time for five minutes?"
- Prompt: "You are TEBOS's intake caller. You speak with {{prospect_name}} from {{business_name}}
  ({{kind_of_business}}), who just watched TEBOS in a meeting and asked for this call. In about five minutes: ask
  what takes most of their time each week; what still has to go through them personally; and where that lives
  today. Listen and reflect back briefly. Do not diagnose, recommend fixes, quote prices or promise results.
  Close by asking: would they like TEBOS to go ahead with building their operating system? Either answer is fine.
  Tell them they'll get an outline by email tomorrow morning and that they're on the waiting list."
- Data collection: a boolean `wants_to_proceed`: "True only if the person clearly said yes to going ahead; false
  only if they clearly said no; leave empty otherwise."

## Platform monitoring (read-only)

TEBOS watches the platforms it runs for, without being able to change them or read personal data.
BAME is the first (`src/monitoring/`, connector `bame-ops`, capability `operations.read_metrics`, tier 0):

- On BAME's database (`bame-os`), `tebos_export.operational_snapshot()` returns counts and ages only: leads
  and diagnostics (volume, unassigned and for how long), case-deliverable progress, unread staff
  notifications, staff coverage and pending invitations, player roster, and capital-ledger totals.
  The SQL is in `connectors/bame/bame_os_tebos_export.sql`.
- TEBOS connects as `tebos_reader`, a login that can execute that one function and nothing else: no table
  access and no row-level-security bypass. Its connection string is kept in TEBOS's Vault.
- About once an hour (`settings.interval_minutes`), the worker reads the snapshot and turns it into plain
  facts. They're recorded as `acquired` evidence from a `connected_system` source when the numbers change,
  or at least daily. A refused login moves the connection to `authentication_required`, with the reason.
- No write capability is mapped to this connector, so no action can be routed through it. Acting on BAME
  (for example, assigning a lead) will be a separate capability with approvals.

## The operating board

TEBOS is business operating architecture ([ADR 0003](docs/adr/0003-business-operating-architecture.md)). For each
business it keeps an operating board (migration `board_objectives`, `src/domain/board.ts`, page
`/businesses/:id/board`):

- **Objectives:** quantified targets with an owner and a due date. A measured value is read by the database
  from a connected system's evidence; nobody can type one in. The owner's own figure can be recorded as
  *stated*, citing their statement, but it never counts toward the target.
- **Pieces:** the tools, providers, channels, teams and roles the business runs on.
- **Flows:** ordered steps, each with who performs it, the tool it uses, its decision rule, and whether it is
  written down anywhere.
- **Founder dependency:** a count of the steps that exist only in the founder's head, per flow and overall.
- **The board in 3D** (`web/src/world/`): the same records drawn as a chessboard.
  - Pieces confirmed by evidence are solid, and pieces the business only described are glass.
  - Flows can be followed one at a time.
  - Founder-only steps glow amber at the founder.
  - Objective columns fill only from measured values.
  - The page draws it only when the device has a graphics chip; other devices get the page without it.

## Client pipeline

The pipeline takes a pricing-page enquiry through to an onboarded, maintained client (migration `client_pipeline`,
`src/pipeline/`). TEBOS's staff use the **Pipeline** page (`/pipeline`); the client uses the contract page, which needs
no account.

```
enquiry → screened → approved → awaiting payment → paid → contract sent → contracted → onboarded
                  ↘ declined            (an open opportunity can also be cancelled, with a reason)
```

- **Screened automatically.** Each enquiry is checked for:
  - a personal or throwaway email address;
  - a missing website, or a website on a different domain from the email;
  - words that overlap TEBOS's services (a possible competitor);
  - earlier enquiries from the same person or business.

  Each flag is a reason to look closer, not a verdict.
- **Decided by people.** Platform admins and staff with the `sales` role approve, decline or cancel. Approving a
  flagged enquiry needs a written reason, and who decided is recorded.
- **Paid before anything costly.**
  - The worker creates a Paystack payment page for the plan's monthly fee.
  - An opportunity is `paid` only on Paystack's signed confirmation (`POST /webhooks/paystack` on the worker) of the
    full amount in Rand, or on an EFT that a platform admin records with its bank reference.
  - The client's organisation only exists after payment and a signed contract, so no call or review can happen
    before then.
- **Contract from a lawyer-approved template.**
  - Templates live on **Pipeline → Contract templates**. TEBOS's starting draft is in `web/src/lib/contract-drafts.ts`
    and needs a lawyer's review.
  - Nothing is sent until a template is approved with a note saying who approved it. An approved template is fixed.
  - The contract is rendered with the plan's deliverables (`src/domain/plans.ts`), and the client accepts it at
    `/contract/<link>`.
  - The database records the name, time, network address and browser against the exact text's fingerprint.
    Accepted contracts and payments are never edited.
- **Onboarded.**
  - TEBOS creates the client's organisation and invites their admin; the invitation is bound to their email.
  - The assigned maintainer (staff with the `maintainer` role) joins the organisation as an operator.
- **Emails.** Every client email goes through an outbox with retries (5 attempts, 5 minutes apart), so a one-time link
  is never lost. Staff see whether each email went out, but never the link inside it.
- **Equity applications** stop at `approved`: they need a valuation and a shareholder agreement.

Worker settings:

| Variable | Purpose |
|---|---|
| `PAYSTACK_SECRET_KEY` | Creates payment pages and verifies Paystack's webhook signatures. Set the webhook URL in Paystack to `https://<worker domain>/webhooks/paystack`. |
| `RESEND_API_KEY` | Sends the client's emails. Without it, they wait in the outbox. |
| `PIPELINE_EMAIL_FROM` | The sender, e.g. `TEBOS <hello@yourdomain.com>`. It defaults to `ENQUIRY_ALERT_FROM`. |
| `TEBOS_SITE_URL` | The public site used in links. The default is `https://tebos-demo.vercel.app`. |

Plans (`src/domain/plans.ts`, one source for the pricing page, the payment and the contract):
- small businesses: Diagnostic (R2,500/month) and Architecture & Operations (R7,500/month), first month paid
  upfront;
- established companies (about 20–200 people): Company Operating Architecture, a one-off R15,000 Company
  Diagnostic paid upfront, then a monthly fee (from R25,000) agreed in a written proposal;
- equity partnership: no fees.

Staff roles: platform admins are in `platform_admins`, and `sales` and `maintainer` roles are in `platform_staff`.

### The sales team (migrations `sales_team`, `sales_playbook`)

- **Joining.** A platform admin invites a salesperson or maintainer on Pipeline → Staff. The link is bound to the
  invited, confirmed email address, lasts 7 days and is shown once. Accepting it grants the staff role only: staff
  are never members of a client's organisation. Staff without an organisation get a staff workspace (pipeline and
  playbook) instead of the client app.
- **Leads.** Sales add leads from their own outreach (Pipeline → Add a lead). The database decides where an enquiry
  came from by who sent it: a salesperson's lead is `source = 'sales'` and owned by them; anyone else's is
  `website`. A salesperson can take an unowned lead; only a platform admin reassigns one that has an owner.
  Leads are screened and move through the pipeline like any enquiry.
- **The playbook** (`/sales`): what TEBOS is, who to sell to, plans and prices, how a sale works, a call script,
  message templates, objection handling, how to show the demo, and the rules (nothing of value before payment,
  no promised results, no internal material leaves TEBOS). It lives in `public.sales_playbook`, readable only by
  staff, so it is not in the public web bundle. Admins edit it in the app (audited). Prices are `{{placeholders}}`
  filled from `src/domain/plans.ts`, so it can't quote a different price from the contract.

## TEBOS on its own board (migration `company_board`)

TEBOS runs on TEBOS. Its own company is the business "TEBOS" in TEBOS's organisation, with a board of its
departments (sales, client operations, finance, people, marketing, security, legal, capital), the tools and
providers they use, and flows that say who really does each step today, so what still runs through the founder
is counted on the board.

- **Company numbers.** The `tebos-company` connector reads `tebos_private.company_snapshot()`: aggregates from
  TEBOS's pipeline and payments (leads, decisions waiting, wins, cash collected, active clients, team, failed
  client emails), never names or client details. The monitor records them hourly as connected-system evidence.
  Only an organisation in `tebos_private.company_orgs` can hold the connector, so a client can't read TEBOS's
  revenue.
- **Automatic measurement.** An objective can be bound to a reading (`measure_metric`, `measure_path`). Each new
  reading then records a measured value for every active objective bound to it, read by the database from the
  evidence. Once an objective is active, what it's measured by can't change. Tick "Measure this automatically
  from now on" when measuring an objective from a connected system; it works for any client's platform too.

## Client delivery (migration `client_delivery`)

When TEBOS onboards a client, it creates their delivery plan (`src/domain/delivery.ts`): dated steps from
kick-off to the first monthly review (small businesses) or the architecture proposal (Company plan). Each step
says what "done" means.

- The assigned maintainer (or a platform admin) closes each step once, as done or skipped, with a note. The
  database records who and when; titles and due dates are fixed.
- Maintainers work from Pipeline → Delivery queue: overdue steps first.
- The client's team sees their plan, read-only, on their home page.
- TEBOS's own board counts open and overdue steps and on-time completion (`delivery.steps`).

## The maintainer's queue (migration `maintainer_signals`)

Every hour, the worker reads each onboarded client's records (and TEBOS's own) and raises what their maintainer
should look at (`src/domain/maintenance.ts`):

- an objective past its due date (mark it achieved or missed);
- an objective at risk: within 14 days of its date and not meeting its target (high in the last week);
- an objective nobody is measuring (no measured value in 35 days);
- a connection that is disconnected or degraded;
- findings waiting for review, and approvals waiting on the client, for 3 days or more.

Each signal is one queue item per client, refreshed while it holds and resolved automatically when it clears. The
maintainer closes an item as done or dismissed with a note (a dismissed signal isn't raised again for 14 days).
Items are TEBOS's working list: the client's maintainer and platform admins see them, the client doesn't. The
queue is Pipeline → Maintainer queue, above each client's delivery steps; TEBOS's board counts what's open
(`maintenance.queue`).

## Monthly billing (migration `monthly_billing`)

After the first payment, TEBOS bills each client monthly (`src/domain/billing.ts`, `src/billing/`):

- **Accounts.** Onboarding opens a billing account. Small-business plans are active immediately, billed on the
  same day each month as the first payment. A Company-plan account waits until a platform admin sets the fee
  from the agreed proposal, with a note saying which.
- **Invoices.** On the date, the worker issues the invoice (numbered `TEBOS-YYYY-NNNN`, due in 7 days), creates
  a Paystack payment page and emails it; reminders go out at 3 and 10 days late. An issued invoice never
  changes; a confirmed payment of its full amount (Paystack's signed webhook, or an EFT a platform admin
  records) marks it paid.
- **People decide:** TEBOS never charges a card (money is tier 3). Pausing a client more than 14 days late,
  ending billing, voiding an invoice and recording an EFT are a platform admin's decisions, each with a reason
  (Pipeline → Billing).
- Clients see their invoices, with a pay link, on their home page. TEBOS's own board counts monthly recurring
  revenue and what's overdue (`billing.recurring`).
- Amounts exclude VAT. Once TEBOS is VAT-registered, invoices need its VAT number and VAT added to be tax
  invoices.

## Enquiry alerts

Pricing-page enquiries (`public.enquiries`) are emailed to the team once, by the worker's `alerts` stage
(`src/notify/`). It runs when both of these are set on the worker:

- `RESEND_API_KEY`: a Resend API key (a send-only key is enough).
- `ENQUIRY_ALERT_TO`: who receives the alerts, comma-separated.
- Optional `ENQUIRY_ALERT_FROM`: the sender. It defaults to Resend's test sender `onboarding@resend.dev`, which
  can only deliver to the email address that owns the Resend account. Verify a domain in Resend and set,
  e.g., `TEBOS <alerts@yourdomain.com>` to send to anyone.

Each email uses an idempotency key per enquiry, so a retry after an unclear outcome never sends twice. An
enquiry is marked notified only when Resend accepts it, with Resend's message id recorded
(`notify_reference`). Failures are recorded in `notify_error` and retried up to 5 times, 5 minutes apart.
The public can't write any of these columns.

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
