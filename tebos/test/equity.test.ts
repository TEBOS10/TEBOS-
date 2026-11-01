import { describe, expect, it } from "vitest";
import { canTransition } from "../src/domain/states";
import { auditFlags, qualificationGaps, type EquityApplicationFacts } from "../src/domain/equity";

const strong: EquityApplicationFacts = {
  registrationNumber: "2019/123456/07", tradingSince: "2025-01-15", sector: "beauty_wellness", revenueBand: "10k_50k",
  revenueEvidenceNote: "Three months of bank statements seen on a video call; not copied.", ownerFullTime: true, reportingConsent: true,
};

describe("qualifying for the equity programme", () => {
  it("qualifies a registered, trading, earning business whose owner works in it and agrees to record sales", () => {
    expect(qualificationGaps(strong, "2026-11-01")).toEqual([]);
  });
  it("names each reason it doesn't qualify", () => {
    const gaps = qualificationGaps({ registrationNumber: "123", tradingSince: "2026-08-01", sector: "other", revenueBand: "under_10k", revenueEvidenceNote: "seen", ownerFullTime: false, reportingConsent: false }, "2026-11-01");
    expect(gaps.map((g) => g.split(":")[0])).toEqual(["registration", "trading", "sector", "revenue", "evidence", "owner", "consent"]);
  });
  it("needs six full months of trading", () => {
    expect(qualificationGaps({ ...strong, tradingSince: "2026-05-01" }, "2026-11-01")).toEqual([]);
    expect(qualificationGaps({ ...strong, tradingSince: "2026-05-02" }, "2026-11-01")[0]).toMatch(/^trading/);
  });
  it("can't skip the founder's approval or the signed agreement", () => {
    expect(canTransition("equity_application", "screening", "approved")).toBe(false);
    expect(canTransition("equity_application", "approved", "active")).toBe(false);
    expect(canTransition("equity_application", "agreement_signed", "active")).toBe(true);
  });
});

describe("the audit of a partner's sales", () => {
  const m = (period: string, sales: number, extra: Partial<{ closed: boolean; refunds: number; corrections: number; count: number }> = {}) =>
    ({ period, closed: true, sales, refunds: 0, corrections: 0, count: sales > 0 ? 10 : 0, ...extra });
  it("flags an overdue close, an empty month, heavy corrections and a sharp drop", () => {
    const rows = auditFlags([
      m("2026-06-01", 4_000_000), m("2026-07-01", 4_200_000), m("2026-08-01", 3_800_000),
      m("2026-09-01", 1_500_000, { corrections: -300_000 }),
      m("2026-10-01", 0, { closed: false }),
      m("2026-11-01", 200_000, { closed: false }),
    ], "2026-11-12");
    const by = Object.fromEntries(rows.map((r) => [r.period, r.flags]));
    expect(by["2026-11-01"]).toEqual([]);
    expect(by["2026-10-01"]).toEqual(["close_overdue", "no_sales", "sharp_drop"]);
    expect(by["2026-09-01"]).toEqual(["heavy_corrections", "sharp_drop"]);
    expect(by["2026-08-01"]).toEqual([]);
    expect(rows[0]!.period).toBe("2026-11-01");
  });
});
