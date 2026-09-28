# ADR 0003: TEBOS is business operating architecture

Date: 2026-09-28 · Status: accepted

## Context

Up to now TEBOS has been built as a diagnostic engine. It collects evidence (scans, interviews, connected
systems), proposes findings from that evidence, and governs the actions taken on them. This works, but it
invites the wrong comparison: an AI agency, or "another platform that does everything".

The owner's strategy memo (28 Sep 2026) reframes the product. Growing businesses rarely lack tools. They lack
structure. The founder acts as the middleware: leads, prices, handovers and decisions all pass through one
person's memory. What TEBOS sells is the construction of the business's chessboard, and a control plane that
orchestrates the systems already on it.

## Decision

### 1. Positioning

TEBOS is **business operating architecture**. It is not an AI agency and it does not replace a business's
systems.

- AI, automation, integrations, analytics and agents are capabilities inside the architecture. Each is used
  where it earns its place, and always under approval.
- TEBOS does not promise results. The claim is structural: a business on TEBOS becomes *structurally capable of
  producing its intended outcomes with less dependence on individual people, memory, improvisation and founder
  intervention*.
- A client's existing providers (web studio, bookkeeper, CRM) are **components on the board, not competitors**.

### 2. The model

The lifecycle is ASSESS → MAP → ARCHITECT → INTEGRATE → AUTOMATE → GOVERN → OPTIMISE. The commercial lifecycle
follows the same order: Diagnostic → Architecture → Deployment → Operations → Optimisation.

The chess framework names what TEBOS must model:

| Chess | In TEBOS | Where it lives |
|---|---|---|
| Board | The business's operating map | `board_components`, `board_flows`, `board_steps` |
| Pieces | Tools, providers, channels, teams, roles, data | `board_components` (+ `connection_instances` when connected) |
| Position | The current state, from evidence | `evidence`, `findings`, the latest measurements |
| Objective | Quantified targets with an owner and a date | `objectives`, `objective_measurements` |
| Moves | Proposed changes | `actions` |
| Rules | Decision logic and permissions | `board_steps.decision_rule`, approvals, row-level security, guards |
| Clock | Due dates, schedules, freshness | `objectives.due_on`, rescans, monitoring |
| Opponent | Market and competitive pressure | not modelled yet |
| Engine | TEBOS itself | the workers and the control plane |

The eight layers, and what exists today:

| Layer | Status |
|---|---|
| Intelligence | Built: scans, interviews, connected-system snapshots |
| Diagnosis | Built: evidence-backed findings, business reviews |
| Architecture | **First slice (this ADR)**: board, flows, steps, the founder-dependency count |
| Integration | Started: read-only connected systems; Resend for email |
| Automation | Minimal: approved email sends only |
| Governance | Built: guarded state machines, approvals by risk tier, audit trail |
| Measurement | **First slice (this ADR)**: objectives measured only from connected systems |
| Optimisation | Not started |

### 3. The next foundation: the Board and the Objective

Built in migration `board_objectives`, mirrored in `src/domain/board.ts`, on the page
`/businesses/:id/board`.

**Objective.** A quantified target with a metric, unit, direction, target value, period, due date and an owner
who is a member of the organisation.
- The goalposts don't move: once active, the target and date are fixed (`TEBOS_INPUT_FROZEN`). To change them,
  retire the objective and set a new one; retiring needs a reason.
- A measurement is either:
  - **measured**: the database reads the number itself from a connected system's evidence, at a path inside
    its structured value, and records when that evidence was retrieved. A client cannot type in the value;
  - **stated**: the owner's figure. It must cite the owner's own statement and never counts toward achieving
    the objective.
- `achieved` needs a measured value that meets the target (`TEBOS_OBJECTIVE_UNMEASURED`). `missed` is possible
  only after the due date (`TEBOS_OBJECTIVE_NOT_DUE`). Measurements are never edited.

**Board.** It has three parts:
- Pieces (`board_components`): kinds, supplier and owner.
- Flows (`board_flows`): what starts the flow, what "done" means, and the objective it serves.
- Ordered steps (`board_steps`): who performs each step (founder, team, automation, provider, client), the tool
  it uses, its decision rule, and whether it is written down anywhere.

Rules for the Board:
- Pieces and steps are *stated* until evidence confirms them (*observed*). An observed piece must cite
  evidence that was actually obtained (`TEBOS_EVIDENCE_REQUIRED`).
- An automated step must name the tool it runs on.
- Nothing is deleted: pieces and steps are retired, and objectives are closed.

**Founder dependency** is counted, not scored: how many steps the founder performs, and how many of those
exist only in the founder's head (performed by the founder and written down nowhere). This makes "the founder
is the middleware" something the business can see, step by step.

Findings can now name the flow and objective they concern (`findings.flow_id`, `findings.objective_id`), so
diagnosis attaches to the architecture.

**Provenance.** The Objective relies on "connected system" meaning what it says. The same migration therefore
makes these server-only:
- creating connected-system and system sources;
- recording system-generated evidence;
- setting who created evidence or a finding.

## Consequences

- Positioning copy (home page, pricing, meta) now says *business operating architecture*. The plans follow the
  lifecycle: **Diagnostic** (R2,500/month), **Architecture & Operations** (R7,500/month) and the equity
  partnership. Their enquiry keys (`starter`, `growth`, `equity`) are unchanged.
- The film's narration still describes the diagnostic promise ("finds what's holding your business back"). It
  is accurate, but the next commercial should tell the board story.
- **Not built, on purpose:** automatic mapping of flows from connected systems, an optimisation loop,
  "opponent" modelling, and anything that automates a step without a rule and a tool. Each needs the board to
  be used on real businesses first ([ROADMAP](../ROADMAP.md)).
- The trap to avoid remains: TEBOS does not become a gigantic AI platform that does everything. Each new
  capability must attach to a piece, a flow step or an objective on the board.
