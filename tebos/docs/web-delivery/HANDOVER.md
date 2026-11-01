# Web Delivery Division: handover (kept current)

## Where things stand

- **Branch:** `claude/dossier-foundations-4mmjkk` (see the PR in the operator log).
- **Milestone 1 is BUILT and TESTED locally:**
  - the project record and its state machine;
  - scope revisions held to the package;
  - client approvals;
  - the readiness check;
  - the delivery clock;
  - QA verdicts and the release gates.
- **Merged (PR #105) and applied live** on 1 Nov as migration `web_delivery`, then checked with a rolled-back live
  test. The live test confirmed that a project is accepted, and that a private organisation, scope over the package,
  and an unready build are each refused.
- **No interface yet.** The order is foundations first (`CLAUDE.md`).

## Setup and run

```sh
cd tebos
npm ci
npm run typecheck
npm test
sh scripts/local-pg.sh
PGHOST=/tmp/tebos-pg PGPORT=54329 PGUSER=postgres npm run test:db
node scripts/check-migrations.mjs origin/main
```

For interface work, in `tebos/web`: `npm ci`, `npm run typecheck`, `npm test`, `npm run test:e2e`.

**Environment variable names** are listed in `tebos/.env.example` (the worker) and `tebos/web/.env.example` (the
interface). Never commit values. The interface holds only the publishable Supabase key.

## Tests run, and their results (1 Nov 2026)

- **Core:**
  - `npm run typecheck`: passed;
  - `npm test`: 456 passed, 63 skipped (the skipped ones are database tests that run under `test:db`).
- **Database:** `npm run test:db`: all SQL rule files passed, including the new `99zz_web_delivery.sql`. The 63
  Postgres integration tests passed.
- **Not run:** the web e2e suite, because nothing in the interface changed.

## Decisions

These are in ADR 0011.
- The division is a **module of TEBOS**, on the existing database and roles. It is not a new app.
- **Package ceilings reuse the board limits** (workflows and parts): Small 4/10, Medium 10/30, Company 40/120.
- **Company stays R7,500 a month.** The founder decided this on 1 Nov; the spec's R7,200 was not adopted.
- **The design standard is set by the founder's eight reference recordings** (`DESIGN_BRIEF.md`).
- **Business days count weekends only.** South African public holidays aren't counted yet.

## Known problems and limits

- **Hosting:** Vercel Hobby forbids commercial use (`TOOLCHAIN.md` §3). Client sites need a commercial-use host
  before anything goes live publicly.
- **QA independence is by role only.** Any maintainer can record a verdict. "Not the builder" isn't enforced yet.
- **The 3-day clock** doesn't yet exclude public holidays.

## The next three tasks

1. **Founder:** check the Vercel plan, and choose a host for client sites whose terms allow commercial use
   (`TOOLCHAIN.md` §3).
2. **Milestone 2, the data:**
   - an agent task ledger with dependencies;
   - the asset register, with licence status;
   - integration connections, recorded with their owner and revocation plan;
   - deployment records.
   All additive, with SQL tests.
3. **Milestone 2, the interface:**
   - the maintainers' project list and project page in TEBOS;
   - the client's progress-and-approve page;
   - e2e at phone width.

## How another agent resumes

1. Read this file, `README.md`, `ACCEPTANCE.md` and `../adr/0011-web-delivery-division.md`.
2. Read the migration, then `src/domain/web-delivery.ts`.
3. Run the commands above. If they don't all pass, fix that before building anything.
4. Keep the database as the system of record:
   - every new rule goes in a migration, is mirrored in `src/domain`, and is covered by a parity test;
   - never weaken a test to make it pass;
   - never fabricate QA, approvals or deployment success.
