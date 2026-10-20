# ADR 0009: The Property Revenue Architect firm comes first, on a confirmed legal footing

Date: 2026-10-20 · Status: accepted (founder, 20 Oct 2026, from "Tidy Property Revenue Architect: Operating Blueprint
v1")

Builds on ADR 0006 (earn first), ADR 0007 (durable value) and ADR 0008 (no custom projects). The blueprint agrees with
all three. This ADR records what it adds, what it changes, and what was checked.

## The decision

Build the Property Revenue Architect (PRA) firm first. Real cases prove the approach; REEDS, TEPOS and TEBOS serve the
firm, and never compete with it for time or money.

The order is:

1. compliance;
2. customer validation;
3. a paid case;
4. a measured outcome;
5. repeatable delivery;
6. selective automation;
7. scale.

## Who does what

| Part | Its job | What it must not become |
|---|---|---|
| The PRA firm | Win the right clients; diagnose, compare options, assemble specialists, coordinate the agreed route | A broad advisory promise without defined deliverables |
| The founder | Trust, discovery, judgement, approving recommendations | The person remembering every deadline |
| REEDS | Prioritise, coordinate, monitor, escalate | An unsupervised agent making binding commitments |
| TEPOS | The founder's own priorities, time, money, training and commitments | Another dashboard that needs constant upkeep |
| TEBOS | Standardise and automate the work that repeats | A large build before demand is proven |
| The agency and specialists | Regulated transaction work and specialist expertise, within their actual appointments | Names on a list who haven't agreed to take part |

**This fits the current architecture.** No migration is needed:
- ADR 0005 already defines TEPOS as the founder's own operating environment;
- the PRA case workspace already runs there, under Tidy Enterprise, as the firm's case register;
- TEBOS receives the functionality once it is proven (ADR 0005), never the data.

## The legal footing (checked 20 Oct against PPRA sources)

| Claim in the blueprint | What was found |
|---|---|
| A person acting as a property practitioner needs their own Fidelity Fund Certificate (section 48); a principal's FFC doesn't cover the founder's regulated work | Consistent with the Act and with the PPRA's candidate registration process. **Not to be assumed otherwise** |
| An alternative competency-based pathway, effective 1 August 2026 | **Confirmed** on theppra.org.za. It needs Matric, a PPRA examination with the same content as PDE 4, and six prescribed practical modules, and it leads to registration as a non-principal practitioner. The existing qualification routes remain. It isn't a fast licence. The PPRA said the first sittings would be "announced in due course" |
| A PDE exam on 12 November 2026; registrations close 30 October. *Correction, 20 Oct: the PPRA's eligibility page requires a valid FFC and NQF 4 before PDE, and the new pathway needs a matric. The founder has no matric, so the route is the candidate route (`pra-compliance-checklist.md`)* | **Reported** by industry sources citing the PPRA calendar: enrolment runs 1–30 October on the MyPPRA portal, and no late entries are accepted. One post says 31 October, so take the earlier date. Whether this sitting suits the founder's route is for the PPRA to confirm |
| A PPRA notice of 22 September 2026 on "powered by" and "in partnership with" | **Confirmed:** "Communique – Clarifying the use of powered by", 22/09/2026, on the PPRA news page. A practitioner may not market themselves as trading through a separate firm that isn't registered |
| A June 2026 report on a court application against the PPRA | Not checked. It isn't relied on. No provider's promise of a quick FFC is accepted without the PPRA confirming the route |

**Consequences:**
- **Don't present Tidy as a registered firm.** Until the position is confirmed in writing, Tidy isn't presented as a
  registered property-practitioner firm or brand, and no regulated work happens outside the founder's authorised
  arrangement.
- **The fee needs an answer before money is taken.** Whether the PRA fee itself (the assessment or the monthly plan) is
  permitted, how it is disclosed, and who invoices: this is decision 10b, unchanged and still blocking the first
  invoice.
- **The questions for the principals and the PPRA** are in `pra-compliance-checklist.md`.

## What changes

1. **The first offer is the assessment; the monthly plan follows it.**
   - The blueprint's "Property Income & Options Assessment" is the PRA assessment that already exists
     (`src/domain/property.ts`). It covers:
     - the evidence-labelled baseline;
     - seven compared pathways, including "do nothing";
     - the specialists each pathway needs;
     - a recommendation, or a reasoned decision not to proceed.
   - The monthly plan (R750 / R1,950 / R3,950) continues for owners whose decision is to hold and optimise.
   - **The assessment's price is the founder's decision** (decision 26). Its scope is fixed here: one property, the
     evidence the owner can provide, and a written comparison with a next step.
2. **Discovery before offers.** The founding-offer message is split:
   - **version A, send now:** asks to hear about the owner's property, with no price and no firm named;
   - **version B, the priced offer:** sent only once decision 10b is answered.
3. **New dates replace the 30-day objective in ADR 0006.** Funding arrives in the first week of December 2026.

| Phase | Dates | Outcome | Evidence that it's reached |
|---|---|---|---|
| 1. Foundations | 20–31 Oct | A known, compliant route, and an offer that can be explained | Registration route confirmed by the PPRA; the agency arrangement in writing (decision 25) |
| 2. Demand | 1–30 Nov | A pipeline and a repeatable delivery process | 10 substantive owner conversations recorded; one scoped assessment proposal to a qualified prospect; one worked, anonymised example |
| 3. Funding | 1st week of Dec | Only the essentials funded: registration and training, minimum legal review, the tools for enquiries and delivery, a small measured acquisition test | Spending recorded against actual quotes |
| 4. Validation | 1 Dec 2026 – 28 Feb 2027 | One paid case with a documented outcome; one to three pilots is a plan, not a forecast | A payment, a measured result, and a reason to return or refer |

   ADR 0008's trigger ("no paying client by day 60 means re-examine the offer") now reads: **no paid case by
   28 February 2027 means re-examine the offer.**
4. **Two revenue paths, kept apart.**
   - **Path A:** the assessment and coordination fee. It is charged by the firm under written terms, once decision 10b
     allows.
   - **Path B:** transaction commission. It is earned only through the appointed agency, under the founder's own
     registration and a written split.
   - TEBOS and Tidy never take a percentage of a deal (ADR 0008 stands).
   - A referral partner (Wealth Assist, Real Estate Assist, Pelser, the principals) counts as a channel only once its
     role and terms are agreed in writing.

## REEDS's mandate, against what exists

| Workstream | What REEDS tracks | Built today | Gap, built only when a case needs it |
|---|---|---|---|
| Licensing and compliance | Registration status, documents, deadlines, signed agreements, marketing approvals | The decisions list; the agent office's FFC path (planned) | A compliance item with a due date in REEDS |
| Sales pipeline | Prospect, problem, source, next action, follow-up date, proposal status | Opportunities and enquiries; the demand signal | Recording a conversation's problem and objection |
| Case delivery | Evidence gaps, specialist input, report status, client decision, milestones | The PRA case: evidence, gates, workstreams, monthly update; the delivery signal | — |
| Cash flow | Cash, planned outflows, collections, contingent commission | Money records (TEPOS resilience); the cash signal | Contingent income kept apart from collected income |
| Performance | Qualified leads, paid work, delivery time, revenue, direct cost, outcomes | The outcome scorecard; the live counts | Delivery time and direct cost per case |
| Technology and process | Repeated manual work, failures, data quality | The daily run; the reliability signal | — |

**Permissions are unchanged** (OPERATOR.md and the REEDS rules):
- routine work runs freely;
- client-ready reports, prices, data sharing and partner introductions are reviewed first;
- signing, commission splits, binding promises, transaction instructions, financing views, spending and regulated work
  need the founder or the authorised professional.

**The rhythm.**
- The daily run and the weekly signal brief already exist. The weekly brief's scorecard adds:
  - qualified conversations;
  - paid assessments and mandates;
  - fees collected;
  - delivery time and direct cost per case;
  - cases with a documented decision;
  - measured outcomes;
  - repeat engagements and referrals;
  - outstanding compliance actions.
- Each indicator is reported only from records, and is unknown until a record exists.
- **Not claimed:** the blueprint's morning top-three and evening reconciliation for the founder. They aren't running.
  They become a REEDS standing request when the founder asks, and only once the worker runs (decision 21).

## TEPOS's lanes for the launch

Three active lanes:
1. **Professional readiness:** registration, training, compliance, agency integration.
2. **Commercial execution:** conversations, proposals, follow-ups, delivery, collections.
3. **Business improvement:** templates and systems, only after real work shows the need.

**A new idea becomes active only when it has:**
- a customer problem;
- an owner;
- a next step;
- a deadline;
- a reason to outrank what is already active.

## TEBOS: what is built, and what waits

**The blueprint's first components, and where they stand:**

| Component | Status |
|---|---|
| Property and owner intake | Built |
| Evidence with sources and dates | Built |
| Baseline and scenario comparison | Built |
| Strategy-match record | Built, as the seven pathways |
| Specialist register | Built, as the specialists per pathway |
| Report and approval | Built, as the gates |
| Outcome against the baseline | Built |

**Not built:**
- an appointment register of named specialists who have agreed to take part;
- the nine strategy families from the founder's "Formal Strategy Library v1.0".

**Nothing new is built in Phase 1 or 2.**
- **The strategy library** isn't in the repository. When the founder adds it, its nine families are mapped onto the
  seven pathways as sub-strategies, as configuration and not a fork (ADR 0008 rule 1). A family is a candidate for
  investigation, never proof that a property qualifies.

## Not adopted

- **Assuming any route to an FFC is quick or guaranteed.** Only the PPRA's written confirmation counts.
- **A sophisticated application or a website redesign before December.**
- **Spending the December funds on software ahead of the first case.**
