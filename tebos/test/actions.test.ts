import { describe, expect, it } from "vitest";
import {
  approvalPolicy,
  can,
  checkActionTransition,
  checkApprovalDecision,
  classifyRisk,
  proposeAction,
  type ActionState,
  type ApprovalState,
  type TransitionContext,
} from "../src";

const activeFinding = { id: "f1", businessId: "b1", status: "active" as const };
const emptyCtx: TransitionContext = { approvals: [], runs: [], dependencyStatuses: [], hasVerifiedOutcome: false };
const approval = (over: Partial<ApprovalState> = {}): ApprovalState => ({
  id: "a1",
  status: "approved",
  riskTier: 2,
  requestedBy: "op",
  decidedBy: "approver",
  decidedAt: new Date().toISOString(),
  expiresAt: null,
  ...over,
});
const action = (over: Partial<ActionState> = {}): ActionState => ({
  id: "x",
  status: "ready",
  riskTier: 2,
  approvalRequired: true,
  ownerUserId: "op",
  capabilityKey: "web.update_public_content",
  ...over,
});

describe("risk classification", () => {
  it("maps operations to tiers, higher tier when in doubt", () => {
    expect(classifyRisk({ readOnly: true, external: false, reversible: true, consequential: false })).toBe(0);
    expect(classifyRisk({ readOnly: true, external: false, reversible: true, consequential: false, usesPrivateAccess: true })).toBe(1);
    expect(classifyRisk({ readOnly: false, external: false, reversible: true, consequential: false })).toBe(1);
    expect(classifyRisk({ readOnly: false, external: true, reversible: true, consequential: false })).toBe(2);
    expect(classifyRisk({ readOnly: false, external: true, reversible: false, consequential: false })).toBe(3);
    expect(classifyRisk({ readOnly: false, external: false, reversible: true, consequential: true })).toBe(3);
  });

  it("requires approval from tier 2 and a second person at tier 3", () => {
    expect(approvalPolicy(1).required).toBe(false);
    expect(approvalPolicy(2)).toMatchObject({ required: true, separateApprover: false });
    expect(approvalPolicy(3)).toMatchObject({ required: true, separateApprover: true });
  });
});

describe("action proposals", () => {
  it("come only from active findings", () => {
    const r = proposeAction({ ...activeFinding, status: "draft" }, { title: "t", objective: "o", riskTier: 1 });
    expect(r).toMatchObject({ ok: false, code: "TEBOS_FINDING_NOT_ACTIVE" });
  });

  it("inherit the capability's risk tier and the matching approval requirement", () => {
    const r = proposeAction(activeFinding, {
      title: "Email enquirers",
      objective: "Follow up",
      riskTier: 1,
      capabilityKey: "email.send_transactional",
      capabilityRiskTier: 2,
    });
    expect(r.ok && r.proposal).toMatchObject({ riskTier: 2, approvalRequired: true, status: "proposed", findingId: "f1" });
  });
});

describe("action transitions", () => {
  it("rejects illegal jumps", () => {
    expect(checkActionTransition(action({ status: "proposed" }), "running", emptyCtx)).toMatchObject({
      ok: false,
      code: "TEBOS_ILLEGAL_TRANSITION",
    });
  });

  it("needs an owner or capability to be ready", () => {
    const a = action({ status: "proposed", ownerUserId: null, capabilityKey: null });
    expect(checkActionTransition(a, "ready", emptyCtx)).toMatchObject({ code: "TEBOS_ACTION_UNASSIGNED" });
  });

  it("cannot skip approval", () => {
    expect(checkActionTransition(action(), "queued", emptyCtx)).toMatchObject({ code: "TEBOS_APPROVAL_REQUIRED" });
    expect(checkActionTransition(action({ status: "awaiting_approval" }), "approved", emptyCtx)).toMatchObject({
      code: "TEBOS_APPROVAL_REQUIRED",
    });
    expect(
      checkActionTransition(action({ status: "awaiting_approval" }), "approved", { ...emptyCtx, approvals: [approval()] }),
    ).toEqual({ ok: true });
  });

  it("ignores expired and consumed approvals", () => {
    const ctx = {
      ...emptyCtx,
      approvals: [approval({ expiresAt: new Date(Date.now() - 1000).toISOString() }), approval({ id: "a2", status: "consumed" })],
    };
    expect(checkActionTransition(action({ status: "approved" }), "queued", ctx)).toMatchObject({ code: "TEBOS_APPROVAL_REQUIRED" });
  });

  it("waits for dependencies", () => {
    const a = action({ riskTier: 1, approvalRequired: false });
    expect(checkActionTransition(a, "queued", { ...emptyCtx, dependencyStatuses: ["running"] })).toMatchObject({
      code: "TEBOS_DEPENDENCY_UNMET",
    });
    expect(checkActionTransition(a, "queued", { ...emptyCtx, dependencyStatuses: ["verified"] })).toEqual({ ok: true });
  });

  it("never claims completion or verification without proof", () => {
    const running = action({ status: "running" });
    expect(checkActionTransition(running, "completed", emptyCtx)).toMatchObject({ code: "TEBOS_ACTION_UNPROVEN" });
    expect(checkActionTransition(running, "completed", { ...emptyCtx, runs: [{ status: "succeeded", verified: false }] })).toEqual({
      ok: true,
    });
    const done = action({ status: "completed" });
    expect(checkActionTransition(done, "verified", { ...emptyCtx, runs: [{ status: "succeeded", verified: false }] })).toMatchObject({
      code: "TEBOS_ACTION_UNVERIFIED",
    });
    expect(checkActionTransition(done, "verified", { ...emptyCtx, hasVerifiedOutcome: true })).toEqual({ ok: true });
  });

  it("refuses tier 2+ actions that claim not to need approval", () => {
    expect(checkActionTransition(action({ approvalRequired: false, status: "proposed" }), "ready", emptyCtx)).toMatchObject({
      code: "TEBOS_APPROVAL_REQUIRED",
    });
  });
});

describe("approval decisions", () => {
  const pending = approval({ status: "pending", decidedBy: null, decidedAt: null });

  it("are reserved for approvers and org admins", () => {
    expect(can("operator", "approval.decide")).toBe(false);
    expect(checkApprovalDecision(pending, "approved", { userId: "u", role: "operator" })).toMatchObject({ code: "TEBOS_NOT_APPROVER" });
    expect(checkApprovalDecision(pending, "approved", { userId: "u", role: "approver" })).toEqual({ ok: true });
  });

  it("need a second person for consequential operations", () => {
    const tier3 = { ...pending, riskTier: 3 as const, requestedBy: "admin" };
    expect(checkApprovalDecision(tier3, "approved", { userId: "admin", role: "org_admin" })).toMatchObject({
      code: "TEBOS_SELF_APPROVAL",
    });
    expect(checkApprovalDecision(tier3, "approved", { userId: "other", role: "approver" })).toEqual({ ok: true });
  });

  it("cannot be decided twice", () => {
    expect(checkApprovalDecision(approval(), "rejected", { userId: "u", role: "approver" })).toMatchObject({
      code: "TEBOS_ILLEGAL_TRANSITION",
    });
  });
});
