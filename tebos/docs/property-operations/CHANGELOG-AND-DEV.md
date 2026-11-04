# Tidy Property Operations: changelog and developer guide

## Changelog

### 4 Nov 2026: Release 0 and Release 1 (built, not live)

- Docs: PRODUCT-VISION, COMPETITOR-ANALYSIS, PRODUCT-REQUIREMENTS, SYSTEM-ARCHITECTURE, IMPLEMENTATION-ROADMAP,
  SECURITY-AND-COMPLIANCE, this file; ADR 0023; separate `docs/venture-studio/FEASIBILITY.md`.
- Database: migration `20261104090000_property_operations.sql` (see SYSTEM-ARCHITECTURE §2); test
  `supabase/tests/99zzm_property_operations.sql`.
- Domain: `src/domain/opsLedger.ts` (dates, pro-rata, positions, statements, rand parsing and formatting, CSV);
  `opsMaintenanceMachine` in `src/domain/states.ts`; tests in `test/opsLedger.test.ts` and `test/schema-parity.test.ts`.
- Web: the `ops` app (`web/ops/`, `web/src/ops/`, `web/src/lib/opsData.ts`, `web/vite.ops.config.ts`); e2e
  `web/e2e/ops.spec.ts`; the fake Supabase in `web/e2e/fake-supabase.ts` answers the ops functions.
- Fix: `99zzf_equity_programme.sql` compared a future date against UTC while the rule uses the South African date, so
  it failed between 22:00 and 24:00 UTC. The test now uses `tebos_private.sa_today()`.

## Running it locally

From `tebos/web/`:

```sh
npm install
VITE_SUPABASE_URL=… VITE_SUPABASE_PUBLISHABLE_KEY=… npm run dev:ops   # http://localhost:5179 (publishable key only)
npm run build:ops                                                     # → dist-ops/
```

Use a local or branch Supabase project with the migrations applied. Never put a service-role key in a `VITE_`
variable: the bundle check fails the build if one appears.

## Tests

From `tebos/`:

```sh
npm run typecheck
npm test                                   # unit and parity tests, including opsLedger
PGHOST=… PGPORT=… PGUSER=… npm run test:db # every migration on a fresh Postgres, then supabase/tests/*.sql
```

From `tebos/web/`:

```sh
npm run typecheck
npm test
npm run build                              # all apps, then scripts/check-bundles.mjs
npx playwright test e2e/ops.spec.ts        # Property Operations only (starts the ops dev server on 5179)
npm run test:e2e                           # everything
```

The e2e tests run against a fake Supabase in the browser (`e2e/fake-supabase.ts`); the database's rules are proved
by `test:db` against real Postgres, not by the fake.
