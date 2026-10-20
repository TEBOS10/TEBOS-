# ADR 0006: Earn first; enterprise readiness follows evidence

Date: 2026-10-19 · Status: accepted (founder, 19 Oct 2026, from the ChatGPT strategy review)

Builds on ADR 0005, the systems portfolio. That ADR says how a capability moves from TEPOS to TEBOS; this one says
what the company works on first.

## Context

The founder brought a strategy review on 19 Oct. It covered:
- Fortune 500 readiness;
- security and compliance gaps;
- enterprise architecture;
- pricing, go-to-market and funding.

Its own conclusion is the decision below:
- **The distance to a valuable business is much shorter than the distance to an enterprise platform.**
- The first doesn't wait for the second.

Live state on 19 Oct:
- 0 paying clients;
- 0 property cases;
- 0 money records;
- 0 REEDS requests.

## Decision

### Three stages, overlapping, each gated on evidence

| Stage | Goal | Evidence that it is reached |
|---|---|---|
| 1. Make the business earn | One narrow capability solves one expensive problem for one paying customer. Delivery may be partly manual | A payment, a measured result, and the customer's willingness to pay again |
| 2. Make delivery repeatable | Standard inputs, outputs, price, delivery cost and reusable software | Several customers with the same problem, served without rebuilding |
| 3. Become enterprise-ready | Security, governance, reliability, support and procurement documents | A larger buyer's requirements met, and their contract signed |

**Stage 1 is the PRA monthly plan:**
- the price was decided on 19 Oct;
- the monthly update is built.

**The 30-day objective** was one paying owner, with the result measured in the monthly update. *Replaced 20 Oct by ADR 0009's phases: compliance first, then a first paid case by 28 Feb 2027.*

**Rules:**
- Don't build another product line, portfolio or architecture layer because the current one isn't yet what we
  envision. Proposals already approved stay in their order, behind stage 1.
- Sell only what is reliable:
  - no client's sensitive data goes into TEPOS or TEBOS until the stage-1 security items below are done;
  - no capability is promised before it exists.
- The founder's real-estate registration and training stay first in their time.
- **Profit is a constraint, not an afterthought:**
  - the running cost stays inside free tiers until there is revenue (worker batch mode, 19 Oct);
  - each paid upgrade waits for income that covers it (ROADMAP: TEBOS pays its own costs, then 50% to Tidy Capital).

### What the review got right, and what had already changed

| Review item | Status on 19 Oct |
|---|---|
| Audit-chain verifier | **Done.** `audit_verify()` and `audit_chain_status()` are live, and all 12 chains were intact. The heads are recorded in the operator log |
| Make the repository private; default branch `main` | Founder's action (decision 8) |
| Two-step sign-in enrolled | Built and enforced by the database. The founder's enrolment is pending (decision 19) |
| Rotate database passwords; leaked-password protection | Founder's action (decision 8). Leaked-password protection needs Supabase Pro |
| Backups and point-in-time recovery | Need a paid Supabase plan. **Waits for revenue** (stage 1 pays for it) |
| "The web app uses the service key" | Not so: the interface uses only the user's own session. From 19 Oct the build also fails if a privileged key appears in either web bundle (`web/scripts/check-bundles.mjs`) |
| Pricing tiers ($100 / $500 / $2,000+) | **Not adopted.** TEBOS's prices already exist (`src/domain/plans.ts`: R2,500, R7,500, from R25,000, equity), as do PRA's (R750, R1,950, R3,950). They change only on evidence from real sales |
| SOC 2, SSO, multi-tenant "bridge" databases, cloud marketplaces, Series A | **Stage 3.** Recorded as the direction, not started. They are revisited when a buyer's requirement and the revenue to pay for them both exist |
| Statistics quoted in the review (for example "78% of buyers require SOC 2") | Not verified here. Not to be quoted to clients without a source |

### REEDS watches the signals that change the plan

The review asked how the company adapts. REEDS's job, as it gains each capability:
- **Report weekly on:**
  - customer demand (enquiries, conversions);
  - cash (income, runway);
  - operating results (the monthly updates);
  - security (advisors, the audit chain);
  - competitors and technology changes.
- **Act on what it finds** by proposing a reallocation for the founder's approval. It never acts alone on money or
  priorities.

The daily morning run already covers health, the audit chain and the live counts. Demand and cash follow when there
is a first client.

## Consequences

- **Decision order:** the founder's decisions list puts stage-1 items (selling, the free Railway plan, two-step) ahead
  of enterprise items.
- **New work states its stage.** Stage-3 work needs a buyer asking for it.
- **The ambition stands, sequenced:**
  1. earn;
  2. repeat;
  3. scale.
