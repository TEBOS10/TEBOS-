# Property Revenue Architecture (Tidy Enterprise)

The case workspace for Tidy Enterprise's Property Revenue Architecture practice. It is built from the founder's
dossier (the business specification), the HTML prototype (the visual reference) and the build brief, all dated
16 October 2026. TEBOS is the enabling layer: the property business stands on its own service, and this
workspace supports it.

## What it does

The first milestone is a reliable single-case workflow, from intake to a decision-ready assessment report:

1. **Intake.** Open a case (PA-001, PA-002, …, numbered by the database). Record:
   - the property type, problem and owner objective;
   - the suspected cause (marked as unverified);
   - the owner's authority, and how it was confirmed;
   - constraints and the definition of success.
2. **Disposition.** PROCEED, NURTURE, HOLD–OPTIMISE, DO NOTHING or REJECT.
   - Every disposition carries its reason, and a change needs a new reason.
   - Each change is timestamped and kept in the history.
   - PROCEED needs the owner's authority confirmed.
3. **Evidence room.** The twelve material items from the dossier, plus anything else (title deed, mandate, quotes).
   - Each item records its source, period, received date, responsible person, status, confidence, document
     reference, reconciliation notes and follow-up.
   - Status is one of missing, requested, received, checked or conflicting.
   - **Readiness is weighted by materiality and quality**, not by ticked boxes:
     - an item checked and current counts fully;
     - an item received, or checked but older than six months, counts half;
     - the rest count nothing.
   - Stale and conflicting items are flagged.
4. **Economics.** Each figure is entered monthly in rand and labelled **verified**, **owner-reported** or
   **estimated**.
   - A verified figure names evidence from the same case that was checked.
   - Forecasts (net benefit, implementation cost, downside impact) are always estimates.
   - **Unknown is not zero:** a figure not supplied has no value, and anything that needs it says
     "Not established" and names what is missing.
   - **Losses are counted once.** Vacancy loss and the collection shortfall are separate inputs. A rent roll that
     doesn't reconcile (scheduled rent − vacancy ≠ rent due) is flagged, never silently netted.
   - Indicators:
     - effective income, collection shortfall, NOI and cash flow after debt and reserve (monthly or annual);
     - collection rate, occupancy, operating expense ratio and break-even occupancy;
     - base, optimisation and downside scenarios, payback, and one-off capital need (kept out of monthly cash flow).
   - Each result is labelled by its weakest input.
5. **Pathways.** The seven routes of the routing matrix, each with:
   - rationale and why it is preferred over the alternatives;
   - the evidence it rests on;
   - cost, timeline, risks, downside, disqualifiers and specialist dependencies;
   - the decision owner, and what would change it.

   At most one pathway is recommended, and only with all of that filled in.
6. **Execution gates.** Evidence sufficiency → root cause → feasibility → authorisation → outcome verification.
   - Gates pass in order, each with an owner and the evidence for passing.
   - The evidence gate needs the owner's authority confirmed and no conflicting evidence.
   - A gate can't reopen while a later one stands passed.
7. **Execution workstreams.** Each workstream records:
   - a task, its accountable owner, a deadline and a status (planned, in progress, blocked, done, cancelled);
   - the workstream it depends on;
   - a budget, with its approval (who approved it, and when);
   - the evidence of completion.

   The rules:
   - a workstream starts only once what it depends on is done, and dependency cycles are refused;
   - a budget is spent only once it is approved;
   - done needs the evidence of completion and a date;
   - blocked says why.

   Exceptions are raised for anything overdue, blocked or awaiting budget approval.
8. **Outcome scorecard.**
   - **The baseline is captured by the database:** it copies the case's figures as they stand, so a baseline can't
     be typed in, and it is frozen afterwards. Only the target cash flow and its note can be revised.
   - **Outcome reviews** are dated between the baseline and today. They record actuals, measured or stated by the
     owner, never estimated; a verified actual rests on checked evidence.
   - **The scorecard compares each review with the baseline:**
     - cash flow, and the change against the baseline: the realised monthly net benefit;
     - the variance against the target;
     - collection rate and occupancy (percentage points), NOI and arrears;
     - spend on the plan so far.
   - It flags results below the baseline or the target, growing arrears, a review that can't be compared, and an
     overdue next review.
   - **The outcome gate** passes only with a baseline and a review of actual results.
9. **History.** Every change to the case and its records, read from the tamper-evident audit trail.
10. **The Property Opportunity Assessment report.** It covers:
   - executive assessment;
   - verified facts, owner-reported statements and estimates, each in its own section;
   - unknowns and source quality;
   - baseline economics with formulas, root-cause hypotheses and scenarios;
   - pathway comparison and recommendation;
   - risks, specialists, gates and next actions.

   Each report carries the case ID, report date, version (the case's last change) and confidentiality language.
   Export it as PDF (browser print), as structured JSON (`tidy-enterprise.property-case/v1`), or as CSV (the
   evidence register and the figures, protected against formula injection).

## Where it is

- **In the app:** Menu → **Property cases**, shown to TEBOS's admins. Work in the **Tidy Enterprise** organisation:
  the organisation switcher at the bottom of the menu.
- **Who can do what:** members of an organisation read its cases; admins and operators work them; no one deletes a case.

## Architecture

| Layer | Where |
|---|---|
| Rules and calculations (pure, tested) | `src/domain/property.ts`: economics, readiness, disposition, figure, pathway and gate checks, the report composer |
| Database (the system of record) | Migration `20261016150000_property_cases.sql`: tables, checks, guards, row-level security, audit triggers |
| Interface | `web/src/pages/PropertyPage.tsx` (cases and workspace), `web/src/pages/PropertyReportPage.tsx` (report and exports), `web/src/lib/property.ts` (row → domain) |

The interface pre-checks each rule so it can explain a refusal before sending anything. The database enforces the
same rules, so they hold however the data arrives. `test/property.test.ts` checks that the two lists agree.

### Data model

| Table | Holds |
|---|---|
| `property_cases` | Reference, label, type, problem, objective, suspected cause, authority, constraints, success definition, disposition with reason and time |
| `property_evidence` | One row per evidence item: category, kind, title, source, period, received date, responsible, status, confidence, document reference, notes, follow-up |
| `property_figures` | One row per supplied figure (no row means unknown): value, basis, linked evidence, as-of date |
| `property_pathways` | One row per assessed pathway, with everything a recommendation must explain |
| `property_gates` | One row per gate touched: status, owner, evidence note |
| `property_workstreams` | Task, owner, deadline, status, dependency, budget and approval, evidence of completion |
| `property_baselines` | One per case: the figures copied when captured (frozen), the target cash flow |
| `property_outcome_reviews` / `property_outcome_values` | Dated reviews and their actuals, each verified or owner-reported |

## Tests

| Suite | What it proves |
|---|---|
| `test/property.test.ts` | Every formula; unknown ≠ zero; double-counting flags; weakest-basis labelling; readiness weighting and staleness; disposition, figure, pathway and gate rules; the report's separation of facts, statements and estimates; parity with the migration |
| `supabase/tests/99zd_property_cases.sql` | On Postgres: numbering; frozen reference; reasons and timestamps; verified figures need checked evidence (from the same case); forecasts are estimates; evidence that verifies a figure can't be unchecked or removed; one recommendation; gate order and conditions; audit history of figure and disposition changes; viewers read only; other organisations see nothing; no deletes |
| `supabase/tests/99ze_property_execution.sql` | On Postgres: dependency order and no cycles; budgets approved before spending; done with evidence; the baseline copied from stored figures, whatever is sent, and frozen; reviews dated between the baseline and today; actuals never estimated; the outcome gate needs a baseline and actuals |
| `web/e2e/property.spec.ts` | Opening a case from the menu; figures computed only when complete; a refusal shown before anything is sent; readiness; disposition and gate rules in the interface; the report sections; JSON and CSV export; read-only viewers; workstream rules and exceptions; capturing a baseline sends only the target; the scorecard's changes and flags |

## Limitations (not built yet)

- **Documents aren't uploaded:** the evidence register records where a document is kept. Secure upload comes with
  the private vault (founder's priority 5).
- **No AI document analysis.** Any future extraction will be shown as fallible, cite its source and need a person's review.
- **The monthly update** (`/property/:id/month/:month`, built 19 Oct) is the subscription's monthly page:
  - the decided plan, from the number of rentable units (`PRA_PLANS`, `planForUnits`);
  - work finished that month, with its evidence;
  - what is next, and what needs attention;
  - the latest outcome review against the frozen baseline.

  It is computed by `monthlyUpdate` in `src/domain/property.ts`, from recorded work and reviews only. Nothing on it is
  estimated, and an unmeasured month says so.
- **Prices aren't in the product:** the R2,800 assessment in the dossier is a working price for the founder to confirm.
- Nothing here is a valuation, legal opinion, credit decision or financing approval. South African legal, tax,
  property-practitioner, privacy and financial-services requirements must be confirmed with professionals.
