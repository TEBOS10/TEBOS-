import { describe, expect, it } from "vitest";
import { gauge, trendPoints, type GlanceMeasurement } from "./glance";

const obj = { id: "o1", title: "Leads", status: "active", direction: "at_least", target_value: "20", unit: "count" };
const m = (id: string, value: number, at: string, basis = "measured"): GlanceMeasurement => ({ id, objective_id: "o1", basis, value, measured_at: at });

describe("the home screen's gauges", () => {
  it("draw nothing until a reading is measured, whatever the owner says", () => {
    const g = gauge(obj, [m("s", 25, "2026-10-01T00:00:00Z", "stated")]);
    expect(g).toMatchObject({ fraction: null, met: null, latest: null, readings: [] });
  });

  it("fill toward the target from the latest measured reading", () => {
    const g = gauge(obj, [m("a", 5, "2026-10-01T00:00:00Z"), m("b", 12, "2026-10-08T00:00:00Z"), m("s", 30, "2026-10-09T00:00:00Z", "stated")]);
    expect(g.fraction).toBeCloseTo(0.6);
    expect(g.met).toBe(false);
    expect(g.latest?.value).toBe(12);
    expect(g.readings.map((r) => r.value)).toEqual([5, 12]);
  });

  it("are full once the target is met, and empty further over an at-most target", () => {
    expect(gauge(obj, [m("a", 22, "2026-10-01T00:00:00Z")])).toMatchObject({ fraction: 1, met: true });
    const atMost = { ...obj, direction: "at_most", target_value: 10 };
    expect(gauge(atMost, [m("a", 8, "2026-10-01T00:00:00Z")]).fraction).toBe(1);
    expect(gauge(atMost, [m("a", 20, "2026-10-01T00:00:00Z")]).fraction).toBeCloseTo(0.5);
  });

  it("only count the objective's own readings", () => {
    const other = { ...m("x", 99, "2026-10-01T00:00:00Z"), objective_id: "o2" };
    expect(gauge(obj, [other]).fraction).toBeNull();
  });
});

describe("the trend line", () => {
  it("needs two readings", () => {
    expect(trendPoints([], 100, 30)).toBeNull();
    expect(trendPoints([{ value: 1, measuredAt: "2026-10-01T00:00:00Z" }], 100, 30)).toBeNull();
  });

  it("runs oldest to newest, higher values higher up", () => {
    const pts = trendPoints([{ value: 1, measuredAt: "2026-10-01T00:00:00Z" }, { value: 3, measuredAt: "2026-10-03T00:00:00Z" }], 100, 30)!;
    const [[x0, y0], [x1, y1]] = pts.split(" ").map((p) => p.split(",").map(Number)) as [[number, number], [number, number]];
    expect(x0).toBeLessThan(x1);
    expect(y1).toBeLessThan(y0);
  });

  it("draws a flat series across the middle", () => {
    const pts = trendPoints([{ value: 4, measuredAt: "2026-10-01T00:00:00Z" }, { value: 4, measuredAt: "2026-10-02T00:00:00Z" }], 100, 30)!;
    expect(pts.split(" ").map((p) => Number(p.split(",")[1]))).toEqual([15, 15]);
  });
});
