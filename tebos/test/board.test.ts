import { describe, expect, it } from "vitest";
import {
  checkMeasurement,
  checkObjectiveEdit,
  checkObjectiveTransition,
  checkStep,
  extractMeasuredValue,
  founderDependency,
  measurablePaths,
  meetsTarget,
  objectiveProgress,
  type MeasurementState,
  type ObjectiveTarget,
} from "../src";

const revenue: ObjectiveTarget = { id: "o1", status: "active", direction: "at_least", targetValue: 2_000_000, dueOn: "2027-06-30" };
const m = (over: Partial<MeasurementState>): MeasurementState => ({
  id: "m", objectiveId: "o1", basis: "measured", value: 0, measuredAt: "2026-09-01T00:00:00Z", ...over,
});

describe("targets", () => {
  it("compares in the objective's direction", () => {
    expect(meetsTarget("at_least", 10, 10)).toBe(true);
    expect(meetsTarget("at_least", 10, 9)).toBe(false);
    expect(meetsTarget("at_most", 20, 20)).toBe(true);
    expect(meetsTarget("at_most", 20, 21)).toBe(false);
  });
});

describe("measured values are read from evidence", () => {
  it("reads numbers and digit strings the way the database does", () => {
    const v = { value: 1250000, nested: { share: "81.5" }, list: [3, 4], label: "twelve", sci: "1e6" };
    expect(extractMeasuredValue(v, ["value"])).toBe(1250000);
    expect(extractMeasuredValue(v, ["nested", "share"])).toBe(81.5);
    expect(extractMeasuredValue(v, ["list", "1"])).toBe(4);
    expect(extractMeasuredValue(v, ["label"])).toBeNull();
    expect(extractMeasuredValue(v, ["sci"])).toBeNull();
    expect(extractMeasuredValue(v, ["missing"])).toBeNull();
    expect(extractMeasuredValue(v, [])).toBeNull();
    expect(extractMeasuredValue(null, ["value"])).toBeNull();
  });

  it("lists what can be measured", () => {
    expect(measurablePaths({ metric: "revenue", value: 5, nested: { a: "7", b: "x" } })).toEqual([
      { path: ["value"], value: 5 },
      { path: ["nested", "a"], value: 7 },
    ]);
  });

  const snapshot = { sourceType: "connected_system", evidenceState: "acquired", structuredValue: { value: 1_250_000 }, valuePath: ["value"] };

  it("accepts a connected system's number and ignores nothing typed", () => {
    expect(checkMeasurement({ basis: "measured", ...snapshot })).toEqual({ ok: true, value: 1_250_000 });
    expect(checkMeasurement({ basis: "measured", ...snapshot, value: 1_250_000 })).toMatchObject({ ok: true });
    expect(checkMeasurement({ basis: "measured", ...snapshot, value: 2_500_000 })).toMatchObject({ ok: false, code: "TEBOS_MEASUREMENT_UNSUPPORTED" });
  });

  it("refuses measured values from anything but a connected system", () => {
    expect(checkMeasurement({ basis: "measured", ...snapshot, sourceType: "user_statement" })).toMatchObject({ ok: false });
    expect(checkMeasurement({ basis: "measured", ...snapshot, evidenceState: "user_supplied" })).toMatchObject({ ok: false });
    expect(checkMeasurement({ basis: "measured", ...snapshot, evidenceState: "unavailable" })).toMatchObject({ ok: false });
    expect(checkMeasurement({ basis: "measured", ...snapshot, valuePath: ["nope"] })).toMatchObject({ ok: false });
  });

  it("takes stated values only from the owner's statement", () => {
    expect(checkMeasurement({ basis: "stated", sourceType: "user_statement", evidenceState: "user_supplied", value: 1_800_000 })).toEqual({ ok: true, value: 1_800_000 });
    expect(checkMeasurement({ basis: "stated", sourceType: "connected_system", evidenceState: "acquired", value: 1 })).toMatchObject({ ok: false });
    expect(checkMeasurement({ basis: "stated", sourceType: "user_statement", evidenceState: "user_supplied" })).toMatchObject({ ok: false, code: "TEBOS_VALIDATION" });
  });
});

describe("objective lifecycle", () => {
  it("is achieved only on a measured value that meets the target", () => {
    expect(checkObjectiveTransition(revenue, "achieved", { measurement: m({ value: 2_050_000 }) })).toEqual({ ok: true });
    expect(checkObjectiveTransition(revenue, "achieved", { measurement: m({ value: 1_999_999 }) })).toMatchObject({ code: "TEBOS_OBJECTIVE_UNMEASURED" });
    expect(checkObjectiveTransition(revenue, "achieved", { measurement: m({ value: 3_000_000, basis: "stated" }) })).toMatchObject({ code: "TEBOS_OBJECTIVE_UNMEASURED" });
    expect(checkObjectiveTransition(revenue, "achieved", { measurement: m({ value: 3_000_000, objectiveId: "other" }) })).toMatchObject({ code: "TEBOS_OBJECTIVE_UNMEASURED" });
    expect(checkObjectiveTransition(revenue, "achieved")).toMatchObject({ code: "TEBOS_OBJECTIVE_UNMEASURED" });
  });

  it("is missed only after the due date", () => {
    expect(checkObjectiveTransition(revenue, "missed", { today: "2027-06-30" })).toMatchObject({ code: "TEBOS_OBJECTIVE_NOT_DUE" });
    expect(checkObjectiveTransition(revenue, "missed", { today: "2027-07-01" })).toEqual({ ok: true });
  });

  it("follows the state machine and needs reasons to stop", () => {
    expect(checkObjectiveTransition({ ...revenue, status: "achieved" }, "active")).toMatchObject({ code: "TEBOS_ILLEGAL_TRANSITION" });
    expect(checkObjectiveTransition(revenue, "retired")).toMatchObject({ code: "TEBOS_VALIDATION" });
    expect(checkObjectiveTransition(revenue, "retired", { reason: "Replaced" })).toEqual({ ok: true });
    expect(checkObjectiveTransition({ ...revenue, status: "draft", dueOn: "2020-01-01" }, "active", { today: "2026-09-28" })).toMatchObject({ ok: false });
  });

  it("fixes the target once active", () => {
    expect(checkObjectiveEdit("draft")).toEqual({ ok: true });
    expect(checkObjectiveEdit("active")).toMatchObject({ code: "TEBOS_INPUT_FROZEN" });
  });

  it("reports progress from measured values only", () => {
    const list = [
      m({ id: "a", value: 1_250_000, measuredAt: "2026-08-01T00:00:00Z" }),
      m({ id: "b", value: 3_000_000, basis: "stated", measuredAt: "2026-09-20T00:00:00Z" }),
      m({ id: "c", value: 1_600_000, measuredAt: "2026-09-01T00:00:00Z" }),
      m({ id: "x", value: 9_000_000, objectiveId: "other" }),
    ];
    const p = objectiveProgress(revenue, list);
    expect(p.measured?.id).toBe("c");
    expect(p.stated?.id).toBe("b");
    expect(p.met).toBe(false);
    expect(p.gap).toBe(400_000);
    expect(p.proof).toBeNull();
    expect(objectiveProgress(revenue, []).met).toBeNull();
    const hours = objectiveProgress({ id: "o1", direction: "at_most", targetValue: 20 }, [m({ value: 18 })]);
    expect(hours).toMatchObject({ met: true, gap: 0 });
    expect(hours.proof?.value).toBe(18);
  });
});

describe("the board", () => {
  it("needs a tool for automated steps", () => {
    expect(checkStep({ performer: "automation", documented: true })).toMatchObject({ ok: false });
    expect(checkStep({ performer: "automation", documented: true, componentId: "c" })).toEqual({ ok: true });
    expect(checkStep({ performer: "founder", documented: false })).toEqual({ ok: true });
  });

  it("counts where the founder is the middleware", () => {
    const d = founderDependency([
      { performer: "client", documented: true },
      { performer: "founder", documented: false },
      { performer: "founder", documented: true },
      { performer: "automation", documented: true, componentId: "c" },
      { performer: "founder", documented: false, retired: true },
    ]);
    expect(d).toEqual({ steps: 4, founder: 2, undocumented: 1, automated: 1, middleware: 1, founderShare: 0.5 });
    expect(founderDependency([]).founderShare).toBeNull();
  });
});
