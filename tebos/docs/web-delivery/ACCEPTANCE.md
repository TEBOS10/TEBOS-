# Web Delivery Division: acceptance criteria

Status words:
- **IMPLEMENTED:** the code exists.
- **TESTED:** an automated test proves it.
- **BLOCKED:** it waits on something named in the row.
- **NOT VERIFIED:** not built or not proven yet.

Evidence is the named test file. The SQL tests run with `npm run test:db`, the unit tests with `npm test`.

## Milestone 1: the delivery engine's records and rules (database first)

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | A project belongs to one TEBOS client organisation and gets a reference (`WP-0001`) | TESTED | `99zz_web_delivery.sql` |
| 2 | Only TEBOS maintainers open or change a project; sales staff and clients can't | TESTED | `99zz` |
| 3 | A client's members read only their own project; another client sees nothing | TESTED | `99zz` |
| 4 | The state machine `LEAD → INTAKE → SCOPE_REVIEW → APPROVAL → BUILD → QA → CLIENT_REVIEW → RELEASE → HANDOVER → CLOSED`, plus the blocked, scope-change, QA-failed and cancelled states. Skipping a step is refused | TESTED | `99zz`, `web-delivery.test.ts`, parity |
| 5 | Every change of state carries a new reason. The audit trail records who changed it, when, from what and to what | TESTED | `99zz` |
| 6 | Scope is an insert-only, numbered revision with pages, features, workflows, exclusions, primary conversion, acceptance criteria and recurring costs | TESTED | `99zz` |
| 7 | Scope beyond the package's ceiling is refused, and the refusal tells you to offer a revised quote, a smaller scope or a later phase. The ceilings are workflows and parts (pages plus features): Small 4/10, Medium 10/30, Company 40/120 | TESTED | `99zz`, `web-delivery.test.ts` |
| 8 | Only the client's own admin approves scope, design and release. Each approval is given once and is never edited | TESTED | `99zz` |
| 9 | Build starts only when the project is ready: (a) the package is the client's active plan; (b) the client approved the latest scope and design; (c) every readiness item has evidence. Only missing assets may be knowingly waived | TESTED | `99zz`, `web-delivery.test.ts` |
| 10 | The three-business-day clock starts at build, pauses while the client blocks it, and can't be edited by hand | TESTED | `99zz`, `web-delivery.test.ts` |
| 11 | Client review needs a QA pass on the latest scope with no critical defect open. A "pass" with a critical defect open is refused. QA verdicts can't be edited | TESTED | `99zz` |
| 12 | Release also needs the client's release approval, which can only be given after a QA pass | TESTED | `99zz` |
| 13 | Nothing is deleted | TESTED | `99zz` |
| 14 | No secrets in the records (`looks_secret` checks on the free text) | IMPLEMENTED | migration checks |

## Milestone 2 (built 1 Nov; migration `web_delivery_ledger` waits on "merge it")

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 16 | Maintainers' dashboard, with four numbers: open projects, due within a day or late, waiting on the client, live sites. Each project shows its stage, its clock, tasks done, and what holds it up | TESTED | `web/e2e/web-delivery.spec.ts`; the `web_delivery_board()` SQL in `99zzb` |
| 16a | A project page with these parts: the stage track, moving stages with a reason, the database's readiness gaps, the readiness checklist, scope revisions checked against the package before sending, the client's approvals (read-only), tasks, assets, QA and deployments | TESTED | `web-delivery.spec.ts` |
| 16b | The dashboard fits a 375px phone with no sideways scroll, and is for maintainers only | TESTED | `web-delivery.spec.ts` |
| 18 | A task ledger for the twelve roles. A task waits for the tasks it depends on, and dependencies can't form a loop. Nobody passes their own review, and "done" needs evidence | TESTED | `99zzb_web_delivery_ledger.sql`, `web-delivery.test.ts`, e2e |
| 19 | An asset register. An asset is received only with its source and licence recorded | TESTED | `99zzb`, e2e |
| 21 | Deployment records: environment, address, commit, what was checked, outcome. Production needs a project in release and the client's release approval; afterwards the record can only change to "rolled back". Handover needs a live production deployment | TESTED | `99zzb`, `99zz`, e2e |

## Milestone 3 (built 1 Nov; migration `web_delivery_portal` waits on "merge it"; ADR 0012)

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 17 | **Your website** (`/website`), the client's page in their own account. It shows: the stage, the clock and progress; what TEBOS needs from them; the agreed scope; approve buttons for their admin only; the preview and live links; and history | TESTED | `web/e2e/web-portal.spec.ts` |
| 17a | The client asks TEBOS for a change from their account. It lands on the project and counts against their plan; a refusal from the plan is shown with its reason | TESTED | `99zzc`, `web-portal.spec.ts` |
| 20 | Accounts the site depends on: the client owns them, and TEBOS's access is recorded with how it ends. An account TEBOS holds needs a hand-over plan; no secrets are stored | TESTED | `99zzc`, `web-delivery.test.ts`, e2e |
| 22 | Costs per project. A recurring cost the client pays must be disclosed first | TESTED | `99zzc`, e2e |
| 22a | Project history from the audit trail, for staff and the client's members only | TESTED | `99zzc`, e2e |
| 25 | Every project has a maintainer, by default the client's own. A maintainer runs at most 8 open projects, and the dashboard shows the team's load | TESTED | `99zzc`, `web-delivery.test.ts`, e2e |
| 26 | 50 clients at once: 52 projects on one board (`99zzc`); the board's read takes about 10 ms on a local Postgres with 50 projects | TESTED locally; live NOT VERIFIED | `99zzc`, ADR 0012 |

## Later (not built)

| # | Criterion | Status |
|---|---|---|
| 15 | Client intake form (sections A–J, conditional questions) in the client portal | NOT VERIFIED |
| 22 | Cost and delivery metrics per project | NOT VERIFIED |
| 23 | One reusable website template delivered end to end | BLOCKED: a commercial-use host is needed (`TOOLCHAIN.md` §3) |
| 24 | Public-holiday calendar in the business-day count | NOT VERIFIED (weekends only today) |

## Design standard (from `DESIGN_BRIEF.md`; checked for every client site at QA)

| # | Criterion | How it's checked |
|---|---|---|
| D1 | The site is built around one named hero idea (object, world, transformation, or person and work) | The creative brief names it; design review fails a site without one |
| D2 | One display face, one quiet sans, one accent colour; body text at least 16px | Token file review; computed styles in e2e |
| D3 | The primary call to action is visible in the first viewport on 375px and 1280px, and returns at the end of each chapter | Playwright screenshots at both widths |
| D4 | Every animated or 3D section has a fallback: still chapters for reduced motion, and a poster without WebGL | e2e with `reducedMotion: 'reduce'`, and with WebGL disabled |
| D5 | Before the first interaction on mobile, the hero transfers at most 2 MB | Playwright network log on a throttled profile |
| D6 | Keyboard only: every link and control is reachable with visible focus; scroll scenes have text equivalents | e2e keyboard walk |
| D7 | Every image and model is in the asset register with its licence or source | Asset register (milestone 2) |
