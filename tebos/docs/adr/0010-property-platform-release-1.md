# ADR 0010: The Property Revenue Architect Platform starts with Release 1, on the existing property workspace

Date: 2026-10-29 · Status: accepted (founder's build directive, 29 Oct 2026)

## Context

ADR 0009 said nothing new would be built for the PRA firm in Phases 1–2 (20 Oct – 30 Nov), and that TEBOS gets
functionality only once it is proven. On 29 Oct the founder directed the build of the Property Revenue Architect
Platform: a continuous property-improvement journey for South African landlords, delivered through TEBOS.

## Decision

1. **Release 1 is built now.** This replaces ADR 0009's "nothing new is built in Phase 1 or 2" for the platform's
   Release 1 only.
2. **One architecture:**
   - the landlord's workspace is the existing property case, inside the landlord's own organisation in the TEBOS app;
   - there is no new application or database;
   - the founder's PRA cases stay in Tidy Enterprise (TEPOS), and no private records move.
3. **What Release 1 adds:**
   - a problem register;
   - links from evidence and actions to problems;
   - an action's reason and completion criterion;
   - a journey stage, milestones and next actions, all computed from records;
   - owner-facing pages.
4. **The database keeps the integrity rules:**
   - a problem is resolved only with a result, a completed action and checked evidence;
   - an action's proof is received evidence from the same case;
   - no personal identifiers in problem text.
5. **No billing, tenant records, document upload, provider network or AI** in Release 1
   (`docs/pra-platform/release-1.md` §7).

## Consequences

- **The risk ADR 0009 named still holds:** the platform is built before a paid case. Each release still has to be
  tested with real landlords before the next one grows.
- **Real customer records need backups first:** Supabase Pro, a founder decision.
- The R79 and R199 subscriptions are test prices only. Nothing charges anyone.

## Amendment, 29 Oct 2026 (founder): its own platform, linked to TEPOS

The founder: "it's its own platform … It's just linked to TPOS. That's the core difference."

**What changes:**
1. **A third web app.** The Property Revenue Architect Platform is now its own web app from the same code base:
   - entry `web/pra/index.html`;
   - build `vite.pra.config.ts`, which outputs `dist-pra`;
   - its own deployment.

   It sits alongside TEBOS (the client app) and TEPOS (the founder's own app).
2. **Landlords' accounts belong to this app alone** (`organisations.app = 'pra'`, migration `pra_platform`).
   - A landlord opens one account, without an invitation (`create_pra_account`).
   - TEBOS and TEPOS never list it, and it never lists theirs.
3. **TEPOS links to it.** The menu has a "Property platform" link, set with `VITE_PRA_URL`.
4. **TEBOS's client app has no property pages any more.** The bundle check refuses any trace of the platform in TEBOS,
   and any trace of TEPOS in the platform.

**What stays the same:**
- one database and one set of rules;
- row-level security per account;
- the founder's PRA cases in Tidy Enterprise (TEPOS).
