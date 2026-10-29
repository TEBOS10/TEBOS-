# Product register

The state of every capability in the TEPOS → library → TEBOS portfolio
([ADR 0005](adr/0005-systems-portfolio.md)). REEDS reads this as the portfolio's state. Update it in the same PR as
any change to a capability.

**Names (founder, 20 Oct):**
- **TEBOS** is the independent platform that businesses subscribe to (BAME first).
- **TEPOS and REEDS** are the founder's own system and chief of staff. They build and run the Property Revenue
  Architect firm with TEBOS's technology.

## Stages and evidence

**Stages** (full definitions in ADR 0005):
1. Identified.
2. Built for internal use.
3. Validated.
4. Productised.
5. Deployed through TEBOS.

**Evidence rule:** a stage is reached only with its evidence.
- "Built" means merged and tested.
- **"In use" needs real records** from an actual workflow in the live database.
- A count of 0 means *not yet used*, never *broken*. Tests show it works as written; only use shows it helps.

**Live counts, 28 Oct 2026** (read-only; unchanged since 21 Oct):

| | Count |
|---|---|
| Paying clients, payments, invoices | 0 |
| Opportunities and enquiries | 0 |
| Property Revenue Architecture cases | 0 |
| Money records | 0 |
| REEDS requests | 0 |
| Standing weekly briefs | 0 |
| Client channel messages / change requests | 1 / 0 |
| Findings and actions | 0 |
| Scans | 1 |
| Objectives | 15 (3 active) |
| Businesses | 9 |
| Connections | 2 |

**Nothing is past stage 2 yet.** Most capabilities are built but haven't shown real use. That reflects the evidence,
not a verdict on whether they work.

## Shared foundation

| Capability | Where | Stage | Evidence and gap |
|---|---|---|---|
| Business diagnosis (scans, interviews, findings) | TEBOS core | Built, barely used | 1 scan, 0 interviews, 0 findings. Analysis is paused by the rejected AI key (decision 2b) |
| Objectives and scorecards (boards, measured readings) | TEBOS core | 2 (internal) | 15 objectives, 3 active, on TEBOS's own board |
| Tasks and accountability (actions, delivery steps) | TEBOS core | Built, unused | 0 actions, 0 delivery steps |
| Requests and work queues (REEDS ledger) | TEBOS core | Built, unused | 0 requests |
| Approvals and change governance | TEBOS core | Built, unused | 0 approvals |
| Evidence and documentation | TEBOS core | Built | Used by the one scan |
| Risk and dependency management | TEPOS (resilience) | 1, partly built | Money records built (0 in use). Asset inventory, risk register and playbooks not built |
| Reporting (REEDS reports, PRA report) | Both | Built, unused | No reports produced yet |
| Integrations and automation (connections, Model Bridge) | TEBOS core | Built; bridge not yet live | 2 connections. Bridge migrations live 19 Oct; service and token pending (decisions 19, 20) |
| Audit and security (audit chain, two-step, private organisations) | Both | 2 (internal) | Audit chain verified intact live, 19 Oct. Two-step built, 0 authenticators enrolled |

## Operational systems

| System | Where | Stage | Evidence and gap |
|---|---|---|---|
| Sales and revenue | TEBOS's own pipeline and sales team | Built, unused | 0 opportunities, 0 enquiries |
| Marketing | TEBOS content drafts, social pack (docs) | Built, unused | 0 drafts in the database. The social pack is documents |
| Finance | TEBOS billing (its own invoices); TEPOS Tidy Capital | Built, unused | 0 invoices, 0 money records |
| IT and digital infrastructure | Connection monitoring | Partial | Monitors 2 connections. No inventory of tools, accounts or renewals |
| Supply chain and procurement | — | Not started | — |
| Operations, people, customer experience, strategy | Parts of board, delivery and objectives | Proposed extensions | Not designed as modules |

## Creative systems

The founder said yes to proposals 1 to 5 on 19 Oct (`tepos/creative-proposals.md`), so each is at stage 1. None is built yet.

| System | Stage | Note |
|---|---|---|
| Interactive experience | 1 | The TEPOS city (3D, merged #70) exists. "Builds as verified work progresses" is proposal 1 (yes, first in order) |
| Content and campaign production | 1 | Proposals 4 and 5 |
| Visualisation and simulation | 1 | Proposal 3. Always labelled illustrative |
| Environmental intelligence | 1 | Proposal 2. Public information only, no tracking of people |
| Creative communications | 1 | Proposals 4 and 5. Drafts only |
| Design system (one visual standard everywhere) | 1 | Proposal 6 (`tepos/video-review-19-oct.md`), yes 19 Oct. Not built yet |

## Industry systems

| System | Where | Stage | Evidence and gap |
|---|---|---|---|
| Property Revenue Architecture | TEPOS (Tidy Enterprise) | Built, unused | 0 cases. Priority 1. First offer: the assessment (ADR 0009, price is decision 26), then the monthly plan (decided 19 Oct, `pra-pricing.md`). Monthly update built 19 Oct. First invoice waits on decision 10b |
| Property journey (Property Revenue Architect Platform, Release 1) | Its own platform (`web/pra`, accounts `app = 'pra'`), linked from TEPOS | Built, tested, not deployed | 0 landlords. Problem register, evidence and actions linked to problems, proof rules, journey stage, milestones and next actions computed from records; owner pages at `/properties`. Migration `property_journey` waits on "merge it". Plan: `pra-platform/release-1.md`, ADR 0010 |
| Real Estate Office OS | TEPOS agent office (merged) | Built slice 1 | Listings and people with next steps. Documents, FFC path, relationships and marketing are next (founder, 19 Oct) |
| Hospitality OS | — | Not started | Client tile only |
| Sports and Marketing OS | BAME's own app (`bame/`) | Separate app | Not a TEBOS module. Its working parts are candidates for the library |
| Creative Studio OS | — | Not started | — |
| Industry blueprints (11 routes, incl. education centre and gym) | `src/domain/blueprints.ts` | Built, unused | Templates only; no real client yet. Creative (music, film, editing) and corporate routes named by the founder 19 Oct, not yet templated |
| Finance and Capital OS | `capital` schema (outside the repo); Tidy Capital page | 1 | Schema unreviewed (decision 9). Paper trading only, never live |
| Business Resilience OS | TEPOS resilience | 1, slice 1 built | Money records and two-step built. Inventory and decision log are next |

## What would move the most

1. **Real use in TEPOS**, so built capabilities can reach stage 2 with evidence:
   - money records;
   - the first property case;
   - the first REEDS request.
2. **A working AI key** (decision 2b), which unblocks diagnosis.
3. **A first client using a capability under an agreement** reaches stage 5a, deployed. Repeatable commercial success
   (5b) needs more than one paying client, a measured outcome and a known delivery cost.

**The first TEPOS test should be a workflow the founder already needs to finish,** not a feature built to fill this
register. For example, tracking the real-estate registration requirements, deadlines and proof of completion in the
accountability system, once that system is confirmed ready for that information.
