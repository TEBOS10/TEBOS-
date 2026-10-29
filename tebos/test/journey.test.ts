import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkAction, checkProblem, checkProblemStatus, holdUps, milestones, nextActions, PROBLEM_CATEGORIES, problemEvidence, problemStage,
  propertyStage, propertySummary, type JourneyAction, type JourneyEvidence, type JourneyInput, type JourneyProblem,
} from "../src/domain/journey";
import { canTransition } from "../src";

const TODAY = "2026-10-29";
const problem = (over: Partial<JourneyProblem> = {}): JourneyProblem => ({
  id: "p1", title: "Unit 2 rent paid late", category: "arrears", status: "open", measure: null, createdAt: "2026-10-01T08:00:00Z", closedOn: null, ...over,
});
const ev = (over: Partial<JourneyEvidence> = {}): JourneyEvidence => ({
  id: "e1", problemId: "p1", title: "Bank statements", status: "missing", receivedOn: null, updatedAt: "2026-10-02T08:00:00Z", ...over,
});
const act = (over: Partial<JourneyAction> = {}): JourneyAction => ({
  id: "a1", problemId: "p1", title: "Agree a new debit date", owner: "Owner", dueOn: "2026-11-05", status: "planned",
  completedOn: null, note: null, createdAt: "2026-10-03T08:00:00Z", ...over,
});
const input = (over: Partial<JourneyInput> = {}): JourneyInput => ({
  property: { createdAt: "2026-09-30T10:00:00Z", propertyType: "residential_multi", nextReviewOn: null },
  problems: [], evidence: [], actions: [], baseline: null, reviews: [], today: TODAY, ...over,
});

describe("problem register rules", () => {
  it("needs a name and what is happening, and refuses personal identifiers", () => {
    expect(checkProblem({ category: "arrears", title: "Late rent", experienced: "Rent arrives after the 7th." }).ok).toBe(true);
    expect(checkProblem({ category: "arrears", title: "Late rent", experienced: "late" }).ok).toBe(false);
    expect(checkProblem({ category: "tenancy", title: "Tenant", experienced: "Tenant is on 082 555 1234 for access." }).ok).toBe(false);
    expect(checkProblem({ category: "tenancy", title: "Tenant", experienced: "Contact tenant at t.m@gmail.com please." }).ok).toBe(false);
  });

  it("planned states the intervention; resolved rests on a done action and checked evidence", () => {
    expect(checkProblemStatus("planned", { intervention: null, resultNote: null }, { doneActions: 0, checkedEvidence: 0 }).ok).toBe(false);
    expect(checkProblemStatus("resolved", { intervention: "x", resultNote: "Rent on time in November." }, { doneActions: 0, checkedEvidence: 1 }).ok).toBe(false);
    expect(checkProblemStatus("resolved", { intervention: "x", resultNote: "Rent on time in November." }, { doneActions: 1, checkedEvidence: 0 }).ok).toBe(false);
    expect(checkProblemStatus("resolved", { intervention: "x", resultNote: "short" }, { doneActions: 1, checkedEvidence: 1 }).ok).toBe(false);
    expect(checkProblemStatus("resolved", { intervention: "x", resultNote: "Rent on time in November." }, { doneActions: 1, checkedEvidence: 1 }).ok).toBe(true);
    expect(checkProblemStatus("parked", { intervention: null, resultNote: null }, { doneActions: 0, checkedEvidence: 0 }).ok).toBe(false);
  });

  it("an action on a problem explains itself, and done needs received proof", () => {
    const base = { problemId: "p1", reason: "Rent arrives after the bond is paid.", doneWhen: "Signed addendum", status: "planned" as const, proofStatus: null };
    expect(checkAction(base).ok).toBe(true);
    expect(checkAction({ ...base, reason: "because" }).ok).toBe(false);
    expect(checkAction({ ...base, doneWhen: "" }).ok).toBe(false);
    expect(checkAction({ ...base, status: "done" }).ok).toBe(false);
    expect(checkAction({ ...base, status: "done", proofStatus: "missing" }).ok).toBe(false);
    expect(checkAction({ ...base, status: "done", proofStatus: "received" }).ok).toBe(true);
    // an action not tied to a problem keeps the older workstream rules only
    expect(checkAction({ problemId: null, reason: null, doneWhen: null, status: "planned", proofStatus: null }).ok).toBe(true);
  });

  it("the lifecycle never ends: resolved reopens, and a problem starts open", () => {
    expect(canTransition("property_problem", "(initial)", "open")).toBe(true);
    expect(canTransition("property_problem", "(initial)", "resolved")).toBe(false);
    expect(canTransition("property_problem", "resolved", "open")).toBe(true);
    expect(canTransition("property_problem", "open", "resolved")).toBe(false);
  });
});

describe("evidence state", () => {
  it("counts what is checked, received, missing and conflicting; a conflict outranks all", () => {
    expect(problemEvidence("p1", []).state).toBe("none");
    expect(problemEvidence("p1", [ev()]).state).toBe("missing");
    expect(problemEvidence("p1", [ev(), ev({ id: "e2", status: "received", receivedOn: TODAY })]).state).toBe("received");
    expect(problemEvidence("p1", [ev({ status: "checked", receivedOn: TODAY }), ev({ id: "e2", status: "received", receivedOn: TODAY })]).state).toBe("verified");
    expect(problemEvidence("p1", [ev({ status: "checked", receivedOn: TODAY }), ev({ id: "e2", status: "conflicting", receivedOn: TODAY })]).state).toBe("conflicting");
    // another problem's evidence doesn't count
    expect(problemEvidence("p1", [ev({ problemId: "p2", status: "checked" })]).state).toBe("none");
  });
});

describe("journey stage", () => {
  it("moves with the records: assess → strategise → execute → optimise", () => {
    const p = problem();
    expect(problemStage(p, [], [])).toBe("assess");
    expect(problemStage(p, [ev({ status: "received", receivedOn: TODAY })], [])).toBe("strategise");
    expect(problemStage(p, [ev({ status: "received", receivedOn: TODAY })], [act()])).toBe("execute");
    expect(problemStage({ ...p, status: "resolved", closedOn: TODAY }, [], [])).toBe("optimise");
    expect(problemStage({ ...p, status: "parked" }, [], [])).toBeNull();
    // a cancelled action doesn't count as work under way
    expect(problemStage(p, [], [act({ status: "cancelled" })])).toBe("assess");
  });

  it("the property is at the earliest stage of its open problems; with none open it is in its review cycle", () => {
    expect(propertyStage(input()).stage).toBe("discover");
    const two = input({ problems: [problem(), problem({ id: "p2", title: "Gate motor faulty", category: "security" })], actions: [act()] });
    const s = propertyStage(two);
    expect(s.stage).toBe("assess");
    expect(s.reason).toContain("Gate motor faulty");
    expect(s.reason).toContain("earliest of 2");
    expect(propertyStage(input({ problems: [problem({ status: "resolved", closedOn: TODAY })] })).stage).toBe("optimise");
  });
});

describe("milestones", () => {
  it("are reached only with a record, dated from it", () => {
    expect(milestones(input()).map((m) => m.key)).toEqual(["property_recorded"]);
    const m = milestones(input({
      problems: [problem({ status: "resolved", closedOn: "2026-10-28" })],
      evidence: [ev({ status: "checked", receivedOn: "2026-10-05", updatedAt: "2026-10-27T09:00:00Z" })],
      actions: [act({ status: "done", completedOn: "2026-10-20" })],
    }));
    expect(m.map((x) => x.key)).toEqual(["property_recorded", "first_problem", "first_action", "first_evidence", "first_done", "first_checked", "resolved:p1"]);
    expect(m.find((x) => x.key === "first_done")!.on).toBe("2026-10-20");
    // the day evidence was checked isn't stored: it is marked as "by", not invented
    expect(m.find((x) => x.key === "first_checked")!.approximate).toBe(true);
  });

  it("a cancelled action or missing evidence reaches nothing", () => {
    const m = milestones(input({ evidence: [ev()], actions: [act({ status: "cancelled" })] }));
    expect(m.map((x) => x.key)).toEqual(["property_recorded"]);
  });
});

describe("next actions", () => {
  const keys = (i: JourneyInput) => nextActions(i).map((n) => n.key);

  it("start with discovery, and every one explains itself", () => {
    const list = nextActions(input({ property: { createdAt: "2026-09-30T10:00:00Z", propertyType: null, nextReviewOn: null } }));
    expect(list.map((n) => n.key)).toEqual(["profile", "discover"]);
    for (const n of list) for (const f of [n.trigger, n.evidence, n.uncertain, n.next]) expect(f.length).toBeGreaterThan(3);
  });

  it("ask for evidence, then an action, then the result", () => {
    expect(keys(input({ problems: [problem()] }))).toEqual(["evidence:p1"]);
    const received = [ev({ status: "received", receivedOn: TODAY })];
    const plan = nextActions(input({ problems: [problem()], evidence: received }));
    expect(plan.map((n) => n.key)).toEqual(["plan:p1"]);
    expect(plan[0]!.uncertain).toContain("hasn't been checked");
    expect(keys(input({ problems: [problem()], evidence: received, actions: [act()] }))).toEqual([]);
    const fixed = nextActions(input({
      problems: [problem({ measure: "Bank date of rent, three months" })], evidence: received, actions: [act({ status: "done", completedOn: "2026-10-20" })],
    }));
    expect(fixed.map((n) => n.key)).toEqual(["result:p1"]);
    expect(fixed[0]!.next).toContain("Bank date of rent, three months");
  });

  it("a conflict comes before planning, and blocked or overdue work is followed up", () => {
    const k = keys(input({
      problems: [problem()],
      evidence: [ev({ status: "conflicting", receivedOn: TODAY })],
      actions: [act({ id: "a1", status: "blocked", note: "Tenant hasn't replied" }), act({ id: "a2", dueOn: "2026-10-20" })],
    }));
    expect(k[0]).toBe("conflict:e1");
    expect(k).toContain("blocked:a1");
    expect(k).toContain("overdue:a2");
  });

  it("a problem held up twice is investigated before any new action, and the strategy isn't changed", () => {
    const actions = [act({ id: "a1", status: "blocked", note: "No access" }), act({ id: "a2", status: "cancelled" })];
    expect(holdUps("p1", actions, TODAY)).toBe(2);
    const list = nextActions(input({ problems: [problem()], evidence: [ev({ status: "received", receivedOn: TODAY })], actions }));
    const keyList = list.map((n) => n.key);
    expect(keyList).toContain("repeated:p1");
    expect(keyList).not.toContain("plan:p1");
    expect(list.find((n) => n.key === "repeated:p1")!.next).toContain("Don't change the strategy");
  });

  it("never prescribes a major intervention", () => {
    const busy = input({
      problems: [problem(), problem({ id: "p2", status: "not_resolved" })],
      evidence: [ev({ status: "conflicting", receivedOn: TODAY })],
      actions: [act({ status: "blocked", note: "x" }), act({ id: "a2", status: "cancelled" }), act({ id: "a3", dueOn: "2026-01-01" })],
      property: { createdAt: "2026-01-01T00:00:00Z", propertyType: "residential_multi", nextReviewOn: "2026-10-01" },
    });
    const text = JSON.stringify(nextActions(busy)).toLowerCase();
    for (const w of ["rezon", "refinanc", "redevelop", "sell the", "demolish"]) expect(text).not.toContain(w);
  });

  it("with nothing open, the cycle continues and a due review is raised", () => {
    const k = keys(input({ problems: [problem({ status: "resolved", closedOn: TODAY })], property: { createdAt: "2026-09-30T10:00:00Z", propertyType: "other", nextReviewOn: TODAY } }));
    expect(k).toEqual(["review", "cycle"]);
  });

  it("the portfolio summary counts only from records", () => {
    const s = propertySummary(input({ problems: [problem()], actions: [act({ dueOn: "2026-10-01" })] }));
    expect(s).toMatchObject({ openProblems: 1, overdueActions: 1 });
    expect(s.next?.key).toBe("overdue:a1");
  });
});

describe("parity with migration property_journey", () => {
  const sql = readFileSync(join(__dirname, "..", "supabase", "migrations", "20261029090000_property_journey.sql"), "utf8");
  it("the problem categories match", () => {
    const list = sql.split("category in (")[1]!.split(")")[0]!;
    expect([...list.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort()).toEqual(Object.keys(PROBLEM_CATEGORIES).sort());
  });
  it("the minimum lengths match", () => {
    expect(sql).toContain("length(trim(experienced)) between 10 and 2000");
    expect(sql).toContain("length(trim(coalesce(result_note, ''))) >= 10");
    expect(sql).toContain("length(trim(coalesce(reason, ''))) >= 10 and length(trim(coalesce(done_when, ''))) >= 5");
  });
});
