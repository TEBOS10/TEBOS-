# Target architecture: Tidy Enterprise, PRA, TEBOS, REEDS

Phase 1 of the enterprise directive (7 Nov 2026). It extends what exists; nothing here replaces a working part. Every
proposed piece names the business requirement it serves and its entry in the
[capability gap register](03-capability-gap-register.md) (G-nn).

## 1. Master business architecture

**Tidy Enterprise** is a business architecture company with a property-finance specialisation. It helps a business:
- find value it isn't using;
- design new revenue;
- make itself financeable;
- install the operating system to run it.

It is not an estate agency, a lender, an investment fund or an authorised financial-services provider. Where an
activity needs one of those, it is routed to someone authorised (§9 and the
[risk register](05-risk-and-compliance-register.md)).

| Unit | What it is | Who it serves | How it earns |
|---|---|---|---|
| **Tidy Enterprise** | Business architecture and corporate development | Businesses across industries | Paid assessments, engagements, project coordination fees, structured participation (never instead of cash) |
| **PRA** (Property Revenue Architecture) | The property specialisation inside Tidy Enterprise | Landlords, property owners, developers | Property Income & Options Assessment, monthly plan, landlord operations software |
| **TEBOS** | The operating-system platform | Tidy Enterprise and PRA internally; client businesses externally | Subscriptions, implementation, configuration, support |
| **REEDS** | The founder's private chief of staff | The founder only | None directly: it raises the quality and speed of decisions |
| **TEPOS** / **IREKUN** | The founder's private operating system and security backbone | The founder only | None: never productised |

**Why a client would choose Tidy Enterprise over a consultancy, a software vendor or a property adviser:** it
diagnoses, structures and installs in one engagement. The installed system keeps measuring the result afterwards,
which is the recurring part. That claim needs proof: no client has yet received it (scorecard S-1 to S-3).

### The founder's three channels

```
                ┌──────────────── REEDS (founder only): research, priorities, decisions ──────────────┐
                │                                                                                       │
 Pelser Real Estate            Real Estate Assist                 Tidy Enterprise / PRA / TEBOS
 (employer: sales, letting)    (partner: specialist landlord help) (own company: finance, architecture, systems)
   agent's office  ──referral (consent + partner terms)──►  partner
   agent's office  ──referral (consent + agency's written permission)──►  property enquiry / PRA case / TEBOS pipeline
                │                                                                                       │
                └──────── TEBOS infrastructure: one codebase, separate organisations and records ──────┘
```

- **Separate records, owners and money for each channel.** Pelser income is not TEBOS revenue. A referred landlord
  is not a Tidy Enterprise client until they become one through Tidy Enterprise's own intake.
- **The agency's book stays the agency's.** The agent's office holds references, not people (decision 12).
- **A referral is the only bridge.** It carries no personal details and needs consent plus the written basis
  (ADR 0025).

## 2. Product and service architecture

| Offer | Unit | Status | Next |
|---|---|---|---|
| Property Income & Options Assessment | PRA | Built (case, evidence, underwrite, report) | Price (decision 26) and the PPRA question (10b) before the first invoice |
| PRA monthly plan | PRA | Built (monthly update) | Same gates |
| Tidy Property Operations (landlord software) | PRA / TEBOS | Built, not live | Apply migration; pilot landlord |
| TEBOS operating system (Starter, Growth, Company) | TEBOS | Built: pipeline, billing, delivery, boards | Payment and email keys (decisions 1, 2) |
| Website delivery (3-day clock) | TEBOS | Built, live | Commercial hosting (31) |
| Business architecture assessment (any industry) | Tidy Enterprise | Method only: interview playbooks, scan, operating picture | Methodology in §4; priced engagement (founder) |

## 3. Application architecture

There is one repository and one database (`tebos-core`), with apps separated by organisation and by private flags:

| App | Directory | Audience |
|---|---|---|
| TEBOS web (public, client, staff) | `web/src` | Clients, staff |
| TEPOS | `web/tepos` | Founder only (private organisation, two-step) |
| PRA platform | `web/pra` | Landlords (`app = 'pra'` accounts) |
| Tidy Property Operations | `web/ops` | Landlords |
| Tidy Enterprise site | `web/tidy` | Public |
| Grape Studios | `web/grape` | Public, client |
| Worker | `src/` on Railway | Server only |
| Domain rules | `src/domain`, mirrored in `supabase/migrations` | Shared |

**Principles, all already in force:**
- The database is the system of record.
- Every rule that protects trust is enforced in SQL and mirrored in TypeScript.
- The interface uses the user's own session and never a privileged key.
- New industries become configuration (blueprints, playbooks, templates), not forks (ADR 0008).

**Not proposed:** microservices, a message bus or a second database. Load is zero, and the single worker with
idempotent stages handles the planned volume (directive §12: "do not implement for appearance").

## 4. Corporate development methodology

This is the repeatable method for any client. Every step has a TEBOS record already, or a named gap.

| Step | Question | TEBOS record |
|---|---|---|
| 1. Discover | What does the business do, own and earn? | Scan (public evidence), interview (owner's statements), operating picture (ownership, operations, money, time) |
| 2. Assess | Where is value unused? Assets, capacity, contracts, customers | Findings with evidence; for property, PRA problems and figures with source, date and reliability |
| 3. Underwrite | Is the opportunity real and financeable? Downside first | PRA underwrite (proceed / hold and optimise / not viable). Generalised for non-property: G-06 |
| 4. Strategise | Which structure? Own, lease, concession, partner, operating rights | Pathways and workstreams (PRA); objectives and boards |
| 5. Execute | Who does what, by when, with which specialist | Actions, delivery tasks, approvals, specialist routing |
| 6. Optimise | Did it work? | Objective measurements, outcome reviews; resolved needs new checked evidence |

**Asset-backed opportunities** (e.g. a football facility: academy, field rental, tournaments, events, leases) are
assessed as separate income lines. Each line carries:
- demand evidence;
- capital expenditure;
- working capital;
- the downside.

Speculative lines are labelled estimated, never presented as revenue. The enforcement exists for property figures
today; generalising it is G-06.

## 5. Enterprise operating model and decision rights

| Function | Today held by | Decision rights | Escalates to |
|---|---|---|---|
| Strategy, capital allocation, partnerships | Founder | All material decisions | — |
| Property finance and corporate development | Founder | Diagnosis, structuring, closing | Authorised professional where regulated |
| Sales | Founder (calls); REEDS routine (research) | Who to call, what to offer within approved prices | Founder for price or terms |
| Product and engineering | REEDS routine (tier 1) | Code, tests, additive migrations, merging green PRs | Founder for tier 3 |
| Delivery | Maintainers (invited, decision 30) | Within the agreed scope | Founder for scope or price change |
| Finance | Founder | Every payment, price, commitment | — |
| Risk and compliance | Founder with attorney | Every legal text, regulated activity | Attorney, PPRA, FSCA |
| Quality | Database gates + reviewer | Release gates (web delivery), verification (REEDS) | Founder |

No new hires are proposed. Each role above is documented with purpose, outputs and KPIs only when it has a person or
a funded workload (directive §18).

## 6. Autonomy maturity model

Levels:
- **0** manual;
- **1** documented;
- **2** AI-assisted;
- **3** automated with human approval;
- **4** monitored autonomous with escalation;
- **5** management by exception.

A process moves up a level only with measured evidence: runs without founder intervention, error rate and cost.

| Process | Level today | Evidence | Next level needs |
|---|---|---|---|
| Prospect research | 2 | Daily routine adds researched rows, with source, to the desk | Write approvals that don't time out; a measured hit rate |
| Calling prospects | 0 | 38 uncalled | A person calling (cannot be automated responsibly) |
| Enquiry intake and screening | 3 (built) | Pipeline test; 0 live runs | Live enquiries |
| Payment links, contracts, invoices | 3 (built) | Blocked on keys | Keys; first client |
| Delivery (websites) | 3 (built) | Gates enforced; 0 projects | First project |
| Referrals between channels | 1 → 3 (today) | ADR 0025 | Written agreements with Pelser and Real Estate Assist |
| Engineering and ops checks | 4 | Daily run, health, audit verification, merges; founder only for tier 3 | Fewer tier-3 blockers |
| Management reporting | 2 | Morning brief; boards | Real revenue data |
| **Never autonomous** | — | Prices, contracts, payments, credentials, deletion, regulated advice, outward messages | Stays human by design |

## 7. REEDS integration blueprint (founder only)

- **Where it lives.** The request ledger (`work_requests`), with an independent verifier. The daily routine is
  REEDS's engineering and sales arm. Private data stays in TEPOS's private organisation, and clients never see it.
- **Learns from:**
  - documented decisions (the founder's decisions table, the ADRs);
  - outcomes recorded in TEBOS.
  It does not learn from chat it cannot cite.
- **May:** analyse, draft, research, prioritise, coordinate approved workflows, merge its own green code.
- **May not:** send, pay, sign, price, change access, delete, or advise as a regulated professional.
- **Next increments:**
  - free-text requests, once a model key works;
  - a weekly "actual vs plan" brief from boards and the ledger, once money records exist (G-12).

## 8. AI receptionist blueprint

| Part | Design | Status |
|---|---|---|
| Voice | ElevenLabs conversational agent on a provider phone number; identifies itself as an AI assistant | Intake path built; number and agent pending (decision 2c) |
| Profiles | Two scripts on one agent configuration: PRA (property) and TEBOS (business systems), chosen by the number dialled or the caller's answer | Design |
| Records | Each call writes an `intake_calls` row → enquiry or property enquiry with consent captured; no transcript kept beyond what's needed | Built for intake calls |
| Guardrails | Never promises finance approval, valuations, legal conclusions or returns; escalates urgent or sensitive matters to a person; recording only with stated consent (POPIA) | To be written into the agent prompt with the attorney's wording |
| Booking | Consultations through the bookings module (Tidy Enterprise's own organisation) | Built (bookings) |
| Reporting | Calls, qualified, booked, escalated per week | G-11 |

It is not deployed until the founder sets the provider number and approves the script. It is outward-facing, so tier
3.

## 9. Financial architecture

- **Records, not movement.** TEBOS records money and never holds or moves it. Paystack takes payment; banks hold
  money.
- **What TEBOS keeps distinct:**
  - revenue (invoiced);
  - collected cash (payments with proof);
  - recurring (subscriptions) versus implementation and project revenue (one-off).
  It does this today for TEBOS's clients (`invoices`, `payments`, `billing_accounts`).
- **Missing for the company itself (G-08):**
  - operating expenses;
  - payables;
  - reserves: company, founder personal and client reserves always separate;
  - a cash-flow view.
  The founder's private money records (`res_money_items`, TEPOS) stay private and are never mixed with company
  books.
- **Pricing rule.** Every price covers delivery cost, infrastructure, contractors, maintenance, risk and margin, and
  is set by the founder. No price is invented here.
- **Client funds:** never pooled, never used by the company.
- **Investment vehicles:** any pooled investment or third-party money needs South African legal and regulatory
  review first (CISCA, FAIS). This is not built, and won't be without that review.
- **KPIs** (MRR, ARR, gross margin, CAC, LTV, churn, NRR, receivables ageing, reserve coverage) are defined in the
  [scorecard](04-roadmap-and-scorecard.md). Each shows "unknown" until there is data.

## 10. Technology and security blueprint

| Concern | Today | Gap |
|---|---|---|
| Tenant isolation | RLS by organisation; private organisations with two-step; tested in every SQL suite | Businesses in one organisation still need splitting (14 Oct audit) |
| Secrets | Never in tables (parity test), refused in free text, set by the founder in host settings | CI database password wrong (founder) |
| Audit | Hash-chained, verified daily; redacted for private data | — |
| Backups and recovery | Supabase daily backups (platform). No tested restore | G-13: a documented, rehearsed restore on a scratch project |
| Monitoring | Worker heartbeat, maintainer signals, advisors read daily | Error alerting to the founder's phone (push not started) |
| Environments | Local Postgres for tests, Vercel previews, one production database | No staging database (cost); migrations are tested on scratch databases instead |
| Deployment rollback | Vercel instant rollback; Railway redeploy by commit; additive migrations | Documented in G-13 |
| Integrations | Connectors with status, honest statuses (no "connected" without proof), pause on failure, bounded retry | Payment, email and voice keys (founder) |
