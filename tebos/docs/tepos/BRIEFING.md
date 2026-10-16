# TEPOS briefing

The full context for any new conversation about TEPOS, as of 16 October 2026. Attach this file or paste it at the start
of a chat. The code lives in the repository `TEBOS10/TEBOS-`, under `tebos/`.

## What TEPOS is

**TEPOS** stands for the **Tidy Enterprise Personal Operating System**. It is the founder's own, private web app, and it
runs the founder's personal side of Tidy.

**TEBOS** (Business Operating Systems) is a separate web app for clients. It builds and runs business operating systems
for other businesses, such as BAME. The two are kept apart:
- TEBOS shows nothing of TEPOS;
- TEPOS lets in only its owner;
- personal and client data never mix.

| | TEPOS (personal) | TEBOS (clients) |
|---|---|---|
| Address | tebos-web.vercel.app (Vercel project `tebos-web`) | tebos-demo.vercel.app (Vercel project `tebos`) |
| Who gets in | Only someone who owns a private organisation, which means the founder | Clients and TEBOS staff; invite-only |
| Look | Earthy browns and beiges; the same TB logo in bronze; the home page is a city at dusk | Near-black and silver; the chessboard and 3D boards; client tiles in each client's own colours |
| Code | `tebos/web/tepos/`, `tebos/web/src/tepos/`, `vite.tepos.config.ts` → `dist-tepos` | `tebos/web/src/`, `vite.config.ts` → `dist` |

The two apps share one sign-in (the same email and password), one Supabase database (project `tebos-core`, free
plan) and the same rules. Each organisation belongs to one app (`organisations.app`), and private organisations are
always TEPOS's. Every merge to `main` deploys both apps automatically.

## The founder's structure

```
Tidy
├── REEDS: the chief of staff. Works across TEPOS and TEBOS.
├── TEBOS: builds operating systems for clients (separate app)
└── IREKUN: security backbone and personal cyber security. Never sold.

Tidy Capital: the reserve. It receives every income stream:
  1. Forex trading (as software): always speculative, never counted as cash
  2. TEBOS retainers from client businesses
  3. The real-estate agent job (commissions)
  4. Property Revenue Architect retainers

Tidy Enterprise: building a qualified, trustworthy asset-management firm:
  property credentials · asset-management portfolio · the Property Revenue Architect (PRA) business ·
  success in the real-estate agent job

TEBOS pays Tidy Capital 50% of its profit above running costs plus a 3–6 month buffer (reviewed quarterly).
```

**REEDS** (the chief of staff) works across both apps. Its roles: manages, communicates, pairs and links, thinks and
suggests, understands, cleans up chaos, assesses and diagnoses, guides and aligns, protects, creates contingencies,
and interviews people and agents for roles.

## The six TEPOS portals

| Portal | Status | What it holds |
|---|---|---|
| **Tidy Capital** | Built | The reserve. Money records by entity (Tidy, Tidy Capital, Tidy Enterprise, TEBOS, IREKUN, Personal): essential and other costs, income by stream and how often it pays, reserves (liquid or not), debts and commitments. Shows runway in months: base (reliable income continues) and downside (all income stops). |
| **Tidy Enterprise** | Built | Property Revenue Architecture cases: intake, disposition, an evidence room, economics (rental income, occupancy, costs), pathways, execution gates, workstreams, the outcome scorecard, and the assessment report (PDF, JSON, CSV). |
| **IREKUN** | Built | Security: two-step sign-in status and the private organisation. |
| **Academics** | Not built yet | The study path towards asset management: qualifications, dates and evidence of completion. |
| **Real Estate Job** | Not built yet | The agent's office: buyers, sellers, listings, appointments, and no enquiry left unanswered. |
| **Forex** | Not built yet | A paper-trading ledger: every idea time-stamped before its outcome. No live trading. |

The TEPOS home page is a city at dusk with one building per portal:
- a fortress for IREKUN;
- an office tower for Tidy Enterprise;
- a bank for Tidy Capital;
- a trading tower for Forex, a library for Academics and a row of houses for Real Estate Job, all three under
  scaffolding because they aren't built yet.

The six tiles below the city are each a different earthy shade. Opening one plays a warm "vortex" transition into
that portal.

## What protects it, all live and tested

- **Private organisation (IREKUN):**
  - It has one member, ever: the founder. The database refuses a second member, any other role and invitations,
    by any path.
  - It can never be made non-private.
- **Two-step sign-in (TOTP):**
  - The money records open only after a code from an authenticator app. A password alone reads and writes nothing;
    this was verified live.
  - It is set up under Account; a backup authenticator is recommended.
- **No secrets stored:** text that looks like a password, PIN, key or token is refused in every field.
- **Redacted audit trail:** it records who changed which fields and when, never the amounts or text. So a deleted
  record is really gone.
- **Honest numbers:**
  - Unknown is not zero.
  - Speculative income and lump sums never count as cash.
  - Reliable income must name its signed agreement or statement.
  - Every result is labelled by its weakest input: verified, stated or estimated.

## Rules that never change

- **Never invent data.** That covers figures, scans, evidence, connections, success or outcomes. If something isn't
  connected or recorded, say so. A portal that isn't built says "Not built yet".
- **Nothing outward-facing goes out** on the founder's behalf without approval; draft only.
- **Money, legal, credentials and irreversible deletion are always the founder's:**
  - never charge, refund, sign, or change prices or legal text;
  - never rotate keys;
  - never set or ask for passwords or keys.
- **No surveillance:**
  - no covert recording, spyware or tracking;
  - no automated accusations;
  - an AI alert alone never escalates anything.
- **Human approval for consequential actions.**
- **Build foundations before interface:** data model, rules, permissions and audit come first, then screens. Test
  before claiming that something works.
- **The creative team:**
  - one creative proposal a week, for TEPOS or a client, within the agreed deliverables;
  - REEDS puts each proposal to the founder (and the client, where it affects them) for a yes or no;
  - nothing is built until it is approved.

## Founder's priorities (cash first)

1. Property Revenue Architect as an affordable monthly subscription. The price follows the market (decision 10).
2. REEDS works without being asked: standing requests and a weekly money brief by income cadence.
3. The agent's office (Real Estate Job portal).
4. The study path (Academics portal).
5. The private vault: document storage in IREKUN, with every read audited.
6. Tidy Capital, honestly: paper trading and a verifiable track record (Forex portal).
7. BAME talks to TEBOS both ways (this is TEBOS work).

## Open items for the founder

- **Set a password and turn on two-step sign-in.**
  - Use "Forgot password?" on TEPOS once; Supabase's free email allows only a few messages an hour.
  - Then turn on two-step sign-in, with a backup authenticator.
- **Enter real figures in Tidy Capital** (none are entered yet): essential costs, liquid reserves, debts, and income
  by stream.
- **Resend key and a verified domain** (decision 2). This lifts the email limit.
- **Supabase Pro**, when there's income (decision 11). TEPOS could then move to its own database project.
- **Delete the unused Vercel projects**, if wanted: `tebos-ex3f` and `tebos-production-v2`.

## Where things are in the code

| What | Where |
|---|---|
| Money rules and runway | `tebos/src/domain/resilience.ts`, migration `20261017040000_resilience_money.sql` |
| Two-step sign-in | `tebos/web/src/components/TwoStep.tsx`, migration `20261017100000_two_step_resilience.sql` |
| Separating the apps | migration `20261017180000_organisation_app.sql`, `tebos/web/scripts/check-bundles.mjs` |
| Property Revenue Architecture | `tebos/src/domain/property.ts`, `tebos/docs/property-revenue-architecture.md` |
| Resilience design | `tebos/docs/resilience/blueprint.md` (vaults, threat model, MVP order) |
| Roadmap and decisions | `tebos/docs/ROADMAP.md`, `tebos/docs/operator-log.md` |
