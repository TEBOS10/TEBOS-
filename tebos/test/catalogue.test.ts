import { describe, expect, it } from "vitest";
import {
  BLUEPRINTS,
  CATALOGUE_STATUS_LABEL,
  MACHINES,
  countProblems,
  draftFromBlueprint,
  factoryRunProblems,
  gateProblems,
  tierCounts,
  type TemplateRecord,
} from "../src";

const ready = (over: Partial<TemplateRecord> = {}): TemplateRecord => ({
  ...draftFromBlueprint("education-centre")!,
  problemStatement: "Enrolments and parent updates live on the owner's phone",
  targetCustomer: "Tutoring centres with 1-10 tutors",
  buyer: "The owner",
  successMetric: "Enquiries answered within a day",
  ...over,
});

describe("template catalogue", () => {
  it("every blueprint's editions fit their plan's ceilings, each tier holding at least the smaller one", () => {
    for (const b of BLUEPRINTS) {
      const c = tierCounts(b.key)!;
      expect(countProblems(c), b.key).toEqual([]);
      expect(c.starter.workflows).toBeGreaterThan(0);
    }
  });

  it("a draft from a blueprint is speculative and leaves customer, buyer and problem to real conversations", () => {
    const d = draftFromBlueprint("gym-fitness")!;
    expect(d.status).toBe("draft");
    expect(d.validationState).toBe("speculative");
    expect(d.problemStatement ?? null).toBeNull();
    expect(d.buyer ?? null).toBeNull();
    expect(draftFromBlueprint("no-such-industry")).toBeUndefined();
  });

  it("refuses counts over a ceiling or a larger tier holding less", () => {
    const c = tierCounts("education-centre")!;
    expect(countProblems({ ...c, starter: { workflows: 5, parts: 4 } }).map((p) => p.code)).toContain("TEBOS_OUT_OF_PLAN");
    expect(countProblems({ ...c, growth: { workflows: 1, parts: 6 } }).map((p) => p.code)).toContain("TEBOS_VALIDATION");
  });

  it("QA needs the problem, customer, buyer and measure", () => {
    expect(gateProblems(draftFromBlueprint("education-centre")!, "ready_for_qa", false).map((p) => p.code)).toEqual(["TEBOS_VALIDATION"]);
    expect(gateProblems(ready(), "ready_for_qa", false)).toEqual([]);
  });

  it("only a platform admin approves, and approval needs the tests, setup, limits and rollback", () => {
    const qa = ready({ status: "ready_for_qa" });
    expect(gateProblems(qa, "approved_internal", false).map((p) => p.code)).toEqual(["TEBOS_PERMISSION_DENIED", "TEBOS_EVIDENCE_REQUIRED"]);
    const documented = { ...qa, testReport: "12 tests pass", setupSteps: "1. …", knownLimitations: "No payments", rollbackPlan: "Retire the edition" };
    expect(gateProblems(documented, "approved_internal", true)).toEqual([]);
  });

  it("a template goes on sale only evidence-backed", () => {
    const approved = ready({ status: "approved_internal" });
    expect(gateProblems(approved, "available_for_sale", true).map((p) => p.code)).toEqual(["TEBOS_EVIDENCE_REQUIRED"]);
    expect(gateProblems({ ...approved, validationState: "evidence_backed", evidence: "3 owners described the problem" }, "available_for_sale", true)).toEqual([]);
  });

  it("follows the state machine and names a blocker", () => {
    expect(gateProblems(ready(), "available_for_sale", true).map((p) => p.code)).toEqual(["TEBOS_ILLEGAL_TRANSITION"]);
    expect(gateProblems(ready(), "blocked", false).map((p) => p.code)).toEqual(["TEBOS_VALIDATION"]);
    expect(gateProblems(ready({ blocker: "No test client yet" }), "blocked", false)).toEqual([]);
    expect(Object.keys(CATALOGUE_STATUS_LABEL).sort()).toEqual(Object.keys(MACHINES.catalogue_template.transitions).sort());
  });

  it("a factory run is completed only with evidence and a template past draft", () => {
    expect(factoryRunProblems("completed", {}, "ready_for_qa").map((p) => p.code)).toEqual(["TEBOS_EVIDENCE_REQUIRED"]);
    expect(factoryRunProblems("completed", { evidence: "tests pass" }, "draft").map((p) => p.code)).toEqual(["TEBOS_EVIDENCE_REQUIRED"]);
    expect(factoryRunProblems("completed", { evidence: "tests pass" }, "ready_for_qa")).toEqual([]);
    expect(factoryRunProblems("blocked", {}, "draft").map((p) => p.code)).toEqual(["TEBOS_VALIDATION"]);
    expect(factoryRunProblems("deferred", {}, "draft")).toEqual([]);
  });
});
