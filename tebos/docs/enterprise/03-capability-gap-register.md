# Capability gap register

Every capability the enterprise directive names, against what exists (7 Nov 2026).

**Statuses:**
- **Live:** applied and working in production.
- **Built:** merged and tested, but either unused or not applied.
- **Partial:** works, but a named piece is missing.
- **Missing.**

**Priority** follows the directive's ranking:
1. revenue;
2. cost;
3. founder dependency;
4. risk;
5. reuse;
6. reliability;
7. advantage.

**Owner:** **F** founder (tier 3), **R** REEDS routine (tier 1).

| ID | Capability | Status | Gap | Priority | Action | Owner |
|---|---|---|---|---|---|---|
| G-01 | Apply the four pending migrations | Built | Not live; CI can't log in | 1 | Run `apply-2026-11-05.sql`; fix `SUPABASE_DB_URL` | F |
| G-02 | Take payment (Paystack) | Built | No secret key | 1 | Set `PAYSTACK_SECRET_KEY` on Railway; webhook URL | F |
| G-03 | Proposals and scope of work | Missing | No generator between screening and contract | 1 | Proposal draft from approved template + price list, founder approves (Release A step) | R, after F sets prices |
| G-04 | Sending client email | Built | No Resend key or domain | 1 | Resend key, verified domain | F |
| G-05 | Calls to prospects | Partial | 38 researched, 0 called | 1 | A person calls; desk records outcomes | F |
| G-06 | Underwrite beyond property | Partial | PRA only | 7 | Generalise figures-with-source and verdict to any asset-backed opportunity | R |
| G-07 | Channel referrals (Pelser ↔ Real Estate Assist ↔ Tidy Enterprise) | **Built today** | Written agreements with both partners | 4 | ADR 0025; founder gets the agreements | R built; F agreements |
| G-08 | Company finance: expenses, payables, reserves, cash-flow | Missing | Only client invoices and payments | 4 | Company ledger in cents, append-only, reserves kept separate; reports show unknown when empty | R, after first revenue |
| G-09 | Electronic signature | Partial | Hash-bound acceptance exists; no third-party e-signature | 5 | Keep acceptance; add provider only if a client requires it | — |
| G-10 | Customer success (health, renewals, churn) | Missing | No clients to measure | 5 | Build when there are 3 paying clients | R |
| G-11 | AI voice receptionist | Partial | Intake path built; no number or agent; no call report | 3 | Founder sets number and approves script; weekly call report | F, then R |
| G-12 | Executive dashboard (revenue, cash, MRR, margin, receivables, risks) | Partial | Boards and inbox exist; no money view | 3 | One page reading invoices, payments and the company ledger; unknown when empty | R, after G-08 |
| G-13 | Backup restore rehearsal and rollback runbook | Missing | Backups not tested | 6 | Rehearse a restore on a free scratch project; write the runbook | R (needs F for the project) |
| G-14 | Commercial hosting | Partial | Vercel Hobby is non-commercial | 4 | Move paying-client apps (decision 31) | F |
| G-15 | Measuring founder dependency | Missing | No hours or interventions recorded | 3 | Count tier-3 asks and founder actions per week from the operator log | R |
| G-16 | Specialist network (attorneys, planners, QS, engineers, finance) | Partial | PRA pathways name specialists; no verified register | 7 | Register with credential and verification date; never recommend unverified | R, entries by F |
| G-17 | Property marketplace and specialist marketplace | Missing | — | 7 (deferred) | Not before PRA has paying landlords; needs PPRA review | — |
| G-18 | Content workflow with Grape Studios | Partial | Content drafts and studio exist; no agreement | 4 | Monthly brief → draft → founder approval → publish → lead attribution; after a signed scope | F, then R |
| G-19 | Compliance registers (contracts, processing, vendors, incidents) | Partial | Risk register written today; others missing | 4 | Data-processing record and vendor register next | R |
| G-20 | Tenant separation of the 9 businesses | Partial | Three businesses share one organisation | 4 | Reviewed, founder-approved migration (14 Oct audit) | F approval |
| G-21 | Duplicate Vercel projects | Duplicate | Four projects, one repo | 2 | Retire extras (irreversible) | F |
| G-22 | Agent cost monitoring | Partial | Tokens recorded per run; no budget alert | 2 | Monthly cost per agent from `agent_runs` with a ceiling | R |

## First implementation priorities

These are ranked by what moves revenue and risk soonest, and use only what exists:

1. **G-01, G-02, G-04** (founder, about 15 minutes each). They unblock everything built.
2. **G-05** (founder): call the desk.
3. **G-07** (done today, R): the channel referrals.
4. **G-03** (R): proposals. It waits on the founder's price list (decision 26), because a proposal with an invented
   price is forbidden.
5. **G-08 and G-12** (R), after the first invoice exists, so the dashboard reads real money.
6. **G-13** (R): a restore rehearsal.

**Reordered against the directive's Release A to E**, and why: Releases A to D are largely built. The binding
constraint is activation, not features. So founder unblocks and selling come first, and building resumes where
a real record needs it.
