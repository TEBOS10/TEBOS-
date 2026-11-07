# 12-month roadmap and enterprise value scorecard

From 7 Nov 2026. These are measurable stages with decision gates. Fortune 500 scale is the long-term ambition. It is
not a 12-month promise, and nothing here forecasts revenue.

## The first 30 days (the three-channel model)

**Week 1: agreements and workflow mapping** (founder)
- Pelser:
  - written permission covering what may be kept, which tools, and whether its contacts may ever be introduced to
    Tidy Enterprise (decisions 12, 25);
  - commission rules.
- Real Estate Assist: a written referral arrangement covering:
  - eligible problems;
  - consent;
  - who serves;
  - whether a fee is permitted, who pays it and when. Check the PPRA position before any fee (risk R-02).
- **Acceptance:** three documented workflows, each with its boundaries and payment rules on paper.

**Week 2: the minimum operating system**
- Apply the pending migrations (G-01).
- Referrals are live (ADR 0025).
- Payment and email keys (G-02, G-04).
- **Acceptance:** a test enquiry, and a test referral, each reach the right record. Each has its next step, and no
  duplicates are created.

**Week 3: real cases**
- Pelser opportunities stay in the agent's office.
- Suitable landlords are referred with consent.
- Tidy Enterprise prospects come from the desk and the founder's own leads.
- **Acceptance:** real cases handled. Every manual intervention is written in the operator log.

**Week 4: measure and standardise**
- Channel economics from records (cash collected per channel).
- Remove manual steps.
- Pick the next automation by measured value.
- **Acceptance:** a monthly view built from records, and a ranked backlog.

## The 12 months

| Stage | Months | Exit gate (all must be true) |
|---|---|---|
| 1. Enterprise foundation | 1–2 | Audit done (today). Pending migrations live. Payment and email working. Referrals live. Written agreements with Pelser and Real Estate Assist |
| 2. Commercial validation | 2–5 | At least 3 paying clients under a signed agreement. First recurring invoice paid. One client outcome measured against a baseline |
| 3. Operational independence | 4–8 | Receptionist answering and booking. Onboarding run end-to-end from records. Founder interventions per week measured and falling for 8 weeks |
| 4. Market expansion | 7–11 | PRA landlords on Property Operations. One TEBOS module sold to a second industry without new code. Verified specialist register in use |
| 5. Institutional maturity | 10–12+ | Company ledger reconciled monthly. Risk register reviewed quarterly. Management accounts from an accountant. Roles with named owners |

**Decision gates** (founder): prices (before stage 2), hosting move (before stage 2), hiring (only with funded
workload), any investment vehicle (only after legal review).

## Enterprise value scorecard

Every row is computed from records. A row without data shows **unknown**, never zero dressed as performance.

| ID | Measure | Source | 7 Nov 2026 |
|---|---|---|---|
| S-1 | Paying clients | `billing_accounts`, `payments` | 0 |
| S-2 | Monthly recurring revenue | Paid recurring invoices | R0 |
| S-3 | Measured client outcomes (with baseline) | Objective measurements, PRA outcome reviews | 0 |
| S-4 | Cash collected by channel (Pelser, Real Estate Assist, Tidy Enterprise) | Company ledger (G-08) | Unknown |
| S-5 | Qualified opportunities / meetings / close rate | Sales desk, opportunities | 0 / 0 / unknown |
| S-6 | Referral acceptance and completion | `agent_referrals` | Unknown (not live) |
| S-7 | Gross margin per client | Invoices − delivery costs (`web_project_costs`) | Unknown |
| S-8 | Retention and net revenue retention | Billing over time | Unknown |
| S-9 | Founder interventions per week | Operator log tier-3 asks | Not measured (G-15) |
| S-10 | Reserve coverage (months of essential costs) | Company ledger | Unknown |
| S-11 | Reuse: modules sold to a second client without new code | Product register | 0 |

**What compounds (defensible):**
- installed operating systems clients keep paying for;
- outcome data per client;
- the verified specialist network;
- documented methodology with its records.

**What is easily copied:** branding, AI agents, feature lists. Those are not counted as advantage here.
