# TEBOS repository

- `tebos/` — the TEBOS control-plane core: Postgres/Supabase schema, domain rules, security primitives. Start here for TEBOS work.
- `bame/` — the BAME website and staff system (a client deployment; its own Next.js app and Supabase project). Do not put TEBOS core logic here.

## Working rule: foundations before interface

Do not start TEBOS work by redesigning or polishing the front end. The build order is
data model → evidence graph → action lifecycle → capability layer → permissions → audit trail, and only then UI.
A feature is not done because the UI works: it needs persistence, guarded state transitions, permissions,
failure states, audit events and tests (see `tebos/docs/adr/0001-foundations-first.md`).
The path to autonomy, and the gate each stage must pass, is in `tebos/docs/ROADMAP.md`. Do not skip stages.

- The database is the system of record. Rules that protect trust are enforced in `tebos/supabase/migrations`, mirrored in `tebos/src/domain`; `test/schema-parity.test.ts` keeps them in sync.
- Never fabricate scans, evidence, connection status, execution success or outcomes — the schema rejects most of these; do not work around it.
- Run `npm run typecheck`, `npm test` and `PGHOST=… PGUSER=… npm run test:db` in `tebos/` before pushing.
- For interface changes, also run `npm run typecheck`, `npm test` and `npm run test:e2e` in `tebos/web/`. The interface uses the user's own Supabase session and must never hold a privileged key.

## Tidy Property Operations: design and engineering standards

Property Operations is its own app (`tebos/web/ops`, `tebos/web/src/ops`, ADR 0023). Its docs are in
`tebos/docs/property-operations/` (vision, requirements, architecture, database dictionary, design system, security,
testing strategy, roadmap, changelog); keep them current with every change.

- Visual values come only from `tebos/web/src/ops/tokens.css`; no raw colours or ad-hoc spacing in components
  (`src/ops/tokens.test.ts` enforces colours and WCAG 2.2 AA contrast in both themes). Read DESIGN-SYSTEM.md before
  changing the interface, and finish its screen checklist (§10) before calling a screen done.
- Interaction follows the apple-design skill (`.claude/skills/apple-design/SKILL.md`), applied selectively: feedback on
  press, critically damped short transitions, nothing that blocks input, and the reader's motion, transparency and
  contrast settings always respected. Don't add an animation library unless something is genuinely draggable.
- Show only modules that work. Every figure comes from records and states its basis (expected, billed, received, owed,
  held, estimated, actual).
- Money is integer cents; the ledger is append-only; corrections are reversals with reasons. The product records money
  and never holds or moves it. AI may summarise and flag; it never makes financial or legal decisions.
- Test layouts at 390, 768 and 1440px with long names and large balances, and look at screenshots in dark and light.
