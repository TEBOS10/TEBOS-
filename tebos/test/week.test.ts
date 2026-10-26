import { describe, expect, it } from "vitest";
import {
  LENSES,
  MACHINES,
  WEEK_PLAN,
  WEEK_TASK_STATUS_LABEL,
  addDays,
  isoWeekday,
  lensProgress,
  nextBestAction,
  saToday,
  statusProblems,
  todaysQueue,
  weekStartOf,
  type WeekTask,
} from "../src";

const MON = "2026-10-26";
const task = (over: Partial<WeekTask>): WeekTask => ({
  id: Math.random().toString(36).slice(2), localDate: MON, position: 1, title: "t", lens: "income",
  status: "not_started", estMinutes: 15, deferUntil: null, ...over,
});

describe("the week board's dates", () => {
  it("uses South African time for today", () => {
    // 23:30 UTC on Sunday 25 Oct is already Monday 01:30 in Johannesburg
    expect(saToday(new Date("2026-10-25T23:30:00Z"))).toBe(MON);
    expect(saToday(new Date("2026-10-26T21:59:00Z"))).toBe(MON);
  });

  it("finds the Monday that starts each week, and its days", () => {
    expect(isoWeekday(MON)).toBe(1);
    expect(isoWeekday("2026-11-01")).toBe(7);
    expect(weekStartOf("2026-11-01")).toBe(MON);
    expect(weekStartOf(MON)).toBe(MON);
    expect(weekStartOf("2026-11-02")).toBe("2026-11-02");
    expect(addDays(MON, 6)).toBe("2026-11-01");
  });
});

describe("the weekly plan", () => {
  it("has seven scenes, each with ordered actions that fit the database's limits", () => {
    expect(WEEK_PLAN.days.map((d) => d.weekday)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (const d of WEEK_PLAN.days) {
      expect(d.scene.length).toBeLessThanOrEqual(80);
      expect(d.focus.length).toBeLessThanOrEqual(300);
      expect(d.deliverable.length).toBeLessThanOrEqual(300);
      expect(d.savedTo.length).toBeLessThanOrEqual(200);
      const items = WEEK_PLAN.items.filter((i) => i.weekday === d.weekday);
      expect(items.length, d.scene).toBeGreaterThan(0);
      expect(items.map((i) => i.position)).toEqual(items.map((_, n) => n + 1));
    }
    for (const i of WEEK_PLAN.items) {
      expect(i.title.length).toBeLessThanOrEqual(160);
      expect(i.action.length).toBeLessThanOrEqual(600);
      expect(i.definitionOfDone.length).toBeLessThanOrEqual(400);
      expect(i.estMinutes).toBeGreaterThanOrEqual(5);
      expect(i.estMinutes).toBeLessThanOrEqual(480);
      expect(LENSES).toContain(i.lens);
    }
  });

  it("keeps BAME to one bounded weekly review", () => {
    const bame = WEEK_PLAN.items.filter((i) => /BAME/.test(i.title));
    expect(bame).toHaveLength(1);
    expect(bame[0]!.estMinutes).toBeLessThanOrEqual(45);
  });
});

describe("today's queue", () => {
  it("puts today's open tasks first, keeps earlier unfinished ones, and never counts them done", () => {
    const tasks = [
      task({ title: "today 2", position: 2 }),
      task({ title: "today 1", position: 1 }),
      task({ title: "done", position: 3, status: "done" }),
      task({ title: "tomorrow", localDate: "2026-10-27" }),
    ];
    expect(todaysQueue(tasks, MON).map((t) => t.title)).toEqual(["today 1", "today 2"]);
    // on Tuesday, Monday's unfinished task is still there, after Tuesday's own
    expect(todaysQueue(tasks, "2026-10-27").map((t) => t.title)).toEqual(["tomorrow", "today 1", "today 2"]);
  });

  it("brings a deferral back on its date, and skips blocked work for the next action", () => {
    const tasks = [
      task({ title: "blocked", position: 1, status: "blocked" }),
      task({ title: "later", position: 2, status: "deferred", deferUntil: "2026-10-28" }),
      task({ title: "next", position: 3 }),
    ];
    expect(nextBestAction(tasks, MON)?.title).toBe("next");
    expect(todaysQueue(tasks, MON).map((t) => t.title)).toEqual(["blocked", "next"]);
    expect(todaysQueue(tasks, "2026-10-28").map((t) => t.title)).toContain("later");
  });

  it("counts each lens's progress, leaving skipped work out", () => {
    const p = lensProgress([
      task({ lens: "income", status: "done" }),
      task({ lens: "income" }),
      task({ lens: "impact", status: "skipped" }),
      task({ lens: "intelligence", status: "blocked" }),
    ]);
    expect(p).toEqual({ income: { done: 1, total: 2, open: 1 }, impact: { done: 0, total: 0, open: 0 }, intelligence: { done: 0, total: 1, open: 1 } });
  });
});

describe("status changes", () => {
  it("needs a reason to block, defer or skip, and a date today or later to defer", () => {
    expect(statusProblems("not_started", "blocked", { byPerson: true }, MON).map((p) => p.code)).toEqual(["TEBOS_VALIDATION"]);
    expect(statusProblems("not_started", "deferred", { reason: "Agency ran late", deferUntil: "2026-10-25", byPerson: true }, MON).map((p) => p.code)).toEqual(["TEBOS_VALIDATION"]);
    expect(statusProblems("not_started", "deferred", { reason: "Agency ran late", deferUntil: "2026-10-27", byPerson: true }, MON)).toEqual([]);
  });

  it("only a person marks done, and the state machine holds", () => {
    expect(statusProblems("in_progress", "done", { byPerson: false }, MON).map((p) => p.code)).toEqual(["TEBOS_PERMISSION_DENIED"]);
    expect(statusProblems("in_progress", "done", { byPerson: true }, MON)).toEqual([]);
    expect(statusProblems("skipped", "done", { byPerson: true }, MON).map((p) => p.code)).toEqual(["TEBOS_ILLEGAL_TRANSITION"]);
    expect(Object.keys(WEEK_TASK_STATUS_LABEL).sort()).toEqual(Object.keys(MACHINES.week_task.transitions).sort());
  });
});
