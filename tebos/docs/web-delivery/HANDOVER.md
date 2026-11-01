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

- **Milestone 2: BUILT and TESTED locally, not merged.** It adds:
  - the task ledger with dependencies;
  - the asset register;
  - deployment records and the handover gate;
  - `web_delivery_board()` and `web_delivery_clients()`.

  The **maintainers' dashboard** is at `/web-delivery` and `/web-delivery/:id`, in the staff workspace. It needs the
  founder's "merge it", because the migration changes the database.

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

## Tests run (1 Nov, milestone 2)

- **Core:** typecheck passed; 463 unit tests passed; `test:db` passed, including `99zz` and `99zzb`, plus the 63
  integration tests.
- **Web:** typecheck passed; 63 unit tests passed; the build and the bundle check passed; 151 browser tests passed, 1
  skipped (the screenshot test, which runs only on request).

## The next three tasks (after milestone 2 merges)

1. **Founder:** check the Vercel plan, and choose a host for client sites whose terms allow commercial use
   (`TOOLCHAIN.md` §3).
2. **The client's portal:** intake progress, pending decisions, the preview, and approve (scope, design and release
   are approved by the client's admin only).
3. **Project history on the dashboard** (a staff-readable audit view), then integration connections and cost
   records.

## How another agent resumes

1. Read this file, `README.md`, `ACCEPTANCE.md` and `../adr/0011-web-delivery-division.md`.
2. Read the migration, then `src/domain/web-delivery.ts`.
3. Run the commands above. If they don't all pass, fix that before building anything.
4. Keep the database as the system of record:
   - every new rule goes in a migration, is mirrored in `src/domain`, and is covered by a parity test;
   - never weaken a test to make it pass;
   - never fabricate QA, approvals or deployment success.
