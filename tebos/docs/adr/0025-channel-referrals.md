# ADR 0025: Channel referrals between Pelser, Real Estate Assist and Tidy Enterprise

- Status: Accepted (built 7 Nov 2026; live when its migration is applied)
- Context: founder's enterprise directive, 7 Nov 2026 ("one operating system, three revenue channels")

## Context

The founder works through three channels:
- **Pelser Real Estate**, the employer: property sales and lettings under the agency's authority.
- **Real Estate Assist**, a referral partner: specialist landlord services.
- **Tidy Enterprise**, the founder's own company: property finance, business architecture and TEBOS.

A landlord met through the agency may need help the agency doesn't give. Referring them on is valuable, but it can
break three things:
1. **The person's privacy.** POPIA: information is shared only with consent, for a purpose.
2. **The employer's trust.** The agency's client book is not Tidy Enterprise's pipeline.
3. **The law on property-practice remuneration.** Whether a referral fee may be paid or received depends on PPRA
   registration (risk R-02).

The agent's office (TEPOS, private organisation, two-step) already keeps the agency's people as references only.

## Decision

Add `public.agent_referrals` to the agent's office. A referral is a record of what the founder did, never an action
TEBOS takes.

| Rule | How it's enforced |
|---|---|
| Consent comes first | Any status past "identified" needs when and how the person agreed. The date can't be in the future (`TEBOS_CONSENT_REQUIRED`) |
| Real Estate Assist | No introduction without the reference to its written referral arrangement |
| Tidy Enterprise | Someone from the agency's book (`via_agency`, always true when linked to a contact) needs the reference to the agency's written permission before an introduction. The founder's own leads don't |
| Fees | Only "none", "agreed in writing" (with where it is) or "not agreed". No amount column |
| No personal details | Contact details, ID numbers and secrets are refused in every free-text field |
| What was agreed stays fixed | The destination and origin are frozen. Consent is frozen once the referral moves on |
| States | `identified → consent_given → introduced → accepted/declined → served → resolved/not_resolved`; withdrawn from any open state before service. Skipped states are refused |
| Privacy | Private organisation only; owner only, in a two-step session; redacted audit; a deleted contact leaves the referral unlinked |

The interface (Real Estate Job → Referrals) shows:
- per destination, how many are open, introduced, accepted and resolved;
- what a referral still needs before it is saved (`referralGaps`, mirroring the database).

## Consequences

- The three channels can be worked together without mixing their records or their money.
- The written agreements become the gate. Nothing can be introduced until the founder has them (decisions 12 and 25,
  and the new decision 42).
- Fee amounts and commissions stay outside TEBOS until the PPRA position is confirmed.
- **Tests:**
  - `supabase/tests/99zzh_channel_referrals.sql` (rules, isolation, redaction);
  - `test/referrals.test.ts` (mirror, gaps, summary);
  - `e2e/agent.spec.ts` (the form refuses a step without consent, then saves it).
