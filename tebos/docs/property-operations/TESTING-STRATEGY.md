# Tidy Property Operations: testing strategy

"Done" means the screen works **and** looks right, and the database enforces what the screen promises. No layer's
tests stand in for another's.

## 1. Layers

| Layer | What it proves | Where | Runs against |
|---|---|---|---|
| Database rules | RLS isolation, roles, state machines, ledger immutability, reversal rules, overlap, limits, suspension, audit privacy, storage policies | `supabase/tests/99zzm_property_operations.sql` | real Postgres with every migration |
| Parity | lists and the pro-rata rule are identical in SQL and TypeScript | `test/schema-parity.test.ts` | the migration text |
| Domain | money arithmetic (pro-rata, FIFO, statements), CSV parsing and matching, Needs attention rules | `test/opsLedger.test.ts`, `test/opsAttention.test.ts` | pure functions |
| Design tokens | no raw colours outside tokens; every token defined; WCAG contrast of every pairing in both themes; reader settings handled | `web/src/ops/tokens.test.ts` | the CSS files |
| Interface journeys | each workflow end to end; what each role sees; failure and empty states | `web/e2e/ops.spec.ts` | the built app with a fake Supabase in the browser |
| Layout and accessibility | no horizontal scroll at 390/768/1440 with long names and large balances; skip link; theme; reduced motion; more contrast; 44px touch targets | `web/e2e/ops.spec.ts` | Chromium |
| Bundle | no service key, provider names or other apps' code in `dist-ops` | `web/scripts/check-bundles.mjs` | build output |
| Visual review | a person looks at dark and light at 390, 768 and 1440 before a screen is accepted | screenshots (not committed) | — |

The e2e fake does **not** enforce database rules; it answers like the database so the interface can be tested. Every
rule the interface relies on must also have a database test.

## 2. Data shapes always covered

Empty portfolio; one property and many units; long tenant and property names; nine-figure balances; overdue and
partial payments; reversed entries; ended leases; vacant and held-back units; each role (owner, manager, approver,
viewer, outsider, platform staff); suspended account; failed requests (errors shown, nothing claimed).

## 3. Commands

From `tebos/`:

```sh
npm run typecheck
npm test                                   # unit, domain and parity tests
PGHOST=… PGPORT=… PGUSER=… npm run test:db # every migration on a fresh Postgres, then supabase/tests/*.sql
```

From `tebos/web/`:

```sh
npm run typecheck
npm test                                   # includes the design-token tests
npm run build                              # every app, then the bundle check
npx playwright test e2e/ops.spec.ts        # Property Operations (starts the ops dev server on 5179)
npm run test:e2e                           # everything
```

Running the app locally: `VITE_SUPABASE_URL=… VITE_SUPABASE_PUBLISHABLE_KEY=… npm run dev:ops` (port 5179) against a
local or branch Supabase project with the migrations applied. Never a service-role key in a `VITE_` variable.

## 4. Not yet automated

- Pixel-level visual regression (screenshots are reviewed by eye; a baseline suite needs stable fonts in CI first).
- Large-portfolio performance (hundreds of units) against a real database.
- Real-device testing (iOS Safari, Android Chrome) beyond Chromium's emulation.
