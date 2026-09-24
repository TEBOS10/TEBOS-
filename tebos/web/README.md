# TEBOS web — operator interface

The interface for stage 3 of [the roadmap](../docs/ROADMAP.md). It is a single-page React app that talks
directly to the `tebos-core` Supabase database under the **signed-in user's own session**. There is no
server of its own and no privileged key. Row-level security decides what each person can see, and the
schema's guards decide what they can change. The interface explains the rules; the database enforces
them.

## What it does

| Area | What you can do |
|---|---|
| Sign-in | Create an account or sign in (Supabase Auth). A first-time user creates their organisation and becomes its admin. |
| Home | Scan a public website, with an optional objective and context. See businesses, recent scans with honest summaries, open actions, pending approvals, and system health, which reflects recorded worker activity, not a claim. |
| Businesses | Browse persistent business records. Edit the profile. Add context as your own statements (never stored as fact). Rescan. |
| Scans | See every page attempted and its outcome, evidence grouped by page (with pages that were not read shown as "not obtained"), the confidence breakdown, the findings, and the agent runs (model, tokens). While a scan is queued or running, the page updates itself. |
| Findings | "Why did TEBOS say this?": the finding, its supporting and contradicting evidence with excerpts and sources, what is missing, and the checks TEBOS applied. Hypotheses are marked. |
| Actions | Propose an action from a finding. The risk tier can't go below the capability's tier, and the approval requirement follows from the tier. Take only the legal next steps: ready, request approval, queue, start, record done or failed, verify, block, cancel. Each step is pre-checked with the same domain rules the database enforces. Each action has its full audit history. |
| Approvals | Pending and decided requests. Approvers and admins decide on the action page. Deciding moves the action on automatically, and a tier-3 action can't be approved by the person who requested it. |
| System | Capabilities (what TEBOS knows how to do), verified connections (what is actually connected), worker runs, and the organisation's audit trail. |

Controls appear according to the user's role (`org_admin`, `operator`, `approver`, `viewer`). This is only a
convenience: the database refuses anything the role doesn't allow, and the interface explains the refusal
in plain words (`src/lib/errors.ts`).

## Run locally

```bash
cd tebos/web
npm install
cp .env.example .env    # public, browser-safe project URL + publishable key
npm run dev
```

## Deploy (Vercel)

1. Vercel → **Add New Project** → import `TEBOS10/TEBOS-`. Set **Root Directory** to `tebos/web`. The
   framework preset is **Vite**.
2. Add the environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, with the values
   from `.env.example`. Both are public by design. Never put a service-role key, database URL or Anthropic
   key in a `VITE_` variable.
3. Add a rewrite so client-side routes work on refresh. `vercel.json` in this folder already does this.
4. In Supabase → **Authentication → URL Configuration**:
   - set **Site URL** to the deployed address;
   - add that address to the **Redirect URLs**.

   Sign-up confirmation emails then link back to the app.

## Tests

```bash
npm run typecheck
npm test              # unit tests (errors, formatting, routing, audit wording)
npm run test:e2e      # the real app in Chromium against a network-level stand-in for Supabase
```

The end-to-end tests run the unmodified app. `e2e/fake-supabase.ts` answers its HTTP requests from fictional
fixtures (`e2e/fixtures.ts`), and can refuse a write the way the database would, to check that refusals are
explained. The database's rules themselves are tested against real Postgres in the core package
(`npm run test:db`). In this sandbox, run e2e with `PLAYWRIGHT_CHROMIUM=/opt/pw-browsers/chromium`.
