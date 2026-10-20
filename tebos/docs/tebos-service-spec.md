# TEBOS service and governance specification, v0 (20 Oct 2026)

**Status: draft.** It is the reference that the existing system is audited against (3–9 Nov), and that future work
must fit.
- **Prices:** the figures are the current ones in `src/domain/plans.ts`. They are hypotheses, not validated prices.
  Changing them is the founder's decision.
- **Contract terms:** everything here waits on a lawyer's review (decision 3).

**The principle:** a client buys a defined level of TEBOS. That never includes unlimited access to the founder,
unlimited custom development or unlimited advice.

## 1. Why not price like an AI subscription?

**TEBOS can have a tier at that level.** It just can't be today's R2,500 package at that price.
- **AI subscriptions are cheap because no person works on each account.** Claude Pro is $20 a month ($17 a month
  billed annually), and Max starts at $100 (claude.com/pricing, checked 20 Oct). Millions of people talk to the
  product directly, within usage limits.
- **Today's TEBOS packages include people's time:** a diagnostic interview, reviews and a named maintainer. That time
  is what costs R2,500 and more.

**So the ladder has a self-serve tier at the bottom.**
- The business talks to TEBOS directly, as you would to an AI assistant.
- TEBOS answers from that business's own records, and does only what the plan allows.
- No founder time is included.
- The tiers above add people's time, and are priced for it.

**Will businesses pay?** There is no evidence yet: 0 paying TEBOS clients. What is known:
- SA small businesses already pay monthly for services they understand. For example, a published accounting package
  starts at R1,990 a month (companypartners.co.za, checked 20 Oct).
- **The risk is the category, not the number.** Buyers pay for a result they recognise, such as fewer missed
  enquiries or a better website. "An operating system" is something they've never bought.

**What follows from that:**
- the one-off diagnostic is the first purchase;
- the self-serve tier is the low-risk monthly entry;
- BAME is the reference case, with its written permission.

**Kill rules, written before the test:**
- 10 qualified business conversations by 30 Nov and 0 purchases means change who we sell to, or what, not the price
  alone;
- diagnostics bought but none converted to monthly means the monthly scope is wrong.

**Not done:**
- free pilots (they prove nothing about willingness to pay);
- promised results;
- invented testimonials or statistics.

## 2. Three ways to buy: once-off, monthly, annually (proposed, decision 27)

**Prices are the founder's decision.** The figures marked *new* are proposals. The others are the current prices in
`src/domain/plans.ts`.

| Option | Plan | Price | What's included | Limits |
|---|---|---|---|---|
| **Once-off** | Business Diagnostic *(new)* | R2,500 once | A website and operations scan; one diagnostic interview (an AI call or written); findings with the evidence behind each; a first operating board | One business, one report, delivered within 10 working days |
| Once-off | Build project *(new)* | Fixed quote | A defined build, such as a new website, an industry operating system set up from a template, or an integration | Only what the quote lists; changes are re-quoted; maintenance is a monthly plan |
| **Monthly** | Essentials *(new, self-serve)* | R499 a month | Talk to TEBOS about your own business; your operating board; a monthly website scan; reminders on your objectives | 2 users; 30 questions and 2 configuration changes a month; read-only; no people's time |
| Monthly | Diagnostic | R2,500 a month | All of Essentials; a quarterly interview; the founder-dependency map; findings with evidence | 3 users; 100 questions and 5 changes a month |
| Monthly | Architecture & Operations | R7,500 a month | All of Diagnostic; rules, owners and handovers; read-only integrations where authorised; the approved-change record; objectives on real numbers; a monthly interview | 15 users (replacing "unlimited"); 300 questions and 15 changes a month |
| Monthly | Company | Scoped, from R25,000 a month after a R15,000 diagnostic | All of A&O across departments; a named maintainer; a monthly leadership review | Per the contract |
| **Annually** | Any monthly plan *(new)* | 10 months' price for 12 | The same as monthly | The same as monthly. Paid up front, renewed yearly |

**What every plan excludes:**
- bespoke development;
- write access to connected systems;
- guaranteed results;
- unlimited founder time.

**What happens at a limit:** a request beyond the plan is never quietly done. TEBOS says which limit was reached and
offers the next plan or a quote.

**Annual plans:**
- Two months free is in line with AI subscriptions: Claude's annual discount is about 15%.
- Cancelling an annual plan early needs a written rule (decision 3).

**The usage numbers are starting limits, not costs.** The cost of a question (AI usage) is measured in the November
tests, and each limit is set so that the plan's price covers it.

## 3. The entitlement record each client needs

| Control | Exists today | Gap |
|---|---|---|
| Package (name, version, price, billing cycle) | The billing account and plan key (`monthly_billing`) | Plan version, so terms can change without rewriting history |
| Entitlements (features, users, limits) | **Not enforced.** The plan is a label | The database checks the package before a feature runs (backend, not the interface) |
| Integrations and permitted actions | Connection instances; read-only by default | A per-client list of approved systems and actions |
| Deliverables and cadence | Delivery-plan tasks; maintainer queue | — |
| Support channel and response target | — | One channel (a request in TEBOS), with a response target per plan |
| Exclusions | — | Recorded per plan; an out-of-scope request is answered from it |
| Changes (who approves) | Approvals and the audit trail | Plan changes as approved, audited records |
| Status | Invoices and dunning | Active, past due, paused, upgrading, downgrading, ended |

## 4. Controls, against what exists

| Control | Status |
|---|---|
| Identity and client isolation | Built: row-level security on every client table; audit chains per organisation (12 intact, 20 Oct) |
| Entitlement enforcement | **Gap**: the first build after the audit |
| Activity and approval log | Built: the hash-chained audit trail; approvals; REEDS's verified tasks |
| Action boundaries | Built: read-only by default; REEDS can't send, pay or commit |
| Failure handling | Built: failed work is recorded as failed, never as done; the exception queue is the maintainer queue |
| Usage and cost limits | **Gap**: no per-client limit on analysis runs |
| Offboarding (revoke, export, delete) | Partly: access can be revoked. Export and the deletion policy aren't written |
| Support and change control | **Gap**: section 3 |
| POPIA: operator agreement | **Gap**: a written operator clause in each client contract (decision 3) |

## 5. Client request flow

1. **Sign-in and package check.** The client signs in, and TEBOS identifies their package.
2. **Permission and limit check.** TEBOS checks permissions, limits and data access.
3. **Within the package:**
   1. TEBOS runs the approved workflow;
   2. it verifies the result and records the evidence;
   3. it returns the result to the client;
   4. it logs the usage.
4. **Outside the package:**
   1. TEBOS explains the limit and the options: an upgrade, a quote, or decline;
   2. a person approves any entitlement change, and it is recorded.
5. **Risk, uncertainty or failure:**
   1. TEBOS stops;
   2. it raises an exception;
   3. REEDS routes it to the named owner (the founder at first);
   4. the decision is recorded.

## 6. BAME: two agreements, not one

There is a mismatch to resolve:
- the code and the contract templates say **5%** equity (`EQUITY_SHARE`);
- the founder has also described "5.1% vesting".

These are different numbers, and vesting is how a share is earned, not its size. The BAME contract isn't in the
repository, so its wording hasn't been checked.

**Agreement A (services)** sets out:
- the package BAME receives (one of the three above);
- its deliverables, limits, support, exclusions and data handling.

**Agreement B (equity)** sets out:
- the exact percentage;
- the vesting schedule and conditions;
- what happens on either side's exit;
- dilution, transfer and buy-back.

**What equity doesn't buy.** It pays for the defined package in A. It doesn't buy every future feature, custom work,
or any right to REEDS, TEPOS, IREKUN, or the founder's private data.

**Intellectual property:**

| Category | Who owns it |
|---|---|
| TEBOS core (code, framework, standard workflows, general improvements) | Tidy |
| BAME's configuration | Licensed to BAME for the term |
| BAME's data | BAME's |
| Custom work | Ownership agreed before the work starts |

**Review.** A South African attorney who knows technology and equity agreements reviews both (decision 28).

## 7. BAME talking to TEBOS directly (the next build)

**The gap.** BAME works smoothly, but a change still goes through the founder.

**What already exists.** "Ask TEBOS" (REEDS requests) lets a client organisation's admin or operator ask TEBOS for
work. It is guarded, verified and audited. It has four request kinds, and none of them is "change something for us".

**The build**, in the CLAUDE.md order:
1. **Data model:**
   - `plan_entitlements`: per plan and billing option, the users allowed, and the questions and configuration changes
     allowed each month;
   - each client organisation's active plan and period, taken from its billing account.
2. **A new request kind, `change_request`:**
   - a client admin or operator describes the change;
   - the database counts this month's requests against the plan before accepting it;
   - over the limit, it's refused with `TEBOS_OUT_OF_PLAN` and the plan that would cover it.
3. **Within the plan:**
   - REEDS plans the change using only executors the plan allows (configuration in TEBOS, never code or outside
     systems);
   - it runs, verifies and reports as today.
   - Development work (BAME's own site in `bame/`) becomes a quote for the founder to approve, never an automatic
     change.
4. **Failure states and audit:**
   - a refusal, a failed change and an exception each become a record;
   - nothing is reported as done unless it was verified.
5. **Tests:**
   - in scope, over the limit, the wrong role, a downgrade mid-month, and a lapsed payment;
   - plus the schema-parity mirror.
6. **Interface:** a "Request a change" box on BAME's Ask TEBOS page, showing what's left this month.

**Needs first:** BAME's plan (decision 28). An equity partner pays no fees, so the agreement must say which plan's
limits BAME has.

## 8. First new lead: a tutoring academy (20 Oct)

**The lead.** A teacher who runs a tutoring business. Her website is weak, she wants TEBOS to diagnose it and make it
exceptional, and she likes interactive sites in the Getlayers style.

**It fits without custom work.** TEBOS already has the "Education centre operating system" blueprint
(`src/domain/blueprints.ts`, education-centre: private school or tutoring centre). If she pays, this is the paying
client who opens that route (ADR 0008 rule 2).

**The offer, in order:**
1. **Business Diagnostic (once-off):** her website and operations scanned, with findings. Nothing is built before
   she pays.
2. **Build project (fixed quote):**
   - a new interactive website;
   - her academy's operating system set up from the education-centre template: enrolments, sessions, tutors, parents.
3. **Monthly or annual plan** for the operating system, with its limits.

**The design.** We study what she likes about the Getlayers style (motion, interactivity) and design our own. We
never copy their designs, code or assets (proposal 6 rules).

**Needs from the founder:**
- her website address;
- her permission to scan it;
- her business name.

She can also enter these herself through TEBOS's meeting form, which records her as an opportunity.

## 9. Timeline (from the founder's plan, 20 Oct)

| Dates | Result |
|---|---|
| 20–26 Oct | Licensing questions sent; this spec; the BAME agreement collected; its ambiguities listed |
| 27 Oct – 2 Nov | Package matrix agreed; points for legal review |
| 3–9 Nov | Audit of isolation, permissions, usage, logging and approvals against sections 3 and 4; list of gaps |
| 10–16 Nov | Each package tested with sample requests: in scope, out of scope, failures, upgrade and downgrade |
| 17–23 Nov | BAME's agreed scope piloted; effort, errors, cost and support recorded |
| 24–30 Nov | Readiness decision; itemised December budget |

**The rule from now on:** no new TEBOS functionality until sections 3 and 4 are audited. The exception is the
entitlement check itself, once the audit confirms the gap.
