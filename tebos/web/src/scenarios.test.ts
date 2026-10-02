import { describe, expect, it } from "vitest";
import { SCENARIOS, stepOf } from "./scenarios";

describe("scenario films", () => {
  it.each(SCENARIOS.map((s) => [s.key, s] as const))("%s shows only real steps of its blueprint", (_, s) => {
    for (const m of s.moments) expect(stepOf(s, m), `${m.at} ${m.flow} #${m.step}`).not.toBeTypeOf("string");
    expect(s.moments.length).toBeGreaterThanOrEqual(5);
    expect(s.before.length).toBeGreaterThan(0);
    expect(s.after.length).toBeGreaterThan(0);
  });

  it("tells each day in order", () => {
    for (const s of SCENARIOS) {
      const times = s.moments.map((m) => m.at);
      expect([...times].sort()).toEqual(times);
    }
  });
});
