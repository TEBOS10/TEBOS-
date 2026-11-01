# ADR 0011: The Web Delivery Division is a TEBOS module, built database first

Date: 2026-11-01 · Status: accepted for milestone 1 (founder's operating specification, 1 Nov 2026)

## Context

The founder asked for a multi-agent website factory: intake, scope, design, build, QA, release and handover,
delivered within three business days of readiness, with packages controlling scope. The specification itself says
to build this as "a dedicated Web Delivery module, not as a separate application". It also says to start with the
project record, the state machine, intake, scope approval and package enforcement.

## Decision

1. **The division is a module of TEBOS:**
   - the same database, roles (maintainers, client admins), audit trail and state-machine table;
   - no new app and no new paid service.
2. **The agents are roles, not processes.** Milestone 1 records what each gate needs, whoever does the work: a person,
   this coding agent, or a later worker.
3. **The database enforces the gates:**
   - scope within the package;
   - only the client's admin approves;
   - build only when ready;
   - client review and release only after a QA pass, and release only with the client's release approval;
   - the clock is the database's.
4. **The package ceilings are the board limits.** Workflows and parts (pages plus features) are capped per package:
   Small 4/10, Medium 10/30, Company 40/120. More is a revised quote, a smaller launch, or a later phase, never unpaid
   work.
5. **Three business days** count from entering build, and pause while the client blocks the work. It is a target for
   defined scope, not a guarantee.

## Consequences

- **Prices aren't changed.** The spec lists Company at R7,200; the founder confirmed R7,500 on 1 Nov.
- **Public client sites need a host whose terms allow commercial use.** Vercel Hobby doesn't
  (`docs/web-delivery/TOOLCHAIN.md` §3). Until a host is chosen, nothing commercial is deployed publicly.
- **Later milestones** add the task ledger, assets, integrations, deployments, costs, the dashboard and the client
  portal, in that order (foundations before interface).
