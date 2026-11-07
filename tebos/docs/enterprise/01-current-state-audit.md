# Current-state audit, 7 Nov 2026: Tidy Enterprise, TEBOS, PRA, REEDS

Phase 0 of the enterprise directive (founder, 7 Nov 2026). This refreshes the 14 Oct platform audit
([`../audit/2026-10-14-platform-audit.md`](../audit/2026-10-14-platform-audit.md)) rather than replacing it.

**What was checked today, and how:**
- the repository;
- the live database (`tebos-core`, read-only queries);
- the migration history;
- the Railway worker;
- GitHub CI;
- the Supabase advisors.

**What wasn't verified:** anything not listed above, notably the deployed Vercel pages. Those are protected, and I
didn't open them.

## 1. The headline

**The software is far ahead of the business.** There are 77 migrations, 563 unit tests, 198 end-to-end tests and 61
SQL rule tests, covering most of what the directive's Release A to D ask for. The live database tells the other
story: 0 paying clients, 0 invoices, 0 payments, 0 opportunities and 0 enquiries. 38 researched sales prospects
haven't been called. TEBOS recurring revenue is R0.

**The constraint on the company's value is no longer the platform.** It is three things:
1. Nobody is selling.
2. Four founder actions block taking money: the Paystack key, the email key, the contract review and the PPRA
   question.
3. Four built modules can't be applied to the live database.

So this audit recommends **no rebuild and no new large module**. The highest-value work is to:
1. unblock what's built;
2. make the founder's three commercial channels (Pelser, Real Estate Assist, Tidy Enterprise) safe to use together;
3. make the first sale happen.

## 2. What exists and works (verified)

| Area | What | Evidence |
|---|---|---|
| Control plane | Organisations, roles, row-level security, state machines (`public.state_transitions`), hash-chained audit log | 12 audit chains intact today (`tebos_private.audit_verify()`); schema-parity test mirrors every rule in `src/domain` |
| Commercial pipeline (Release A) | Enquiry → screening → payment link → contract → onboarding → delivery plan → monthly billing; sales prospects desk; sales team, playbook and calls | Migrations `enquiries`, `client_pipeline`, `sales_team`, `sales_playbook`, `sales_prospects`, `monthly_billing`; integration test `pipeline-flow-pg` passes. **Live: 0 records, 38 prospects** |
| Contracts | Templates, versioned acceptance bound to a hash of the body | `contract_templates`, `contracts`, `accept_contract`. Lawyer review is still decision 3 |
| Client operations (Release B) | Delivery tasks, work requests and tasks, client channel and change requests, web delivery division (state machine, scope, approvals, QA and release gates) | Migrations `client_delivery`, `work_requests`, `client_channel`, `web_delivery*`. Live: 0 projects |
| Executive intelligence (Release C) | REEDS request ledger with independent verifier; boards, objectives, measured readings; worker heartbeat; founder inbox | `work_requests`, `board_objectives`, `worker_heartbeat`; 15 objectives live (3 active) |
| PRA (Release D) | Property cases, evidence, figures, gates, pathways, problems, underwrites (Discover → Assess → Underwrite → Strategise → Execute → Optimise), property enquiries, operating picture | ADRs 0009, 0010, 0021, 0022, 0024. `property_journey` and `pra_platform` live; `property_underwrite` and `property_enquiries` **not yet live** |
| Landlord operations | Tidy Property Operations: portfolio, tenants, leases, append-only rent ledger in cents, arrears, maintenance | ADR 0023, 17 e2e tests. **Not live** (migration pending) |
| Agent's office (Pelser channel) | Listings, buyers, sellers, tenants and landlords as references only; deal documents against the agency's checklist; FFC path; listing studio; vault | Private organisation, two-step sign-in, redacted audit. Today it gains **referrals** (§7) |
| Bookings and studio | Services, packages, hours, bookings, crew, gallery delivery (Grape Studios) | ADRs 0016, 0018 |
| Agents | Agent runs and tool calls with purpose, permissions, model and tokens; capability registry with risk tiers; AI crew with approve-before-send | `agent_governance`, `capabilities`, `ai_crew` (**not yet live**) |
| Worker | One Node process on Railway: pipeline, billing, monitoring, maintenance, intelligence | Beating every 15 minutes today; on PR #115's commit |
| Security | RLS everywhere, two-step for private data, secret- and personal-data-shaped text refused, destructive-change guard, rate limits on public forms | Advisors today: only known, intended findings (public RPCs, RLS-only tables) |

## 3. What is incomplete

| Item | State |
|---|---|
| Four migrations | `ai_crew`, `property_underwrite`, `property_enquiries` and `property_operations` are merged but **not applied**. The founder has the one-transaction script `apply-2026-11-05.sql`. CI can't apply them: its `SUPABASE_DB_URL` password is refused (28P01) |
| Taking money | Paystack secret key not set (decision 1). Paystack is the only payment route; TEBOS never holds money |
| Sending email | No Resend key or verified domain (decision 2). Payment links, contracts and invoices can't reach a client |
| AI reasoning | Anthropic credit exhausted; worker intelligence paused. Grok built but off (decision 36) |
| Voice receptionist | An intake-call path exists (`intake_calls`, ElevenLabs agent ID in the README). No phone number or agent configured (decision 2c) |
| Free-text REEDS requests | Need a working model key |
| Proposals | No proposal or scope-of-work generator. Contracts and screening exist; a proposal draft step is missing (gap register G-03) |
| Finance (company) | Invoices and payments exist for TEBOS's clients. No accounts payable, expenses, cash-flow forecast or reserve tracking for the company itself (G-08) |
| Customer success | No health score, renewal register or churn signal (G-10). Nothing to measure yet: 0 clients |

## 4. What is duplicated or inconsistent

- **Four Vercel projects build the same repository** (`tebos`, `tebos-ex3f`, `tebos-web`, `bame-os`), plus build
  skipping to stay under the free plan's limit. Retiring the extras is irreversible, so it is the founder's call
  (14 Oct audit, still open).
- **Three intake routes for property leads:** `enquiries` (TEBOS), `property_enquiries` (Tidy Enterprise site) and
  agent contacts (Pelser). This is intended: they serve different channels with different owners. Today's referral
  record is the one controlled bridge between them.
- **Hosting:** Vercel Hobby is non-commercial (decision 31). It can't legitimately carry paying clients.

## 5. What is broken

- **CI's migration step can't log in** (28P01). Every merge since 2 Nov has left the live database behind.
- **A false history row** (`20261105034954 ai_crew`, a no-op I created on 5 Nov) makes CI's runner skip `ai_crew`.
  The founder's script removes it.
- **The worker is held on an old commit**, because main's worker expects the `ai_crew` tables.

## 6. What must be preserved

Everything in §2. In particular:
- the state machines and their parity test;
- the audit chain;
- the private-organisation and two-step boundary around TEPOS, REEDS and IREKUN data;
- money in integer cents with an append-only ledger;
- "AI drafts, a person approves and sends".

None of this is to be rewritten. The directive's own rules forbid it, and nothing found today justifies it.

## 7. The three-channel model: what exists and what was missing

| Channel | Exists | Missing before today |
|---|---|---|
| Pelser Real Estate (employer) | Agent's office: listings and people as references only, documents checklist, FFC path | A controlled way to refer a person outward without misusing the agency's client book |
| Real Estate Assist (referral partner) | Nothing | A referral record with consent and the written arrangement |
| Tidy Enterprise (own company) | Property enquiries, PRA cases, TEBOS pipeline | A rule that someone met through the agency enters Tidy Enterprise's pipeline only with the agency's written permission |

**Built today (ADR 0025): channel referrals** in the agent's office. Each referral records:
- what the person needs;
- that they agreed to be introduced, and when and how;
- for Real Estate Assist, where the written referral arrangement is;
- for Tidy Enterprise, where the agency's written permission is (unless the lead is the founder's own);
- whether a fee is agreed in writing, and where, with no amounts.

The database refuses any step that skips these, and the screen says what is missing first. Nothing is sent from
TEBOS.

## 8. Baseline (for measuring change)

| Measure | 7 Nov 2026 |
|---|---|
| Paying clients / MRR / invoices / payments | 0 / R0 / 0 / 0 |
| Opportunities / enquiries | 0 / 0 |
| Sales prospects (researched, not called) | 38 |
| Scans / findings / actions | 1 / 0 / 0 |
| Businesses / objectives | 9 / 15 (3 active) |
| Referrals | 0 (table not yet live) |
| Audit chains intact | 12 of 12 |
| Unit / SQL rule / e2e tests | 563 / 61 files / 198 |
| Worker | Beating every 15 min; 1 error per pass (AI credit) |
| Hours of founder intervention per week | Not measured yet (G-15) |
