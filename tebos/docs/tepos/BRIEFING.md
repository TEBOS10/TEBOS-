# TEPOS briefing

Read this first in any TEPOS session. It gathers what is decided and built, with a pointer to where each fact comes
from. Where this file and a source disagree, the source wins: fix this file.
Sources: [`ROADMAP.md`](../ROADMAP.md), [`operator-log.md`](../operator-log.md), the root `CLAUDE.md`, and the
code under `web/tepos/` and `web/src/tepos/`.

## What TEPOS is

- **TEPOS**, the Tidy Enterprise Personal Operating System, is the founder's private web app.
- **TEBOS** is the separate, public app for clients. TEPOS work doesn't change TEBOS-only code unless the founder asks.
- The two apps share the Supabase database (`tebos-core`, project `jjibuvqpidimckmrhlqa`) and the domain rules in
  `tebos/src/domain`. REEDS works across both.
- Only someone who owns a private organisation gets in. Anyone else sees "This is a private system".
- TEPOS data lives in private organisations (`organisations.app = 'tepos'`). Private organisations are always TEPOS's
  (migration `organisation_app`).
- It looks like its tiles: earthy browns and beiges, with the Tidy logo in bronze (`web/tepos/public/brand`).

## Where it fits (founder's drawing, 16 Oct 2026)

- Tidy sits at the top. Beneath it are three systems:
  - **REEDS**, the chief of staff;
  - **TEBOS**, the builder;
  - **IREKUN**, the security backbone, which is never sold.
- **Tidy Capital** receives the income. It has four streams: forex, TEBOS retainers, the real-estate agent job and
  Property Revenue Architect retainers.
  - Forex income always counts as speculative.
  - A retainer counts as reliable only with a signed agreement.
- **Tidy Enterprise** builds the founder's standing towards asset management.
- 50% of TEBOS's profit above its running costs and a three-to-six-month buffer goes to Tidy Capital. The share is
  revisited each quarter.

## The systems portfolio (founder, 19 Oct 2026)

TEPOS is the proving ground. A capability is built and used here first, then made reusable, then configured for
TEBOS clients. Only the design moves; TEPOS data never leaves.
- **Read:** [`../adr/0005-systems-portfolio.md`](../adr/0005-systems-portfolio.md).
- **Record:** each capability's stage, with its evidence, in [`../product-register.md`](../product-register.md), in the
  same PR as the change.

## The code and the build

| What | Where |
|---|---|
| Real Estate Job portal | `tebos/web/src/tepos/AgentOffice.tsx`, `AgentCompliance.tsx`, `agentData.ts`; rules in `tebos/src/domain/agent.ts` |
| Entry and page | `tebos/web/tepos/index.html`, `tebos/web/tepos/main.tsx` |
| App, sign-in gate and menu | `tebos/web/src/tepos/TeposApp.tsx` |
| The six portals and what the unbuilt ones will hold | `tebos/web/src/tepos/portals.ts` (tested by `portals.test.ts`) |
| Home (the city) and portal pages | `TeposCity3D.tsx` and `city3d.ts` (the 3D city), `TeposCity.tsx` (the drawn city, for reduced motion and devices without a graphics chip), `TeposPage.tsx`, `tepos.css` |
| Build config | `tebos/web/vite.tepos.config.ts` |
| End-to-end test | `tebos/web/e2e/tepos.spec.ts` (also `agent.spec.ts`, `resilience.spec.ts`, `property.spec.ts`, `two-step.spec.ts`) |

- Build TEPOS with `npm run build:tepos` in `tebos/web`. The output goes to `dist-tepos`.
- `npm run build` (TEBOS) must keep passing `scripts/check-bundles.mjs`, which fails if the TEBOS bundle mentions TEPOS.
- TEPOS reuses shared pages from `web/src/pages`: property cases and their report, Resilience (Tidy Capital), REEDS,
  account, sign-in and the second step.

## Where it runs

| App | Vercel project | Address | Build |
|---|---|---|---|
| TEPOS | `tebos-web` | tebos-web.vercel.app | Root `tebos/web`, `npm run build:tepos` → `dist-tepos` |
| TEBOS | `tebos` | tebos-demo.vercel.app, tebos-neon.vercel.app | Root `tebos/web`, `npm run build` → `dist` |

- Both projects deploy production from `main` (set up 16 Oct, night). Every merge to `main` deploys TEPOS.
- "Live" is confirmed from the GitHub deployment named "Production – tebos-web", never from the migration job.
- New migrations are applied live with the Supabase connector, under the migration's own name. CI's migration job
  does not apply them.
- Supabase Auth's Redirect URLs list both apps, so a password-reset email returns to the app it came from.
  Supabase's built-in email sends only a few messages an hour, so repeated reset requests hit a limit.

## The six portals

| Portal | Opens | Organisation | Built |
|---|---|---|---|
| Tidy Capital | `/capital` | `irekun` | Yes: the reserve, income by stream and cadence, and how many months the money lasts |
| Tidy Enterprise | `/property` | `tidy-enterprise` | Yes: Property Revenue Architecture cases, assessment report, workstreams, outcome scorecard |
| IREKUN | `/irekun` | `irekun` | Yes: two-step sign-in and the private organisation |
| Academics | `/academics` | (none yet) | No: under scaffolding (priority 4, the study path) |
| Real Estate Job | `/agent` | `irekun` | Yes: listings and people with next steps; each deal's documents against the agency's checklist (tracked, never stored or changed); the FFC path. No personal details (decision 12). Agency: Pelser Real Estate |
| Forex | `/forex` | (none yet) | No: under scaffolding (priority 6, paper trading only) |

- The menu also has **Ask REEDS** (`/reeds`).
- A portal that isn't built says so and lists what it will hold. It never shows invented figures.

## Safeguards in place

- **Private gate:** a signed-in user without a private organisation sees only "This is a private system".
- **TEPOS needs two-step sign-in throughout (migration `tepos_two_step`, 17 Oct):** every TEPOS organisation is
  hidden from a password-only session, and the app asks for an authenticator first. It signs itself out after
  30 minutes unused, and sends strict browser protection headers (`vercel.json`, TEPOS hosts only).
- **Two-step rule (live since 16 Oct, night; migration `two_step_resilience`):** private records need the
  authenticator code. Checked live with a test record that was rolled back: password only shows 0 records, with the
  code the record shows.
- **Separation:** TEBOS's bundle check, and TEBOS's switcher no longer lists private organisations.
- **Honest figures:** every figure is measured, stated or estimated, and labelled as such. Only measured figures are
  shown as results.

## Standing rules

- Never fabricate data, evidence, connection status or outcomes.
- Decisions about money, legal matters, credentials and irreversible deletion are the founder's.
- Nothing outward-facing goes out without the founder's approval.
- Foundations before interface: data model, then rules, permissions, audit and tests, and only then the screen.
- Test before claiming anything works: `npm run typecheck`, `npm test` and `npm run test:e2e` in `tebos/web`,
  plus the `tebos/` checks for database changes.
- Work on a branch named `claude/tepos-<topic>`, open a pull request, and merge when CI is green.
- Write to the founder in plain, short language. The founder speaks by voice, so names can arrive mangled:
  "T-Post" means TEPOS, "T-Boss" means TEBOS, "Reed" means REEDS.

## Priorities that touch TEPOS (ROADMAP, founder's order)

1. Property Revenue Architect as a monthly subscription. Next step: the monthly subscription view.
2. REEDS works without being asked: standing requests, then the weekly money brief.
3. The agent's office (Real Estate Job portal). Slices 1 and 2 built (17 and 19 Oct); next: relationships, then
   marketing, then commission expected versus received.
4. The study path (Academics portal).
5. The private vault in IREKUN: private documents, every read audited, short-lived signed links.
6. Tidy Capital, honestly: bring the `capital` schema into this repository, and the paper-trading ledger (Forex
   portal).

Creative ideas waiting for the founder's yes or no are listed in [`creative-proposals.md`](creative-proposals.md):
- portals that build themselves, stage by stage;
- a public-awareness globe;
- labelled 3D walkthroughs of a property;
- REEDS drafting the social calendar and replies;
- day and night in the TEPOS city following Tidy Capital's runway.

## Open items for the founder

From the decisions table at the top of `operator-log.md`. That table is the live list.

- **10:** the Property Revenue Architect monthly price, and whether there are tiers.
- **12:** what the agency's principal allows (CRM, listing portals, WhatsApp, client data), and the one auto-reply
  text the founder approves.
- **11:** Supabase Pro once there's income (about USD 25 a month), so the vault and Tidy Capital get their own
  project.
- **9:** whether the `capital` schema (18 tables, applied 3 Oct from outside this repo) stays in TEBOS's database.
- **8:** make the repo private, rotate database passwords, turn on leaked-password protection.
- **2:** a sending service for email, which would also lift the password-reset limit.
- Unused Vercel projects `tebos-ex3f` and `tebos-production-v2`: deleting them is the founder's choice.
- The Alpha Vantage market-data key for Tidy Capital, when the founder wants it.
