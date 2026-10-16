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
7. **History.** Every change to the case and its records, read from the tamper-evident audit trail.
8. **The Property Opportunity Assessment report.** It covers:
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

## Tests

| Suite | What it proves |
|---|---|
| `test/property.test.ts` | Every formula; unknown ≠ zero; double-counting flags; weakest-basis labelling; readiness weighting and staleness; disposition, figure, pathway and gate rules; the report's separation of facts, statements and estimates; parity with the migration |
| `supabase/tests/99zd_property_cases.sql` | On Postgres: numbering; frozen reference; reasons and timestamps; verified figures need checked evidence (from the same case); forecasts are estimates; evidence that verifies a figure can't be unchecked or removed; one recommendation; gate order and conditions; audit history of figure and disposition changes; viewers read only; other organisations see nothing; no deletes |
| `web/e2e/property.spec.ts` | Opening a case from the menu; figures computed only when complete; a refusal shown before anything is sent; readiness; disposition and gate rules in the interface; the report sections; JSON and CSV export; read-only viewers |

## Limitations (not built yet)

- **Documents aren't uploaded:** the evidence register records where a document is kept. Secure upload comes with
  the private vault (founder's priority 5).
- **No AI document analysis.** Any future extraction will be shown as fallible, cite its source and need a person's review.
- **Execution workstreams** (owner, task, deadline, dependency, budget, evidence of completion) and the **outcome
  scorecard** (actual against a dated baseline) are the next step. The outcome gate exists; its measurements don't yet.
- **The monthly subscription view** (what was done this month, figures then and now) builds on these cases next.
- **Prices aren't in the product:** the R2,800 assessment in the dossier is a working price for the founder to confirm.
- Nothing here is a valuation, legal opinion, credit decision or financing approval. South African legal, tax,
  property-practitioner, privacy and financial-services requirements must be confirmed with professionals.
