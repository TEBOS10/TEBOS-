# Six videos from the founder, 19 Oct 2026: what they mean for TEBOS and TEPOS

These were reviewed from frames and on-screen captions. The audio wasn't transcribed. Claims in the videos (money made,
win rates, "five minutes", "unlimited") are the creators' own and weren't verified.

**What the founder wants them for** (19 Oct): TEBOS should look and operate like a company worth a trillion dollars.
It is a set of business operating systems, chosen by the route a business is on, built on shared functional systems,
and run by a team that can deliver at large scale.

## The six videos

| # | Video | What it shows | What we take | What we don't do |
|---|---|---|---|---|
| 1 | @kimball.ai, "Stop building Jarvis dashboards" | A good-looking dashboard is worth little without the three things behind it: an AI model that thinks, tools that let it act, and written instructions it follows. Example screens: inbox sorting with drafted replies, "watching every number" | **It confirms the build order.** REEDS already has the three: the model, its tools (the work ledger and the Model Bridge), and its instructions (OPERATOR.md, the daily run, the briefings). Screens come after the brain works (ADR 0001) | A dashboard of numbers that aren't measured |
| 2 | @textura.eu, premium websites with a design-reference gallery | Dark, cinematic sites, built from a library of strong references and a detailed prompt | **The visual standard.** Proposal 6: one TEBOS design system built from a curated reference board. It is used on the public site, TEBOS, TEPOS and every client portal, so everything looks like one premium company | Copying another brand's work. Buying a tool before the founder approves the spend |
| 3 | Usage limits and cost (Claude Code tools: model fallback, a context compressor, usage views, plugins) | Ways to avoid running out of usage | **Our own savings, no new service:** <br>• one topic per session (TEPOS and TEBOS are already separate); <br>• short briefing files, so a new session starts cheaply; <br>• the daily run does one step, not everything; <br>• fewer large uploads at once | **No proxy or "free models" router** sits between us and the model. It would see the code, the database layout and the conversation. That breaks the security rules, and its operator isn't vetted |
| 4 | @copykingjeff, "AI closer" for high-ticket sales | An AI that closes $12,000 packages after a sales video | **For the sales system:** an assistant that prepares each call, scores the lead and drafts the follow-up. This builds on Meeting mode and the pipeline | **An AI never closes, commits a price, or sends anything on its own.** A person closes (the REEDS rules) |
| 5 | @emma.salestips, a lead-list tool connected to a chat assistant with an API key | Generating prospect lists in bulk | We already have a prospecting connector (50 prospects drafted earlier). Use it, with a person approving outreach | Pasting keys into unvetted tools. Bulk contact data without a POPIA basis |
| 6 | @as_seegers, "a trading bot in 8 minutes", "60% win rate" | A backtest dashboard | **For Tidy Capital, as a warning:** a backtest on 30 positions proves nothing. Any strategy stays in paper trading, with out-of-sample tests | **Live trading. Never** |

## Proposal 6: one design system for everything TEBOS shows

- **Serves:**
  - the public site;
  - TEBOS;
  - TEPOS;
  - client portals.
- **The idea:**
  - collect a reference board of premium examples;
  - turn it into one written design system: type, colour, spacing, motion, components;
  - apply it everywhere in stages.
- **Rule:**
  - no copied brand assets;
  - visuals never show data that isn't real (no fake numbers on screens);
  - foundations first, so it is applied to working features, not used to dress up unfinished ones.
- **Cost:** build time. A reference tool or paid template only with the founder's approval.
- **Risk:** low. The main risk is spending effort on looks before the underlying feature is used.
- **Status:** the founder said yes, 19 Oct. It is at stage 1, applied in stages after the real-estate work.

## The founder's model of the catalogue

The founder's picture (19 Oct) matches ADR 0005, and much of it already exists:
- **Routes (industry systems):** a business is first asked which route it is on, then gets the operating system for
  that route. Each is configured from shared modules.
  - Already templated in `src/domain/blueprints.ts`. Eleven industries: marketing agency, trades, sports agency,
    medical practice, restaurant, real estate, online retail, accounting, logistics, **education centre (academies and
    tutoring)** and **gym**.
  - Named by the founder but not yet templated:
    - creative (music, film, editing agencies): Creative Studio OS;
    - corporate.
- **Functional systems (inside every route):** marketing, sales, finance, admin and operations, people, IT. They are
  built once and shared (ADR 0005, operational systems).
- **Scale:** a route is sold only when its delivery cost is known and a team can deliver it (stage 4). That is the
  "team that can skyrocket this". It is a staffing decision as well as a build.

None of the eleven templates has been used by a real client yet (product register: 0 paying clients).
