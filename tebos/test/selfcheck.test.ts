import { describe, expect, it } from "vitest";
import { bandOf, firstFixes, MAX_SCORE, planForSize, QUESTIONS, scoreOf } from "../src/domain/selfcheck";

describe("the free self-check", () => {
  it("scores ten answers as a share of the maximum, in steps of 5", () => {
    expect(QUESTIONS).toHaveLength(10);
    expect(MAX_SCORE).toBe(20);
    expect(scoreOf(Array(10).fill(0))).toBe(0);
    expect(scoreOf(Array(10).fill(2))).toBe(100);
    expect(scoreOf([2, 2, 1, 0, 1, 2, 0, 1, 1, 2])).toBe(60);
    expect(scoreOf([2, 2])).toBeNull();
    expect(scoreOf([3, 0, 0, 0, 0, 0, 0, 0, 0, 0])).toBeNull();
  });

  it("names a band, the first fixes, and the plan that fits the size", () => {
    expect(bandOf(30).key).toBe("structured");
    expect(bandOf(35).key).toBe("middleware");
    expect(bandOf(65).key).toBe("runs_through_you");
    expect(firstFixes([1, 2, 0, 0, 0, 0, 0, 0, 0, 2]).map((q) => q.key)).toEqual(["pricing", "targets", "leads"]);
    expect(firstFixes(Array(10).fill(0))).toEqual([]);
    expect(planForSize("51-200")).toBe("company");
    expect(planForSize("6-20")).toBe("starter");
  });

  it("matches the database's score for every answer total", () => {
    // tebos_private.self_check_score is sum * 100 / 20 (integer division): every total gives a multiple of 5
    for (let total = 0; total <= 20; total++) {
      const answers = Array.from({ length: 10 }, (_, i) => Math.min(2, Math.max(0, total - 2 * i)));
      expect(scoreOf(answers)).toBe(Math.trunc((total * 100) / 20));
    }
  });
});
