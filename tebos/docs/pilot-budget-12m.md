# The first TEBOS pilot: a 12-month estimate (28 Oct 2026)

**The pilot** is BAME, TEBOS's first client (`tebos-service-spec.md` §9: its agreed scope is piloted 17–23 Nov). This
covers what TEBOS itself pays for 12 months. By the founder's rule (spec §2), a client's own running costs (their
hosting, domain, SMS, phone number, call minutes) are theirs, disclosed first. They're listed at the end, not counted.

Rand figures use **R16.68 to the dollar** (Alpha Vantage, 28 Oct 2026, 18:01 UTC). Prices exclude VAT unless said.

Every line is marked:
- **Verified:** seen directly in TEBOS's own accounts, or on the provider's published price page, on 28 Oct 2026.
- **Measured:** read from TEBOS's live systems.
- **Assumption:** an estimate that nothing has confirmed yet. It's kept apart and can be replaced the moment a real
  figure exists.

## 1. Where things stand today (verified, 28 Oct)

| Service | Plan today | Paying now |
|---|---|---|
| Supabase (database) | **Free** (org "TEBOS10's Org"); 2 projects: `tebos-core`, `bame-os` | USD 0 |
| Railway (the worker) | **Free** (founder, 27 Oct) | USD 0 |
| Vercel (the websites) | Not confirmed. The billing API returns "costs not found", which fits a free Hobby team but doesn't prove it | Unknown, probably USD 0 |
| Anthropic (AI analysis) | Credit balance **zero**; every analysis is refused | USD 0 (nothing works) |
| Resend, Paystack | Not set up (decisions 1–2) | USD 0 |

**Spent so far on building it** (recorded in the 14 Oct audit, from the session list): about **USD 377** for this
development session and **USD 1,573** for the BAME session, about **USD 1,950 (≈ R32,500)** in total by 14 Oct. Later
spend isn't recorded in the repo.

## 2. What the pilot needs that TEBOS pays for

### 2a. Verified prices

| # | Item | Why the pilot needs it | Price (source) | 12 months |
|---|---|---|---|---|
| 1 | **Supabase Pro**, `tebos-core` only | The free tier has no automatic backups (Pro keeps 7 days), and a paying client's records need backups | USD 25 a month, including USD 10 of compute that covers one Micro project (supabase.com/pricing) | **USD 300 ≈ R5,004** |
| 2 | **Vercel Pro**, 1 seat | Hobby is the personal plan; selling to clients is commercial use (confirm against Vercel's terms) | USD 20 a month per seat (vercel.com/pricing) | **USD 240 ≈ R4,003** |
| 3 | **Railway Hobby** | See the measurement below: the worker is likely to outgrow the Free plan's USD 1 credit | USD 5 a month, including USD 5 of usage (docs.railway.com/pricing/plans) | **USD 60 ≈ R1,001** |
| 4 | **Company registration** (decision 7) | Invoices that are legally complete | R125 registration + R50 name reservation (CIPC, Aug 2026) | **R175** once |
| 5 | **Resend** (client email) | Payment links, contracts, invoices | Free: 3,000 emails a month (resend.com) | **R0** |

**Subtotal, verified: about R10,180 for 12 months** (about R850 a month).

**Taken from the client's payment, not paid upfront:**

| Item | Price (source) | On BAME's Medium plan, R2,500 a month by card |
|---|---|---|
| **Paystack** | 2.9% + R1 per local payment, excl. VAT; no monthly fee; payouts free (paystack.com/za/pricing) | R73.50 + VAT ≈ **R84.50 a month ≈ R1,015 a year** |

### 2b. Measured

- **The worker's size** (Railway, last 24 hours):
  - average memory 0.16 GB;
  - average CPU 0.0004 vCPU;
  - outbound traffic close to zero.

  Railway's own formula (memory × USD 10 + CPU × USD 20 a month) gives **about USD 1.60 a month**. That's above the Free
  plan's **USD 1 credit**, so the worker could stop part-way through a month. That's why item 3 is in the budget. It's
  worth confirming against Railway's usage page after the first full week.
- **The database:** 29 MB. The free and Pro limits are far away.
- **AI usage can't be measured yet.** All 628 analysis runs since 25 Sep have empty token counts (`agent_runs.tokens_in`
  and `tokens_out` are null), and 627 of them failed for want of credit. **The cost per analysis is therefore
  unknown.** Recording tokens is a small build step (tier 1). After it, this line becomes a measured cost.

### 2c. Assumptions (nothing has confirmed these yet)

| # | Item | Assumption | 12 months |
|---|---|---|---|
| A1 | **AI analysis** (Anthropic) | The worker's default is Claude Opus 5, at USD 5 / 25 per million input / output tokens (verified price). *Assumed:* about 20,000 input and 3,000 output tokens per analysis, so about USD 0.18 each; and 30–300 analyses a month for one pilot client plus TEBOS itself | **USD 63–630 ≈ R1,050–10,500** |
| A2 | **Domain** for TEBOS (a .co.za, needed for Resend's sending domain) | Price not checked | **about R100–200** |
| A3 | **Development sessions** from now on | Unknown. Spend was about USD 1,950 in the first three weeks of building; the pilot needs much less new building | **Not estimated:** record the real figure monthly |
| A4 | **Lawyer**: contract templates and POPIA advice (decision 3) | No quote | **Get 2 quotes**; no number until then |
| A5 | **Founder's time** | Not measured | Not costed |

## 3. The 12-month picture

| | 12 months |
|---|---|
| Verified (2a) | about **R10,180** |
| Paystack, taken from BAME's payments | about **R1,015** |
| Assumptions A1 + A2 | about **R1,150–10,700** |
| Lawyer, development, founder's time | **Open** until quoted or measured |
| **Known plus assumed** | **about R12,300–21,900**, plus the open lines |

**Set against the pilot's revenue (for context only):** BAME's tier is Medium, **R2,500 a month, or R30,000 a year if
paid in full** (operator log, decision 28). The equity arrangement (5% or 5.1%) and its agreements aren't settled, so
this isn't counted as income yet.

## 4. What delivering the pilot needs, and who

| Need | Who | State |
|---|---|---|
| Worker running every 15 minutes, with a heartbeat | TEBOS (tier 1) | **Done** (27–28 Oct) |
| Client workspace, pipeline, billing, audit trail, package limits | TEBOS (tier 1) | **Built** |
| Daily sales desk | TEBOS (tier 1) | **Built**, PR #101 |
| Per-client limits on AI usage and cost (spec: "gap") | TEBOS (tier 1) | To build |
| Token usage recorded, so A1 becomes measured | TEBOS (tier 1) | To build |
| Isolation and permissions audit before the pilot (spec §3–4) | TEBOS (tier 1) | To do, 3–9 Nov per the plan |
| Upgrade Supabase, Vercel and Railway (items 1–3) | **Founder (money)** | Decision |
| Anthropic credit (A1) | **Founder (money)** | Decision |
| Paystack and Resend keys, domain (items 5, A2) | **Founder** | Decisions 1–2 |
| Company registration (item 4) | **Founder** | Decision 7 |
| Lawyer-approved contracts, POPIA advice (A4) | **Founder** | Decision 3 |
| BAME's agreements: services and equity (5% or 5.1%) | **Founder** | Decision 28 |

## 5. The client's own costs (not TEBOS's, listed for the proposal)

- BAME's Supabase project `bame-os`: free now. On a paid org, about USD 10 a month extra compute for a second Micro
  project (supabase.com/pricing).
- Its domain, any SMS, and the voice agent's phone number and call minutes (ElevenLabs): priced in BAME's proposal
  before anything is set up.

## Sources checked on 28 Oct 2026

- **TEBOS's own accounts:**
  - Supabase: `get_organization` and `list_projects`;
  - Railway: the plan and 24 hours of service metrics;
  - Vercel: team billing (no costs found);
  - `agent_runs`: run counts and token columns.
- **Published prices:**
  - supabase.com/pricing;
  - vercel.com/pricing;
  - docs.railway.com/pricing/plans and docs.railway.com/guides/right-size-cpu-memory;
  - platform.claude.com/docs/en/about-claude/pricing;
  - paystack.com/za/pricing;
  - resend.com/docs/knowledge-base/what-is-resend-pricing;
  - cipc.co.za (Aug 2026 registration guide).
- **Exchange rate:** Alpha Vantage, USD/ZAR 16.679 on 28 Oct 2026.
