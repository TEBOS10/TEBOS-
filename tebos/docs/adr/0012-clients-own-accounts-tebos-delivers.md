# ADR 0012: Clients own their accounts; TEBOS's team delivers; the founder isn't the delivery team

Date: 2026-11-01 · Status: accepted (founder, 1 Nov 2026)

## Context

The founder, 1 Nov:
- "capacity of handling 50 clients at one go";
- "instead of using my account for all this let's create accounts for clients and have TEBOS have access to modify
  their operating systems or web apps";
- "I'm not the one fixing the client's projects, that's the whole company's responsibility … should they need to
  modify or edit something they directly are in communication with TEBOS and TEBOS delivers consistently."

## Decision

1. **Every client has their own TEBOS account.** Onboarding already creates the client's organisation and their admin
   login once they've paid and accepted the agreement.
   - Their website, its scope, approvals, requests and history live in *their* organisation, never in the founder's.
   - The client's page is **Your website** (`/website`).
2. **The client's accounts with other providers belong to the client.** That includes hosting, domain, repository,
   database, email and payments.
   - TEBOS is given delegated access, and `web_integrations` records it: who owns the account, what access TEBOS has,
     what it's for, the date the access was checked, and how the access ends.
   - An account TEBOS has to hold for a client needs a written hand-over plan.
   - Passwords and keys are never stored in TEBOS. They stay in each provider's own access controls, or in the
     client's own secret manager.
3. **Clients talk to TEBOS, not to the founder.**
   - A change request from **Your website** lands on the project and in the maintainers' dashboard.
   - It counts against the plan's monthly allowance, like every channel request.
   - The client approves scope, design and release from their own account; the database refuses anyone else's
     approval.
4. **Delivery belongs to TEBOS's team, sized by capacity.**
   - Every project has a maintainer: by default the client's maintainer from the pipeline.
   - A maintainer runs at most **8** open projects, and the database refuses a 9th. 50 clients need **7
     maintainers**.
   - The dashboard shows each maintainer's load, and how many more maintainers the open work needs.
5. **Measured, not assumed:** with 50 client projects (600 tasks, 250 assets) on a local Postgres, the dashboard's
   read takes about 10 ms, and the team load and history about 1 ms each. The test `99zzc` puts 52 projects on one
   board. Live performance on the free Supabase plan is NOT VERIFIED.

## What "TEBOS functions without the founder" needs (not yet true)

| Needed | Today (live database, 1 Nov) | What changes it |
|---|---|---|
| People with the maintainer role to do the work | **0 maintainers**, 1 platform admin (the founder) | Founder: invite maintainers (Staff → Invite, role Maintainer). Hiring and paying them is a money decision (tier 3) |
| Paying clients | **0 active plans** | The sales desk's calls (18 on the desk), and Paystack live (decision 1) |
| Money reaching the founder's account | Paystack key not set | Founder: decision 1. The billing code exists; nothing charges anyone until it's set |
| AI doing parts of the work (drafting, checking) | Analysis paused: **no Anthropic credit** | Founder: add credit (decision 2b). Even then, AI output goes through a person's review: nobody passes their own review |
| Live client sites | No commercial-use host chosen | Founder: the Vercel plan check, or another host (`TOOLCHAIN.md` §3) |

## Consequences

- **The founder's account is no longer where client work happens.** Client data sits in client organisations, and
  TEBOS's staff reach it through their staff role, which the audit trail records.
- **The founder's job becomes the decisions only the owner can make:** money, prices, legal terms, hiring and
  credentials. Each one is listed in the operator log's decisions table.
- **REEDS still doesn't send outward communications on its own.** The client channel is inside TEBOS: a maintainer
  replies there, and nothing is emailed or messaged outside without approval.
