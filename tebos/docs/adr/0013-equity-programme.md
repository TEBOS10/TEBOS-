# ADR 0013: The equity programme: equity instead of fees, only for businesses that qualify

Date: 2026-11-01 · Status: accepted in principle (founder, 1 Nov 2026). The criteria below and the meaning of "5.1%"
are for the founder to confirm, and nothing is binding until an attorney has drafted the agreement.

## Context

The founder, 1 Nov:
- "if a client doesn't have capital to pay TEBOS will have 5% equity + 5.1% vetting rights to that company/business so
  that we protect ourselves as a company and sure that there's limitations or boundaries";
- "TEBOS [must] have access into seeing the capital that goes into the company by ensuring that any client that a
  business serves is document[ed] via an internal operating system that evaluates and audits the company … but will
  not have access to their bank accounts cause that's not ethical";
- "we don't want people to take advantage of the no capital option so it's crucial for us to be specific about the
  type of business we are assisting, a client would need to qualify."

## Decision

1. **The terms are fixed in the database.** These are 5.00% equity and 5.10% voting rights (`equity_terms` checks
   both), and one package, Small by default.
   - Changing either number is a founder decision and a new migration, not an edit on a screen.
   - **"Vetting rights" is read as voting rights.** That means 5.1% of the votes, held by TEBOS. *Founder to confirm.*
     If it meant a right to vet (approve) certain decisions, the attorney writes it as reserved matters instead, and
     the database keeps only the percentages.
2. **A business must qualify** (`equity_qualification_gaps`, mirrored in `src/domain/equity.ts`). *The criteria are
   proposed, for the founder to confirm:*
   - it is registered, with a CIPC number;
   - it has traded for at least 6 months;
   - it is an eligible kind of business: practices, education, trades, hospitality, retail, property, beauty and
     wellness, creative services, or logistics ("something else" does not qualify);
   - it earns at least R10,000 a month, and the screener writes down what they saw, not the statements themselves;
   - the owner works in it full time;
   - the owner consents to recording every sale in TEBOS.
3. **Nobody can push an application through alone.**
   - The stages are: applied → screening → qualified → approved → agreement signed → active → exited.
   - Every move needs a reason.
   - Only the founder (a platform admin) approves, and never the person who screened it.
   - At most 5 equity partners at once, so the programme can't swallow the team's capacity.
   - Nothing is active until the attorney-drafted agreement is signed, its reference is recorded, and the terms exist.
   - The facts are frozen once screening is done.
4. **TEBOS sees the money coming in, never the bank account.**
   - The partner records each sale, refund and correction in **Sales** (`/sales-register`). Records are never edited
     or deleted; a mistake is fixed with a correction and a reason.
   - The owner closes each month. The database works out the closed month's totals and fixes them; nothing more can
     be added to a closed month.
   - Customer names and numbers are not recorded, only an invoice or receipt number.
   - TEBOS's staff read a business's sales only while it is an active equity partner.
   - `equity_audit` flags overdue closes, months with no sales, heavy corrections, and a sharp drop.
5. **An active partner's package counts as its plan** (`active_plan`). Its website and change requests follow the
   same limits as a paying client of that package. That is the boundary: equity buys a package, not unlimited service.

## What this does not do

- It is not a valuation, a shareholder agreement or an offer. An attorney drafts the agreement (operator log,
  decision 28), covering vesting, exit, dilution, information rights and IP. The pricing page says the programme is
  subject to qualifying, the founder's approval and a signed agreement.
- It does not take payments or touch money; that remains Paystack (decision 1) for paying clients.

## Consequences

- BAME and the client who asked for a website without capital apply at **Pipeline → Equity partners**
  (`/pipeline/equity`) with their real facts. They are not entered on their behalf with invented numbers.
- Tests: `supabase/tests/99zzf_equity_programme.sql`, `test/equity.test.ts`, `test/schema-parity.test.ts`,
  `web/e2e/equity.spec.ts`.
