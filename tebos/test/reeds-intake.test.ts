import { describe, expect, it } from "vitest";
import { COMMITMENT_STATUS_LABEL, MACHINES, commitmentProblems, dailyBrief, normaliseForDedupe, type Commitment } from "../src";

const TODAY = "2026-10-26";
const c = (over: Partial<Commitment>): Commitment => ({
  id: Math.random().toString(36).slice(2), title: "t", owner: "founder", dueOn: null, dueBasis: "unknown",
  priority: "normal", status: "ready", approval: "not_needed", nextAction: null, ...over,
});

describe("the daily brief", () => {
  it("holds at most three priorities: late first, then today, then high priority", () => {
    const brief = dailyBrief([
      c({ title: "later high", priority: "high", dueOn: "2026-11-02", dueBasis: "reported" }),
      c({ title: "today", dueOn: TODAY, dueBasis: "reported" }),
      c({ title: "late", dueOn: "2026-10-24", dueBasis: "reported" }),
      c({ title: "today low", dueOn: TODAY, dueBasis: "reported", priority: "low" }),
      c({ title: "someone else's", owner: "pra", dueOn: TODAY, dueBasis: "reported" }),
    ], TODAY);
    expect(brief.priorities.map((x) => x.title)).toEqual(["late", "today", "today low"]);
    expect(brief.overdue.map((x) => x.title)).toEqual(["late"]);
    expect(brief.dueToday.map((x) => x.title)).toEqual(["today", "today low", "someone else's"]);
  });

  it("shows blocked work, approvals and undated work instead of hiding or dating it", () => {
    const brief = dailyBrief([
      c({ title: "blocked", status: "blocked", dueOn: "2026-10-20", dueBasis: "reported" }),
      c({ title: "needs approval", approval: "required" }),
      c({ title: "no date" }),
      c({ title: "done", status: "done", dueOn: "2026-10-20", dueBasis: "reported" }),
    ], TODAY);
    expect(brief.blocked.map((x) => x.title)).toEqual(["blocked"]);
    expect(brief.overdue).toEqual([]);
    expect(brief.awaitingApproval.map((x) => x.title)).toEqual(["needs approval"]);
    expect(brief.undated.map((x) => x.title)).toEqual(["needs approval", "no date"]);
    expect(brief.undated.every((x) => x.dueOn === null)).toBe(true);
  });
});

describe("commitments", () => {
  it("done needs evidence, and approval first where it is required", () => {
    expect(commitmentProblems({ status: "in_progress", approval: "not_needed" }, "done", {}).map((p) => p.code)).toEqual(["TEBOS_EVIDENCE_REQUIRED"]);
    expect(commitmentProblems({ status: "in_progress", approval: "required" }, "done", { evidence: "Drafted" }).map((p) => p.code)).toEqual(["TEBOS_APPROVAL_REQUIRED"]);
    expect(commitmentProblems({ status: "in_progress", approval: "approved" }, "done", { evidence: "Sent, message ID in Sent" })).toEqual([]);
    expect(commitmentProblems({ status: "ready", approval: "not_needed" }, "blocked", {}).map((p) => p.code)).toEqual(["TEBOS_VALIDATION"]);
    expect(commitmentProblems({ status: "cancelled", approval: "not_needed" }, "ready", {}).map((p) => p.code)).toEqual(["TEBOS_ILLEGAL_TRANSITION"]);
    expect(Object.keys(COMMITMENT_STATUS_LABEL).sort()).toEqual(Object.keys(MACHINES.reeds_commitment.transitions).sort());
  });

  it("recognises the same note pasted twice", () => {
    expect(normaliseForDedupe("Call the  photographer about Saturday")).toBe(normaliseForDedupe(" call the photographer about saturday "));
  });
});
