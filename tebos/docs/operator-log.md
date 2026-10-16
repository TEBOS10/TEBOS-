# Operator log

The build loop's record, newest first. See [`OPERATOR.md`](OPERATOR.md) for the rules each run follows.

## Founder's decisions (only you can unblock these)

Update this list every run; strike items when they're done.

| # | Decision | What it unblocks |
|---|---|---|
| 0 | **Run the first real operating systems.** Pick real businesses (BAME first, then pilots) and let TEBOS lay down their blueprint | Real proof. The ten blueprints are templates, not client work; only real clients make a portfolio |
| 1 | Paystack secret key on the worker, and the webhook `https://tebos-worker-production.up.railway.app/webhooks/paystack` | Taking the first payment, and monthly invoices |
| 2b | Replace the worker's `ANTHROPIC_API_KEY` with a key **scoped to a workspace** (the key set on 8 Oct is not, so every request is rejected) | Findings from scans and interviews: the next product step |
| 2 | Resend key and a verified sending domain | Every client email: payment links, contracts, invoices, reminders, the next-day outline after an intake call |
| 2c | A phone number on the voice provider, and the intake agent (`ELEVENLABS_INTAKE_AGENT_ID`, set-up in the README) | TEBOS ringing prospects from meetings |
| 3 | A lawyer approves the contract templates (standard and company) and advises on POPIA | Signing clients |
| 4 | Activate the 9 draft objectives on TEBOS's board | The company measuring itself, and the maintainer queue watching TEBOS |
| 5 | Founder name and title for outreach and the site | Sending the outreach drafts |
| 6 | Social accounts created, and whether to invite a marketer (Staff → Invite, role Marketing) | Publishing the social pack and approved drafts |
| 7 | Company registration and VAT number | Invoices that are legally complete |
| 8 | Make the repo private, rotate database passwords, turn on leaked-password protection | Protecting the platform from copying |
| 10 | **Property Revenue Architect:** the monthly subscription price (and whether there are tiers). The assessment is settled: rental income, occupancy and costs | The first paying subscribers, priority 1 |
| 12 | **Agent's office:** what your agency's principal allows (CRM, listing portals, WhatsApp, client data), and the one auto-reply text you approve | Never missing an enquiry, priority 3. Until the principal allows client data, the office keeps references only (B-001), no names or numbers |
| 11 | When there's income: Supabase Pro (about USD 25 a month) so the vault and Tidy Capital can have their own project, out of the client database. Until then the vault is a private organisation inside TEBOS | Full separation of your private data |
| 18 | Each client's web app address (where TEBOS's people sign in to their department), starting with BAME's | Client tiles that open the client's web app |
| 15 | Each client's exact colours and logo (the client map uses colours from your description) | Tiles that look exactly like each client |
| 9 | Confirm the `capital` schema (18 tables, applied 3 Oct from outside this repo) should live in TEBOS's database, or move it to its own project | Keeping TEBOS's system of record clean, and its migrations in one place |

## 17 Oct 2026: the Real Estate Job portal opens (the agent's office, slice 1)

- **Asked by the founder:** the real-estate job first, starting with deals and next steps. The agency's
  principal hasn't been asked about client data yet (decision 12), so no personal details are kept.
- **Built** (migration `agent_office`, additive):
  - Listings (L-001, ...) and people (buyers B-, sellers S-, tenants T-, landlords O-), each with a stage.
  - Nothing open is left without a next step and its date; anything closed says how it ended.
  - Email addresses, South African phone numbers and ID numbers are refused in every text field, as are
    secrets. People are described by what they need, never by who they are.
  - Only in the private organisation (IREKUN), only for its owner, only after two-step sign-in. The audit
    trail is redacted, so a deleted record is really gone.
  - The portal: next steps soonest first (overdue, today, this week), mandates ending within two weeks,
    and the listings and people. The city's Real Estate Job building is now open.
- Tests: SQL `99zj`, `test/agent.test.ts`, and the e2e test `agent.spec.ts`.
- Next: commission expected versus received (feeding Tidy Capital), then the enquiry log.

## 16 Oct 2026 (night): both apps deploy themselves from `main`

The founder set this up in Vercel and Supabase, step by step from the phone:

| App | Vercel project | Address | Build |
|---|---|---|---|
| TEBOS | `tebos` | tebos-demo.vercel.app (moved here from `tebos-web`), tebos-neon.vercel.app | Root `tebos/web`, Vite defaults (`npm run build` → `dist`) |
| TEPOS | `tebos-web` | tebos-web.vercel.app | Root `tebos/web`, `npm run build:tepos` → `dist-tepos` |

- Both projects take their Production Branch from `main`. Until now they took it from a BAME branch
  (`claude/bame-intake-integration-s5ue43`), which is why merges only ever became previews.
- Both projects have the two public `VITE_SUPABASE_…` variables. The `tebos` project had none before.
- Supabase Auth:
  - the Site URL is the TEBOS address;
  - the Redirect URLs list both apps' addresses, so each app's password-reset email returns to that app.
- Unused projects are left untouched; deleting them is the founder's choice:
  - `tebos-ex3f` serves a 404 from the BAME branch;
  - `tebos-production-v2` is an old prototype from 11 Sep, not linked to Git.
- `bame-os` and `bame-live` (BAME's own sites) were not touched.
- Supabase's built-in email sends only a few messages an hour. Repeated reset requests hit that limit. A sending
  service lifts it (decision 2).

## 16 Oct 2026 (night): the two-step rule is live

- On the founder's "edit in place", the rule was applied by editing the existing access rule. Removing and
  re-creating it kept being cancelled at the approval step.
- The live database now matches migration `two_step_resilience`.
- Checked live, with a test record that was rolled back:
  - signed in with only a password, the owner sees 0 records in IREKUN;
  - with the authenticator code, the owner sees the record.
- No records were left behind.

## 16 Oct 2026 (evening): TEPOS and TEBOS are two separate web apps

- **TEBOS** is the public platform for clients.
  - It shows nothing of TEPOS. Your private organisations no longer appear in its switcher.
  - The build fails if the TEBOS bundle mentions TEPOS.
- **TEPOS** is your own app.
  - It is built apart from TEBOS and lets in only someone who owns a private organisation.
  - It uses earthy colours, with the same logo recoloured in bronze.
  - Its home is a city of six buildings, one per portal. The three not built yet stand under scaffolding.
- **Client tiles** open the client's own web app. A client whose address isn't recorded says so and opens nothing.
- **Decision 13 settled:** 50% of TEBOS's profit above its costs and buffer goes to Tidy Capital.
- **Found:** the live site hasn't been following `main` (decision 16).
  - Merges since 16 Oct were built as previews only. Production last changed from a BAME branch commit.
  - Earlier reports that changes had gone live were wrong. They read the migration job's "production" environment,
    not the site. Decisions 16 and 17 fix this; from now on, "live" is reported from Vercel's own production
    deployment.
- Migration `organisation_app`: which app an organisation belongs to, and `businesses.app_url`.
- Tests: SQL `99zi`, and the e2e tests `tepos.spec.ts`, `resilience.spec.ts`, `property.spec.ts` and
  `two-step.spec.ts`, which now run against the TEPOS app on its own server.

## 16 Oct 2026 (afternoon): TEPOS and TEBOS, two sides of one app (founder's drawing; superseded the same evening)

- **TEPOS**, the Tidy Enterprise Personal Operating System, is the founder's personal side.
  - Its home shows six portal tiles in earthy brown and beige: Tidy Capital, Tidy Enterprise, IREKUN, Academics,
    Real Estate Job and Forex.
  - Opening a tile pulls you through a warm vortex in its colours, into the organisation that holds it.
  - Tidy Capital (the reserve and runway), Tidy Enterprise (property cases) and IREKUN (security) are built.
  - Academics, Real Estate Job and Forex say "Not built yet" and what they will hold.
- **TEBOS** is the client side. Its home opens with a client map: each client as a tile in its own colours, marked
  "Not connected yet" until its systems are linked.
- **The menu** has a TEPOS / TEBOS switch. Property cases and the money records moved to TEPOS.
- **Clients set up** (the founder confirmed they are real clients), each with its own organisation:
  - Grape Studios, Mmupi and Clay, Avocado OS, Vantage and K. Academy;
  - Hospitality OS, marked "in development".
  - BAME carries its colours.
  - No figures are shown for any of them until measured.
- Migration `business_brand` stores the colours and how each business relates to Tidy.
- Tests: the new SQL test `99zh`, `test/brand.test.ts` (tile contrast), the web test `portals.test.ts`, and the e2e
  test `tepos.spec.ts`. Older e2e tests now follow the new menu.

## 16 Oct 2026: Property Revenue Architecture, workstreams and the outcome scorecard

- **Asked by the founder:** the next step after the case workspace.
- **Built** (migration `property_execution`, additive):
  - **Workstreams:** owner, deadline, status, dependency, budget and approval, evidence of completion. The rules:
    a workstream starts only after its dependency is done, with no cycles; a budget is spent only once approved;
    done needs evidence and a date; blocked says why. Exceptions are raised for overdue, blocked and awaiting-approval work.
  - **The baseline:** the database copies the case's figures when it is captured, whatever the client sends, and
    freezes them. Only the target can be revised.
  - **Outcome reviews:** dated between the baseline and today. Actuals are verified or owner-reported, never estimated.
  - **The scorecard:** realised net benefit (cash-flow change against the baseline), variance against the target,
    collection, occupancy, NOI and arrears changes, and spend so far. It flags shortfalls and an overdue review.
  - **The outcome gate** now needs a baseline and actuals.
  - **Arrears outstanding** became a figure, so it can be baselined.
  - The report and the CSV export include all of it.
- **Proof:**
  - core: 291 tests, including `property.test` (25);
  - database: 55 of 55, including SQL `99ze`;
  - web: 60 unit tests, and e2e 95 of 95, including `property.spec` (8).

## 16 Oct 2026: Property Revenue Architecture, the case workspace (founder's specification)

- **Asked:** the founder sent three things: the Property Revenue Architect dossier (the business specification),
  the HTML prototype (the visual reference) and a build brief. The brief asked for a real application, not a mock-up.
- **What the prototype already did:**
  - it calculated NOI, cash flow, collection rate and occupancy only when the inputs were filled;
  - blank meant unknown;
  - it had evidence checkboxes, gates and a JSON export.
- **What it didn't do:**
  - nothing was saved, and there was one hardcoded case;
  - readiness counted ticks;
  - figures weren't labelled verified or owner-reported;
  - a single "vacancy / collection loss" field invited double-counting;
  - there was no audit trail and no report.
- **Built:** the case workspace in the Tidy Enterprise organisation:
  - intake with the five dispositions, each with a reason, a time and its history;
  - an evidence register weighted by materiality and quality;
  - figures labelled verified, owner-reported or estimated, where verified rests on checked evidence;
  - economics that never treat unknown as zero, with vacancy and collection shortfall counted once;
  - the seven pathways, with one explained recommendation;
  - five ordered gates;
  - history from the audit trail;
  - the assessment report with PDF, JSON and CSV export;
  - the prototype's dark visual style.
- **Proof:**
  - core: 284 tests, including `property.test` (18);
  - database: 55 of 55, including SQL `99zd`;
  - web: 60 unit tests, and e2e 93 of 93, including `property.spec` (6).
- **Not yet:** document upload (with the vault), execution workstreams and the outcome scorecard (next), the monthly
  subscription view, and any AI document analysis. No property data was entered: the workspace is empty until a
  real case is opened.

## 16 Oct 2026: the founder's priorities, cash first

- The founder set the order for the whole company (ROADMAP "Founder's priorities"). The daily run now takes these
  first (OPERATOR rule 2.3), so work continues when the founder is busy.
- **Why cash first:** subscriptions keep running out. Tidy Capital is how money grows over years; commissions,
  Property Revenue Architect reviews and TEBOS clients are how bills get paid this month.
- **The vault goes inside TEBOS for now:** the free plan allows two projects and both are in use. It is built
  to move out to its own project later.
- New founder questions: 10 (how you assess a property, and the review price) and 11 (Supabase Pro when there's income).

## 16 Oct 2026 (daily run): Ask TEBOS answers "How are my businesses doing?"

- **State read:**
  - `main` is green, and the worker runs #45's build (SUCCESS, no errors logged since).
  - Business reviews still fail on the AI key: 48 in the last day (decision 2b).
  - No maintainer items and no REEDS requests yet. The advisors are unchanged.
- **Chosen:** item 2 of the founder's build order, a second REEDS request type. It is deterministic, so the AI key
  doesn't block it.
- **Built:** "How are my businesses doing?" runs four checks on the organisation's own records. Each check has a
  separately written recount and a re-test of every record it lists:
  - active objectives whose **latest measured reading misses the target**. The executor picks the latest reading
    with `distinct on`; the verifier re-derives it as "no later reading exists". What the owner said never counts;
  - active objectives with **no measured reading**;
  - active objectives **past their date**;
  - board steps that **only the founder does, written down nowhere**.
  - Migration `business_status_request` only widens the list of request kinds. The kind stays fixed once asked,
    and planning and reporting stay the server's.
  - The ask screen offers the new question with no interface change: it lists the kinds the domain defines.
- **Proof:**
  - integration `reeds-pg`, on real Postgres: an objective that met its target earlier but misses on the latest
    reading counts as off target; a stated-only objective counts as unmeasured; a documented or retired founder
    step doesn't count. Every task is verified. Another organisation asking sees none of it;
  - SQL `99zb`: the new kind is asked like the first, and is fixed once asked;
  - unit: the plan, unique keys across kinds, and parity with the database's latest kind check;
  - e2e: asking it from the phone sends `business_status`;
  - core: 266 tests, database 55 of 55; web: 60 unit tests, e2e 87 of 87.

## 15 Oct 2026 (daily run): approvals and alerts in the Ask TEBOS inbox

- **State read:**
  - `main` is green, and the worker runs #45's build (SUCCESS).
  - Every business review in the last two days failed (97 runs) with "the reasoning service refused its set-up": the
    AI key is not workspace-scoped (decision 2b).
  - No open maintainer items, no REEDS requests yet, and the security advisors are unchanged (the token-based
    functions and server-only tables are deliberate).
- **Chosen:** the founder's build order, item 1: the phone inbox. Roadmap items 2 (findings naming their flow)
  and 5 (automation) wait on the AI key and on connected tools.
- **Now on Ask TEBOS** (`/reeds`), a **Your inbox** card:
  - **Waiting on a decision:** pending approvals, each linking to its action, where the decision is made with
    the evidence in view. Nothing is approved from the list.
  - **Alerts:** runs that failed in the last day, grouped by their reported reason so one cause reads as one alert
    with a count, and active objectives past their date.
  - Every alert comes from a record. With nothing to show, it says so.
  - It refreshes every minute.
- **Proof:**
  - unit `inbox.test` (grouping, counts, ordering);
  - e2e: a pending approval links to its action; two failures read as one alert, and one from two days ago
    doesn't count; an objective past its date shows and one not yet due doesn't; the empty state.
  - Checks: web typecheck, 60 unit tests, e2e 86 of 86; core 265 tests. No schema change.
- **Also shipped since the last entry, at the founder's request:**
  - #50: the app menu links to the showcase and the film. Signed in, they had no way back.
  - #51: the signed-in home shows each business at a glance: its 3D chessboard (the board page's view,
    unchanged), a gauge per objective from measured readings, and trend lines.
  - Both are live (Vercel production deployment succeeded).
- **Worker:** unchanged by these web-only changes, so no redeploy.

## 15 Oct 2026 (night): the site answered "not found" for every app page; fixed

- **What broke:** the founder signed in on the phone and got the host's "404: this page doesn't exist" at
  `/sign-in`.
  - The cause was mine, from 14 Oct (#43, per-page share previews). It switched on `cleanUrls` in `vercel.json`.
  - With it on, the host no longer honoured the fallback that sends every other address (`/sign-in`, `/reeds`,
    `/approvals`, ...) to the app, so those addresses answered 404.
  - My tests run against the development server, which doesn't apply `vercel.json`, so they couldn't catch it.
- **Fixed:**
  - `cleanUrls` is off.
  - `vercel.json` now lists each public page's address explicitly, mapped to its built copy, then the fallback to
    the app. This is the same fallback that worked before 14 Oct.
- **Kept from breaking again:** a test now fails if `cleanUrls` returns, if the fallback isn't last, or if any
  public page lacks its rule.
- **Not yet verified live:** this workspace can't reach the live site. The founder confirms by signing in again.

## 15 Oct 2026: TEBOS installs on the phone

- The founder asked for the app to be installable, the next step for the phone as the main control point.
- **Now:**
  - The TEBOS web app can be installed on a phone (Android: Chrome menu, "Install app" or "Add to Home screen";
    iPhone: Share, "Add to Home Screen"). It opens full screen on **Ask TEBOS**, with shortcuts to Ask TEBOS and
    Approvals and the TEBOS icon.
  - Where the browser offers it, "Install TEBOS on this device" appears in the menu.
- **Offline, honestly:**
  - A small service worker steps in only when a page can't load, and shows "You're offline".
  - It stores no data, only the icon, so nothing out of date can ever be shown as current. The test asserts what
    is stored.
  - Working offline with data is deliberately not offered.
- **Proof:**
  - e2e `pwa.spec`: manifest, icons, and the service worker controlling the page;
  - **Chrome's own installability check returns no errors**, run in a normal profile because browsers never
    install from private windows;
  - offline shows the notice, and the page recovers when the connection returns;
  - the production build carries the manifest link on every page copy.
- **Not yet:** push notifications. They need web-push keys and an end-to-end test; until then nothing claims them.
- **Checks:**
  - web: typecheck, 49 unit tests, e2e 81 of 81;
  - core: unchanged.

## 15 Oct 2026: one organisation per company and client (founder-approved)

- **The founder approved** moving the businesses that shared "Tidy Enterprise" into an organisation each, through a
  narrow exception to the rule that records never change organisation.
- **The exception** (migration `move_business`):
  - `tebos_private.move_business(business, organisation)` moves one business and everything that belongs to it
    in one statement: sources, scans, evidence, runs, tool calls, connections and credentials, findings, actions,
    objectives, measurements and the board.
  - Only TEBOS's server can call it; a signed-in person or the API cannot.
  - While it runs, the guards accept only an update that changes nothing but the organisation, for that business,
    from its organisation to the named one. Everything else is refused as before.
  - A client's business (one with a contract) can't be moved.
  - Audit history stays where it was written.
  - SQL test `99zc` proves all of this, including that setting the move's markers by hand opens nothing.
- **The plan for the live move:**
  - "Tidy Enterprise" becomes **TEBOS**: TEBOS's company records already live there.
  - **BAME** and **rocomamas.com** each move to a new organisation of their own.
  - A new, empty **Tidy Enterprise** is created for the property business.
  - The founder is admin of each.
- **Done live, 14 Oct, 21:20 UTC:**
  - Migration `move_business` applied with the connector.
  - "Tidy Enterprise" renamed **TEBOS** (slug `tebos`). New organisations: **BAME** (`bame`), **rocomamas.com**
    (`rocomamas`) and **Tidy Enterprise** (`tidy-enterprise`, empty, for the property business). The founder is
    org admin of all four.
  - Moved, matching the counts taken beforehand exactly:

    | Business | Evidence | Sources | Scans (targets) | Runs (tool calls) | Objectives (measurements) | Board | Connection and credential |
    |---|---|---|---|---|---|---|---|
    | rocomamas.com | 104 | 7 | 1 (7) | 4 (11) | 0 | 0 | none |
    | BAME | 279 | 4 | 0 | 57 (57) | 6 (8) | 41 | 1 and 1 |

  - Checked afterwards:
    - no record of any business sits outside its business's organisation;
    - TEBOS is untouched (194 evidence, 223 runs, its company connection);
    - both connections still read connected;
    - a direct attempt to change a business's organisation was still refused live.
  - BAME's hourly reading takes its organisation from its connection, so new readings land in BAME's
    organisation.
  - Audit history from before the move stays under TEBOS's organisation, as written.

## 14 Oct 2026 (night): REEDS takes its first request end to end

- **Phase 2 of the directive.** A person can now ask TEBOS for something and get a verified answer, without
  anyone managing the steps. This is the first milestone: one legitimate request, done, checked and reported.
  - **Ask TEBOS** (`/reeds`): ask "What needs my attention today?" from a phone or a desktop, watch it go through
    Asked, Planned, Done and checked, and Reported, then read the report and how each figure was checked.
  - **The ledger** (migration `work_requests`, ADR 0004): requests and tasks with their own state machines. The
    database refuses to mark a request complete until every task has passed its independent check. Only a person
    can ask, so work can't spawn work. Tasks and attempts are capped.
  - **The worker** plans, runs, verifies and reports, one step per cycle, alongside the other workers.
  - **Proof:**
    - SQL test `99zb`: who can ask, the limits, no false completion, isolation;
    - integration test `reeds-pg`: a real request completes with figures matching a recount; another organisation's
      records never appear; a failing executor is retried three times, then fails; an inflated figure is rejected
      and never reported;
    - e2e at phone width: asking, the report, the failure view, a viewer can read but not ask.
  - **Caught by the tests:** three verifier queries were refused by the database. The request failed honestly
    instead of reporting. Fixed, and a unit test now checks every query's parameters.
- **Phones:** the menu used to fill the first screen of every page on a phone. It now folds behind a Menu button,
  in the app and in the staff workspace.
- **Checks:**
  - core: typecheck, 265 unit tests, database and integration tests;
  - web: typecheck, 49 unit tests, e2e 79 of 79.

## 14 Oct 2026 (later): platform audit for the REEDS × TEBOS directive

- The founder issued the master build directive. Its order: audit, then orchestration, then Tidy Enterprise and Tidy
  Capital as separate products, then the phone. The first milestone is one request taken from receipt to a
  verified report without the founder.
- **Audit:** [`audit/2026-10-14-platform-audit.md`](audit/2026-10-14-platform-audit.md). The living status is in
  [`REGISTER.md`](REGISTER.md). In short:
  - TEBOS's control plane, approvals, audit and worker are real and tested.
  - REEDS has no code yet.
  - Tidy Capital exists only as a database schema and a function created outside the repository. Its nightly
    ingestion has been blocked since 3 Oct (no market-data key).
  - The Tidy Enterprise property product doesn't exist yet.
- **Corrected live:** two Tidy Capital providers were marked `connected` without real access: Alpha Vantage (no
  key) and Vanguard (only a chat connector). Both are now `placeholder`, with the reason recorded.
- **Next:** Phase 2, the request ledger. Request type 1 is "What needs my attention today?", answered from live
  data and verified by an independent recount.

## 14 Oct 2026: every public page can be found and shared on its own

- **State:** nothing broken. The worker is healthy (#41 deployed 13 Oct, SUCCESS), and main is green.
  - The live signal: the site has had **no enquiries and no self-checks yet**.
  - Bringing people to the site is outward-facing, so it is the founder's (the social pack and the outreach drafts
    wait on decisions 5 and 6).
  - Within the loop's reach: make sure that when the site is found or shared, it presents itself properly.
- **What was wrong:** the site is one page that changes after it loads. Search engines and link previews
  (WhatsApp, LinkedIn, X) therefore saw the home page's title and text for every address: a shared self-check or
  showcase link previewed as the home page. The hand-written sitemap was also missing `/showcase` and `/film`.
- **Now:**
  - One list of public pages (`web/src/lib/pages.ts`) gives each page and each article its own title and
    description.
  - The build writes a copy of the page per address carrying them, with its canonical address and preview tags.
    The host serves that copy, then the app takes over as before (`cleanUrls` in `vercel.json`).
  - The sitemap is generated from the same list.
  - A test fails if a public route in the app is missing from the list, or if a title or description quotes a price,
    a percentage, a case study or a supplier.
- No database or worker change.
- **Checks:**
  - typecheck;
  - unit tests (web 49, core 259) and database tests;
  - e2e 75 of 75.

## 13 Oct 2026: yesterday's change finished going live

- **What was broken:** the 12 Oct run merged #41 but stopped before its last two steps.
  - Its database rule (`diagnostic_closes_delivery`) was not applied.
  - The worker was still running the 10 Oct code, so new clients would not yet get their diagnostic opened.
  - Nothing failed for anyone (there are no clients yet), but the change was not live.
- **Fixed today:**
  - Applied the migration with the database connector under its own name. Checked live: the trigger is enabled and
    the delivery guard is updated.
  - Reconnected the worker to `main`, which deployed #41.
- **Lesson kept:** a run is not finished at "merged". It ends only after the migration and the deploy are
  confirmed live, as OPERATOR.md already says. When a run is cut short, the next run finishes it first, as
  today's did.
- State otherwise: main is green; there are no enquiries, clients or open maintainer items; advisors are unchanged.

## 12 Oct 2026: a new client's diagnostic runs without the founder

- State: nothing broken. The worker is healthy (last deploy SUCCESS), and main's checks are green. No enquiries,
  clients or open maintainer items yet. Advisors are unchanged (the known, intended public functions, the
  `capital` schema (decision 9), and leaked-password protection (decision 8)). No run on 11 Oct: the routine fired
  but the run didn't complete.
- Picked: the founder's ask that a newly signed client is served without them. One founder step on every small
  plan was "Diagnostic interview": someone had to hold it and then tick it off.
- **Now:**
  - At onboarding TEBOS opens a written diagnostic interview for the client by itself: their industry's questions
    when TEBOS has them (agencies), otherwise a new general **small-business diagnostic** (10 questions on where the
    business runs through the owner, customers, money, team and tools, and numbers).
  - The welcome email tells the owner to answer it.
  - When the owner submits it (or a diagnostic call completes), a database rule closes the plan's
    "Diagnostic interview" step itself, with a note of how many questions were answered. It records no person,
    because TEBOS closed it.
  - It closes only on a real completion (a cancelled interview closes nothing), and only for that client.
- The diagnostic card on a business now asks that business's industry questions, not the agency ones for everyone.
- Migration `diagnostic_closes_delivery` is additive: one new trigger, plus the delivery guard recording "no
  person" when TEBOS closes a step.
- Checks: typecheck; unit tests (core 259, web 45); database tests, including the new `99za` and the onboarding
  flow; e2e 74 of 75 (the 3D `world.spec` fails only in this container).

## 10 Oct 2026 (night): "What TEBOS does", shown rather than told

- The founder asked for a visual showcase: rows by category, like a streaming service, each card showing
  something TEBOS does, built on what businesses are paying for now. New public page **`/showcase`**, linked from
  every site menu as "What TEBOS does".
- Eight rows (sales, money, founder work, numbers, delivery, websites, security, service), 17 cards. Opening a
  card plays it: the problem, each step lighting up with who or what does it (automatic, the team, the owner, the
  customer, a supplier), then what changes.
- **Honest by construction.** TEBOS has no client case studies yet, so every card is labelled an illustration
  with invented names and no results, and carries one of four labels: runs in TEBOS today, runs once a tool is
  connected, TEBOS designs it for the business's team, or on the roadmap. A unit test fails if a card quotes a
  percentage, mentions a case study or testimonial, names a supplier, or links anywhere but a public page.
- The row order follows the research in [`market-needs.md`](market-needs.md) (finding customers and cash flow
  first for small businesses; reporting, connected systems and approvals for larger ones).
- No database change. Checks: typecheck, unit tests (web 45, core 258), database tests, e2e 74 of 75 (the 3D
  `world.spec` fails only in this container and passes on GitHub).
- Next: the founder's other ask, that a newly signed client gets full service delivery without the founder.

## 10 Oct 2026 (later still): the guard is live, and nothing technical is left for the founder

- The founder said, rightly, that the set-up had turned them into a technical person. The point of TEBOS is that
  it does this itself. Decision 11 (secret, branch protection, labels) is withdrawn.
- **The guard is live.** After the founder's approval (the label on #38), this session applied `destructive_guard`
  with the database connector. It contains no `drop` statement, so the connector didn't cancel it. A rolled-back
  probe in the live database confirmed the guard refuses a table drop. Both event triggers are enabled.
- **CI's migration job:** the `SUPABASE_DB_URL` secret exists, but the database refuses its password. A refused
  login is now a warning, not a failed build, and the build loop applies migrations with the connector meanwhile.
  The runner also matches migrations by name, because the connector records its own version, so nothing is
  applied twice. Fixing the secret is optional, not a decision.

## 10 Oct 2026 (late): CI applies migrations itself, and the guard is approved

- PR #36 merged: CI and the operating rules are live. Its separate "apply migrations" workflow never ran: GitHub
  never registered it (its "after CI finishes" trigger), so the marketing migration is still unrecorded. Applying
  migrations is now the last job of the CI run on `main`. It runs only after Core and database and Web pass,
  and never cancels mid-run. The separate workflow stays as a manual button that defaults to a dry run.
- The founder asked in chat for the approval label on the guard's pull request (#38) and for it to be added
  for them. On that explicit instruction this session added `founder-approved-destructive` to #38. (On #36 the
  permission system had refused it before the founder asked directly.)

## 10 Oct 2026 (night): shipping without the founder at the keyboard, safely

- **Why:** the founder asked for less hands-on work without giving up safety. Most of their trips to Supabase
  and GitHub came from nothing checking or applying changes by itself. The database connector also cancels any
  migration containing `drop`, so on 10 Oct a migration had to be pasted into the SQL editor by hand.
- **Built:**
  - **CI on every pull request and on `main`** (`.github/workflows/ci.yml`):
    - Migration check: applied migrations are immutable, new ones come in order, and data loss needs the
      founder's label;
    - Core and database: typecheck, unit tests and `test:db` on Postgres 17;
    - Web: typecheck, unit tests, build, the provider-name check, and the Playwright e2e tests.
  - **Migrations applied by CI** (`.github/workflows/migrate.yml`, `scripts/migrate.mjs`): after a green merge
    to `main`, new migrations are applied in order, each in its own transaction, and recorded in Supabase's
    history. A failure rolls back and stops the run. It does nothing until the `SUPABASE_DB_URL` secret exists.
    The hand-applied `marketing_role` is listed in `supabase/applied-outside-history.txt`, to be recorded
    without running again.
  - **The database refuses data loss** (migration `destructive_guard`, rule code `TEBOS_DESTRUCTIVE_BLOCKED`):
    - it refuses to drop tables, columns, materialized views or sequences in `public` or `tebos_private`, and
      to drop those schemas or the guard's own schema and functions, unless the same transaction declares
      `tebos.allow_destructive = 'founder approved: …'`;
    - testing found that a cascade could take the guard with it, so a second trigger now refuses that first;
    - Postgres runs no guard on commands about event triggers, so the owner can still remove it on purpose.
      This is written down as a seatbelt, not a lock.
  - **Operator rules:** the three tiers are written into `OPERATOR.md`, with a weekly summary on Mondays. The
    loop may never lift a guard itself (the label, the setting, the CI checks or branch protection).
- **Proved:**
  - core: typecheck and 258 unit tests pass.
  - `test:db`: every SQL file passes (new `99z_destructive_guard.sql`), and all 50 integration tests pass.
  - The runner was tested on a local copy shaped like the live project. It recorded `marketing_role` without
    running it, applied the guard, applied nothing on a second run, and the guard then refused a column drop.
  - The migration check flags this PR's own guard migration until the label is added, as intended.
- **First CI run on GitHub:**
  - it caught a missing web message for the new rule code, now fixed;
  - the test Postgres needed to trust test logins, as the local one does;
  - after those fixes, Core and database and Web pass;
  - the 3D board e2e test also passes on GitHub, so its local failure earlier today came from this session's
    container, not the code.
- **Split:** the label could not be added from this session: the permission system refuses it, as it should.
  So the guard migration and its test moved to their own pull request, which waits for the founder's label. CI,
  migrations by CI, and the rules shipped without it.
- **Waiting on the founder:** decision 11, the one-time set-up, including the label on the guard's pull request.

## 10 Oct 2026 (evening): the marketing department is live

- **The founder applied the `marketing_role` migration** in the Supabase SQL editor. Through the database
  connector it was cancelled every time: the connector stops any migration containing `drop`, before an approval
  can reach the founder. Checked live afterwards:
  - the playbook has its `department` column, with 5 marketing and 9 sales sections;
  - staff and invitations both accept the marketing role;
  - the drafts and playbook rules include marketing, and `staff_directory` lists marketers.
- **Restored the code** by reverting the hold-back commit (dfe3b18). The 7 Oct work is unchanged.
- **Migration history:** because it ran in the SQL editor, the migration is not recorded in Supabase's migration
  history. The file keeps its version (`20261007060000`). Before anyone runs `supabase db push`, it needs an entry
  in that history, or it will be applied twice and fail.
- **Proved:**
  - core: typecheck and 258 unit tests pass.
  - `test:db`: every SQL file passes, and all 50 integration tests pass.
  - web: typecheck, 26 unit tests, and 72 of 73 e2e tests pass.
- **Failing, not this change's:** `world.spec.ts` ("a client's board is drawn in 3D"). In this session's new
  container the 3D canvas never appears. It fails the same way on main without this change, and it passed on main at
  04:00 today in the previous container. Next run: find out why the test browser no longer creates the canvas.

## 10 Oct 2026: clients see plainly that analysis is paused, never the provider's raw error

- **Read:**
  - Main was green, and the worker was live (SUCCESS) since 9 Oct.
  - The 9 Oct pause worked: 38 provider-fault runs in about 19 hours, one every 30 minutes, none counted against a
    business.
  - The key is still not scoped to a workspace (decision 2b), and the marketing migration is still unapproved
    (decision 10).
  - Problem found: those failed runs stored the provider's raw error, its name and a JSON body, on rows that each
    organisation's System page shows to its members. The page also never said that analysis was paused.
- **Chosen (rule 2, live signal):** what clients see about a live fault.
- **Built (no migration):**
  - A provider fault is stored in neutral words that name no service, with its kind (`fault`) on the run. The raw
    message goes only to the worker's log (`intelligence.paused`, `analysis.error`).
  - An unexpected error is stored as "Analysis failed unexpectedly", and logged the same way.
  - `src/domain/analysis.ts`:
    - `analysisPausedSince` reads the pause from the recorded runs;
    - `runDetail` shows the neutral words, including on runs recorded before this change.
  - On the System page: an "Analysis is paused" notice, with when it started. Each worker run shows the neutral
    words.
  - Branch housekeeping: the marketing department restored by draft PR #34 is held back again by dfe3b18. It
    stays in history and comes back with one revert once its migration is approved.
- **Proved:**
  - core: typecheck and 253 unit tests pass (new `analysis.test.ts`; the worker test checks the stored words).
  - `test:db`: every SQL file passes, and all 50 integration tests pass.
  - web: typecheck, 26 unit tests and 72 e2e tests pass (new `system.spec.ts`). The production bundle names no
    provider.
- **Next:** the same two decisions unblock the most: a workspace-scoped key (findings start), and the marketing
  migration.

## 9 Oct 2026: a provider fault pauses analysis instead of using up every business's attempts

- **Read:**
  - Main was green.
  - On 8 Oct the founder set the Claude API key, which turned the intelligence stage on. Saving it redeployed the
    worker from a BAME branch: another session had switched the worker's source. That build failed. This session
    reconnected the worker to main, and it is live (SUCCESS).
  - The key is not scoped to a workspace, so the provider rejects every request.
  - From 17:02 to 23:08 the worker made 15 failed analyses: 3 for a scan, 3 for one business review, and 9 for
    BAME's review. Each set of 3 came within seconds, and BAME's review got a fresh 3 whenever its connected system
    recorded new figures. Nothing was charged, because rejected requests aren't billed.
  - 7 Oct's marketing department (PR #33, commit 7ef841a) is built and tested, but not live:
    - applying its migration timed out once on 8 Oct, and was then cancelled at the approval step;
    - it waits for the founder (decision 10);
    - its screens need the migration, so this PR holds it back with a reverting commit (cc20184), and reverting
      that commit restores it.
- **Chosen (rule 1, broken):** the worker treated a provider fault as the business's fault, and retried at once.
- **Built (worker only, no migration):**
  - The provider reports a rejected key or request as *misconfigured*, and an overload or outage as *unavailable*.
  - Either pauses the whole analysis stage. A set-up fault pauses it for 30 minutes. An outage pauses it for 1
    minute, doubling each time up to 30, and back to 1 after a success. While paused, nothing is claimed.
  - A provider fault is marked on its run (`providerFault`), so it doesn't count towards the business's 3 attempts.
  - A failed analysis is retried no sooner than 10 minutes later.
- **Proved:**
  - core: typecheck and 248 unit tests pass (four new worker and provider tests).
  - `test:db`: every SQL file passes, and all 50 integration tests pass. A new `intelligence-retry-pg.test.ts`
    checks the wait, the provider-fault marking and the limit. The existing three-attempts test now uses a failure
    the analysis caused, and still checks the limit of 3.
  - No interface change.
- **Next:** bring the marketing department back as soon as its migration is approved. Then findings, once a
  workspace-scoped key is in place.

## 7 Oct 2026: a marketing department, with its own role and playbook

- **Read:**
  - Main was green. The worker was live (SUCCESS) since 6 Oct's deploy. Its only error lines were the old
    container being stopped during the swap.
  - The company snapshot is still all zeros. No maintainer items are open, nobody has written a draft yet, and the
    advisors are unchanged.
- **Chosen (rule 4, company plumbing):** product items are still gated (the Claude API key; a connected tool on a
  client board). So this run took item 4 of "TEBOS on its own board": department roles beyond sales and maintainer,
  starting with marketing, the department that now has a page (6 Oct) but no-one to staff it.
- **Built (migration `marketing_role`):**
  - A **marketing** staff role. A platform admin invites marketers like any staff, and a marketer is never a member
    of a client's organisation.
  - Least privilege: marketing drafts content and reads its playbook. It sees no pipeline, leads, clients, billing or
    sales playbook. Every older policy still names its own roles, so the new role gains nothing it isn't given.
  - **Department playbooks.** Each playbook section now belongs to sales or marketing. Sales sections are read by
    sales and maintainers, as before. Marketing sections are read by marketing, sales and maintainers. Admins edit
    both.
  - **The first marketing playbook**, five sections:
    - what we say, and how;
    - what we never publish (nothing invented; no client names without written permission; AI visuals labelled;
      no provider names; nothing internal; no prices beyond a link to the pricing page);
    - from draft to published;
    - channels (newsletters only to people who asked, under POPIA);
    - what to do when someone gets in touch (nothing of value before payment).
  - Mirrored in `src/domain/staff.ts`, whose test checks the roles and departments against the migration.
  - On screen:
    - marketers land on their drafts;
    - the menu shows them Marketing and Marketing playbook only;
    - the pipeline refuses them even when opened by its address;
    - the staff invite form offers Marketing.
- **Proved:**
  - core: typecheck and 249 unit tests pass.
  - `test:db`: every SQL file passes (new `99y_marketing_role.sql`, and `90_sales.sql` unchanged), and all 47
    integration tests pass.
  - web: typecheck, 26 unit tests and 71 e2e tests pass (a new marketer test in `marketing.spec.ts`).
- **Next by the rules:** the next department (finance or operations) only when there is work for it. Otherwise
  hardening, unless the Claude API key arrives, which unblocks findings named by flow.

## 6 Oct 2026: marketing and PR drafts, approved before anything goes out

- **Read:**
  - Main was green, and the worker was live (SUCCESS) with no errors since 5 Oct's deploy.
  - The company snapshot is still all zeros, no maintainer items are open, and the advisors are unchanged.
- **Chosen (rule 4, company plumbing):** every product item is gated. Item 2 needs the Claude API key, item 5
  needs a connected tool on a client board, and stage 5 waits on the earlier gates. So this run took item 3 of
  "TEBOS on its own board": marketing and PR drafting with approval before publishing.
- **Built (migration `content_drafts`):**
  - Staff (sales, maintainer) draft LinkedIn, Instagram, Facebook, X and TikTok posts, blog articles, press
    releases and newsletters on a new Marketing page (`/marketing`).
  - The text is editable only while it's a draft. Once sent for approval it is frozen; to change it, pull it back
    to a draft, which needs approval again.
  - Only a platform admin approves or sends back, and sending back needs a note. Staff can't approve their own.
  - "Published" is recorded only for an approved draft, by a person, with the https address where it went live.
    It's never inferred, and TEBOS never publishes anything itself. Drafts are never deleted, only withdrawn.
  - Mirrored in `src/domain/content.ts` (`canMoveDraft`, `canEditDraft`, `isPublishedUrl`).
- **Proved:**
  - core: typecheck and 244 unit tests pass.
  - `test:db`: every SQL file passes (new `99x_content_drafts.sql`), and all 47 integration tests pass.
  - web: typecheck, 26 unit tests and 70 e2e tests pass (new `marketing.spec.ts`).
- **Next by the rules:** item 4 of the own board (department roles with playbooks), unless the Claude API key
  arrives, which unblocks item 2 (findings named by flow).

## 5 Oct 2026: architecture proposals for founder-only steps

- **Read:**
  - Main was green. 4 Oct's run merged PR #29 but stopped before reconnecting the worker, so this run did that
    first; the worker deployed it (SUCCESS) and started with no errors.
  - The company snapshot is still all zeros. No maintainer items are open, and the advisors are unchanged.
  - The live boards have 11 steps only the founder does, and 8 of them have no written rule.
- **Chosen (rule 3, the product):** "Next for the board", item 4: architecture proposals, one approvable proposal per
  founder-only step.
- **Built (migration `step_proposals`):**
  - The business's team (operators or admins) proposes, for a live founder step, who does it instead (the team,
    a provider, an automation, or the customer), the written rule they follow, and why. An automation must name
    the piece it runs on.
  - There is one open proposal per step, and its content is frozen once proposed.
  - Only the business's owner (an org admin) decides, and never on their own proposal. A rejection must say why.
    A decided proposal can't be edited, and the proposer can withdraw an undecided one.
  - `approve_step_proposal` changes the board in one transaction. It retires the founder step (the record of how
    it was, with its evidence) and puts a new stated, written-down step in its place. Nothing is overwritten,
    which keeps yesterday's rule: an observed step never quietly becomes something else.
  - Mirrored in `src/domain/board.ts` (`checkStepProposal`, `canDecideProposal`).
  - On the board: "Propose a rule" on each founder step, and the open proposal with Approve and Reject for the
    owner, or Withdraw for its proposer.
- **Fixed (root cause found):** the self-check e2e test that failed intermittently (logged on 30 Sep) read the
  recorded request straight after the click. The click returns before the browser sends the request, so under a
  busy full run the check sometimes saw nothing. It now waits for the request; what it checks is unchanged.
  Every other such check already waits for a screen change first. The full e2e suite then passed three runs in a row.
- **Proved:**
  - core: typecheck and 239 unit tests pass.
  - `test:db`: every SQL file passes (new `99w_step_proposals.sql`), and all 47 integration tests pass.
  - web: typecheck, 26 unit tests and 68 e2e tests pass (new `proposals.spec.ts`).
- **Next by the rules:** item 5, automation of steps that have a written rule and a connected tool. Its first slice
  needs a connected tool on a client board; otherwise item 2, findings named by flow, once the Claude API key arrives.

## 4 Oct 2026: observed pieces, confirmed only by evidence TEBOS obtained

- **Read:**
  - Main was green, and the worker was live with no errors since the 2 Oct deploy.
  - The company snapshot is still all zeros: no enquiries, clients or intake calls yet. No maintainer items are open.
  - The advisors show only the known by-design warnings: each public function checks its own token or role.
  - 3 Oct's run stopped after choosing its work, before building it; nothing from it was shipped.
- **Chosen (rule 3, the product):** "Next for the board", item 3: observed pieces. Item 2 (findings named by flow)
  waits on the Claude API key (decision 2b).
- **Built (migration `board_observed_pieces`):**
  - A piece or step of the board is observed only when it cites evidence TEBOS obtained and that is current
    (acquired, partly acquired, or system-generated). What the owner said (an interview answer, a statement)
    makes a piece stated, never observed: the owner's word is not proof of itself. Before, the database accepted
    an owner's statement here.
  - Once evidence confirmed a piece, it stays observed: it can cite newer evidence, or be retired, but never
    quietly fall back to stated or proposed.
  - Mirrored in `src/domain/board.ts` (`canObserve`, `canChangeBasis`).
  - On the board: "Confirm from evidence" on each piece offers only evidence TEBOS obtained (scans, documents,
    connected systems), and an observed piece shows what confirmed it ("Confirmed by: …"), flagged if that
    evidence has since gone stale. With nothing obtained yet, it says how to get evidence instead.
  - Live check before applying: every observed piece and step on the live boards (BAME's 20) already cites
    obtained evidence from documents or connected systems, so nothing live breaks.
- **Proved:**
  - core: typecheck and 237 unit tests pass.
  - `test:db`: every SQL file passes and all 47 integration tests pass. The board test that once made a piece
    observed from the owner's statement now asserts that this is refused.
  - web: typecheck, 26 unit tests and 66 e2e tests pass (new `observed.spec.ts`).
- **Noticed, not touched:** on 3 Oct something outside this repo applied four `capital_*` migrations to TEBOS's
  live database, creating a separate `capital` schema with 18 tables. They don't touch TEBOS's tables. Decision 9
  asks the founder whether this belongs in TEBOS's database.
- **Next by the rules:** item 4, architecture proposals (suggested rules and owners for founder-only steps, each
  an approvable action), unless the Claude API key arrives first, which unblocks item 2.

## 2 Oct 2026 (night): meeting mode, and intake calls that start on the spot

- **At the founder's request:** in meetings, show TEBOS instead of talking about it. After the film, the prospect
  types their number and TEBOS rings them straight away; the next day they get an outline and are on the waiting
  list; a "yes" reaches the founder to close.
- **The founder's decisions:** a short intake call before payment, not the diagnostic (it stays paid); and only staff,
  in the meeting, can start a call (no public "call me" button).
- **Built:**
  - Migration `meeting_intake_calls` and `start_meeting_call`: staff only, consent word for word, 20 calls an hour,
    forward-only states, never completed without words, the answer never overwritten.
  - The intake worker (`src/intake/`): rings at once through its own voice agent, follows the call, reads the
    agent's yes or no strictly, and queues the next-morning outline email (blueprint pieces and flows by name only).
  - Meeting mode (`/meet`): full screen, no staff navigation. Scenario films (a gym, a sports agency) built from real
    blueprint steps and labelled as illustrations, and the TEBOS film. Then the call form, then the call's progress live.
  - The pipeline shows each intake call's outcome; the opportunity page shows what was said, and staff can record an
    answer the call didn't settle.
  - An 11th blueprint: gym or fitness studio (access control at the door, a morning attendance report, member
    messages answered from the FAQ, failed debit orders recovered), from the gym owner's own pains.
  - The outbound call script is written for the playbook (migration `outbound_call_script`), held back until the
    founder approves applying it to the live database.
- **Proved:** core typecheck and 234 unit tests; `test:db` with every SQL file (new `99v_intake_calls.sql`) and 47
  integration tests (new `intake-pg`); web typecheck, 26 unit tests (new scenario check) and 64 e2e tests (new `meet.spec.ts`).
- **To run live, the founder needs:** a phone number connected to the voice provider, and a second voice agent for
  intake (set-up text in the README) with `ELEVENLABS_INTAKE_AGENT_ID` on the worker; the client email key for the
  next-day outline.

## 2 Oct 2026 (evening): the waiting list, and operating systems that start by themselves

- **At the founder's request:** a waiting list, and once a business is accepted, TEBOS starts on it without being told.
- **Built:**
  - A public `/waitlist` page: name, business, email, kind of business (one of the ten blueprints, or something
    else) and team size. It goes through the same throttled enquiry path as every other public form, and is linked
    from the home page, the site menu and the sitemap.
  - Migration `waiting_list`: enquiries carry `kind` (enquiry or waitlist) and `industry`; an opportunity remembers
    both, and links to the client's business on TEBOS once it exists.
  - At onboarding the worker now creates the client's business on TEBOS and lays the blueprint for their kind of
    business onto its board as proposals, then marks "Draft operating system on the board" done with a note saying
    exactly what it laid down. Nothing is marked stated or observed: the owner confirms each piece on day 3.
  - Acceptance stays a person's decision. Everything after it (payment link, agreement, account, blueprint, the
    3-day plan) already ran by itself; the blueprint is the new part.
- **Proved:**
  - core: typecheck and 228 unit tests pass.
  - `test:db`: every SQL file and all 42 integration tests pass. The pipeline test now takes a client from the
    waiting list to onboarded and checks the board holds 5 pieces, 3 flows and 13 steps, all proposed.
  - web: typecheck, 23 unit tests and 61 e2e tests pass, including the new waiting-list test.
- **Still needed to run live end to end:** decisions 1 and 2 (Paystack and Resend keys).

## 2 Oct 2026 (later): BAME is the first real operating system

- **At the founder's request**, BAME's operating system started on the new 1–3 day plan.
- **Day 1, done:** the sports-agency blueprint, fitted to BAME, was laid onto BAME's board as proposals.
  - It is fitted to BAME's own tools: the roster lives in the staff operating system, commission goes to the capital
    ledger, and enquiries come in through the diagnostic intake.
  - It is fitted to BAME's own teams: Sales, PR, Administration and Finance.
  - It adds an "Athlete outreach to diagnostic" flow for the sales push.
  - The result is 3 tools, 3 flows and 12 steps, each with a written rule. BAME's existing observed board was
    left untouched.
- **Objectives added as drafts, owned by the founder:**
  - "Every enquiry answered within 24 hours" (by 31 Oct). It can't be measured yet: BAME's live snapshot reports how
    many leads arrive, not how fast they're answered.
  - "New leads from events, athletes and opportunities each month" (20 a month), bound to BAME's live lead count.
    The target of 20 is a proposal for the founder to confirm.
- **Day 2:** the founder answers the diagnostic interview.
- **Day 3:** the founder confirms, changes or removes each proposed piece on BAME's board, and activates the objectives.

## 2 Oct 2026: an operating system in 1 to 3 days

- **Read:**
  - Main was green, the worker was live, and the live site was up to date.
  - The company snapshot is still all zeros, with no clients yet.
- **Chosen (rule 3, the product):** yesterday's named next step, which is also the founder's target: "every
  operating system takes 1 to 3 days".
- **Built:** the delivery plan a client gets at onboarding (`src/domain/delivery.ts`).
  - **Small businesses:**
    - day 1: the kick-off (the blueprint is chosen) and the draft operating system on their board;
    - day 2: the diagnostic interview;
    - day 3: the operating system confirmed with the owner and objectives set;
    - day 30: the first monthly review.

    Before this change the board was due by day 12 and the objectives by day 14.
  - **Companies:**
    - day 1: the kick-off;
    - day 3: the draft operating system per department;
    - day 10: the interviews that correct the draft;
    - day 21: the board confirmed;
    - day 30: the proposal.
  - New unit test: every plan puts a draft operating system on the board within 3 days, and a small business's
    operating system is confirmed by day 3.
  - The onboarding slides now say the same thing ("Your operating system in 3 days").
- **Also live since yesterday's run:**
  - PR #25: the demo no longer takes over the main address. A fresh visit to `/` always shows the home page with
    the 3D board.
- **Proved:**
  - core: typecheck and 228 unit tests pass.
  - `test:db`: every SQL file and all 42 integration tests pass.
  - web: typecheck, 23 unit tests and 60 e2e tests pass.
- **Next by the rules:** findings that name their flow and objective. That needs the Claude API key on the
  worker (decision 2b), so until then, the first observed pieces: linking board pieces to the evidence that
  confirms them.

## 1 Oct 2026: operating-system blueprints

- **Read:**
  - Main was green, and the worker was live.
  - The company snapshot is all zeros, with no clients yet.
  - BAME already has three active objectives, each with an owner and a date and measured from its live platform.
    So the roadmap's first gate ("map one real business") was already met; the roadmap said otherwise and is now
    corrected. That unblocked the product.
- **Chosen (rule 3, the product):** "Architecture proposals", first slice. This also serves the founder's
  target that a client's operating system takes 1–3 days, not weeks.
- **Built:**
  - Ten operating-system blueprints in `src/domain/blueprints.ts`: marketing agency, trades, sports agency,
    medical practice, restaurant, real estate, online retail, accounting firm, logistics, and education centre.
    Each has its pieces, 2–3 flows, an owner and a written rule for each step, and suggested objectives.
  - Migration `operating_system_blueprints`: a new *proposed* basis for board pieces, flows and steps.
    - The `apply_blueprint` function lays a blueprint down in one transaction, as the caller and under their
      permissions.
    - It never overwrites what the business stated.
    - A proposal is confirmed forward (proposed → stated → observed) and never goes back.
    - Where a piece came from is frozen.
  - On the board page: "Start from an operating-system blueprint", proposed badges, and Confirm buttons.
  - A public `/systems` page shows each blueprint's outline. It is labelled "blueprints, not client case studies",
    and the written rules stay inside TEBOS.
- **Fixed (root cause found):** the billing integration test that failed intermittently picked "the first
  onboarded opportunity". The maintenance test, added on 30 Sep, onboards one of its own without a billing
  account, and the test files run in no fixed order. On a fresh database with the maintenance test first, the
  old test fails and the new one passes. The billing test now uses the client it onboarded itself.
- **Proved:**
  - core: typecheck and 228 unit tests pass, including the new blueprint tests. Those tests caught 19 steps with no
    written rule, and every one now has a rule.
  - `test:db`: every SQL file passes, including the new `99u_blueprints.sql`, and all 42 integration tests pass,
    three runs in a row.
  - web: typecheck, 23 unit tests and 59 e2e tests pass. Playwright now keeps a trace whenever a test fails, so
    an intermittent failure leaves its cause behind.
- **Next by the rules:** a delivery plan that gets a client's draft operating system ready in 1–3 days (blueprint
  on day 1, confirmed with the owner by day 3), then findings linked to flows.

## 30 Sep 2026 (evening): public submissions throttled

- **Read:**
  - Main was green, and the worker's last deployment succeeded; its only errors were the old container shutting down.
  - The company snapshot is all zeros (no leads, clients or payments yet), and no maintainer items are open.
  - The security advisors flagged four functions that anyone can call without signing in.
- **Chosen (rule 2.2, a security signal):** of those four, `submit_self_check` and the enquiry form had no limit.
  A script could flood them, burying real leads and inflating the objectives that measure leads and self-checks.
  The board would then report fake numbers. The other two (`accept_contract`, `contract_for_token`) are protected
  by single-use tokens, and `staff_invitation_for_token` the same way.
- **Built (migration `public_throttle`):**
  - A website enquiry is limited to 3 an hour per source and 60 an hour in total.
  - A self-check is limited to 5 an hour per source and 300 an hour in total.
  - The source is stored only as a salted SHA-256 hash, never the IP address, and counts are cleared after a day.
  - Leads entered by sales staff and direct database connections are not limited.
  - The limits are mirrored in `src/domain/throttle.ts`, and the parity test checks they match the database.
  - A refused submission shows "Too many submissions from here in the last hour. Please try again later."
- **Proved:**
  - core: typecheck and 214 unit tests pass.
  - `test:db`: all SQL rule files pass, including the new `99t_throttle.sql`, and 42 integration tests pass.
  - web: typecheck, 23 unit tests and 57 e2e tests pass.
- **Two intermittent tests, not caused by this change, still to root-cause:**
  - `pipeline-flow-pg` "bills an onboarded client monthly…" failed once at its first assertion, then passed
    48 repeated runs.
  - The e2e "the self-check scores ten answers…" failed once in a full run, then passed on its own and in the
    next full run.
  - Neither failure left its message behind. Next run: capture the failure output, keeping Playwright traces
    on failure, and fix the cause.
- **Still open:** the advisor's other warnings are by design. The public functions check their own tokens or
  roles, and `self_check_results` has no read policy on purpose. Leaked-password protection is decision 8.

## 30 Sep 2026: loop started

- Built: this loop. It has standing orders (`OPERATOR.md`), this log, and `scripts/local-pg.sh`, so a
  fresh session can run the database tests from nothing.
- Live before this run: the pipeline, the sales team pack, the company board, the company plan, the self-check,
  monthly billing, and the maintainer queue (PR #20). The worker's first maintenance scan of TEBOS ran at
  14:15 UTC and raised nothing, because all of TEBOS's objectives are still drafts (decision 4).
- Next by the rules: the build order in `ROADMAP.md` → "TEBOS on its own board" item 3, marketing and PR drafting
  with approval before publishing.
