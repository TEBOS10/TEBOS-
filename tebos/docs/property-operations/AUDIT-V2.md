# Tidy Property Operations: architecture audit for directive v2

Date: 4–5 Nov 2026. Scope: the whole repository as it stands on `claude/dossier-foundations-4mmjkk`, read before any v2
change. Purpose: decide what to keep, what to change and what to build next, without duplicating anything that works.

## 1. What exists

| Area | Finding | Decision |
|---|---|---|
| Repository | Monorepo: `tebos/` (core: schema, domain, tests), `tebos/web/` (six Vite apps sharing components), `bame/` (a client's Next.js app), `marketing/` | Keep. Property Operations stays a separate app inside `tebos/web` (ADR 0023) |
| Instructions | `CLAUDE.md`: foundations before interface; database is the system of record; run all checks before pushing | Kept. v2 design standards appended, nothing removed |
| Dependencies | React 19, Vite 8, Supabase JS, lucide icons, Geist fonts, three.js (marketing only); Vitest, Playwright | No new runtime dependency is needed for v2's first steps. **Motion is not added**: nothing in this product is dragged or thrown, so CSS transitions are the right tool (apple-design skill: springs are for gesture-driven motion) |
| Database | 77 migrations; RLS on every table; hash-chained audit; state machines with `guard_status` | Keep. Property Operations' migration `20261104090000` follows the same patterns |
| Authentication | Supabase Auth (email and password, optional TOTP two-step), one session per app; organisations scoped by `organisations.app` | Keep. `ops` accounts are separate from TEBOS, TEPOS and PRA accounts |
| PRA modules | `property_cases`, evidence, figures, pathways, journey, underwrite, enquiries: **advisory** records about a property's problems | Not duplicated. Operations records (units, leases, ledger) are different data. A future authorised link may let PRA read aggregates (§4) |
| Deployment | Vercel builds `tebos/web`'s default `dist` (the TEBOS app) on pushes; Railway runs the worker | **The ops app (`dist-ops`) is not deployed anywhere.** Previews for this branch are TEBOS's own app |
| Design tokens | `styles.css` defines shared tokens; `ops.css` overrode them but kept ~25 raw colours, fixed `px` type and no light theme | **Replaced** by `src/ops/tokens.css` (single source of truth) and a token-only `ops.css` |
| Accessibility | Focus rings and semantic HTML were present; **missing**: skip link, reduced-motion / reduced-transparency / increased-contrast handling, touch-target sizing, text that scales with the reader's font size | Added in v2 Release 1 (DESIGN-SYSTEM.md §7) |

## 2. Defects found

| # | Defect | Severity | Status |
|---|---|---|---|
| 1 | Caption and label text (`#626b7b` on `#12151b`) was **3.3:1**, under WCAG AA's 4.5:1; used for table headers, KPI bases, hints | Accessibility | Fixed: 5.0:1; a test now computes every pairing |
| 2 | Chart bars under 3:1 against their track (dark "expected" 2.3:1; light "overdue" 2.6:1) | Accessibility | Fixed; tested |
| 3 | No skip link; keyboard users tabbed through the whole sidebar on every page | Accessibility | Fixed; tested |
| 4 | Buttons 30–36px tall on touch screens | Usability | Fixed: 44px on coarse pointers; tested |
| 5 | Type in fixed `px`: ignored the reader's text-size setting | Accessibility | Fixed: rem/em scale |
| 6 | At 768px the shared stylesheet collapses the navigation at 820px but ops kept two columns until 760px: a broken half-sidebar on portrait tablets | Layout | Fixed: breakpoints aligned; tested at 768 |
| 7 | Sidebar background stopped at the first screen height on long pages | Visual | Fixed |
| 8 | `ops_maintenance_photos` had no index on `request_id`, the column every photo read filters by | Performance | Fixed in the (not yet applied) migration; database tests pass |
| 9 | `99zzf_equity_programme.sql` failed every night 22:00–24:00 UTC (UTC date vs SA date) | Test | Fixed on 4 Nov |

## 3. Gaps against directive v2 (not defects: work not yet done)

| Directive part | Gap | Planned release |
|---|---|---|
| 5.1 Portfolio | Buildings within a property; ownership details; property expenses; documents | R3 |
| 5.2 Tenants | Editing tenant details; communication history; documents | R2 / R3 |
| 5.3 Money | Money is **integer cents (`bigint`)**, which is exact; the directive's "numeric or an appropriate decimal implementation" is met (DATABASE-DICTIONARY.md §1). Overpayments show as a credit balance; there is no separate "allocate credit" action yet | R2 |
| 5.4 Maintenance | Issue categories; completion evidence distinct from photos | R3 |
| 5.5 Reporting | Net operating income needs expenses beyond maintenance; date-range reports beyond one month | R3 |
| 7 Intelligence | **Started:** "Needs attention" (overdue, uncharged rent, ending leases, vacancies, stale or urgent repairs, quotes waiting, incomplete records). Configurable thresholds and notifications later | R4 |
| 10 Performance | The portfolio is loaded whole per account. Fine for the target (5–60 units); pagination and server-side search before accounts exceed a few hundred units | R4 |
| 12 Commercial | Plans, limits and statuses exist; no self-service onboarding or billing (manual pilots, as directed) | R5 |
| 13 TEBOS integration | No coupling today. Boundary: TEBOS may later receive **aggregates only** (counts, totals), by an explicit per-account opt-in, through a read-only function; never tenant records | R5 |

## 4. Information architecture

Directive v2 proposes 14 navigation items. Only working modules are shown (directive part 4), so the navigation today is:

| Directive item | Today | Why |
|---|---|---|
| Overview | **Overview** | working |
| Portfolio; Buildings and Units | **Properties** (units inside each property) | working; buildings come in R3 |
| Tenants; Leases | **Tenants** (leases open from tenants and units) | working |
| Rent and Collections; Arrears | **Rent and arrears** | working; one page because they are one workflow |
| Maintenance; Suppliers | **Maintenance** (suppliers on the same page) | working |
| Documents, Financial Reports, Communications, Automations | hidden | not built; shown only when they work |
| Settings | **Account** | working (password, two-step sign-in); theme choice in the sidebar |

## 5. Conclusion

The data layer, security model and workflows from Release 1 are sound and are kept. v2's first work is the design
foundation (tokens, themes, accessibility) and the first piece of operational intelligence, which needs no database
change. Nothing is deployed, and no live data is touched.
