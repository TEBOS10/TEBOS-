# Operator log

The build loop's record, newest first. See [`OPERATOR.md`](OPERATOR.md) for the rules each run follows.

## Founder's decisions (only you can unblock these)

Update this list every run; strike items when they're done.

| # | Decision | What it unblocks |
|---|---|---|
| 0 | **Run the first real operating systems.** Pick real businesses (BAME first, then pilots) and let TEBOS lay down their blueprint | Real proof. The ten blueprints are templates, not client work; only real clients make a portfolio |
| 1 | Paystack secret key on the worker, and the webhook `https://tebos-worker-production.up.railway.app/webhooks/paystack` | Taking the first payment, and monthly invoices |
| 2b | Replace the worker's `ANTHROPIC_API_KEY` with a key **scoped to a workspace** (the key set on 8 Oct is not, so every request is rejected) | Findings from scans and interviews: the next product step |
| 2 | Resend key and a verified sending domain | Every client email: payment links, contracts, invoices, reminders, the next-day outline after an intake call |
| 2c | A phone number on the voice provider, and the intake agent (`ELEVENLABS_INTAKE_AGENT_ID`, set-up in the README) | TEBOS ringing prospects from meetings |
| 3 | A lawyer approves the contract templates (standard and company) and advises on POPIA | Signing clients |
| 4 | Activate the 9 draft objectives on TEBOS's board | The company measuring itself, and the maintainer queue watching TEBOS |
| 5 | Founder name and title for outreach and the site | Sending the outreach drafts |
| 6 | Social accounts created | Publishing the social pack, and the approved drafts on the Marketing page |
| 7 | Company registration and VAT number | Invoices that are legally complete |
| 8 | Make the repo private, rotate database passwords, turn on leaked-password protection | Protecting the platform from copying |
| 10 | Approve applying the `marketing_role` migration (built and tested 7 Oct; the apply was cancelled on 8 Oct) | The marketing department: its role, playbook and staff menu (in history as 7ef841a; reverting dfe3b18 brings it back unchanged) |
| 9 | Confirm the `capital` schema (18 tables, applied 3 Oct from outside this repo) should live in TEBOS's database, or move it to its own project | Keeping TEBOS's system of record clean, and its migrations in one place |

## 10 Oct 2026: clients see plainly that analysis is paused, never the provider's raw error

- **Read:**
  - Main was green, and the worker was live (SUCCESS) since 9 Oct.
  - The 9 Oct pause worked: 38 provider-fault runs in about 19 hours, one every 30 minutes, none counted against a
    business.
  - The key is still not scoped to a workspace (decision 2b), and the marketing migration is still unapproved
    (decision 10).
  - Problem found: those failed runs stored the provider's raw error, its name and a JSON body, on rows that each
    organisation's System page shows to its members. The page also never said that analysis was paused.
- **Chosen (rule 2, live signal):** what clients see about a live fault.
- **Built (no migration):**
  - A provider fault is stored in neutral words that name no service, with its kind (`fault`) on the run. The raw
    message goes only to the worker's log (`intelligence.paused`, `analysis.error`).
  - An unexpected error is stored as "Analysis failed unexpectedly", and logged the same way.
  - `src/domain/analysis.ts`:
    - `analysisPausedSince` reads the pause from the recorded runs;
    - `runDetail` shows the neutral words, including on runs recorded before this change.
  - On the System page: an "Analysis is paused" notice, with when it started. Each worker run shows the neutral
    words.
  - Branch housekeeping: the marketing department restored by draft PR #34 is held back again by dfe3b18. It
    stays in history and comes back with one revert once its migration is approved.
- **Proved:**
  - core: typecheck and 253 unit tests pass (new `analysis.test.ts`; the worker test checks the stored words).
  - `test:db`: every SQL file passes, and all 50 integration tests pass.
  - web: typecheck, 26 unit tests and 72 e2e tests pass (new `system.spec.ts`). The production bundle names no
    provider.
- **Next:** the same two decisions unblock the most: a workspace-scoped key (findings start), and the marketing
  migration.

## 9 Oct 2026: a provider fault pauses analysis instead of using up every business's attempts

- **Read:**
  - Main was green.
  - On 8 Oct the founder set the Claude API key, which turned the intelligence stage on. Saving it redeployed the
    worker from a BAME branch: another session had switched the worker's source. That build failed. This session
    reconnected the worker to main, and it is live (SUCCESS).
  - The key is not scoped to a workspace, so the provider rejects every request.
  - From 17:02 to 23:08 the worker made 15 failed analyses: 3 for a scan, 3 for one business review, and 9 for
    BAME's review. Each set of 3 came within seconds, and BAME's review got a fresh 3 whenever its connected system
    recorded new figures. Nothing was charged, because rejected requests aren't billed.
  - 7 Oct's marketing department (PR #33, commit 7ef841a) is built and tested, but not live:
    - applying its migration timed out once on 8 Oct, and was then cancelled at the approval step;
    - it waits for the founder (decision 10);
    - its screens need the migration, so this PR holds it back with a reverting commit (cc20184), and reverting
      that commit restores it.
- **Chosen (rule 1, broken):** the worker treated a provider fault as the business's fault, and retried at once.
- **Built (worker only, no migration):**
  - The provider reports a rejected key or request as *misconfigured*, and an overload or outage as *unavailable*.
  - Either pauses the whole analysis stage. A set-up fault pauses it for 30 minutes. An outage pauses it for 1
    minute, doubling each time up to 30, and back to 1 after a success. While paused, nothing is claimed.
  - A provider fault is marked on its run (`providerFault`), so it doesn't count towards the business's 3 attempts.
  - A failed analysis is retried no sooner than 10 minutes later.
- **Proved:**
  - core: typecheck and 248 unit tests pass (four new worker and provider tests).
  - `test:db`: every SQL file passes, and all 50 integration tests pass. A new `intelligence-retry-pg.test.ts`
    checks the wait, the provider-fault marking and the limit. The existing three-attempts test now uses a failure
    the analysis caused, and still checks the limit of 3.
  - No interface change.
- **Next:** bring the marketing department back as soon as its migration is approved. Then findings, once a
  workspace-scoped key is in place.

## 6 Oct 2026: marketing and PR drafts, approved before anything goes out

- **Read:**
  - Main was green, and the worker was live (SUCCESS) with no errors since 5 Oct's deploy.
  - The company snapshot is still all zeros, no maintainer items are open, and the advisors are unchanged.
- **Chosen (rule 4, company plumbing):** every product item is gated. Item 2 needs the Claude API key, item 5
  needs a connected tool on a client board, and stage 5 waits on the earlier gates. So this run took item 3 of
  "TEBOS on its own board": marketing and PR drafting with approval before publishing.
- **Built (migration `content_drafts`):**
  - Staff (sales, maintainer) draft LinkedIn, Instagram, Facebook, X and TikTok posts, blog articles, press
    releases and newsletters on a new Marketing page (`/marketing`).
  - The text is editable only while it's a draft. Once sent for approval it is frozen; to change it, pull it back
    to a draft, which needs approval again.
  - Only a platform admin approves or sends back, and sending back needs a note. Staff can't approve their own.
  - "Published" is recorded only for an approved draft, by a person, with the https address where it went live.
    It's never inferred, and TEBOS never publishes anything itself. Drafts are never deleted, only withdrawn.
  - Mirrored in `src/domain/content.ts` (`canMoveDraft`, `canEditDraft`, `isPublishedUrl`).
- **Proved:**
  - core: typecheck and 244 unit tests pass.
  - `test:db`: every SQL file passes (new `99x_content_drafts.sql`), and all 47 integration tests pass.
  - web: typecheck, 26 unit tests and 70 e2e tests pass (new `marketing.spec.ts`).
- **Next by the rules:** item 4 of the own board (department roles with playbooks), unless the Claude API key
  arrives, which unblocks item 2 (findings named by flow).

## 5 Oct 2026: architecture proposals for founder-only steps

- **Read:**
  - Main was green. 4 Oct's run merged PR #29 but stopped before reconnecting the worker, so this run did that
    first; the worker deployed it (SUCCESS) and started with no errors.
  - The company snapshot is still all zeros. No maintainer items are open, and the advisors are unchanged.
  - The live boards have 11 steps only the founder does, and 8 of them have no written rule.
- **Chosen (rule 3, the product):** "Next for the board", item 4: architecture proposals, one approvable proposal per
  founder-only step.
- **Built (migration `step_proposals`):**
  - The business's team (operators or admins) proposes, for a live founder step, who does it instead (the team,
    a provider, an automation, or the customer), the written rule they follow, and why. An automation must name
    the piece it runs on.
  - There is one open proposal per step, and its content is frozen once proposed.
  - Only the business's owner (an org admin) decides, and never on their own proposal. A rejection must say why.
    A decided proposal can't be edited, and the proposer can withdraw an undecided one.
  - `approve_step_proposal` changes the board in one transaction. It retires the founder step (the record of how
    it was, with its evidence) and puts a new stated, written-down step in its place. Nothing is overwritten,
    which keeps yesterday's rule: an observed step never quietly becomes something else.
  - Mirrored in `src/domain/board.ts` (`checkStepProposal`, `canDecideProposal`).
  - On the board: "Propose a rule" on each founder step, and the open proposal with Approve and Reject for the
    owner, or Withdraw for its proposer.
- **Fixed (root cause found):** the self-check e2e test that failed intermittently (logged on 30 Sep) read the
  recorded request straight after the click. The click returns before the browser sends the request, so under a
  busy full run the check sometimes saw nothing. It now waits for the request; what it checks is unchanged.
  Every other such check already waits for a screen change first. The full e2e suite then passed three runs in a row.
- **Proved:**
  - core: typecheck and 239 unit tests pass.
  - `test:db`: every SQL file passes (new `99w_step_proposals.sql`), and all 47 integration tests pass.
  - web: typecheck, 26 unit tests and 68 e2e tests pass (new `proposals.spec.ts`).
- **Next by the rules:** item 5, automation of steps that have a written rule and a connected tool. Its first slice
  needs a connected tool on a client board; otherwise item 2, findings named by flow, once the Claude API key arrives.

## 4 Oct 2026: observed pieces, confirmed only by evidence TEBOS obtained

- **Read:**
  - Main was green, and the worker was live with no errors since the 2 Oct deploy.
  - The company snapshot is still all zeros: no enquiries, clients or intake calls yet. No maintainer items are open.
  - The advisors show only the known by-design warnings: each public function checks its own token or role.
  - 3 Oct's run stopped after choosing its work, before building it; nothing from it was shipped.
- **Chosen (rule 3, the product):** "Next for the board", item 3: observed pieces. Item 2 (findings named by flow)
  waits on the Claude API key (decision 2b).
- **Built (migration `board_observed_pieces`):**
  - A piece or step of the board is observed only when it cites evidence TEBOS obtained and that is current
    (acquired, partly acquired, or system-generated). What the owner said (an interview answer, a statement)
    makes a piece stated, never observed: the owner's word is not proof of itself. Before, the database accepted
    an owner's statement here.
  - Once evidence confirmed a piece, it stays observed: it can cite newer evidence, or be retired, but never
    quietly fall back to stated or proposed.
  - Mirrored in `src/domain/board.ts` (`canObserve`, `canChangeBasis`).
  - On the board: "Confirm from evidence" on each piece offers only evidence TEBOS obtained (scans, documents,
    connected systems), and an observed piece shows what confirmed it ("Confirmed by: …"), flagged if that
    evidence has since gone stale. With nothing obtained yet, it says how to get evidence instead.
  - Live check before applying: every observed piece and step on the live boards (BAME's 20) already cites
    obtained evidence from documents or connected systems, so nothing live breaks.
- **Proved:**
  - core: typecheck and 237 unit tests pass.
  - `test:db`: every SQL file passes and all 47 integration tests pass. The board test that once made a piece
    observed from the owner's statement now asserts that this is refused.
  - web: typecheck, 26 unit tests and 66 e2e tests pass (new `observed.spec.ts`).
- **Noticed, not touched:** on 3 Oct something outside this repo applied four `capital_*` migrations to TEBOS's
  live database, creating a separate `capital` schema with 18 tables. They don't touch TEBOS's tables. Decision 9
  asks the founder whether this belongs in TEBOS's database.
- **Next by the rules:** item 4, architecture proposals (suggested rules and owners for founder-only steps, each
  an approvable action), unless the Claude API key arrives first, which unblocks item 2.

## 2 Oct 2026 (night): meeting mode, and intake calls that start on the spot

- **At the founder's request:** in meetings, show TEBOS instead of talking about it. After the film, the prospect
  types their number and TEBOS rings them straight away; the next day they get an outline and are on the waiting
  list; a "yes" reaches the founder to close.
- **The founder's decisions:** a short intake call before payment, not the diagnostic (it stays paid); and only staff,
  in the meeting, can start a call (no public "call me" button).
- **Built:**
  - Migration `meeting_intake_calls` and `start_meeting_call`: staff only, consent word for word, 20 calls an hour,
    forward-only states, never completed without words, the answer never overwritten.
  - The intake worker (`src/intake/`): rings at once through its own voice agent, follows the call, reads the
    agent's yes or no strictly, and queues the next-morning outline email (blueprint pieces and flows by name only).
  - Meeting mode (`/meet`): full screen, no staff navigation. Scenario films (a gym, a sports agency) built from real
    blueprint steps and labelled as illustrations, and the TEBOS film. Then the call form, then the call's progress live.
  - The pipeline shows each intake call's outcome; the opportunity page shows what was said, and staff can record an
    answer the call didn't settle.
  - An 11th blueprint: gym or fitness studio (access control at the door, a morning attendance report, member
    messages answered from the FAQ, failed debit orders recovered), from the gym owner's own pains.
  - The outbound call script is written for the playbook (migration `outbound_call_script`), held back until the
    founder approves applying it to the live database.
- **Proved:** core typecheck and 234 unit tests; `test:db` with every SQL file (new `99v_intake_calls.sql`) and 47
  integration tests (new `intake-pg`); web typecheck, 26 unit tests (new scenario check) and 64 e2e tests (new `meet.spec.ts`).
- **To run live, the founder needs:** a phone number connected to the voice provider, and a second voice agent for
  intake (set-up text in the README) with `ELEVENLABS_INTAKE_AGENT_ID` on the worker; the client email key for the
  next-day outline.

## 2 Oct 2026 (evening): the waiting list, and operating systems that start by themselves

- **At the founder's request:** a waiting list, and once a business is accepted, TEBOS starts on it without being told.
- **Built:**
  - A public `/waitlist` page: name, business, email, kind of business (one of the ten blueprints, or something
    else) and team size. It goes through the same throttled enquiry path as every other public form, and is linked
    from the home page, the site menu and the sitemap.
  - Migration `waiting_list`: enquiries carry `kind` (enquiry or waitlist) and `industry`; an opportunity remembers
    both, and links to the client's business on TEBOS once it exists.
  - At onboarding the worker now creates the client's business on TEBOS and lays the blueprint for their kind of
    business onto its board as proposals, then marks "Draft operating system on the board" done with a note saying
    exactly what it laid down. Nothing is marked stated or observed: the owner confirms each piece on day 3.
  - Acceptance stays a person's decision. Everything after it (payment link, agreement, account, blueprint, the
    3-day plan) already ran by itself; the blueprint is the new part.
- **Proved:**
  - core: typecheck and 228 unit tests pass.
  - `test:db`: every SQL file and all 42 integration tests pass. The pipeline test now takes a client from the
    waiting list to onboarded and checks the board holds 5 pieces, 3 flows and 13 steps, all proposed.
  - web: typecheck, 23 unit tests and 61 e2e tests pass, including the new waiting-list test.
- **Still needed to run live end to end:** decisions 1 and 2 (Paystack and Resend keys).

## 2 Oct 2026 (later): BAME is the first real operating system

- **At the founder's request**, BAME's operating system started on the new 1–3 day plan.
- **Day 1, done:** the sports-agency blueprint, fitted to BAME, was laid onto BAME's board as proposals.
  - It is fitted to BAME's own tools: the roster lives in the staff operating system, commission goes to the capital
    ledger, and enquiries come in through the diagnostic intake.
  - It is fitted to BAME's own teams: Sales, PR, Administration and Finance.
  - It adds an "Athlete outreach to diagnostic" flow for the sales push.
  - The result is 3 tools, 3 flows and 12 steps, each with a written rule. BAME's existing observed board was
    left untouched.
- **Objectives added as drafts, owned by the founder:**
  - "Every enquiry answered within 24 hours" (by 31 Oct). It can't be measured yet: BAME's live snapshot reports how
    many leads arrive, not how fast they're answered.
  - "New leads from events, athletes and opportunities each month" (20 a month), bound to BAME's live lead count.
    The target of 20 is a proposal for the founder to confirm.
- **Day 2:** the founder answers the diagnostic interview.
- **Day 3:** the founder confirms, changes or removes each proposed piece on BAME's board, and activates the objectives.

## 2 Oct 2026: an operating system in 1 to 3 days

- **Read:**
  - Main was green, the worker was live, and the live site was up to date.
  - The company snapshot is still all zeros, with no clients yet.
- **Chosen (rule 3, the product):** yesterday's named next step, which is also the founder's target: "every
  operating system takes 1 to 3 days".
- **Built:** the delivery plan a client gets at onboarding (`src/domain/delivery.ts`).
  - **Small businesses:**
    - day 1: the kick-off (the blueprint is chosen) and the draft operating system on their board;
    - day 2: the diagnostic interview;
    - day 3: the operating system confirmed with the owner and objectives set;
    - day 30: the first monthly review.

    Before this change the board was due by day 12 and the objectives by day 14.
  - **Companies:**
    - day 1: the kick-off;
    - day 3: the draft operating system per department;
    - day 10: the interviews that correct the draft;
    - day 21: the board confirmed;
    - day 30: the proposal.
  - New unit test: every plan puts a draft operating system on the board within 3 days, and a small business's
    operating system is confirmed by day 3.
  - The onboarding slides now say the same thing ("Your operating system in 3 days").
- **Also live since yesterday's run:**
  - PR #25: the demo no longer takes over the main address. A fresh visit to `/` always shows the home page with
    the 3D board.
- **Proved:**
  - core: typecheck and 228 unit tests pass.
  - `test:db`: every SQL file and all 42 integration tests pass.
  - web: typecheck, 23 unit tests and 60 e2e tests pass.
- **Next by the rules:** findings that name their flow and objective. That needs the Claude API key on the
  worker (decision 2b), so until then, the first observed pieces: linking board pieces to the evidence that
  confirms them.

## 1 Oct 2026: operating-system blueprints

- **Read:**
  - Main was green, and the worker was live.
  - The company snapshot is all zeros, with no clients yet.
  - BAME already has three active objectives, each with an owner and a date and measured from its live platform.
    So the roadmap's first gate ("map one real business") was already met; the roadmap said otherwise and is now
    corrected. That unblocked the product.
- **Chosen (rule 3, the product):** "Architecture proposals", first slice. This also serves the founder's
  target that a client's operating system takes 1–3 days, not weeks.
- **Built:**
  - Ten operating-system blueprints in `src/domain/blueprints.ts`: marketing agency, trades, sports agency,
    medical practice, restaurant, real estate, online retail, accounting firm, logistics, and education centre.
    Each has its pieces, 2–3 flows, an owner and a written rule for each step, and suggested objectives.
  - Migration `operating_system_blueprints`: a new *proposed* basis for board pieces, flows and steps.
    - The `apply_blueprint` function lays a blueprint down in one transaction, as the caller and under their
      permissions.
    - It never overwrites what the business stated.
    - A proposal is confirmed forward (proposed → stated → observed) and never goes back.
    - Where a piece came from is frozen.
  - On the board page: "Start from an operating-system blueprint", proposed badges, and Confirm buttons.
  - A public `/systems` page shows each blueprint's outline. It is labelled "blueprints, not client case studies",
    and the written rules stay inside TEBOS.
- **Fixed (root cause found):** the billing integration test that failed intermittently picked "the first
  onboarded opportunity". The maintenance test, added on 30 Sep, onboards one of its own without a billing
  account, and the test files run in no fixed order. On a fresh database with the maintenance test first, the
  old test fails and the new one passes. The billing test now uses the client it onboarded itself.
- **Proved:**
  - core: typecheck and 228 unit tests pass, including the new blueprint tests. Those tests caught 19 steps with no
    written rule, and every one now has a rule.
  - `test:db`: every SQL file passes, including the new `99u_blueprints.sql`, and all 42 integration tests pass,
    three runs in a row.
  - web: typecheck, 23 unit tests and 59 e2e tests pass. Playwright now keeps a trace whenever a test fails, so
    an intermittent failure leaves its cause behind.
- **Next by the rules:** a delivery plan that gets a client's draft operating system ready in 1–3 days (blueprint
  on day 1, confirmed with the owner by day 3), then findings linked to flows.

## 30 Sep 2026 (evening): public submissions throttled

- **Read:**
  - Main was green, and the worker's last deployment succeeded; its only errors were the old container shutting down.
  - The company snapshot is all zeros (no leads, clients or payments yet), and no maintainer items are open.
  - The security advisors flagged four functions that anyone can call without signing in.
- **Chosen (rule 2.2, a security signal):** of those four, `submit_self_check` and the enquiry form had no limit.
  A script could flood them, burying real leads and inflating the objectives that measure leads and self-checks.
  The board would then report fake numbers. The other two (`accept_contract`, `contract_for_token`) are protected
  by single-use tokens, and `staff_invitation_for_token` the same way.
- **Built (migration `public_throttle`):**
  - A website enquiry is limited to 3 an hour per source and 60 an hour in total.
  - A self-check is limited to 5 an hour per source and 300 an hour in total.
  - The source is stored only as a salted SHA-256 hash, never the IP address, and counts are cleared after a day.
  - Leads entered by sales staff and direct database connections are not limited.
  - The limits are mirrored in `src/domain/throttle.ts`, and the parity test checks they match the database.
  - A refused submission shows "Too many submissions from here in the last hour. Please try again later."
- **Proved:**
  - core: typecheck and 214 unit tests pass.
  - `test:db`: all SQL rule files pass, including the new `99t_throttle.sql`, and 42 integration tests pass.
  - web: typecheck, 23 unit tests and 57 e2e tests pass.
- **Two intermittent tests, not caused by this change, still to root-cause:**
  - `pipeline-flow-pg` "bills an onboarded client monthly…" failed once at its first assertion, then passed
    48 repeated runs.
  - The e2e "the self-check scores ten answers…" failed once in a full run, then passed on its own and in the
    next full run.
  - Neither failure left its message behind. Next run: capture the failure output, keeping Playwright traces
    on failure, and fix the cause.
- **Still open:** the advisor's other warnings are by design. The public functions check their own tokens or
  roles, and `self_check_results` has no read policy on purpose. Leaked-password protection is decision 8.

## 30 Sep 2026: loop started

- Built: this loop. It has standing orders (`OPERATOR.md`), this log, and `scripts/local-pg.sh`, so a
  fresh session can run the database tests from nothing.
- Live before this run: the pipeline, the sales team pack, the company board, the company plan, the self-check,
  monthly billing, and the maintainer queue (PR #20). The worker's first maintenance scan of TEBOS ran at
  14:15 UTC and raised nothing, because all of TEBOS's objectives are still drafts (decision 4).
- Next by the rules: the build order in `ROADMAP.md` → "TEBOS on its own board" item 3, marketing and PR drafting
  with approval before publishing.
