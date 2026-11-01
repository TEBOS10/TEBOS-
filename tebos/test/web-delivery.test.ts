import { describe, expect, it } from "vitest";
import { canTransition } from "../src/domain/states";
import {
  addBusinessDays, businessDaysBetween, canStart, checkAsset, checkDeployment, checkRelease, checkScope, completion, deadlineState,
  makesLoop, nextClock, qaPassed, readinessGaps, checkCost, checkIntegration, clientToDos, maintainersNeeded, monthlyRunningCents,
  WEB_PROJECTS_PER_MAINTAINER, INTAKE_REQUIRED, intakeMissing, easterSunday, isSaPublicHoliday,
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

describe("milestone 2: tasks, assets, deployments, the clock on the dashboard", () => {
  it("a task starts only when what it depends on is done", () => {
    const all = [
      { id: "a", status: "done" as const, dependsOn: [] },
      { id: "b", status: "todo" as const, dependsOn: ["a"] },
      { id: "c", status: "todo" as const, dependsOn: ["a", "b"] },
    ];
    expect(canStart(all[1]!, all)).toBe(true);
    expect(canStart(all[2]!, all)).toBe(false);
    expect(canStart(all[0]!, all)).toBe(false);
  });
  it("refuses dependencies that make a loop", () => {
    const edges: Array<[string, string]> = [["b", "a"], ["c", "b"]];
    expect(makesLoop("a", "c", edges)).toBe(true);
    expect(makesLoop("a", "a", edges)).toBe(true);
    expect(makesLoop("c", "a", edges)).toBe(false);
  });
  it("nobody passes their own review, and a task's states follow the ledger", () => {
    expect(canTransition("web_task", "todo", "done")).toBe(false);
    expect(canTransition("web_task", "review", "done")).toBe(true);
    expect(canTransition("web_task", "cancelled", "todo")).toBe(false);
  });
  it("an asset is received only with its source and licence", () => {
    expect(checkAsset({ status: "received", source: "unknown", licenceNote: "Client owns it outright." })).toMatchObject({ ok: false });
    expect(checkAsset({ status: "received", source: "client_supplied", licenceNote: "short" })).toMatchObject({ ok: false });
    expect(checkAsset({ status: "received", source: "client_supplied", licenceNote: "Client's own logo, supplied by email on 1 Nov." })).toEqual({ ok: true });
    expect(checkAsset({ status: "missing", source: "unknown", licenceNote: "" })).toEqual({ ok: true });
  });
  it("completion is counted from done tasks only", () => {
    expect(completion(0, 0)).toBeNull();
    expect(completion(4, 1)).toBe(25);
  });
  it("places a project against its clock", () => {
    const p = (status: "build" | "intake" | "handover", deadlineOn: string | null, pausedOn: string | null = null) => ({ status, deadlineOn, pausedOn });
    expect(deadlineState(p("intake", null), "2026-11-02")).toEqual({ state: "not_started", businessDaysLeft: null });
    expect(deadlineState(p("build", "2026-11-05"), "2026-11-02")).toEqual({ state: "on_track", businessDaysLeft: 3 });
    expect(deadlineState(p("build", "2026-11-05"), "2026-11-04")).toEqual({ state: "at_risk", businessDaysLeft: 1 });
    expect(deadlineState(p("build", "2026-11-05"), "2026-11-05")).toEqual({ state: "due_today", businessDaysLeft: 0 });
    expect(deadlineState(p("build", "2026-11-05"), "2026-11-09")).toEqual({ state: "overdue", businessDaysLeft: -2 });
    expect(deadlineState(p("build", "2026-11-05", "2026-11-03"), "2026-11-09").state).toBe("paused");
    expect(deadlineState(p("handover", "2026-11-05"), "2026-11-09").state).toBe("finished");
  });
  it("production needs release and the client's approval", () => {
    const d = { environment: "production" as const, url: "https://client.example", commitRef: "1de4b0b", checked: "Home, contact form and mobile menu load." };
    expect(checkDeployment(d, { status: "build", releaseApproved: true })).toMatchObject({ ok: false });
    expect(checkDeployment(d, { status: "release", releaseApproved: false })).toMatchObject({ code: "TEBOS_APPROVAL_REQUIRED" });
    expect(checkDeployment(d, { status: "release", releaseApproved: true })).toEqual({ ok: true });
    expect(checkDeployment({ ...d, environment: "preview", url: "http://x" }, { status: "build", releaseApproved: false })).toMatchObject({ ok: false });
  });
});

describe("milestone 3: capacity, accounts, costs, the client's to-dos", () => {
  it("50 clients need 7 maintainers at 8 open projects each", () => {
    expect(WEB_PROJECTS_PER_MAINTAINER).toBe(8);
    expect(maintainersNeeded(50)).toBe(7);
    expect(maintainersNeeded(8)).toBe(1);
    expect(maintainersNeeded(0)).toBe(0);
  });
  it("records TEBOS's access with how it ends, and a hand-over for accounts TEBOS holds", () => {
    const base = { accountOwner: "client" as const, access: "deploy" as const, status: "granted" as const, purpose: "Hosts the client's website.", revocationPlan: "", transferPlan: "", verifiedOn: null };
    expect(checkIntegration(base)).toMatchObject({ ok: false });
    expect(checkIntegration({ ...base, revocationPlan: "Remove TEBOS from the team at handover." })).toEqual({ ok: true });
    expect(checkIntegration({ ...base, revocationPlan: "Remove TEBOS from the team.", accountOwner: "tebos" })).toMatchObject({ ok: false });
    expect(checkIntegration({ ...base, access: "none", status: "verified" })).toMatchObject({ ok: false });
    expect(checkIntegration({ ...base, revocationPlan: "Remove TEBOS from the team.", status: "revoked" })).toMatchObject({ ok: false });
  });
  it("a recurring cost the client pays is disclosed first; running costs are monthly", () => {
    const c = { description: "Hosting plan", amountCents: 12_000, recurrence: "monthly" as const, paidBy: "client" as const, disclosed: false };
    expect(checkCost(c)).toMatchObject({ ok: false });
    expect(checkCost({ ...c, disclosed: true })).toEqual({ ok: true });
    expect(checkCost({ ...c, paidBy: "tebos" })).toEqual({ ok: true });
    expect(monthlyRunningCents([{ amountCents: 12_000, recurrence: "monthly" }, { amountCents: 24_000, recurrence: "yearly" }, { amountCents: 99_900, recurrence: "once" }])).toBe(14_000);
  });
  it("tells the client what they still have to decide or send", () => {
    const p = { status: "approval" as const, isAdmin: true, hasScope: true, approved: { scope: false, design: true, release: false }, qaPassed: false, assetsNeeded: 2 };
    expect(clientToDos(p)).toEqual(["Approve the scope and its costs", "Send 2 items TEBOS needs from you"]);
    expect(clientToDos({ ...p, isAdmin: false })[0]).toMatch(/Your admin/);
    expect(clientToDos({ ...p, status: "intake", hasScope: false, briefSubmitted: false, assetsNeeded: 0 })).toEqual(["Fill in and submit your brief"]);
    expect(clientToDos({ ...p, status: "intake", hasScope: false, briefSubmitted: true, assetsNeeded: 0 })).toEqual([]);
    expect(clientToDos({ ...p, status: "client_review", approved: { scope: true, design: true, release: false }, qaPassed: true, assetsNeeded: 0 }))
      .toEqual(["Review the preview and approve the release"]);
  });
});

describe("milestone 4: the client's brief", () => {
  const full = {
    business_name: "Northwind Studio", audience: "Homeowners in Randburg who need a plumber today.", first_action: "Request a call-out",
    success_measure: "Ten call-out requests a month", pages: ["Home", "Services"], visual_direction: "minimal" as const,
    confirmations: { rights: true, privacy: true },
  };
  it("is complete only with what TEBOS needs to start", () => {
    expect(intakeMissing(full)).toEqual([]);
    expect(intakeMissing({})).toEqual(Object.keys(INTAKE_REQUIRED));
    expect(intakeMissing({ ...full, pages: [] })).toEqual(["pages"]);
    expect(intakeMissing({ ...full, confirmations: { rights: true } })).toEqual(["confirm_privacy"]);
    expect(intakeMissing({ ...full, visual_direction: "vaporwave" as never })).toEqual(["visual_direction"]);
  });
});

describe("South African public holidays in the delivery clock", () => {
  it("finds Easter (published dates)", () => {
    expect(easterSunday(2024)).toBe("2024-03-31");
    expect(easterSunday(2025)).toBe("2025-04-20");
    expect(easterSunday(2026)).toBe("2026-04-05");
    expect(easterSunday(2027)).toBe("2027-03-28");
    expect(easterSunday(2030)).toBe("2030-04-21");
  });
  it("knows the Act's holidays, Good Friday, Family Day and the Sunday rule", () => {
    expect(isSaPublicHoliday("2026-12-16")).toBe(true);
    expect(isSaPublicHoliday("2026-04-03")).toBe(true);   // Good Friday
    expect(isSaPublicHoliday("2026-04-06")).toBe(true);   // Family Day
    expect(isSaPublicHoliday("2028-09-25")).toBe(true);   // Heritage Day on Sunday 24 Sep 2028 → Monday
    expect(isSaPublicHoliday("2022-12-27")).toBe(false);  // Christmas on a Sunday: the Monday is already the Day of Goodwill
    expect(isSaPublicHoliday("2026-11-02")).toBe(false);
  });
  it("skips holidays when it sets and extends a deadline", () => {
    expect(addBusinessDays("2026-12-24", 3)).toBe("2026-12-30");   // 25 Dec (Fri), the weekend
    expect(addBusinessDays("2026-04-02", 3)).toBe("2026-04-09");   // Good Friday, the weekend, Family Day
    expect(addBusinessDays("2026-12-15", 1)).toBe("2026-12-17");   // Day of Reconciliation
    expect(businessDaysBetween("2026-04-02", "2026-04-07")).toBe(1);
  });
});
