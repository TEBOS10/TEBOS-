# Web Delivery Division: toolchain, access and cost register

Checked 1 Nov 2026, from this cloud session.

Labels:
- **AVAILABLE AND TESTED:** used successfully today.
- **AVAILABLE BUT UNTESTED:** connected, not exercised.
- **REQUIRES OWNER LOGIN**, **REQUIRES PAYMENT**, **UNAVAILABLE**, **UNKNOWN**: as named.

## 1. What this session can actually use

| Tool | Purpose here | Status | Evidence / limit |
|---|---|---|---|
| Terminal, Node, npm, git | Build, test, commit | AVAILABLE AND TESTED | typecheck, 456 unit tests and the database tests ran today |
| Local Postgres (`scripts/local-pg.sh`) | Database rule tests | AVAILABLE AND TESTED | `test:db` passed |
| Chromium and Playwright (pre-installed) | Browser journeys, screenshots | AVAILABLE AND TESTED | the web e2e suite (145 tests) ran on 29 Oct; not run today because there's no interface change |
| GitHub, through the GitHub connector | Branches, PRs, CI status, merges | AVAILABLE AND TESTED | PR #103 and #104 opened and merged; there is no `gh` CLI in this session |
| Supabase, through the Supabase connector (project `tebos-core`) | Schema, SQL, advisors | AVAILABLE AND TESTED | read queries and advisors today; migrations are applied only after the founder's "merge it" |
| Railway, through the Railway connector | The worker: deployments, logs | AVAILABLE AND TESTED | listed deployments today. Pushes don't deploy on their own |
| Vercel, through the Vercel connector (team `tidy8`) | Previews, projects | AVAILABLE AND TESTED (read only) | `get_team` works; creating a project was refused with 403 on 29 Oct. **The plan is UNKNOWN**: the connector doesn't show it |
| Firecrawl, through the Firecrawl connector | Reading reference sites and documentation | AVAILABLE AND TESTED | used today. Each search and scrape spends Firecrawl credits; the remaining credit is UNKNOWN |
| Figma, Miro, ElevenLabs, Higgsfield, OpusClip, Apollo, Make, Zapier, monday, Jotform, Gmail | Design input, media, CRM, automation | AVAILABLE BUT UNTESTED | Several spend credits on use (Higgsfield, ElevenLabs, Apollo, OpusClip); none is used without a spend decision |
| Lovable, Bolt, v0 | Optional alternative builders | UNAVAILABLE (no connector here) | Manual handoff only (§5) |
| Local AI models | A fallback coding model | UNAVAILABLE in this container | 4 CPU cores, 15 GB of memory, no GPU: a small CPU model could run, but slowly. The founder's own computer is UNKNOWN |

## 2. The architecture at zero added spend

- **One authoritative repository** (this one). There are no separate stacks per client unless a requirement justifies
  one.
- **The delivery engine** is TEBOS's own database:
  - the project records, the state machine, approvals and QA live in Supabase;
  - no new service is needed.
- **Client websites:** static output by default (HTML and CSS, or a Vite build).
  - Server, database and auth are added only when the approved scope needs them, and then on the client's own project.
  - **AI used to build a site is separate from AI that visitors use.** A published site never needs a paid coding
    assistant to keep serving its ordinary pages.

## 3. Hosting for client sites: the blocking finding

- **Vercel Hobby (free) doesn't allow commercial use.** Its fair-use guidelines restrict Hobby teams to "non-commercial
  personal use only".
  - Commercial use includes "advertising the sale of a product or service" and "receiving payment to create, update,
    or host the site".
  - Source: https://vercel.com/docs/limits/fair-use-guidelines (read 1 Nov 2026).
  - **So client websites can't be hosted on a Hobby team.** If team `tidy8` is on Hobby, TEBOS's own commercial sites
    may also fall outside the terms.
  - **Founder: check the plan** under Vercel → Settings → Billing.
- **Candidate free host: Cloudflare Pages.** The free plan has 500 builds a month per account, one build at a time,
  and 100 custom domains per project (https://developers.cloudflare.com/pages/platform/limits/, read 1 Nov).
  **Commercial-use terms: NOT VERIFIED.** Read Cloudflare's terms before relying on it.
- **Other routes:**
  - the client's own hosting account, which the client owns and pays for, at cost and disclosed;
  - Vercel Pro, which is a spend decision (tier 3).
- **Until one is chosen:** client sites are built and tested locally and on preview branches, with no public
  commercial deployment. That is acceptance criterion 23, BLOCKED.

## 4. Cost register

| Service | Free quota and conditions (verified 1 Nov unless marked) | Card needed | What triggers the next cost |
|---|---|---|---|
| Supabase `tebos-core` | Free plan: paused after 1 week of low activity; at most 2 active free projects; **no automatic backups** (supabase.com/pricing) | No | Pro, USD 25 a month, for backups and no pausing. Already founder decision 11 |
| Vercel | Hobby: non-commercial only (above). Team plan UNKNOWN | — | Pro, per seat; a spend decision |
| Railway (the worker) | Free plan, about USD 1 a month of credit (operator log, 21–27 Oct; not re-verified today) | — | More worker time than the credit covers |
| Cloudflare Pages | 500 builds a month, 1 concurrent build | NOT VERIFIED | Commercial terms not verified |
| GitHub | Public repository; private needs founder decision 8 | — | — |
| Anthropic API (the worker's analysis) | **No credit**, so analysis is paused | — | Founder decision |
| Firecrawl | Credits per search and scrape; balance UNKNOWN | UNKNOWN | Running out of credits |

**Project policy:** no new subscriptions (R0), no added metered spend (R0), no trials that need a card, no
auto-recharge. This is policy, not a technical block. Set spend caps or alerts on each provider's own billing page.

## 5. Manual handoff to an alternative builder (Lovable, Bolt, v0)

Use this only for a bounded component, and never for the whole site. Give the tool this prompt:

> **Task:** build one section (name it) as a single React + Tailwind component with no runtime dependencies beyond
> React.
> **Inputs:** the design tokens in `web/src/styles.css`, the copy in the client's approved scope, and these images:
> list them with their licence.
> **Constraints:**
> - mobile first;
> - `prefers-reduced-motion` respected;
> - no external scripts;
> - no tracking;
> - no paid packages.
>
> **Acceptance:** the component renders at 375px and 1280px with no horizontal overflow, keyboard focus is visible,
> and contrast is AA.
> **Return:** a single `.tsx` file, plus a list of every dependency it imports.

Bring the file back by hand into a branch, review its imports, and run `npm run typecheck`, `npm test` and
`npm run test:e2e` in `web/`. This handoff is **manual**; no connector exists.
