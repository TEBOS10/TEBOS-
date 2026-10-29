# Property Revenue Architect Platform: audit, gap analysis and Release 1 plan (29 Oct 2026)

The answer to the founder's build directive, §12 ("Required response before implementation"). Status words follow
the directive's §11: **proposed**, **designed**, **implemented**, **tested**, **deployed**, **validated**. Nothing
here is validated: no landlord has used any of it yet (`product-register.md`: 0 property cases in the live database).

## 1. Audit: what already exists

**One codebase, one database.**
- **Database:** Postgres on Supabase (`tebos-core`, free plan, no automatic backups).
- **Core:** TypeScript rules in `tebos/src/domain`, mirrored from the migrations and kept in step by
  `test/schema-parity.test.ts`.
- **Two interfaces from one web codebase:**
  - **TEBOS**, the client app (tebos-demo), for client organisations;
  - **TEPOS**, the founder's private app (tebos-web), for private organisations, behind two-step sign-in.
- **Worker:** on Railway, every 15 minutes.
- **Isolation:** every row carries `org_id`, and row-level security lets only that organisation's members read it.
  Roles are `org_admin`, `operator` and `viewer`.
- **Audit trail:** every insert, update and delete is written to a hash-chained trail. On 29 Oct all 12 chains were
  intact.

**The property case workspace** (built 16–19 Oct for the founder's PRA firm; runs in TEPOS under Tidy Enterprise):

| Capability | Where | Status |
|---|---|---|
| Property intake: type, main problem, objective, suspected cause (marked unverified), owner's authority, constraints, desired outcome | `property_cases` | Implemented, tested |
| Evidence register: source, period, date received, who is responsible, status (missing, requested, received, checked or conflicting), confidence, where the document is kept | `property_evidence` | Implemented, tested |
| Readiness weighted by materiality and quality; stale and conflicting items flagged | `src/domain/property.ts` | Implemented, tested |
| Figures labelled verified, owner-reported or estimated. Unknown is not zero, losses are counted once, and each result is labelled by its weakest input | `property_figures`, `economics()` | Implemented, tested |
| Seven compared pathways, including "do nothing"; at most one recommended, and only with its reasons | `property_pathways` | Implemented, tested |
| Five execution gates, in order | `property_gates` | Implemented, tested |
| Work items (called workstreams in the schema): owner, deadline, dependency (no cycles), budget approval before spending, done needs evidence, blocked needs a reason | `property_workstreams` | Implemented, tested |
| Frozen baseline, dated outcome reviews (actual figures, never estimates), scorecard | `property_baselines`, `property_outcome_*` | Implemented, tested |
| History from the audit trail | `PropertyPage` → History | Implemented, tested |
| Report; export as PDF (print), JSON and CSV | `PropertyReportPage`, `caseExport` | Implemented, tested |
| Monthly update page | `PropertyMonthPage` | Implemented, tested |

**Also reusable:**
- sign-up, and creating an organisation (`create_organisation`);
- invitations and roles (Team page);
- the private document vault (TEPOS only, two-step);
- `looks_personal`, which refuses emails, phone numbers and ID numbers in free text;
- the state-machine table with its guard trigger.

**Not in the repository:**
- the Walter Sisulu educational material, and any record of its project status;
- the "Formal Strategy Library v1.0" (ADR 0009);
- any provider or specialist register beyond the pathway's specialist types.

## 2. Gap analysis against the directive

| Directive | Exists | Gap |
|---|---|---|
| §3 A Discover | Intake fields | A property's area and current use; an owner-facing intake (today only the founder's staff open cases, in TEPOS) |
| §3 B Assess | Evidence, figures, readiness | Evidence isn't linked to a specific problem. **Bank and statement imports and matching:** Release 2 |
| §2 Problem register | One fixed "main problem" per case | **A register of problems**, each with: context, what is experienced, consequence, current workaround, proposed intervention, specialist type, expected result and how it will be measured |
| §3 C Strategise: each action has a reason, owner, deadline, dependency, required documents, cost, completion criterion, status, evidence | Owner, deadline, dependency, budget, status, completion evidence (text) | A **reason**, a **completion criterion**, a **link to the problem**, and a **link to the evidence that proves completion** |
| §3 D Execute | Work items, approvals, history | — (Release 1 sends nothing externally) |
| §3 E Optimise | Baseline, reviews, scorecard | Shown on the owner's journey |
| §4.1 Command centre and portfolio | The founder's case pages in TEPOS | **An owner-facing command centre and portfolio view in the TEBOS app** |
| §4.8 Milestones, next action with explanation, repeated blockers | Exceptions for overdue, blocked and unapproved items | **Journey stage, milestones derived from records, and next actions that explain their trigger, evidence, uncertainty and next step** |
| §10 Export own records | Case JSON | Problems included in the export |
| §4.2–4.7, 4.9, 4.10, §5 billing | — | Releases 2–5 (§7 below) |

## 3. Release 1 architecture and data model

**Decision: reuse, don't fork.** The landlord's workspace is the existing property case, in the landlord's own
organisation in the **TEBOS app**. Neither the founder's private TEPOS app nor its data is reused for customers.

- Same tables, same rules.
- Isolation by `org_id`, as today.
- The founder's PRA cases stay in Tidy Enterprise (TEPOS). A customer's records stay in the customer's organisation.
- This is ADR 0005's rule: TEBOS gets the functionality, never the private records.

**The additive migration** `20261029090000_property_journey.sql`:

| Change | Rule enforced by the database |
|---|---|
| `property_cases.area`, `current_use` | Optional; empty means not recorded, never assumed |
| New `property_problems` table | Fields listed under "Problem register" in §2. No emails, phone numbers or ID numbers in its text until the POPIA review. Its status follows the state machine `property_problem`: open → investigating → planned → resolved / not resolved / parked, and resolved or not resolved can reopen, so the journey has no artificial end. **Resolved needs a written result, a completed action on the problem, and checked evidence on the problem.** Not resolved and parked need their reason |
| `property_evidence.problem_id` | The problem must be in the same case |
| `property_workstreams.problem_id`, `reason`, `done_when`, `completion_evidence_id` | An action for a problem must give its reason and its completion criterion. Its proof must be evidence from the same case that was received or checked |

**Computed, never stored** (`src/domain/journey.ts`):
- **Journey stage, per problem and per property:**
  - Discover → Assess → Strategise → Execute → Optimise;
  - each stage says what moves it on;
  - with no open problems, the property is in Optimise (review cycle).
- **Milestones:**
  - each is dated from the record that proves it;
  - nothing is scored, and nothing is reached without its record.
- **Next actions:**
  - rules only, no AI;
  - each gives its trigger, the evidence it rests on, what is uncertain and the next step;
  - repeated blocking is investigated before the next step;
  - it never proposes redevelopment, rezoning or refinancing because routine work is late.

**Interface** (TEBOS app, menu → Properties):
- **Portfolio:** each property's stage, open problems and overdue actions.
- **New property:** intake, where unknown answers stay unknown.
- **The command centre for one property:**
  - where it stands;
  - what needs attention, and why;
  - problems, each with its evidence status (verified, received, missing, conflicting);
  - actions;
  - journey and milestones;
  - history;
  - export.

## 4. Implementation plan and acceptance tests (directive §10)

| # | Acceptance criterion | Test |
|---|---|---|
| 1 | Create and open a property workspace | e2e: Properties → New property → command centre |
| 2 | Record an operational or financial problem | e2e: add a problem. SQL: personal data refused |
| 3 | Attach or reference evidence | e2e: add evidence to the problem, with source and where it's kept |
| 4 | See what is verified, missing or uncertain | unit: `problemEvidence`. e2e: the badges |
| 5 | Receive a justified next action | unit: each rule's trigger, evidence and uncertainty. e2e: "Needs attention" |
| 6 | Assign responsibility and a deadline | e2e: action form. SQL: reason and completion criterion required |
| 7 | Record a completed action with evidence | SQL: done needs proof, and the proof must be from the same case and received. e2e |
| 8 | Journey and milestones update correctly | unit: `journey()`. e2e: the stage moves to Optimise once the problem is resolved |
| 9 | Review the history | e2e: the history list |
| 10 | Export own records | e2e: the JSON download contains the problems |
| 11 | Access only what the role allows | SQL: another organisation sees nothing; a viewer can't write. e2e: a viewer sees no forms |

Also covered: error states (refusals shown before anything is sent), incomplete information, mobile layout (e2e at
phone width), and persistence (SQL).

## 5. Dependencies, costs, security concerns and missing decisions

1. **ADR 0009 said "nothing new is built in Phase 1 or 2".** The directive changes that, and ADR 0010 records the
   change. The risk stays: this is built before a paid case.
2. **Backups.** Real landlord records shouldn't sit on the free plan, which has no automatic backups. Supabase Pro is
   USD 25 a month (`pilot-budget-12m.md` item 1). **Founder (money), before the first real landlord.**
3. **POPIA.** Release 1 deliberately keeps tenant personal details out: the database refuses emails, phone numbers
   and ID numbers in problem text. Tenant records (Release 2) wait on the POPIA review in the legal quote request.
4. **Pricing.** R79 and R199 are test prices, and no billing is built (directive §5). They differ from the PRA monthly
   plans (R750 / R1,950 / R3,950), which are a firm's service, not software. **Founder decision before Release 5.**
5. **Documents.** Release 1 references where a document is kept and doesn't upload it. Secure customer upload
   (storage with per-organisation policies) is Release 2.
6. **Walter Sisulu material (Release 4).** Share where it is. Nothing is reused until permission and source are
   recorded.
7. **Merging.** The migration changes the database, so it needs the founder's "merge it", as before.

## 6. Exists versus must be built (one line each)

- **Exists:** sign-up, organisations, roles, isolation, audit, intake, evidence, figures, work items, gates,
  baseline, outcomes, history, report, export.
- **Must be built for Release 1:** the problem register, the evidence and action links, journey, milestones, next
  actions, and the owner-facing pages in TEBOS.

## 7. Later releases (proposed only)

| Release | Content | Waits on |
|---|---|---|
| 2 | Financial records and reconciliation, document upload, tenant and maintenance registers, reminders | POPIA review, backups |
| 3 | Specialist categories, provider verification (verified credentials kept apart from claims), quote comparison, engagement tracking | Disclosure terms for referral arrangements (legal) |
| 4 | Lessons linked to problems, repeated-blocker detection across cycles, AI analysis with human review | Source permissions; Anthropic credit |
| 5 | Subscriptions and entitlement (records never deleted, export always available), billing, portfolio reporting | Pricing decision, Paystack (decision 1) |
