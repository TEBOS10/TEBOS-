# TEBOS Web Delivery Division: project brief (agent-neutral)

This folder is the self-contained brief for the Web Delivery Division. It is written for any coding agent or developer;
nothing here depends on one AI tool. Start with `HANDOVER.md`.

**What it is.** One reusable delivery engine, inside TEBOS, that takes a client from intake to a live website:
scope held to the client's package, client approvals, a readiness check, a three-business-day build clock,
independent QA, release and handover. It is a module of TEBOS, not a separate application (ADR 0011).

**Who it serves.**
- **TEBOS's maintainers** run the projects.
- **The client's admin** approves scope, design and release.
- **The client's team** follows progress.

**The business outcome.** Website delivery becomes a standard, repeatable TEBOS product, with measured time, cost and
defects, instead of bespoke work each time.

| File | What it holds |
|---|---|
| `HANDOVER.md` | Current state, commands, tests and results, blockers, next three tasks, how to resume |
| `ACCEPTANCE.md` | Testable acceptance criteria, each with its status |
| `DESIGN_BRIEF.md` | Visual direction (provisional: no references supplied yet) |
| `TOOLCHAIN.md` | Every tool and service, how it was tested, its free-plan conditions, the cost register |
| `../adr/0011-web-delivery-division.md` | The decisions and why |

**The rules that protect trust** live in the database (`supabase/migrations/20261101090000_web_delivery.sql`). They are
mirrored in `src/domain/web-delivery.ts`, and `test/schema-parity.test.ts` keeps the two in step.
