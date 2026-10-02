import { describe, expect, it } from "vitest";
import { checkCompletion, DELIVERY_PLANS, isOverdue } from "../src/domain/delivery";
import { PLAN_TERMS, type PlanKey } from "../src/domain/plans";

describe("client delivery plans", () => {
  it("has a plan for every plan TEBOS sells, in date order, each step saying what done means", () => {
    for (const plan of Object.keys(PLAN_TERMS) as PlanKey[]) {
      const steps = DELIVERY_PLANS[plan];
      expect(steps.length).toBeGreaterThan(0);
      expect(new Set(steps.map((s) => s.key)).size).toBe(steps.length);
      for (let i = 1; i < steps.length; i++) expect(steps[i]!.dueDays).toBeGreaterThanOrEqual(steps[i - 1]!.dueDays);
      for (const s of steps) expect(s.done.length).toBeGreaterThan(20);
    }
    // the first contact is within two days, whatever the plan
    for (const plan of Object.keys(PLAN_TERMS) as PlanKey[]) expect(DELIVERY_PLANS[plan][0]!.dueDays).toBeLessThanOrEqual(2);
    expect(DELIVERY_PLANS.company.at(-1)!.key).toBe("proposal");
    // every client has a draft operating system on their board within 3 days
    for (const plan of Object.keys(PLAN_TERMS) as PlanKey[]) {
      const draft = DELIVERY_PLANS[plan].find((s) => s.title === "Draft operating system on the board");
      expect(draft?.dueDays).toBeLessThanOrEqual(3);
    }
    // and a small business's operating system is confirmed with the owner by day 3
    expect(DELIVERY_PLANS.starter.find((s) => s.key === "objectives")!.dueDays).toBeLessThanOrEqual(3);
  });

  it("closes a step only with a note, and knows when it's overdue", () => {
    expect(checkCompletion("done", "Kick-off held with Thandi")).toEqual({ ok: true });
    expect(checkCompletion("done", " ")).toEqual({ ok: false, reason: "Say what was done" });
    expect(checkCompletion("skipped", null)).toEqual({ ok: false, reason: "Say why it was skipped" });
    expect(checkCompletion("open", "x")).toMatchObject({ ok: false });
    const now = new Date("2026-10-10T00:00:00Z");
    expect(isOverdue({ status: "open", dueAt: "2026-10-09T00:00:00Z" }, now)).toBe(true);
    expect(isOverdue({ status: "done", dueAt: "2026-10-09T00:00:00Z" }, now)).toBe(false);
    expect(isOverdue({ status: "open", dueAt: "2026-10-11T00:00:00Z" }, now)).toBe(false);
  });
});
