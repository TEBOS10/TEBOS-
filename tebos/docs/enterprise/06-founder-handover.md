# Founder handover manual

What the founder does, what the systems do, and what stays reserved. It is updated as processes move up the autonomy
levels ([target architecture §6](02-target-architecture.md#6-autonomy-maturity-model)).

## What only you do

| Area | What |
|---|---|
| Relationships and sales | Calls, meetings, diagnosis, negotiation, closing |
| Commitments | Prices, contracts, fees, payments, hiring, any spend |
| Access | Credentials, keys, who is invited, what is deleted |
| Partners | Written agreements with Pelser and Real Estate Assist, and with every specialist |
| Regulated matters | Your PPRA position; anything a lender, attorney or FSP must decide is referred to them |
| Anything sent | Emails, posts, messages, referrals. TEBOS drafts; you send |

## What the systems do

| System | What it does without you |
|---|---|
| Morning run (REEDS routine, daily) | Checks health, audit chains and advisors; researches prospects; fixes and ships one small step; merges its own green PRs; writes the operator log; briefs you |
| Worker (Railway, every 15 minutes) | Pipeline stages, billing runs, monitoring, maintenance signals, heartbeat |
| Database | Refuses anything that breaks a rule: skipped states, missing consent, personal details where they don't belong, money outside the ledger, secrets |
| Agent's office | Agenda of every next step; the agency checklist; referrals with consent |

## Your weekly routine (about 2 hours)

1. Read the morning briefs; act on the tier-3 asks in the founder's decisions table (`operator-log.md`).
2. Call the sales desk's due list (`/sales/calls`). Record each outcome.
3. Update the agent's office and referrals after each agency day.
4. Review the scorecard when there is money data.

## Where things are

- **Decisions waiting on you:** the table at the top of `docs/operator-log.md`.
- **This architecture:** `docs/enterprise/`.
- **Product and capability state:** `docs/product-register.md` and `docs/REGISTER.md`.
- **Why things are the way they are:** `docs/adr/`.
