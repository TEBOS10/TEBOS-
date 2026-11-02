# ADR 0021: Underwrite, the sixth stage of Property Revenue Architecture

Date: 2 Nov 2026. Status: accepted (founder's "go", 2 Nov 2026).

## Context

Tidy Enterprise's method has six stages: Discover, Assess, Underwrite, Strategise, Execute, Optimise. The property
app had five; it went from evidence straight to agreeing an action. Underwriting is the step that tests whether
fixing a problem is commercially worth it: its viability, risks, likely return and whether the money is there.
Skipping it means agreeing work that may not pay.

## Decision

- A new record, `property_underwrites` (migration `20261102180000_property_underwrite.sql`), one or more per problem.
  - Verdict: proceed, hold and optimise first, or not viable. It always says why (viability) and what could go wrong.
  - An estimated return is optional. When given it is a monthly range in rand with how it was reached, shown as
    "an estimate, not a promise".
  - Financing readiness: ready, needs work (saying what), or not needed.
  - It rests on one evidence item for the same problem, and that item must be checked.
  - Kept as written: no edits, no deletes. A changed view is a new underwrite; the latest counts.
- Strategise waits for proceed. A new action on a problem, or moving the problem to planned, is refused unless its
  latest underwrite says proceed. Actions already agreed carry on; actions not tied to a problem (the TEPOS case
  workspace) are unaffected.
- Evidence an underwrite rests on stays checked and can't be removed.
- Resolved still means checked evidence that the fix worked. The evidence a problem was underwritten on shows the
  problem, not the result, so it no longer counts as that proof (`guard_property_problem` and
  `guard_property_proof` replaced in place).
- The journey's stage rule: received evidence is still Assess (check it); checked evidence with no proceed is
  Underwrite; proceed with no live action is Strategise. Mirrored in `src/domain/journey.ts`.
- A blueprint, `property-revenue-architecture`, gives Tidy Enterprise's TEBOS organisation its operating system:
  the six stages as four flows (the starter plan's limit), with only mandates and fees needing the founder and
  regulated work done by the specialist panel.

## Consequences

- Live data had no property problems or actions when this was written, so nothing in use is blocked.
- The interface shows each underwrite with its verdict, and the next action names what is missing: check the
  evidence, underwrite it, optimise first, or agree an action.
- Tests: `supabase/tests/99zzk_property_underwrite.sql` (and `99zx` updated), `test/journey.test.ts`,
  `test/blueprints.test.ts`, `web/e2e/journey.spec.ts`.
