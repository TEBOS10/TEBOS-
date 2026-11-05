# Tidy Property Operations: product vision

Status: founder's master build directive, 4 Nov 2026. Owner: the founder (CEO and product owner).

## Where it sits

| Part of the ecosystem | Role |
|---|---|
| Tidy Enterprise | The holding and business structure, and the public property brand |
| Property Revenue Architecture (PRA) | The method: diagnose a property, test whether improving it pays, plan, execute, optimise |
| TEBOS | Business operating systems and the shared software infrastructure (database, security, audit, hosting) |
| **Tidy Property Operations** | **A property-management SaaS product, distributed through TEBOS** |
| REEDS | The founder's decision support and coordination |

Tidy Property Operations is a separate product from the PRA platform. PRA answers "what is holding this property back,
and what should we do?". Property Operations answers "what is happening in this property every month: who lives where,
who has paid, who owes, what is broken and what it cost". Over time, Property Operations becomes PRA's source of
verified evidence. They share infrastructure and never share a customer's data without that customer's say.

## The problem

From the competitor research (COMPETITOR-ANALYSIS.md):
- Small property managers and landlords with several buildings fall between agency software (holds trust money, priced
  by quote or by percentage) and landlord bookkeeping apps (free, but stop at invoices).
- Corrections, deposits and rent changes are where records stop being trusted.
- Dashboards mix expected, billed, received and estimated figures.
- South African deposit law is specific, and spreadsheets don't enforce it.

These problems are expensive and recurring: arrears that are noticed late, deposits disputed at the tribunal,
maintenance spent without approval, and month-ends that take days.

## The customer (first)

1. **Independent landlords with 5 to 60 units**, often across two or more buildings, managing themselves.
2. **Small property managers** looking after several owners' portfolios, who do **not** collect rent into a trust
   account (or who do, and only need the operational record beside it).

Not first: large agencies with trust accounting (well served by PayProp, WeconnectU, reOS), and sectional-title schemes.

## The promise

"Know what every property earned, what it is owed and what it cost this month, with records you can defend."

## Principles

1. **Record and reconcile, never hold money.** The platform never receives, holds or transfers rent.
2. **Every figure says what it is.** Expected, billed, received, estimated: labelled, never blended.
3. **Nothing is silently edited.** Money records are append-only; a correction is a reversal with a reason.
4. **Occupancy and metrics are derived, never typed.** A unit is occupied because a lease says so.
5. **Approval before spend.** Maintenance quotes are approved by someone with authority before work starts.
6. **The founder is CEO, not clerk.** Exceptions surface themselves; routine work is a button, not a phone call.
7. **No AI on money or on people's decisions.** Automation may draft and flag; a person decides.
8. **Privacy by design.** Collect the least tenant information that does the job (POPIA).

## Commercial model (hypothesis, not a price list)

- Subscription per organisation, sized by units, with user and unit limits and feature entitlements in the database.
- **No price is set until it is tested with landlords.** Reference points from the market: free up to 20 leases
  (MRI Rentbook), R4.00–R7.50 per lease above that (Rentbook), R150 per unit (RentSorted), and agency products priced
  by quote or a percentage of rent processed.
- First, manual **pilot accounts**, free by default, set up by Tidy. Automated billing comes after the price is proven.
- Hypotheses to test with 5–10 pilot landlords (see IMPLEMENTATION-ROADMAP.md, Release 5):
  - H1: landlords with 10+ units will pay a fixed monthly fee for owner-ready reports and arrears control.
  - H2: per-unit pricing reads as fairer than tiers to landlords below 30 units.
  - H3: maintenance approval and deposit compliance are worth more to property managers than to landlords.

## What success looks like (Release 1 → Release 5)

- Release 1: one real property operation (Tidy Enterprise's own, or a pilot landlord) runs a full month in it, and its
  month-end report matches the bank statement.
- Release 3: a pilot customer uses it weekly without the founder's help.
- Release 5: three paying customers at a tested price.

## Out of scope

The athlete and entrepreneur venture-studio concept is a **separate business line** with its own feasibility
assessment (`docs/venture-studio/FEASIBILITY.md`). It is not part of this product.
