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

## Milestone 2 onward (not built)

| # | Criterion | Status |
|---|---|---|
| 15 | Client intake form (sections A–J, conditional questions) in the client portal | NOT VERIFIED |
| 16 | Maintainer dashboard: stage, deadline, readiness gaps, QA, approvals, history | NOT VERIFIED |
| 17 | Client portal: intake progress, pending decisions, preview, approve | NOT VERIFIED |
| 18 | Agent task ledger with dependencies (`agent_tasks`, `task_dependencies`) | NOT VERIFIED |
| 19 | Assets register with licence status | NOT VERIFIED |
| 20 | Integration connections with owner, access level and revocation plan | NOT VERIFIED |
| 21 | Deployment records: preview URL, production URL, rollback | NOT VERIFIED |
| 22 | Cost and delivery metrics per project | NOT VERIFIED |
| 23 | One reusable website template delivered end to end | BLOCKED: a commercial-use host is needed (`TOOLCHAIN.md` §3) |
| 24 | Public-holiday calendar in the business-day count | NOT VERIFIED (weekends only today) |
