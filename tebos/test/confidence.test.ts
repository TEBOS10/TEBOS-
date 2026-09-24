import { describe, expect, it } from "vitest";
import { scoreConfidence } from "../src";

const strong = { sourceReliability: 0.9, coverage: 1, recency: 1, corroboration: 0.8, extractionQuality: 1, contradiction: 0 };

describe("confidence", () => {
  it("is zero without coverage, whatever else is true", () => {
    expect(scoreConfidence({ ...strong, coverage: 0 }).score).toBe(0);
  });

  it("returns visible components and names what limits it", () => {
    const c = scoreConfidence({ ...strong, coverage: 0.3, corroboration: 0.2 });
    expect(c.score).toBeLessThan(scoreConfidence(strong).score);
    expect(c.limitingFactors.map((f) => f.component).sort()).toEqual(["corroboration", "coverage"]);
    expect(c.components.coverage).toBe(0.3);
  });

  it("is reduced by contradiction", () => {
    const c = scoreConfidence({ ...strong, contradiction: 0.5 });
    expect(c.score).toBeCloseTo(scoreConfidence(strong).score * 0.5, 2);
    expect(c.limitingFactors.map((f) => f.component)).toContain("contradiction");
  });

  it("clamps garbage input instead of inflating", () => {
    expect(scoreConfidence({ ...strong, sourceReliability: 7, coverage: Number.NaN }).score).toBe(0);
    expect(scoreConfidence({ ...strong, sourceReliability: 7 }).score).toBeLessThanOrEqual(1);
  });
});
