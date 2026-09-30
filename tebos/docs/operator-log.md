# Operator log

The build loop's record, newest first. See [`OPERATOR.md`](OPERATOR.md) for the rules each run follows.

## Founder's decisions (only you can unblock these)

Update this list every run; strike items when they're done.

| # | Decision | What it unblocks |
|---|---|---|
| 1 | Paystack secret key on the worker, and the webhook `https://tebos-worker-production.up.railway.app/webhooks/paystack` | Taking the first payment, and monthly invoices |
| 2 | Resend key and a verified sending domain | Every client email: payment links, contracts, invoices, reminders |
| 3 | A lawyer approves the contract templates (standard and company) and advises on POPIA | Signing clients |
| 4 | Activate the 9 draft objectives on TEBOS's board | The company measuring itself, and the maintainer queue watching TEBOS |
| 5 | Founder name and title for outreach and the site | Sending the outreach drafts |
| 6 | Social accounts created | Publishing the social pack |
| 7 | Company registration and VAT number | Invoices that are legally complete |
| 8 | Make the repo private, rotate database passwords, turn on leaked-password protection | Protecting the platform from copying |

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
