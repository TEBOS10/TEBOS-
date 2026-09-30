# Standing orders: the TEBOS build loop

TEBOS keeps building without being told what to do next. A scheduled session runs this loop every day.
It reads the state of the company and the code, decides the most valuable next piece of work, builds
it to the definition of done, ships it, and records what it did in [`operator-log.md`](operator-log.md).
The founder's silence is not a reason to stop. It is the reason this loop exists.

## Each run

1. **Read the state**:
   - the top of `operator-log.md`: the last runs and the founder's open decisions;
   - `ROADMAP.md`;
   - `main`'s CI and the latest Railway worker deployment;
   - the live company snapshot, open `maintainer_items`, and Supabase security and performance advisors.
2. **Pick one piece of work**, the first that applies:
   1. **Something is broken.** This includes red CI on `main`, a failed or crashed worker deployment,
      and worker errors in the logs. Fix it first.
   2. **A live signal that code can fix.** This covers a maintainer item or a company-board objective
      off target because of something in TEBOS itself, and a security advisor warning.
   3. **The next unbuilt step of the product.** TEBOS's product is the operating system it builds for
      each client business: know it, map it, architect it, connect it, automate it, improve it. Take the
      first unbuilt item from `ROADMAP.md` "Next for the board", then stage 5 (operating systems). Only
      when those are blocked, take company plumbing ("TEBOS on its own board", pipeline "Next").
      The item's stage gate must be met, or the roadmap must say it may be built ahead of its gate. A
      gate that waits on the founder goes at the top of the founder's decisions, because it blocks the product.
   4. **Hardening.** Look for missing failure states, tests, audit events, performance, or a rule
      mirrored in the database but not in `src/domain` (or the reverse).
   If a piece of work needs something only the founder can give (a key, a signature, a decision on
   price or legal text), don't build around it. Add it to the founder's decisions and pick the next item.
3. **Build it to the definition of done** (ADR 0001):
   - persistence;
   - guarded state transitions;
   - permissions;
   - failure states;
   - audit events;
   - tests.
   Follow the build order data model → evidence → action lifecycle → capability → permissions → audit → UI.
   Keep each run to one reviewable change.
4. **Prove it** before shipping:
   - `npm run typecheck && npm test`;
   - `sh scripts/local-pg.sh`, then `PGHOST=/tmp/tebos-pg PGPORT=54329 PGUSER=postgres npm run test:db`;
   - for interface changes, `npm run typecheck && npm test && npm run test:e2e` in `web/`.
     The e2e tests need `PLAYWRIGHT_CHROMIUM` pointing at the preinstalled Chromium.
5. **Ship**:
   - open a PR, wait for the checks, and merge when every check is green;
   - apply any migration to the live project only after its tests pass. Migrations must be
     additive; never drop or rewrite data;
   - reconnect the Railway worker source to `main` so it redeploys, and confirm the deployment succeeded.
6. **Record** a new entry at the top of `operator-log.md` covering:
   - what was built and why it was chosen;
   - what was proved and what is live;
   - anything that failed;
   - the updated founder's decisions.
   Commit it with the change.

If a run cannot get to green, it does not merge. It records exactly what is failing and why. The next
run starts from rule 2.1.

## Never

- **Money, legal commitments, credentials or irreversible deletion (tier 3).** A person always decides
  these. Never charge, refund, sign, change prices or legal text, or rotate keys.
- **Anything outward-facing on the company's behalf.** Never email prospects, publish posts, or message
  clients. Draft them for approval instead.
- **Fabrication.** Never invent scans, evidence, connection status, execution success, outcomes,
  measurements or testimonials. An honest empty state beats a filled-in fake.
- **Skipping a stage gate** in `ROADMAP.md`, or working around a rule the schema enforces.
- **Getting to green by cheating.** Never skip, disable or weaken a test; never push an empty commit.
- **Vendor names in the web bundle, or a privileged key in a `VITE_` variable.**
- **Destructive migrations**: dropping tables or columns, or rewriting existing rows.
