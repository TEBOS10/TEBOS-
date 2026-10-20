# TEBOS service and governance specification, v0 (20 Oct 2026)

**Status: draft.** It is the reference that the existing system is audited against (3–9 Nov), and that future work
must fit.
- **Prices:** the figures are the current ones in `src/domain/plans.ts`. They are hypotheses, not validated prices.
  Changing them is the founder's decision.
- **Contract terms:** everything here waits on a lawyer's review (decision 3).

**The principle:** a client buys a defined level of TEBOS. That never includes unlimited access to the founder,
unlimited custom development or unlimited advice.

## 1. The model (founder, 20 Oct)

**The subscription buys the transformation, and then steady improvement.**
- A business subscribes, and TEBOS turns what it has into its operating system: a website that looks exceptional,
  and the workflows, assistant and records behind it.
- **The build is included in the subscription.** It isn't a separate quote the client must buy first.
- After that, the business sends **change requests** each month: "update the pictures", "add a course", "change the
  hours". TEBOS records each one against the month's allowance.
- When the allowance is used up, further requests wait for the next month (or the next tier). The system TEBOS built
  doesn't shrink: the limit is on new changes, never on using what exists.
- **The tier follows the business's scale, not a wish to charge more.** Small businesses must be able to afford it.
  The founder's test: "people starting a business aren't trying to pay R2,000."

## 2. The tiers (decided by the founder, 20 Oct)

| Tier | For | Monthly | What TEBOS builds | Change requests a month |
|---|---|---|---|---|
| **Small** | A business that already knows how it runs and needs its website and system brought up to standard: the tutoring academy, a salon, a sole trader | **R500** | The exceptional website; the operating system from its industry template; an assistant for its owner; its board and reminders | 5 |
| **Medium** | Several employees, more workflows and integrations (BAME's level of system) | **R2,500** | All of Small, plus team roles and handovers; read-only integrations with the tools it uses; objectives on real numbers | 15 |
| **Company** | Many employees and departments | **R7,500** | All of Medium across departments, plus a monthly review | 40 |
| Larger than Company | Bigger organisations | Quoted | Scoped in writing | Per the contract |

**The three ways to pay** (founder, 20 Oct):
- **Monthly:** the prices above.
- **Annually:** 10 months' price for 12, paid up front.
- **Once-off:** the build without the monthly change requests. The client owns the result as delivered, and any later
  change is quoted. The price is decision 27.

**What counts as one request:**
- One change to one thing: new photos for a gallery, a new page, a changed price list, a new form field.
- A request that is really a new feature, such as online bookings with payment, counts as several. TEBOS shows the
  count before the client confirms.
- Unused requests don't roll over.

**Outside every tier:**
- write access to outside systems unless agreed;
- guaranteed business results;
- unlimited founder time.

**Minimum term: 6 months** for monthly plans (founder, 20 Oct), or pay annually. The first build costs more than one
month pays.

**Running costs are the client's, and disclosed before signing** (founder, 20 Oct):
- **Included:** the build and the tools TEBOS already pays for.
- **Paid by the client at cost:** hosting, domain names, and any outside service that runs only for that client, such
  as a sending domain, SMS or a paid map. TEBOS lists each one with its price in the proposal before anything is set
  up, and never pays a client's running costs from its own funds.

**One-off is available but not recommended.**
- A business can buy its system once, without the monthly changes.
- It is quoted, priced by size, and costs more than the subscription's first year, because there is no ongoing
  relationship to spread the build over.
- A one-off enterprise-scale system is a large quote.

**Replaces** the earlier proposal in this spec (a separate diagnostic first, self-serve Essentials at R499, build
projects quoted), and the current prices in `src/domain/plans.ts`:
- R2,500 Diagnostic;
- R7,500 Architecture & Operations;
- Company from R25,000.

The code changes in the next build.

## 2a. Every industry, three sizes, chosen by diagnosis (founder, 20 Oct)

**Each industry has its own Small, Medium and Company tier,** at the same prices: a small, medium or enterprise
agency; the same for academies, gyms, practices and the rest. The industries are TEBOS's blueprints
(`src/domain/blueprints.ts`):
- marketing agency;
- plumbing and construction;
- sports agency;
- medical or dental practice;
- restaurant or hospitality;
- real estate agency;
- online retail;
- accounting and bookkeeping;
- logistics and courier;
- private school or tutoring centre;
- gym or fitness studio.

**The diagnostic comes first, and is strongly recommended.**
- It finds the business's industry (or that it's outside them all), its size, what is actually wrong, and how that
  compares with what the owner wants it to become.
- TEBOS then recommends the tier: "from what we see, you're a small business, and this is what it needs to reach
  the next level". Like a doctor, the owner's own view of the problem is heard, but the diagnosis may find something
  else.
- **A client may still choose a tier without it.** The sign-up page says plainly that the diagnostic is recommended,
  and why.
- A business in no blueprint industry is diagnosed before any tier is offered, never fitted to the nearest template.

**Ambition is respected, and sequenced.** A small business that wants an enterprise system is shown the steps to
get there. It isn't sold Company scope it can't yet use.

## 2b. The showcase: categories, then the businesses inside them (founder, 20 Oct)

**The client map changes from businesses to categories.** It currently shows each business as a coloured tile;
instead, each industry becomes a coloured category. Opening a category shows the businesses TEBOS has built for in
that industry, and what was built for each, so a visitor can say "I want that for mine".

**Rules:**
- **A real business appears only with its written permission,** and with its real results from its own records.
  Nothing is invented, and no template is shown as a client.
- **An industry with no client yet shows its blueprint, labelled as a template,** never as a client's work.
- **BAME** would sit under sports agency once it agrees.

## 2c. What changes in the system (the next build, in order)

1. **Plans:**
   - `src/domain/plans.ts` and a migration get the tiers Small R500, Medium R2,500 and Company R7,500;
   - annual billing at 10 months' price;
   - a 6-month minimum term;
   - the once-off quote;
   - each with its change-request allowance.
   - The prices are enforced in the database today (`client_pipeline`, `company_plan`, `monthly_billing`), so this is
     a live migration with tests.
2. **The change-request allowance** (section 7): BAME first, as Medium, with 15 requests a month.
3. **The diagnostic's recommendation:** the industry, the size, and the recommended tier with its reasons, recorded on
   the diagnostic.
4. **Sign-up:** choose an industry and a size, with the diagnostic recommended.
5. **Running costs:** each client's pass-through costs listed on their proposal and invoice.
6. **The category showcase** on the client map, last, once there is a client who has given permission to be shown.

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

**Needs first:** BAME's tier (decision 28). It is probably Medium, given its integrations. An equity partner pays no
fees, so the agreement must say which tier's allowance BAME has.

## 8. First new lead: a tutoring academy (20 Oct)

**The lead.** A teacher who runs a tutoring business. Her website is weak, she wants TEBOS to diagnose it and make it
exceptional, and she likes interactive sites in the Getlayers style.

**It fits without custom work.** TEBOS already has the "Education centre operating system" blueprint
(`src/domain/blueprints.ts`, education-centre: private school or tutoring centre). If she pays, this is the paying
client who opens that route (ADR 0008 rule 2).

**The offer: the Small tier, R500 a month** (or annually). It includes:
- a new interactive website;
- her academy's operating system set up from the education-centre template: enrolments, sessions, tutors, parents;
- an assistant for her;
- 5 change requests a month after that.

TEBOS diagnoses her current site first, and the findings show her what the build will fix.

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
