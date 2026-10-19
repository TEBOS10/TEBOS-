# ADR 0005: One systems portfolio; TEPOS proves it, TEBOS deploys it

Date: 2026-10-19 · Status: accepted (founder, 19 Oct 2026)

Builds on ADR 0003 (TEBOS is business operating architecture). The live register is
[`../product-register.md`](../product-register.md).

## Context

TEPOS and TEBOS were growing as separate collections of features. The founder (19 Oct, from a video on building the
systems that make a company run, and from discussion with ChatGPT) set the model:
- Don't build each client a system from scratch.
- Build each capability once, prove it on the founder's own operations, then configure it for the clients whose
  diagnosed problems it solves.

## Decision

### 1. Three environments, one direction of travel

1. **TEPOS** is the founder's own operating environment, and the proving ground. Capabilities are used and improved
   there first.
2. **The product library** holds proven capabilities, made reusable. Each has a purpose, permissions, operating logic,
   a measurable outcome and a support cost.
3. **TEBOS** is where clients are served. A client is diagnosed first, then TEBOS assembles and configures only the
   modules their actual problems need. A client doesn't get every system.

**Rules:**
- What moves from TEPOS to TEBOS is the **functionality and design, never the data.** TEPOS's private records stay
  private, enforced by the database (private organisations, two-step sign-in, `organisations.app`).
- **One codebase, configured per client.** There are no per-client copies of the code.

### 2. Three portfolios

**Operational systems.** The core business functions, and the shared foundation under them.
- **Core:**
  - sales and revenue;
  - marketing;
  - finance;
  - IT and digital infrastructure;
  - supply chain and procurement;
  - operations and service delivery, people and responsibilities, customer experience and retention, and strategy
    and performance. These four are proposed extensions, not from the source video.
- **Shared foundation** (one implementation, used by every module):
  - business diagnosis;
  - objectives and scorecards;
  - tasks and accountability;
  - requests and work queues (REEDS);
  - approvals and change governance;
  - evidence and documentation;
  - risk and dependency management;
  - reporting;
  - integrations and automation (including the Model Bridge);
  - audit and security.
- REEDS and the Model Bridge coordinate work on this foundation. Neither is ever a second source of truth.

**Creative systems.**
- interactive experience (e.g. a building that "builds" as verified work progresses);
- content and campaign production;
- visualisation and simulation (always labelled as illustrative);
- environmental intelligence (public information only; no surveillance or tracking of people);
- creative communications (drafts only; a person approves anything published or sent).

**Industry systems.** Combinations of the above for one industry:
- Property Revenue Architecture;
- Real Estate Office OS;
- Hospitality OS;
- Sports and Marketing OS;
- Creative Studio OS;
- Finance and Capital OS (paper trading kept clearly separate);
- Business Resilience OS.

### 3. Every capability moves through five stages

| Stage | Means | Evidence needed to enter it |
|---|---|---|
| 1 Identified | A documented problem and a reason to solve it | The problem, written down, with who has it |
| 2 Built for internal use | Working in TEPOS (or TEBOS's own company), tested, and used for a real need | Merged, tested and live (that is *built*), plus real records from an actual workflow (that is *used*). Passing tests show it is built, never that it is used |
| 3 Validated and generalised | Shown to help; personal data and assumptions separated from the reusable part | A measured outcome from real use |
| 4 Productised | Scope, configuration, permissions, delivery cost, support and price defined | A delivery cost, plus a price decided by the founder |
| 5 Deployed through TEBOS | Used by a client whose diagnosed problem justifies it, and assessed against the outcome | A client using it under an agreement, recorded separately from the measured result. **5a** = deployed. **5b** = repeatable commercial success: more than one paying client, a measured outcome, and a known delivery cost |

**Gating rules:**
- No records doesn't mean a capability is broken. It means it hasn't yet shown real use. Status follows evidence in both
  directions.
- Working for the founder isn't enough to sell it. Demand, willingness to pay, delivery cost, data isolation and
  maintenance must be shown first.
- A creative or industry proposal enters stage 1 only with the founder's yes. It is scored first on the problem it
  solves, how it is measured, what it costs and depends on, and whether it serves current priorities.

### 4. What this changes now

- **The register:** [`product-register.md`](../product-register.md) lists every capability with its stage and its
  evidence. REEDS reads it as the portfolio's state, and it is updated in the same PR as any change to a capability.
- **No development across all categories at once.** The founder's real-estate registration and training come first;
  the build order in ROADMAP stands.
- **Stage claims follow the evidence rule:** never mark a stage reached without that stage's evidence.

## Consequences

- New work is described by the capability it advances and the stage it moves, not by the client it was first built
  for.
- Client-specific needs become configuration of a shared module, or a new shared module. They are never a fork.
- TEPOS's design work feeds the library, so TEPOS sessions record reusable capabilities in the same register.
