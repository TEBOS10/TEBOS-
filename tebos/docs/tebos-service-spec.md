# TEBOS service and governance specification, v0 (20 Oct 2026)

**Status: draft.** It is the reference that the existing system is audited against (3–9 Nov), and that future work
must fit.
- **Prices:** the figures are the current ones in `src/domain/plans.ts`. They are hypotheses, not validated prices.
  Changing them is the founder's decision.
- **Contract terms:** everything here waits on a lawyer's review (decision 3).

**The principle:** a client buys a defined level of TEBOS. That never includes unlimited access to the founder,
unlimited custom development or unlimited advice.

## 1. Will businesses pay R2,500 or R7,500 a month?

**Unknown.** There are 0 paying TEBOS clients, so there is no evidence either way. What is known:
- SA small businesses already pay monthly retainers for services they understand. For example, a published monthly
  accounting package starts at R1,990 (companypartners.co.za, checked 20 Oct). So R2,500 isn't an outlandish amount
  for a small business.
- **The harder problem is the category, not the number.** "An operating diagnostic subscription" is something a buyer
  has never bought. They pay for a result they recognise:
  - fewer missed enquiries;
  - knowing where money leaks;
  - a team that doesn't need the owner for every step.

**The answer: don't make the monthly fee the first thing anyone buys.**

1. **Lead with property, where the problem is already concrete (ADR 0009).** The PRA assessment is for owners who can
   see the empty months and late rent. TEBOS's business packages come second.
2. **Make the first TEBOS purchase a single fixed-price diagnostic, not a subscription.**
   - Plans already has this pattern for larger companies: the R15,000 Company Diagnostic first.
   - Apply it to small businesses too: one Small Business Diagnostic at a single price, delivered as a written findings
     report plus their operating board.
   - The monthly plan is offered only once the findings show work worth paying for each month.
   - The diagnostic's price is decision 27. A starting test: R2,500 once, so it equals the first month of the current
     plan.
3. **BAME is the reference case.** An equity partner pays no fees (`EQUITY_SHARE`). Its measured results (fewer
   missed leads, faster responses, recorded on its board) are what the next buyer is shown, with BAME's written
   permission.
4. **Test the price in conversations before publishing it:**
   - ask a business owner what the problem costs them each month;
   - quote only after they have named the cost.
5. **Kill rules, written before the test:**
   - 10 qualified business conversations by 30 Nov and 0 diagnostics bought means change the segment or the scope,
     not the price alone;
   - a diagnostic bought and no monthly plan after it means the monthly scope is wrong, not the buyer.
6. **Not done:**
   - discounting to "free" (a free pilot proves nothing about willingness to pay);
   - promising results;
   - inventing testimonials or statistics.

## 2. The packages: what each one is, and isn't

| | Diagnostic (R2,500/month) | Architecture & Operations (R7,500/month) | Company (scoped, from R25,000/month after a R15,000 diagnostic) |
|---|---|---|---|
| Included | Monthly website scan; quarterly diagnostic interview; operating board; founder-dependency map; findings with evidence; up to 3 users | All of the Diagnostic; rules, owners and handovers; read-only integrations where authorised; approved-change record; objectives on real numbers; monthly interview | All of A&O across departments; a named maintainer; a monthly leadership review |
| **Not included** | Building software; implementing recommendations; integrations; managing the team; unlimited live consulting | Bespoke development; write access to connected systems; guaranteed performance; implementing every recommendation | Unlimited custom work: every implementation is scoped, priced and delivered separately |
| Over the limit | Offer an upgrade or a quoted engagement | Offer the Company plan or a quoted engagement | A new scoped proposal |
| Changing plan | Upgrade at any time; downgrade or exit at the end of the month (to confirm with the lawyer) | As left | Per the contract |

**Fix to the current plan text:** A&O says "unlimited team members". That conflicts with the rule that every package
has limits. It becomes "users within the agreed usage limits" (decision 27, with the price).

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

## 7. Timeline (from the founder's plan, 20 Oct)

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
