import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FOUNDING_OFFER, monthlyUpdate, planForUnits, PRA_PLANS, scorecard, type Figure, type Workstream } from "../src/domain/property";

const ws = (over: Partial<Workstream>): Workstream => ({
  id: over.id ?? "w", title: "Task", owner: "Owner", dueOn: "2026-11-30", status: "planned", dependsOn: null, budget: null,
  approval: "not_needed", approvedBy: null, approvedOn: null, completionEvidence: null, completedOn: null, note: null, ...over,
});
const fig = (key: Figure["key"], value: number): Figure => ({ key, value, basis: "verified", asOf: "2026-09-30", evidenceId: "e" });
const base = [fig("scheduled_rent", 20000), fig("other_income", 0), fig("vacancy_loss", 4000), fig("rent_due", 16000), fig("rent_collected", 14000), fig("operating_expenses", 5000), fig("debt_service", 3000), fig("reserve", 1000), fig("units", 2), fig("vacant_units", 0)];

describe("the monthly plans", () => {
  it("match the price the founder decided (docs/pra-pricing.md)", () => {
    const doc = readFileSync(join(__dirname, "..", "docs", "pra-pricing.md"), "utf8");
    for (const p of PRA_PLANS) if (p.monthly !== null) expect(doc).toContain(`R${p.monthly.toLocaleString("en-US")}`);
    expect(doc).toContain(`${FOUNDING_OFFER.percentOff}% off for six months`);
  });
  it("pick the plan by units, and never guess unknown units", () => {
    expect(planForUnits(1)?.key).toBe("single");
    expect(planForUnits(2)?.key).toBe("portfolio");
    expect(planForUnits(5)?.key).toBe("portfolio");
    expect(planForUnits(6)?.key).toBe("portfolio_plus");
    expect(planForUnits(15)?.key).toBe("portfolio_plus");
    expect(planForUnits(40)?.key).toBe("larger");
    expect(planForUnits(40)?.monthly).toBeNull();
    expect(planForUnits(null)).toBeNull();
    expect(planForUnits(0)).toBeNull();
    expect(planForUnits(2.5)).toBeNull();
  });
});

describe("the monthly update", () => {
  const work = [
    ws({ id: "a", title: "Register the rental business", status: "done", completedOn: "2026-10-12", completionEvidence: "Registration certificate", dueOn: "2026-10-15" }),
    ws({ id: "b", title: "Set up the rent spreadsheet", status: "done", completedOn: "2026-09-28", completionEvidence: "Sheet link", dueOn: "2026-09-30" }),
    ws({ id: "c", title: "Re-let unit 2", status: "in_progress", dueOn: "2026-11-15" }),
    ws({ id: "d", title: "Fix the geyser", status: "planned", dueOn: "2026-10-20" }),
    ws({ id: "e", title: "Dropped idea", status: "cancelled", dueOn: "2026-10-01" }),
  ];

  it("lists only work finished in the month, and open work soonest first", () => {
    const u = monthlyUpdate({ month: "2026-10", workstreams: work, score: scorecard(null, [], "2026-10-31", null), units: 2, today: "2026-10-31" });
    expect(u.from).toBe("2026-10-01");
    expect(u.to).toBe("2026-10-31");
    expect(u.done.map((d) => d.title)).toEqual(["Register the rental business"]);
    expect(u.next.map((n) => n.title)).toEqual(["Fix the geyser", "Re-let unit 2"]);
    expect(u.exceptions.some((x) => x.title === "Fix the geyser" && x.reason.startsWith("overdue"))).toBe(true);
    expect(u.plan?.key).toBe("portfolio");
    expect(u.outcome).toBeNull();
    expect(u.summary).toContain("No baseline is captured yet, so results can't be measured.");
  });

  it("reports the measured change against the baseline from the latest review in the month, never an estimate", () => {
    const score = scorecard({ capturedOn: "2026-09-30", figures: base, targetCashFlow: 9000 }, [
      { id: "r1", reviewOn: "2026-10-31", values: [
        { key: "scheduled_rent", value: 20000, basis: "verified" }, { key: "other_income", value: 0, basis: "verified" }, { key: "vacancy_loss", value: 0, basis: "verified" },
        { key: "rent_due", value: 20000, basis: "verified" }, { key: "rent_collected", value: 19000, basis: "verified" },
        { key: "operating_expenses", value: 5000, basis: "verified" }, { key: "debt_service", value: 3000, basis: "verified" },
        { key: "reserve", value: 1000, basis: "verified" },
      ] },
      { id: "r2", reviewOn: "2026-11-30", values: [{ key: "rent_collected", value: 1, basis: "owner_reported" }] },
    ], "2026-11-01", null);
    const u = monthlyUpdate({ month: "2026-10", workstreams: work, score, units: 2, today: "2026-11-01" });
    expect(u.outcome?.reviewOn).toBe("2026-10-31");
    expect(u.outcome?.cashFlowChange.value).toBe(5000);
    expect(u.summary.some((l) => l.includes("above the baseline"))).toBe(true);
  });

  it("says there is no measured result when there is no review yet", () => {
    const score = scorecard({ capturedOn: "2026-09-30", figures: base, targetCashFlow: null }, [], "2026-10-31", null);
    const u = monthlyUpdate({ month: "2026-10", workstreams: [], score, units: null, today: "2026-10-31" });
    expect(u.plan).toBeNull();
    expect(u.summary).toEqual(["No work was finished this month.", "No outcome review yet, so there is no measured result to report."]);
  });

  it("refuses a malformed month", () => {
    expect(() => monthlyUpdate({ month: "2026-13", workstreams: [], score: scorecard(null, [], "2026-10-31", null), units: null, today: "2026-10-31" })).toThrow();
  });
});
