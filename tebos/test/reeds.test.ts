import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ATTENTION_TASKS, composeReport, planRequest, REQUEST_KINDS, reportLine, STATUS_TASKS, taskSpec } from "../src/domain/work";
import { COUNT_CHECKS, EXECUTORS } from "../src/reeds/checks";

const sql = readdirSync(join(__dirname, "..", "supabase", "migrations")).sort()
  .map((f) => readFileSync(join(__dirname, "..", "supabase", "migrations", f), "utf8")).join("\n");

describe("REEDS plans", () => {
  it("plans the organisation's checks for anyone, and the platform's only for platform admins", () => {
    const member = planRequest("attention_today", { platformAdmin: false });
    const admin = planRequest("attention_today", { platformAdmin: true });
    expect(member.every((t) => t.scope === "org")).toBe(true);
    expect(member.map((t) => t.key)).toEqual(["approvals.pending", "agent_runs.failed", "delivery.overdue", "maintainer.open"]);
    expect(admin).toHaveLength(ATTENTION_TASKS.length);
    expect(admin.length).toBeLessThanOrEqual(12); // the ledger's default task limit
  });

  it("plans \"how are my businesses doing?\" the same for everyone, from the organisation's own records only", () => {
    const member = planRequest("business_status", { platformAdmin: false });
    expect(member.map((t) => t.key)).toEqual(["objectives.off_target", "objectives.unmeasured", "objectives.overdue", "board.founder_only"]);
    expect(planRequest("business_status", { platformAdmin: true })).toEqual(member);
    expect(member.every((t) => t.scope === "org")).toBe(true);
    // keys are unique across request kinds, so a task's spec is never ambiguous
    const keys = [...ATTENTION_TASKS, ...STATUS_TASKS].map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("gives every task an executor that exists, a verifiable acceptance test and a valid key", () => {
    for (const t of [...ATTENTION_TASKS, ...STATUS_TASKS]) {
      expect(EXECUTORS, t.key).toContain(t.executor);
      expect(t.acceptance.length).toBeGreaterThanOrEqual(10);
      expect(t.key).toMatch(/^[a-z][a-z0-9_.]{1,60}$/);
      expect(taskSpec(t.key)).toBe(t);
    }
  });

  it("writes every check's queries against the parameters it is given", () => {
    // Postgres refuses a query that is given a parameter it never uses
    for (const [name, c] of Object.entries(COUNT_CHECKS)) {
      for (const q of [c.list, c.recount]) for (const p of ["$1", "$2"]) expect(q, `${name}: ${p}`).toContain(p);
      for (const p of ["$1", "$2", "$3"]) expect(c.recheck, `${name} recheck: ${p}`).toContain(p);
      expect(c.list, name).toMatch(/\bid::text\b/);
    }
  });

  it("knows exactly the request kinds the database accepts", () => {
    // the latest definition wins: a later migration that replaces the check, else the table's own
    const replaced = [...sql.matchAll(/add constraint work_requests_kind_check check \(kind in \(([^)]*)\)\)/g)].at(-1);
    const table = sql.slice(sql.indexOf("create table public.work_requests"));
    const m = replaced ?? table.match(/kind\s+text not null check \(kind in \(([^)]*)\)\)/);
    expect(m, "work_requests kind check").toBeTruthy();
    const kinds = [...m![1]!.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort();
    expect(kinds).toEqual(Object.keys(REQUEST_KINDS).sort());
  });
});

describe("REEDS reports", () => {
  const spec = taskSpec("maintainer.open")!;

  it("says what was found, and says plainly when a check couldn't run", () => {
    expect(reportLine(spec, { available: true, count: 0, ids: [] })).toMatchObject({ text: "The maintainer's queue is clear.", attention: false, checked: true });
    expect(reportLine(spec, { available: true, count: 1, ids: ["a"] }).text).toBe("1 item is open in the maintainer's queue.");
    expect(reportLine(spec, { available: false, reason: "No data." })).toMatchObject({ text: "Couldn't check: No data.", checked: false });
  });

  it("never sums an unchecked line into 'nothing needs your attention' silently", () => {
    const ok = reportLine(spec, { available: true, count: 0, ids: [] });
    const unchecked = reportLine(taskSpec("capital.ingestion")!, { available: false, reason: "No data." });
    expect(composeReport("attention_today", [ok]).summary).toBe("Nothing needs your attention.");
    expect(composeReport("attention_today", [ok, unchecked]).summary).toBe("Nothing needs your attention. 1 check couldn't be completed.");
  });
});
