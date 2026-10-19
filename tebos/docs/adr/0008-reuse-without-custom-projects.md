# ADR 0008: One operating infrastructure across industries, without becoming a collection of custom projects

Date: 2026-10-20 · Status: accepted (founder, 20 Oct 2026, from two strategy research reports)

Builds on ADR 0005 (the systems portfolio), ADR 0006 (earn first) and ADR 0007 (durable value).

## The question

Can TEBOS serve many industries from one reusable operating infrastructure, without turning into an expensive,
unmaintainable set of one-off builds?

**Yes, under five rules.** "We can build for any industry" is a capability. "We build for every industry now" is a
strategy, and we don't follow it.

## The five rules

1. **One codebase, one data model; industries are configuration.**
   - An industry route is a blueprint (`src/domain/blueprints.ts`) plus settings for shared modules: objectives,
     tasks, evidence, approvals, reporting.
   - It is never a fork, a per-client copy, or a client-only table.
   - A client need that a shared module can't express either becomes a new shared module, built once for every route,
     or is declined.
2. **A route is opened only by a paying client.**
   - The eleven blueprints stay templates until someone pays for that route.
   - Building ahead of a buyer is the "collection of custom projects" in slow motion.
3. **Learn from existing systems; don't copy them.**
   - Study how software and businesses in an industry work: public documentation, how the founder's own work is done,
     clients' own processes, used with their consent.
   - Then build our own version of the *workflow*. Never copy another product's code, designs, data or protected text.
   - Where good software already exists (accounting, CRM, property management suites), **connect to it** instead of
     rebuilding it: Make or Zapier, an API, or the client's exports. Our value is the layer above: evidence, decisions,
     approvals, measured outcomes.
4. **Service first, software second.**
   - Each route starts as a delivered service. It is partly manual, but every step is recorded in the shared modules.
   - A step is automated only after it has been done by hand for real clients and its delivery cost is known.
   - The PRA monthly plan is the first route run this way.
5. **Maintainability is a gate.** A route is productised (ADR 0005 stage 4) only when:
   - it needs no client-specific code;
   - its delivery cost per client is measured;
   - one person can support it alongside the others.

## What the reports added, and what we take

**Adopted:**
- **A narrow first focus:** property owners and portfolios, then agents. This matches ADR 0006.
- **Service revenue now:** done-with-you setup fees are acceptable alongside the PRA subscription. For example, putting
  a landlord's rent roll and statements into a case.
- **Help with existing habits:** support tenants and owners as they already work (bank transfers, manual receipts,
  WhatsApp). Record those facts; don't force a new workflow. The PRA evidence register already accepts owner-reported
  facts.
- **Decision triggers:**
  - no paying client by day 60 means re-examine the offer, not build more;
  - every proposed feature names the paying client who asked for it.
- **Investor and owner visibility** (live figures, not quarterly PDFs): the PRA monthly update is the start.

**Not adopted, and why:**

| Proposal | Why not now |
|---|---|
| Rebuild a full property-management suite (leases, maintenance, tenant portal, rent collection) | Mature tools exist. We connect to them, and our product is the layer above. Revisit only if paying clients have no tool at all |
| Hire 1–2 developers (R50–80k a month each), Kubernetes, vector database, Series A within 12 months | There is no capital or revenue for it (ADR 0006). The current stack (Supabase with row-level security, Vercel, Railway, CI) already covers multi-tenancy, an auth gateway, audit logging and a model gateway |
| Per-door pricing of R100–R500 a door per month | The reports contradict each other, and above about 3 units it's more than the decided PRA prices. PRA prices stay as decided (`pra-pricing.md`) until real sales show otherwise |
| A commission or percentage of deals closed | A fee tied to property transactions may make TEBOS's work property-practitioner work under the Property Practitioners Act. That's a legal question for decision 10b, not a pricing choice. Subscription only, until it is answered |
| Using the founder's agency clients as pilots | Needs the principal's permission first (decision 12) |
| "Supabase gives us SOC 2 / ISO / HIPAA", "bank-level security" | Supabase's own certifications don't make TEBOS certified. We don't claim compliance we don't hold. We can truthfully say what's built: row-level isolation, two-step sign-in, a verifiable audit trail |
| AI valuations, fraud detection, chatbots, sandboxed custom code | Stage 3 at the earliest, and only if a paying client asks |
| Statistics and quotes in the reports (market sizes, conversion rates, percentages) | Unverified; one report itself names an invented company. Not to be repeated to clients without a checked source |

## How the founder's time is used

- **Real estate first.** The registration and the FFC come first (ADR 0006).
- **TEBOS does the building:**
  - the daily run and these sessions build;
  - REEDS's weekly signal brief reports.
- **The founder's job in TEBOS:**
  - conversations with five owners;
  - approving what is sent;
  - the decisions only they can make.

**Possible move abroad.** One report says the founder may move abroad. If so, the PRA service needs a local person to
meet owners, and every process must be written down. This is noted here and is the founder's to confirm.

## Consequences

- **New industry work** in the register must name the paying client that opened the route.
- **Client requests:** a request that needs client-specific code is declined, or turned into a shared module, and
  recorded either way.
- **Integration before replication:** before any "build X like product Y", the first question is which existing tool
  the client uses, and how we connect to it.
