import { describe, expect, it } from "vitest";
import { canTransition } from "../src/domain/states";
import {
  addBusinessDays, businessDaysBetween, checkRelease, checkScope, nextClock, qaPassed, readinessGaps,
  READINESS_ITEMS, type ReadinessItem, type ScopeDraft,
} from "../src/domain/web-delivery";

const scope = (over: Partial<ScopeDraft> = {}): ScopeDraft => ({
  pages: ["Home", "Services", "Contact"],
  features: ["Enquiry form"],
  workflows: ["Enquiry to follow-up"],
  exclusions: "No online payments or bookings in this phase.",
  primaryConversion: "Send an enquiry from the contact form",
  acceptanceCriteria: ["The enquiry form saves the enquiry and shows an error when saving fails."],
  recurringCosts: "None",
  ...over,
});
const allMet = Object.fromEntries(Object.keys(READINESS_ITEMS).map((k) => [k, "met"])) as Record<ReadinessItem, "met">;

describe("business days", () => {
  it("skips weekends (Fri 31 Oct 2026 + 3 is Wed 5 Nov)", () => {
    expect(addBusinessDays("2026-10-30", 3)).toBe("2026-11-04");
    expect(addBusinessDays("2026-10-31", 3)).toBe("2026-11-04");
    expect(addBusinessDays("2026-11-02", 3)).toBe("2026-11-05");
  });
  it("counts the business days in a pause", () => {
    expect(businessDaysBetween("2026-11-02", "2026-11-02")).toBe(0);
    expect(businessDaysBetween("2026-10-30", "2026-11-02")).toBe(1);
    expect(businessDaysBetween("2026-11-02", "2026-11-09")).toBe(5);
    expect(businessDaysBetween("2026-11-09", "2026-11-02")).toBe(0);
  });
});

describe("the delivery clock", () => {
  it("starts at build, pauses while the client blocks it, and resumes with the paused days added", () => {
    let c = nextClock({ deadlineOn: null, pausedOn: null }, "approval", "build", "2026-11-02");
    expect(c).toEqual({ deadlineOn: "2026-11-05", pausedOn: null });
    c = nextClock(c, "build", "blocked_client", "2026-11-03");
    expect(c).toEqual({ deadlineOn: "2026-11-05", pausedOn: "2026-11-03" });
    c = nextClock(c, "blocked_client", "build", "2026-11-05");
    expect(c).toEqual({ deadlineOn: "2026-11-09", pausedOn: null });
  });
  it("doesn't start before build, and a technical block doesn't pause it", () => {
    expect(nextClock({ deadlineOn: null, pausedOn: null }, "intake", "blocked_client", "2026-11-02")).toEqual({ deadlineOn: null, pausedOn: null });
    expect(nextClock({ deadlineOn: "2026-11-05", pausedOn: null }, "build", "blocked_technical", "2026-11-03"))
      .toEqual({ deadlineOn: "2026-11-05", pausedOn: null });
  });
});

describe("scope against the package", () => {
  it("accepts scope inside the ceiling", () => expect(checkScope("starter", scope())).toEqual({ ok: true }));
  it("refuses more workflows or parts than the package holds, and says what to offer", () => {
    const tooMany = checkScope("starter", scope({ workflows: ["a", "b", "c", "d", "e"] }));
    expect(tooMany).toMatchObject({ ok: false, code: "TEBOS_OUT_OF_PLAN" });
    expect(!tooMany.ok && tooMany.reason).toMatch(/revised quote/);
    expect(checkScope("starter", scope({ pages: Array.from({ length: 10 }, (_, i) => `P${i}`) }))).toMatchObject({ code: "TEBOS_OUT_OF_PLAN" });
    expect(checkScope("growth", scope({ pages: Array.from({ length: 10 }, (_, i) => `P${i}`) }))).toEqual({ ok: true });
  });
  it("needs pages, exclusions, a conversion, acceptance criteria and the recurring costs", () => {
    expect(checkScope("starter", scope({ pages: [] }))).toMatchObject({ code: "TEBOS_VALIDATION" });
    expect(checkScope("starter", scope({ exclusions: "none" }))).toMatchObject({ code: "TEBOS_VALIDATION" });
    expect(checkScope("starter", scope({ acceptanceCriteria: [] }))).toMatchObject({ code: "TEBOS_VALIDATION" });
    expect(checkScope("starter", scope({ recurringCosts: "" }))).toMatchObject({ code: "TEBOS_VALIDATION" });
  });
});

describe("ready to build", () => {
  const ready = { plan: "starter" as const, activePlan: "starter", hasScope: true, scopeApproved: true, designApproved: true, readiness: allMet };
  it("is ready only when everything is in place", () => expect(readinessGaps(ready)).toEqual([]));
  it("names each gap", () => {
    expect(readinessGaps({ ...ready, activePlan: null })[0]).toMatch(/^package/);
    expect(readinessGaps({ ...ready, hasScope: false })).toContain("scope: no scope has been written");
    expect(readinessGaps({ ...ready, designApproved: false })[0]).toMatch(/^design/);
    expect(readinessGaps({ ...ready, readiness: { ...allMet, technical_access: "missing" } })).toEqual(["technical_access: not confirmed with evidence"]);
  });
  it("lets only missing assets be waived", () => {
    expect(readinessGaps({ ...ready, readiness: { ...allMet, assets: "waived" } })).toEqual([]);
    expect(readinessGaps({ ...ready, readiness: { ...allMet, commercial_terms: "waived" } })).toHaveLength(1);
  });
});

describe("QA and release", () => {
  it("uses the latest verdict on the latest scope", () => {
    const runs = [
      { revision: 1, verdict: "pass" as const, criticalOpen: 0, at: "2026-11-03T10:00:00Z" },
      { revision: 2, verdict: "fail" as const, criticalOpen: 2, at: "2026-11-04T10:00:00Z" },
      { revision: 2, verdict: "conditional_pass" as const, criticalOpen: 0, at: "2026-11-04T15:00:00Z" },
    ];
    expect(qaPassed(runs, 2)).toBe(true);
    expect(qaPassed(runs.slice(0, 2), 2)).toBe(false);
    expect(qaPassed(runs.slice(0, 1), 2)).toBe(false);
  });
  it("needs a QA pass, and release also needs the client's approval", () => {
    expect(checkRelease("client_review", false, false)).toMatchObject({ ok: false });
    expect(checkRelease("client_review", true, false)).toEqual({ ok: true });
    expect(checkRelease("release", true, false)).toMatchObject({ ok: false });
    expect(checkRelease("release", true, true)).toEqual({ ok: true });
  });
  it("can't skip QA or reopen a closed project", () => {
    expect(canTransition("web_project", "build", "client_review")).toBe(false);
    expect(canTransition("web_project", "build", "release")).toBe(false);
    expect(canTransition("web_project", "closed", "build")).toBe(false);
    expect(canTransition("web_project", "qa", "client_review")).toBe(true);
  });
});
