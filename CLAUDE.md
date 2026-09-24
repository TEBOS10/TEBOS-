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
