# BAME commercial diagnostic (TEBOS-led), 26 October 2026

**Scope.** BAME is the one permitted exception to TEBOS's property focus. This diagnostic is bounded:
- the question is why enquiries don't become paying clients;
- one experiment to test;
- a 14-day decision gate.

It does not make BAME a direction for TEBOS's product.

**Rule for this document.** Every statement is marked:
- **Confirmed**: read from BAME's code, its live site or its database on 26 Oct 2026;
- **Hypothesis**: to be tested;
- **Unknown**: not available to us yet.

No prospect, result or figure here is invented. No personal details are copied into this document.

## 0. Sources of truth

| What | Where | Status |
|---|---|---|
| Live site `bamemarketing.site` | Vercel project `bame-live`. It builds from the separate repo `TEBOS10/bame-live`, branch `main`. The last production deploy was 14 Oct, commit `c6b2ea0` | Confirmed |
| Code that site runs | Mirrored in `TEBOS10/TEBOS-`, branch `claude/bame-intake-integration-s5ue43`, folder `bame/`, at `f9de3e4`. That branch's commit messages say bame-live is "brought up to date" from it | Confirmed |
| `bame/` on TEBOS-'s `main` | 60 files behind the live code: a stale copy, not edited | Confirmed |
| Vercel project `bame-os` | Preview builds of TEBOS- branches only, behind Vercel's team sign-in; it serves no public site | Confirmed |
| BAME's database | Supabase project `bame-os` (`ugdmvixywmrwwilkcblq`) | Confirmed |

## 1. Audit

### Confirmed evidence

- **The offer.** The site sells brand management for sport, built around ongoing athlete retainers:
  - Foundation: **R6,500 a month**;
  - Growth: **R10,000 a month**, labelled "Most popular";
  - Custom: quoted.

  Club and event paths have no prices: they lead to "Discuss this path".
- **The two ways in:**
  - a short form on the home page (`/api/lead`, stored in `leads`), which then sends the visitor to the full diagnostic;
  - the full diagnostic at `/intake`, stored in `diagnostics`.
- **The diagnostic is long:**
  - 16 sections and 101 fields in `src/lib/intake-schema.ts`, of which 13 are required;
  - the athlete path shows about 14 sections.

  The home page button says **"Take the two-minute diagnostic"**. That promise doesn't match the form.
- **Personal details travel in the address bar.** After the short form, the visitor's name, email and phone are put in
  the `/intake?…` URL (`QuickLeadForm.tsx`). From there they reach browser history, server logs and analytics page views.
- **What the database holds** (counts only, read 26 Oct):

  | Table | Rows |
  |---|---|
  | `leads` | 0 |
  | `diagnostics` | 2 |
  | `prospects` | 1 |
  | `outreach_log` | 1 |
  | `opportunities` | 1 |
  | `players` | 2 |
  | `contracts` | 0 |
- **Both diagnostics are untouched.** They arrived on 23 Sep and 8 Oct, and both are still `received`: neither has
  been assigned to a department or moved on.
- **The one prospect** came through Instagram and is marked `deferred`, as is its single outreach entry (8 Oct).
- **The one opportunity is a sponsorship, marked won.** It is BAME's only recorded commercial win.
- **Insert and delete totals since the database's statistics last reset:**
  - `leads`: 4 inserted, 3 deleted;
  - `diagnostics`: 17 inserted, 11 deleted.

  Most of these were likely tests. That is a hypothesis: the records are gone, so it can't be checked.
- **Measurement.** The site runs cookieless Vercel Web Analytics for page views. No step of the enquiry journey is
  measured.
- **Security note:**
  - the public (`anon`) role holds every table privilege on `leads`, including DELETE and TRUNCATE;
  - row security allows anonymous inserts only, and the public API doesn't expose TRUNCATE, so the practical exposure
    is low;
  - the grants should still be narrowed to INSERT. That is a change to BAME's live database, so it waits for approval.

### Hypotheses (to test, not conclusions)

1. **H1. The journey loses people before they ever reach a conversation.** A "two-minute" promise followed by a
   101-field form, with no human follow-up of the two diagnostics that did arrive. This is the leading hypothesis,
   because the evidence is in the code and the database.
2. **H2. The price doesn't fit the segment.** R6,500–R10,000 a month is a large discretionary spend for an emerging
   athlete. Athletes with that budget often already have agents.
3. **H3. Open-ended brand work reads as a nice-to-have.** A bounded piece of work with a commercial aim may sell
   better. The only win was a sponsorship.
4. **H4. Clubs and events may be better buyers.** They have budgets, sponsors and a clear reason to pay. The site gives
   them no price and no defined offer.
5. **H5. Weak proof.** The site shows athletes BAME represents, but no outcomes. The "Most popular" label has no
   visible evidence behind it.

### Unknowns

- Traffic: how many people visit, and where they come from. Runtime and analytics data are not available to this session.
- Why the deferred prospect deferred.
- What the won sponsorship was worth to BAME, and what delivering it cost.
- Whether any enquiries arrived by WhatsApp, Instagram or phone and were never recorded.
- BAME's delivery cost per package.

### Blockers

- **No changes to BAME's code from here.** Push access to `TEBOS10/bame-live` was refused in this session. The
  correction is prepared as a tested patch (§5) and waits for the founder to apply it, or to grant access.
- **Too few records to read anything from.** Five recent losses to interview don't exist in the records. The tracker
  (§3) starts with the three records there are, and §7 says how to collect more.

## 2. The buyer journey, and where it breaks

| Step | Measured today? | What the records show |
|---|---|---|
| 1. Sees BAME (Instagram, referral, the site) | Page views only | Unknown volume |
| 2. Chooses a path (athlete, club or event) and a package | No | Unknown |
| 3. Sends the short form | `leads` rows | 0 kept |
| 4. Starts the diagnostic | No | Unknown |
| 5. Completes the 101-field diagnostic | `diagnostics` rows | 2 |
| 6. BAME reviews and recommends | Status changes | **0 of 2 reviewed** |
| 7. Proposal or contract | `contracts` | 0 |
| 8. Pays | No | 0 recorded |

**The earliest point where people measurably fall away is step 6.** The two people who completed everything were never
answered in the system.

Before that, steps 3–5 are where H1 says most people leave, but nothing measures them yet. §6 adds the measuring points.

## 3. The objection interview and the tracker

### Interview guide (15 minutes, by phone; ask permission to take notes)

1. What made you look at BAME at the time?
2. What were you hoping would change for you, your club or your event?
3. What happened next? Where did you stop?
4. What would have had to be true for you to go ahead?
5. How did the price compare with what you expected, and with what you were spending on this already?
6. Who else would have had to agree?
7. If BAME offered a short, fixed piece of work aimed at sponsors, with a report at the end, would that be worth a
   conversation? Why or why not?

Write down their words. Don't sell during the interview.

### Tracker (no names here; the record lives in BAME's staff system)

| # | Record | Date | Where it stopped | Reason given | Tag |
|---|---|---|---|---|---|
| 1 | Diagnostic (record 1 of 2) | 23 Sep | Step 6: never reviewed | Not asked yet | Follow-up gap |
| 2 | Diagnostic (record 2 of 2) | 8 Oct | Step 6: never reviewed | Not asked yet | Follow-up gap |
| 3 | Prospect via Instagram | 8 Oct | Deferred | Not recorded | Unknown |

Tags to use: price · scope unclear · no trust or proof · timing · wrong person · follow-up gap · no need · unknown.

## 4. Offer card: Sponsor-ready sprint (working title; a hypothesis)

| | |
|---|---|
| **Segment** | Clubs, academies and sports events in South Africa with a sponsor-worthy audience: members, players, attendance or reach |
| **Pain** | They need sponsor income, but have no clear proposition, no list of target sponsors and no follow-up system. Hypothesis H4 |
| **Evidence** | BAME's only recorded win is a sponsorship. Clubs and events have no defined offer on the site today. Not yet tested with buyers |
| **Deliverables** | (1) a baseline of current partners, open conversations and follow-up; (2) one sponsor proposition and a one-page partner pack; (3) a target list agreed with the client; (4) outreach in the client's name, with their approval, every reply tracked; (5) a closing report |
| **Timebox** | A fixed window. Suggested: 4 weeks, to be confirmed by BAME |
| **Excluded** | Guaranteed sponsorship or income; sponsor contracts (the client's own adviser handles those); ongoing social media and production |
| **Client provides** | Audience figures as known, current sponsors and their terms, one approver, usable photos and video |
| **Success measures** | Sponsors approached; replies; meetings booked; proposals sent; agreements signed (with the client's permission to report them) |
| **Delivery cost** | Unknown. BAME to estimate the hours for the five deliverables before pricing |
| **Pricing to test** | BAME's decision. Hypotheses: (a) one fixed fee below a month of Foundation; (b) a fixed fee plus a success fee on signed sponsorship, if lawful and agreed in writing. Nothing public until BAME and the founder approve |

The sprint never promises revenue. It is described as sponsor-readiness and outreach, never as a "capital gains"
strategy.

## 5. The correction, prepared and tested (not deployed)

The patch is `funnel-and-sprint.patch` in this folder, against `bame/` at `f9de3e4`. That is the code the live site runs.

**What it changes:**
- **The CTA tells the truth.** "Take the two-minute diagnostic" becomes "Start the full diagnostic", with a line saying
  how long it is and that answers stay on the device until sent.
- **Personal details leave the URL.** The short form hands name, email and phone to the diagnostic through the tab's
  session storage. The URL keeps only the path, the sport and the lead reference.
- **The journey is measured** (§6).
- **A preview page, `/sprint`, presents the offer card to clubs and events.** It is not indexed and not linked from
  the site. Its enquiries arrive in `leads` with focus "Sponsor-ready sprint (pilot)", so they can be counted.

**Checked in an isolated copy of the live code:**
- lint is clean;
- `next build` passes, with `/sprint` prerendered;
- the page carries `noindex, nofollow`;
- at phone width (390px) nothing overflows.

**Not checked:** a real enquiry end to end. That would write to BAME's live database.

**To apply it:**
- apply the patch on `claude/bame-intake-integration-s5ue43`;
- bring it to `TEBOS10/bame-live` the way earlier changes were;
- Vercel then builds a preview, and production changes only when `bame-live`'s `main` moves.

**To roll it back:** revert the commit, or, for the experiment alone, delete `src/app/sprint/`.

## 6. Measuring the journey

| Event | When | Properties (never personal) |
|---|---|---|
| `lead_submitted` / `lead_failed` | The short form is sent | `contact_type` |
| `intake_viewed` | The diagnostic opens | `contact_type` |
| `intake_step` | A section is completed | `step`, `of`, `section` |
| `intake_submitted` / `intake_failed` | The diagnostic is sent | `contact_type`, `sections` |
| `sprint_viewed` | The sprint preview opens | — |
| `sprint_enquiry_submitted` | A sprint enquiry is sent | `contact_type` |

- The events use the site's existing cookieless Vercel Analytics.
- Custom events only appear on a Vercel plan that includes them. If they don't appear, the tables still count each
  step:
  - `leads`, including sprint enquiries by their focus;
  - `diagnostics`, and the status each one reaches.
- **The weekly report:**
  - enquiries;
  - diagnostics started, by the last section reached;
  - diagnostics completed;
  - diagnostics reviewed within 2 working days;
  - sprint views and enquiries.

## 7. The 14-day validation plan (27 Oct – 9 Nov 2026)

1. **Days 1–2: fix the follow-up first.**
   - Assign and answer the two waiting diagnostics.
   - Ask both people the interview questions (§3).
   - Record their answers in the staff system.
2. **Days 1–3: apply the patch** once it's approved, then confirm the events or the table counts appear.
3. **Days 3–10: test the offer.** Show the sprint card to 10 clubs, academies or events BAME can reach by referral or
   existing contact. Use the staff call sheet; no bulk messaging.
4. **What counts:**
   - **interest**: a booked 20-minute call;
   - **a paid commitment**: a signed scope and price, or a deposit;
   - interest without a commitment is recorded as interest, not as revenue.
5. **Day 14 (9 Nov): decide.**
   - **Proceed** if at least 2 calls are booked and at least 1 commitment is made.
   - **Change the offer** if calls happen but nobody commits: record the objections.
   - **Change the segment or channel** if fewer than 3 of the 10 reply.
   - **Stop this experiment** if nobody replies after a second touch.

## 8. Decision (26 Oct 2026)

**Change segment/channel.** Test the sponsor-ready sprint with clubs and events, and fix the follow-up and the
diagnostic's promise. The athlete retainers stay as they are while the test runs.

**The evidence:**
- the only recorded win is a sponsorship;
- 0 of 2 completed diagnostics were ever reviewed;
- the "two-minute" promise sits on a 101-field form.

**Review date: 9 November 2026,** in the Sunday BAME review (45 minutes at most). Time spent on BAME this week: today's
diagnostic. Its purpose: one bounded commercial test.

**Needs approval, not done:**
- applying the patch to BAME's live site;
- any public price;
- narrowing the `anon` grants on BAME's `leads` table.
