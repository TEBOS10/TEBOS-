# Tidy Property Operations: competitor analysis

Researched 4 Nov 2026. Every price and feature below comes from the vendor's own page, a user-written review, or a
third-party comparison that names its sources. Where only a competitor's own comparison was available, it is marked as
such and was cross-checked against the vendor's page where possible. "Not published" means the vendor's page did not
show it on that date, not that it does not exist. **Re-check before quoting any of this to a customer.**

## Sources

| # | Source | What it is |
|---|---|---|
| S1 | https://www.payprop.com/za/pricing | PayProp South Africa, vendor pricing page |
| S2 | https://www.mrisoftware.com/za/products/rentbook/ | MRI Rentbook, vendor page with price table |
| S3 | https://www.reos.co.za/ | reOS, vendor home page |
| S4 | https://www.weconnectu.co.za/ and https://softwarefinder.com/property-management-software/weconnectu | WeconnectU vendor page; directory listing |
| S5 | https://lekkelet.co.za/ | LekkeLet, vendor home page |
| S6 | https://rentsorted.co.za/blog/rental-management-software-south-africa (1 Sep 2026) | RentSorted's own comparison (a competitor; it lists its sources) |
| S7 | https://www.reallyo.com/blog/appfolio-vs-buildium-vs-doorloop | Third-party US price comparison citing vendor pages |
| S8 | https://www.capterra.com/p/47428/Buildium-Property-Management-Software/ | Buildium user reviews on Capterra |
| S9 | https://www.trustpilot.com/review/www.payprop.com | PayProp on Trustpilot (2.5 from 5 reviews: too few to generalise) |
| S10 | https://www.saflii.org/za/legis/consol_act/ppa2019300/ | Property Practitioners Act 22 of 2019 |
| S11 | https://www.gov.za/sites/default/files/gcis_document/201409/a50-99.pdf | Rental Housing Act 50 of 1999 |

## South Africa

| Product | Built for | Pricing (ex VAT, as published) | Holds money? | Notable | Limits seen (from sources) |
|---|---|---|---|---|---|
| **PayProp** (S1) | Letting agencies processing rent for landlords | Service fee "less than 1.25%" of processing volume; licence R433.63/month; application fee R3 245–R12 257 by portfolio size | Yes: Absa trust accounts | Real-time bank integration and reconciliation; same-day landlord payouts; maintenance ticketing; unlimited users; uneditable audit log; MFA; Xero via a partner; API | Priced for agencies holding trust money; a self-managing landlord pays for a trust account they don't need (S6) |
| **WeconnectU** (S4) | Rental agencies, sectional title and HOA managers | Not published (custom quote) | Trust reconciliation with live bank integration (S6) | Lease dates and escalations, arrears escalation, tenant vetting, inspections and maintenance via the RedRabbit app, compliance dashboard | Pricing behind a demo; directory notes "limited integration" (S4) |
| **reOS** (S3) | South African rental agencies | Not published (demo) | Yes: bank-integrated collection and instant outgoing EFTs | Automatic allocation of incoming funds; invoicing; deposit management; partners: TPN, Lightstone, Property Inspect, Prop Data | Agency-focused; price not public |
| **MRI Rentbook** (S2) | Independent landlords and small letting agencies | Free for 1–20 active leases; then per lease per month: R7.50 (21–50), R6.00 (51–100), R5.50 (101–250), R4.50 (251–300), R4.00 (301+) | No | Branded invoices by email and SMS, automated reminders, expenses and supplier bills, income and arrears view, built-in TPN credit screening, SA support | Its page does not list maintenance, deposits, inspections, lease signing or metered utilities (S6, cross-checked against S2) |
| **LekkeLet** (S5) | Self-managing landlords | Free for 1–20 units (per S6); its site says prices change from 1 Jan 2027 and the free tier ends | No | Rent tracking and reminders, maintenance with photos, financial reports, tenant messaging, deposit tracking (S6) | Credit checks not included; metered utility billing not listed (S6) |
| **RentSorted** (S6, its own page) | Self-managing landlords, 2–50 units | First unit free, then R150/unit/month | No | Metered utility billing, white-label documents, e-signed leases, deposit ledger with interest, maintenance with recharge | No import tool (its own statement) |
| **MRI Property Central** (S6) | Agencies and property companies with accounting staff | Not published | Varies | Full accounting, lease admin, maintenance workflow, TPN integration, BI | Enterprise; wrong shelf for small landlords |
| **Spreadsheet + WhatsApp** | One or two units | Free | No | Familiar | Manual arithmetic, no audit trail, disputes are hard to prove (S6) |
| **A letting agent** | Owners who want no tenant contact | Commonly 8–10% of rent plus placement fee (industry press, per S6) | Yes | Someone else does the work | Owner still reviews statements; records belong to the agent |

## International (reference only: not sold for South African practice)

| Product | Pricing (USD, per S7, which cites vendor pages) | User complaints (sources) |
|---|---|---|
| **Buildium** | Essential $62/month to 20 units, $80 to 40; Growth $192 to 50 units, $252 to 100; Premium $400 to 150 | Capterra users: "The customer support system is terrible"; "the accounting side is not line by line"; banking setup confusing with reconciliation and delayed transfers; "security deposit handling, prepaid rent, and rent changes clunky" (S8) |
| **AppFolio** | Core $1.49/unit with a 50-unit minimum; reported minimum spend about $280–$298/month; Plus and Max higher (S7) | Pricing not fully published; minimums make it unsuitable for small portfolios (S7) |
| **DoorLoop** | One $2.50/unit billed yearly with a $199 minimum; $3.00 monthly with a $239 minimum (S7) | Monthly minimum covers up to 80 units; payment fees sit on top (S7) |

## What the market leaves unsolved (from the sources above, not assumed)

1. **The two-shelf problem.** Agency products assume a trust account and are priced by quote or by volume (S1, S3, S4).
   Landlord products are free or cheap but stop at bookkeeping (S2, S5). A small property manager or a landlord with
   10–60 units falls between them.
2. **Corrections and deposits are where trust breaks.** Even a mature product's users call deposit handling, prepaid
   rent and rent changes "clunky", and accounting "not line by line" (S8). Disputes at the rental tribunal turn on
   provable records (S6).
3. **Deposit law is specific and easy to get wrong.** The Rental Housing Act requires the deposit in an interest-bearing
   account, interest to the tenant, proof of interest on request, a joint inspection, and the balance refunded within 14
   days of the dwelling being restored (S11). Few landlord tools say they track this (S6).
4. **Expected, actual and estimated are blurred.** Dashboards show "income" without saying whether it was billed,
   received or projected. No source above showed a product that labels each figure's basis.
5. **Holding money brings regulation.** Anyone who collects rent for another person is a property practitioner who
   needs a Fidelity Fund certificate and a trust account (S10, s1 and s54). Software that only records payments avoids
   this, for itself and for a landlord collecting their own rent.

## How Tidy Property Operations differs (strategy, not copying)

- **Record and reconcile, never hold money.** No trust account, no regulatory exposure for the platform; works
  alongside whatever bank the landlord already uses. Bank integration comes later, as an import, not custody.
- **A ledger that can be defended.** Append-only; every correction is a reversal with a reason and a person; payments
  are allocated oldest charge first by a published rule, so a statement can always be re-derived.
- **Deposits treated as the law treats them.** Held separately from rent, never counted as income; where it is held,
  the interest and the refund deadline are tracked (refund deadline: Release 2).
- **Every figure says what it is.** Expected (from leases), billed (charges), received (payments), estimated (market
  rent of vacant units). Never mixed.
- **Built for the middle shelf.** Small property managers and landlords with several buildings: multiple properties,
  team roles, an approver for maintenance spend, owner-ready monthly reports.
- **Connected to Property Revenue Architecture.** Operating data (vacancy, arrears, maintenance spend) is exactly the
  evidence PRA's assessments need. That link is the long-term moat; it is not built in Release 1.

## Pricing position (hypothesis only: see PRODUCT-VISION.md)

The market's published reference points are free-to-20 (Rentbook, LekkeLet until 2027), R4–R7.50 per lease (Rentbook),
R150 per unit (RentSorted) and percentage-of-volume for trust products (PayProp). No price is set for Tidy Property
Operations until it has been tested with landlords; pilot accounts are manual and free of charge by default.
