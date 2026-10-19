# TEBOS roadmap to autonomy

TEBOS becomes autonomous by proving reliability stage by stage. Nobody switches autonomy on in one
go. Each stage has a **gate**: evidence that it works on real businesses. The next stage starts only
when the gate is met. The dossier's principle applies throughout (§59): do not skip to autonomy
because it sounds more impressive.

Where TEBOS aims to be better than a general AI model or an agent tool is in what a model alone lacks:

- persistent memory of each business;
- conclusions that trace back to evidence;
- permissions and approvals;
- verified execution through connected systems;
- measured outcomes.

Models such as Claude are the reasoning engines behind the control plane (§49). The TEBOS product is
the control plane itself.

## Founder's priorities (in order; set 16 Oct 2026)

The founder runs several things at once: TEBOS (the builder, which also sells to outside businesses), property
(a newly qualified agent, the Property Revenue Architect business, and property qualifications towards asset
management), Tidy Capital (the reserve fund and investing) and the founder's own academics. The company has to
keep moving when the founder is busy, and has to pay its own subscriptions. So the daily build run works through
this list first (OPERATOR.md rule 2.3). **Cash first:** Tidy Capital grows money over years; it doesn't pay this
month's bills, so earning comes before investing.

**The structure (founder's drawing, 16 Oct 2026).** Tidy sits at the top, with three systems beneath it:
- **REEDS**, the chief of staff. It manages, communicates, pairs and links, thinks and suggests, understands,
  cleans up chaos, assesses and diagnoses, guides and aligns, protects, creates contingencies, and interviews people
  and agents for roles. It works within the autonomy tiers: it suggests and drafts, and people decide anything
  consequential.
- **TEBOS**, the builder. It serves BAME and other businesses aligned with Tidy's focus on industry and asset
  management, and it is used inside everything Tidy builds.
- **IREKUN**, the security backbone and personal cyber security. It is never sold. The private resilience
  organisation is IREKUN's.

Two businesses sit alongside them:
- **Tidy Capital** receives the income. It has four streams:
  - forex trading, as software;
  - TEBOS retainers from the businesses it helps;
  - the real-estate agent job;
  - Property Revenue Architect retainers from the properties it helps.

  Forex income is always recorded as speculative. A retainer counts as reliable only with a signed agreement.
- **Tidy Enterprise** builds the founder's standing as a qualified, trustworthy asset-management firm. It covers:
  - property credentials;
  - the asset-management portfolio;
  - the Property Revenue Architect business, which builds credibility and relationships by helping others win;
  - success in the real-estate agent job.

**TEPOS and TEBOS are two separate web apps (founder, 16 Oct 2026).**
- **TEBOS** is the public platform for clients. People register there, and it shows nothing of TEPOS: no link, no
  route, no organisation. The build checks this: `web/scripts/check-bundles.mjs` fails if the TEBOS bundle
  mentions TEPOS.
  - Each client is a tile in its own colours (`businesses.brand_*`). The tile opens the client's own web app
    (`businesses.app_url`), where TEBOS's people sign in to their own department. It never opens a page of TEBOS's
    data about the client.
- **TEPOS**, the Tidy Enterprise Personal Operating System, is the founder's private app.
  - It is a separate build: `web/tepos/` and `vite.tepos.config.ts`, output `dist-tepos`.
  - Only someone who owns a private organisation gets in. Anyone else sees "This is a private system".
  - It looks like its tiles: earthy browns and beiges, and the same logo in bronze (`tepos/public/brand`).
  - Its home is a city at dusk with one building per portal. Portals not built yet stand under scaffolding.
- **Organisations belong to one app** (`organisations.app`). Private organisations are always TEPOS's.
- **The two apps share the database (free) and the domain rules.** REEDS works across both.

**Working in a client's web app (founder, 16 Oct 2026).** TEBOS builds and maintains every department of a
client's system, so it holds wide access. It uses it the way a careful CEO would:
- by default, people sign in to their own department only;
- going into another department is a deliberate, recorded step, for a named reason;
- nothing is ever done that disrupts or harms a department;
- changes outside the agreed deliverables go to REEDS and to the client for a yes or no first.

**One systems portfolio (founder, 19 Oct 2026).**
- TEPOS proves each capability on the founder's own operations, the library makes it reusable, and TEBOS configures it
  for clients whose diagnosed problems need it. One codebase, never a copy per client.
- Three portfolios: operational, creative and industry systems. Each capability moves through five stages, with
  evidence at each.
- See [ADR 0005](adr/0005-systems-portfolio.md) and the [product register](product-register.md). Nothing is past
  stage 2 yet.
- This doesn't start development across every category. The order below stands.

**The creative team (founder, 16 Oct 2026).** Both apps should look like themselves, not like copies in different
colours, and ideas shouldn't wait for the founder.
- Each week, the daily build run produces one creative proposal for TEPOS or a client: a visual idea, a
  feature idea or a campaign idea.
- Each proposal names the deliverable it serves, the cost and the risk.
- REEDS puts it to the founder, and to the client where it affects them, for a yes or no. Nothing is built from a
  proposal until it is approved.
- Proposals stay inside the agreed daily, weekly and monthly deliverables. The team doesn't overextend.
- First proposal, now built for review: the TEPOS city. On 17 Oct the founder asked for it in 3D, building itself
  like a house rising from its blueprint, and moving around: done (`web/src/tepos/city3d.ts`). Each building stops
  where its portal really is: finished and lit, a frame with a crane, or a blueprint.
- Next ideas to put forward:
  - the TEBOS board seen as a district of buildings (one per department), shown alongside the chessboard;
  - day and night in the TEPOS city following Tidy Capital's runway;
  - a client's tile taking on its logo once the client sends it.
- Waiting for a yes or no (19 Oct, from the founder's videos), each with what it serves, its cost and its risk:
  [`tepos/creative-proposals.md`](tepos/creative-proposals.md).
  - portals that build themselves, stage by stage;
  - a public-awareness globe, never tracking people;
  - labelled 3D walkthroughs of a property;
  - REEDS drafting the social calendar, posts and replies, with nothing sent without approval.

**TEBOS pays Tidy Capital: 50% (founder, 16 Oct 2026).**
- TEBOS first covers its own running costs (hosting, AI, email, payments) and keeps a buffer of three to six months
  of those costs.
- Of the profit above that buffer, 50% goes to Tidy Capital, the reserve every stream pays into. The rest stays in
  TEBOS to grow.
- Revisit the share each quarter on the real figures.

1. **Property Revenue Architect, as an affordable monthly subscription** (founder, 16 Oct). *Built 16 Oct: the case
   workspace and assessment report (docs/property-revenue-architecture.md). Workstreams and the outcome scorecard
   followed the same day. Next: the monthly subscription view.* Owners of
   underperforming properties can't pay a large once-off fee, so the product is a monthly plan with practical
   results: each month, what was fixed, what was done (a spreadsheet set up, a business registered), what is next.
   It doesn't need the founder present for every step. Build it on what TEBOS already has: the delivery plan
   (steps closed with a note of what was done), monthly billing and the maintainer queue.
   - **The assessment, in the founder's words:** rental income, occupancy and costs. A property's record holds
     those three, each labelled measured (from a statement or system), stated by the owner, or estimated; the
     baseline is net income (income × occupancy − costs); the gaps and opportunities are ranked by their effect on it.
   - **The monthly progress report** an owner receives: done this month, the figures then and now (only
     measured figures shown as results), next month's steps.
   - Prices and any client-facing text are the founder's (tier 3). **The price follows the market** (founder,
     16 Oct): REEDS keeps a market file of cited figures (published rent indices such as PayProp's, the
     interest rate, inflation, what managing agents charge), each with its source and date, and conflicting
     sources shown as conflicting, never averaged away. The founder sets the price from it; owners' own answers
     on what they would pay count as stated evidence.
   - **WhatsApp:** connect through the WhatsApp Business Platform, or the founder's WhatsApp CRM if it offers an
     API, never by automating a personal account. Messages in become leads; replies are drafted for approval.
2. **REEDS works without being asked.** Standing requests: the founder sets a question once ("every Monday: how are
   my businesses doing?") and the server raises it on schedule, with the report waiting in the inbox. The rule that
   only a person can ask stays: a standing request is the founder's own request, repeated, never one the system
   invents. Then the **weekly money brief**, with every income stream by how often it pays (daily, weekly, monthly, yearly, and lump sums such as commissions and trading): what TEBOS and its tools cost (subscriptions the founder records, each
   with its renewal date), what came in (recorded payments and commissions), the months the money lasts, and the
   next best earning move from the records. Nothing estimated is shown as measured.
3. **The agent's office.** *Started 17 Oct with slice 1 (migration `agent_office`): every listing, buyer, seller,
   tenant and landlord with its next step and date, overdue first, and mandates about to end. Kept in the private
   organisation behind two-step sign-in, and without personal details until the agency's principal allows them
   (decision 12): people are references (B-001), and email addresses, phone numbers and ID numbers are refused.
   Slice 2 on 19 Oct (migration `agent_compliance`): each deal's documents against the
   agency's own checklist, tracked but never stored or changed, and the FFC path with a source for every step.
   Next: relationships (investors, landlords, practitioners), then marketing, then commission expected versus
   received.* The founder's real-estate work needs volume (agents are told about 30 listings for
   one sale a month), so TEBOS carries the load: every buyer, seller and listing with its next step and date;
   listing write-ups and marketing drafted from the property's facts for approval; documents per deal in one place;
   appointments; and **no enquiry left unanswered**. An instant acknowledgement with a booking link is the one
   message that may go out automatically, and only from a template the founder approved (ROADMAP autonomy policy,
   tier 2); everything else is drafted for approval. Channels: email and web first; WhatsApp Business needs a Meta
   business account and a number (founder). The agency's own rules and POPIA consent come first: check what the
   agency's principal allows. Commission expected versus received feeds the money brief.
4. **The study path.** The qualifications towards asset management (property finance, property investment and
   development, and what the FSCA requires to manage other people's money) as objectives with dates and evidence of
   completion.
5. **The private vault (IREKUN).** *Started 16 Oct with Strategic Resilience slice 1 (docs/resilience/blueprint.md):
   private organisations (one member, ever), and financial resilience (runway, income by stream and cadence).*
   The founder's own organisation inside TEBOS (free for now): documents stored privately,
   every read audited, shared only through short-lived signed links, searchable ("REEDS, find my document").
   Built so it can move to its own Supabase project, out of the client database, once income pays for one (the
   free plan's two projects are in use: `tebos-core` and `bame-os`).
6. **Tidy Capital, honestly.** Bring the `capital` schema and its ingestion into this repository; a research and
   paper-trading ledger where every idea is time-stamped before its outcome is known and every result, win or loss,
   is recorded. That becomes the verifiable track record a future fund needs. No live trading, and no figure that
   isn't recorded. Its market-data key (Alpha Vantage, in Vault) is the founder's to set.
7. **BAME talks to TEBOS both ways.** BAME already reports hourly (read-only). Next: BAME's own events (a new case,
   an overdue deliverable) arrive as signed notifications, and approved actions go back (ROADMAP "Platform
   monitoring").

Later, and not before there is income and a lawyer's advice: buying media, banking or other protective assets.

## The model: business operating architecture

TEBOS is business operating architecture ([ADR 0003](adr/0003-business-operating-architecture.md)): it makes a
business structurally capable of producing its intended outcomes with less dependence on individual people,
memory, improvisation and founder intervention. It orchestrates the systems a business already has; it does not
replace them.

The client lifecycle, and where each stage stands in the build:

| Lifecycle stage | What TEBOS does | Built on | Status |
|---|---|---|---|
| Assess | Reads the business: scans, interviews, connected-system snapshots | Stages 1–2 | Built |
| Map | The board: objectives, pieces, flows, steps, founder dependency | Migration `board_objectives` | First slice built |
| Architect | Rules, owners and handovers per flow step | `board_steps.decision_rule`, owners | Recorded by hand; no design assistance yet |
| Integrate | Connects the systems already on the board | Stage 4 connectors | Read-only snapshot + Resend |
| Automate | Only steps with a rule and a tool, only after approval | Stages 4–6 | Email only |
| Govern | Approvals by risk tier, guarded transitions, audit trail | Stages 0 and 3 | Built |
| Optimise | Objectives measured on connected numbers; changes judged against them | `objectives`, outcomes | Measurement built; optimisation loop not started |

The chess framework (board, pieces, position, objective, moves, rules, clock, opponent, engine) maps onto these
tables in ADR 0003. Every new capability must attach to a piece, a flow step or an objective. That is the guard
against building "a platform that does everything".

### Next for the board (in order)

1. **Gate: map one real business.** Map BAME's main flows and set 2–3 objectives with an owner and a date.
   Measure at least one objective from its connected platform. Until this is done, nothing below starts.
   - Done (28 Sep 2026): BAME's board is mapped from evidence.
     - Sources: its own system's code, recorded as a `document` source pinned to a commit, and the live
       read-only platform.
     - Contents: 12 observed pieces, the flows "Enquiry to rostered client" and "Package fees to departments",
       and 8 steps.
     - Open steps: routing to a department has no written rule, and deliverables have checklists for PR and
       Technology only.
   - Done (28 Sep 2026): three objectives are active, each with an owner and a date, and each is measured from BAME's
     live platform (cases routed, delivery checklists, ledger fees). **The gate is met.** Still open: who does which
     step, where that isn't visible in the system (for example, whether the admin is the founder).
2. Findings that name their flow and objective, in the business review. The model proposes the link, and TEBOS
   validates that the flow belongs to the business.
3. Observed pieces: link board pieces to the connections and evidence that confirm them.
   - Done (4 Oct 2026): a piece is observed only on evidence TEBOS obtained and that is current, never on the owner's own
     word; once observed it stays observed. The board offers "Confirm from evidence" and shows what confirmed each piece.
4. Architecture proposals: suggested rules and owners for founder-only steps, each one an approvable action.
   - First slice built (1 Oct 2026): **operating-system blueprints** (`src/domain/blueprints.ts`, migration
     `operating_system_blueprints`). There are ten, one per kind of business. Each sets out the pieces, the flows, and
     a written rule and an owner for each step. A blueprint is laid onto a client's board in one step as *proposed*;
     the owner confirms each piece (proposed → stated), and evidence makes it observed. A proposal never overwrites
     what the business stated. The public `/systems` page shows each blueprint's outline, never its rules.
     Done (2 Oct 2026): the delivery plan puts a client's draft operating system on their board by day 1, and it is
     confirmed with the owner by day 3 (companies: a draft by day 3, confirmed by day 21).
   - Done (5 Oct 2026): **architecture proposals** for founder-only steps (migration `step_proposals`). The team proposes
     who does a founder step instead and the written rule they follow; the owner approves or rejects, never their own
     proposal. Approving retires the founder step and puts the new stated step in its place.
5. Only then: automation of steps that have a written rule and a connected tool.

| Stage | Delivers | Gate (proof) | Status |
|---|---|---|---|
| 0. Foundations | Schema with enforced rules, tenancy, audit, domain core | Rule tests pass on Postgres and on `tebos-core` | Done |
| 1. Live evidence | Worker deployed on Railway; real scans of real businesses | 5+ real businesses scanned; every page ends in an honest state | Built; awaiting deployment |
| 2. Intelligence | Claude-proposed findings, validated and linked to evidence | `npm run eval:findings` healthy; findings on real scans reviewed by a person | Built; awaiting API key |
| 3. Interface + actions | Sign-in; Home, Businesses, Scans, Findings, Actions, Approvals; action proposals from findings | A real business review run end to end in TEBOS | First slice built (`web/`); awaiting deployment |
| 4. Capabilities | Verified connectors (email, CRM, calendar, WhatsApp); approved execution with verification | Actions verified as done by the provider, not just by TEBOS | First connector (Resend email) built; gate blocked on stages 1–3 |
| 5. Operating systems | Playbooks, workflow engine, operating-system specifications for new and existing businesses, scheduled rescans, change detection | One client (e.g. BAME) running on a TEBOS-generated operating system | Not started |
| 6. Autonomy | Agents run the loop within permission boundaries | Autonomy granted per action type after measured success; tier-3 actions always need a person | Not started |

## Autonomy policy (stage 6)

- Autonomy is granted **per action type and per organisation**, never globally.
- An action type qualifies only after it has a verified success rate above an agreed threshold, over
  enough real executions.
- Tier 0–1 actions (reading, internal drafting) can be automatic first.
- Tier 2 actions (external but reversible) become automatic only under an explicit policy the
  organisation has approved.
- Tier 3 actions (money, legal commitments, credentials, irreversible deletion) always need a human
  approver. The database already enforces this (`guard_approval`).
- Every autonomous step stays auditable and reversible where possible. A drop in the success rate
  withdraws the autonomy automatically.

## Stage 3 — what the first slice covers and what remains

Built:
- sign-in and organisation creation;
- the command centre;
- the business workspace;
- scan and finding views with evidence traceability;
- action proposal from findings;
- the full manual action lifecycle (approve, queue, run, record, verify, block, cancel);
- approvals, system state and audit history.

Approval decisions move their action automatically (migration `approval_drives_action`).

Added in the second slice (migration `team`):
- teammates: `profiles` (names visible only to colleagues) and invitations. An invitation stores a
  token fingerprint, never the token. It is accepted only by the invited, confirmed email, expires,
  is single-use and revocable. An organisation can't lose its last admin;
- names instead of ids in action history, approvals, business context and the audit trail;
- outcomes recorded from the action page. A verified outcome can verify a completed action;
- a business report (dossier §26) with labelled statement types, gaps, print or PDF, and CSV export
  that is safe against formula injection.

Remaining for the stage-3 gate:
1. Deploy the interface (Vercel) and the workers (Railway), and run a real business review end to end.
   This needs the owner: the Supabase Auth Site URL, the Railway service and its secrets.
2. Email delivery of invitations. For now the admin copies the link and sends it themselves.


## Stage 4: first slice

Started, at the owner's request, before the stage 1–3 gates were met. The code is built and tested, but it
does nothing until an organisation connects a provider, and the stage 4 gate is not claimed until stages
1–3 have met theirs.

Built (migration `provider_execution`, `src/execution/`, and the Connections page):
- the Resend connector: `email.send_transactional`, with key verification and scopes that follow what the
  key proved;
- credentials held in Supabase Vault. Connection health, scopes and credentials can only be written by the
  server;
- email actions whose exact recipients and text are approved. The input is frozen once approval is
  requested, and the approval is pinned to its hash;
- the execution worker: one send per approval (idempotency key), safe retries on unknown outcomes, and
  blocking with a reason when no provider can run the action;
- provider verification: an action is `verified` only on delivery reported by Resend, by polling or by a
  signed, replay-safe webhook. Bounces fail it.

Remaining for the stage-4 gate:
1. Stages 1–3 meet their gates (deployment, real scans, a real business review).
2. Connect a real Resend account with a verified sending domain. Send real approved emails and see them
   verified by Resend.
3. More connectors: CRM (HubSpot), calendar and WhatsApp, each with provider-side verification.

## Internal evidence: diagnostic interviews

Scans read the outside of a business. Interviews add what only its people know (migration
`diagnostic_interviews`, `src/interviews/`, industry playbooks in `src/domain/playbooks/`):
- a marketing-agency playbook (v1);
- calls placed by an ElevenLabs voice agent at a booked time, with recorded consent and an upfront AI
  disclosure, or the same questions answered in writing;
- answers stored as the owner's statements, each quoted word for word from the transcript.

Next:
1. Connect a phone number: Twilio or SIP into ElevenLabs, then `ELEVENLABS_PHONE_NUMBER_ID` and
   `ELEVENLABS_API_KEY` on the worker.
2. ~~Feed interview evidence into findings, alongside scans.~~ Done: business reviews (README).
3. Document uploads.
4. Read-only connectors (accounting, CRM, project tools) to confirm answers against real data.

## Platform monitoring

- **BAME:** a read-only operations snapshot (aggregates only, no personal data) is read hourly into
  evidence. You can see it on the BAME business page under "Live operations".
- **Tidy Capital and Tidy Property Revenue Architect:** not connected. Their code and data weren't found in
  the connected GitHub, Supabase or Railway accounts.
- **Done:** these facts feed business reviews, alongside interviews and scans.
- **Next:** add approved actions on BAME (assign a lead, chase an
  overdue deliverable) as their own capabilities.

## Client pipeline (built 29 Sep 2026)

The pipeline takes a client from enquiry through screening, a decision, Paystack payment and a contract accepted
online, to onboarding with a maintainer. See the README for the details.

To go live:
1. A lawyer reviews TEBOS's draft agreement. Approve it on Pipeline → Contract templates, noting who approved it.
2. Paystack:
   - set `PAYSTACK_SECRET_KEY` on the worker;
   - set the webhook URL to `https://<worker domain>/webhooks/paystack`.
3. Resend: set `RESEND_API_KEY` and a verified sender (`PIPELINE_EMAIL_FROM`).
4. Invite staff on Pipeline → Staff: `sales` for the sales team and `maintainer` for the people who look after clients.

The sales team pack (built 29 Sep 2026): staff invitations, leads owned by the salesperson who added them, and the
sales playbook, readable only by staff. See the README.

Next:
- commission tracking on the leads each salesperson owns;
- monthly billing after the first month;
- the maintainer's queue, fed from each client's live readings and missed objectives.

## TEBOS on its own board (built 29 Sep 2026)

TEBOS's own company is mapped on its own board: departments, flows, and who really does each step. Company
objectives (cash collected, lead decision time, leads per week, active clients, undelivered client emails) are
measured automatically from TEBOS's own pipeline and payments. The founder-dependent steps on that board are
the build order for the next departments:
1. ~~Monthly billing (finance), so cash comes in without the founder.~~ Built.
2. ~~The maintainer's queue (operations), so client delivery runs without the founder.~~ Built.
3. ~~Marketing and PR drafting with approval before publishing (tier 2).~~ Built 6 Oct (`/marketing`): staff draft,
   a platform admin approves, a person publishes and records where it went live. TEBOS never publishes.
4. Department roles beyond sales and maintainer, each with a playbook like the sales one.
   First department built 7 Oct: **marketing** (migration `marketing_role`). Marketing staff draft content and read
   their own playbook (`/marketing/playbook`), and see no pipeline, leads, clients or billing. Next: finance and
   operations, once there is work for them.
5. ~~The diagnostic interview without the founder.~~ Built 12 Oct: onboarding opens the client's written
   diagnostic (industry questions, or the general small-business diagnostic), and completing it closes the
   delivery step by itself.
People the founder still needs to appoint: a lawyer, an accountant, a head of sales.

## Go to market

- **Public site:** home page with the narrated film (`/`), interactive demo (`/demo`), animated tour
  (`/tour`) and pricing (`/pricing`). None of them names the AI or voice providers.
- **Pricing** follows the lifecycle (ADR 0003). All prices exclude VAT, and the enquiry keys stay
  `starter` / `growth`:
  - Diagnostic: R2,500/month.
  - Architecture & Operations: R7,500/month.
  - Equity partnership: a fixed 5% instead of fees, subject to a fit assessment, a valuation and a signed
    shareholder agreement.
- **Positioning:** "business operating architecture", not an AI agency. The site promises structure, never
  results. Plans
  live in `web/src/lib/pricing.ts`. Enquiries are stored in `public.enquiries` (insert-only through the
  API; read them with the service role).
- **Before taking equity:** have a lawyer draft the shareholder agreement and the terms the pricing page
  refers to.
- **Next:** a new commercial that tells the board story (the current film tells the diagnostic one). Then a
  content agent that drafts new commercials (script → voice → animated scenes → video) from
  the same film components, with a person approving each one before it's published. Later: ads with
  characters.
