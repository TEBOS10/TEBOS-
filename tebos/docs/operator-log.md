# Operator log

The build loop's record, newest first. See [`OPERATOR.md`](OPERATOR.md) for the rules each run follows.

## Founder's decisions (only you can unblock these)

Update this list every run; strike items when they're done.

| # | Decision | What it unblocks |
|---|---|---|
| 0 | **Run the first real operating systems.** Pick real businesses (BAME first, then pilots) and let TEBOS lay down their blueprint | Real proof. The ten blueprints are templates, not client work; only real clients make a portfolio |
| 1 | Paystack secret key on the worker, and the webhook `https://tebos-worker-production.up.railway.app/webhooks/paystack` | Taking the first payment, and monthly invoices |
| 2b | Claude API key (`ANTHROPIC_API_KEY`) on the worker | Findings from scans and interviews: the next product step |
| 2 | Resend key and a verified sending domain | Every client email: payment links, contracts, invoices, reminders |
| 3 | A lawyer approves the contract templates (standard and company) and advises on POPIA | Signing clients |
| 4 | Activate the 9 draft objectives on TEBOS's board | The company measuring itself, and the maintainer queue watching TEBOS |
| 5 | Founder name and title for outreach and the site | Sending the outreach drafts |
| 6 | Social accounts created | Publishing the social pack |
| 7 | Company registration and VAT number | Invoices that are legally complete |
| 8 | Make the repo private, rotate database passwords, turn on leaked-password protection | Protecting the platform from copying |

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
