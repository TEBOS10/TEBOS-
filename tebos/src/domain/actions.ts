// The action engine (dossier §16/§17):
//   Finding -> action proposal -> risk classification -> required capability
//   -> approval check -> execution -> verification -> outcome.
//
// These checks mirror tebos_private.guard_action / guard_approval so callers
// get a structured reason before they hit the database, which remains the
// final authority.

import { approvalPolicy, effectiveRiskTier, type RiskTier } from "./risk";
import { can, type OrgRole } from "./permissions";
import { fail, OK, type Check } from "./rules";
import { canTransition, type ActionStatus, type ApprovalStatus, type ActionRunStatus } from "./states";
import type { FindingNode } from "./traceability";

export type ExecutionMethod = "manual" | "internal" | "api" | "mcp" | "automation" | "browser" | "specialist";

export interface ActionProposalInput {
  title: string;
  objective: string;
  expectedOutcome?: string;
  capabilityKey?: string | null;
  capabilityRiskTier?: RiskTier | null;
  riskTier: RiskTier;
  executionMethod?: ExecutionMethod;
  ownerUserId?: string | null;
  priority?: 1 | 2 | 3 | 4 | 5;
  evidenceRequirement?: string;
}

export interface ActionProposal {
  findingId: string;
  businessId: string;
  title: string;
  objective: string;
  expectedOutcome: string | null;
  capabilityKey: string | null;
  riskTier: RiskTier;
  approvalRequired: boolean;
  executionMethod: ExecutionMethod;
  ownerUserId: string | null;
  priority: number;
  evidenceRequirement: string | null;
  status: "proposed";
}

/** Findings become actions only when they are active (and therefore evidence-backed). */
export function proposeAction(
  finding: Pick<FindingNode, "id" | "businessId" | "status">,
  input: ActionProposalInput,
): { ok: true; proposal: ActionProposal } | Extract<Check, { ok: false }> {
  if (finding.status !== "active") {
    return fail("TEBOS_FINDING_NOT_ACTIVE", `Finding is ${finding.status}; only active findings produce actions`) as Extract<
      Check,
      { ok: false }
    >;
  }
  const riskTier = effectiveRiskTier(input.riskTier, input.capabilityRiskTier);
  return {
    ok: true,
    proposal: {
      findingId: finding.id,
      businessId: finding.businessId,
      title: input.title,
      objective: input.objective,
      expectedOutcome: input.expectedOutcome ?? null,
      capabilityKey: input.capabilityKey ?? null,
      riskTier,
      approvalRequired: approvalPolicy(riskTier).required,
      executionMethod: input.executionMethod ?? "manual",
      ownerUserId: input.ownerUserId ?? null,
      priority: input.priority ?? 3,
      evidenceRequirement: input.evidenceRequirement ?? null,
      status: "proposed",
    },
  };
}

export interface ActionState {
  id: string;
  status: ActionStatus;
  riskTier: RiskTier;
  approvalRequired: boolean;
  ownerUserId: string | null;
  capabilityKey: string | null;
  blockedReason?: string | null;
}

export interface ApprovalState {
  id: string;
  status: ApprovalStatus;
  riskTier: RiskTier;
  requestedBy: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  expiresAt: string | null;
}

export interface RunState {
  status: ActionRunStatus;
  verified: boolean;
}

export interface TransitionContext {
  approvals: readonly ApprovalState[];
  runs: readonly RunState[];
  /** Status of every action this one depends on. */
  dependencyStatuses: readonly ActionStatus[];
  hasVerifiedOutcome: boolean;
  now?: Date;
}

export function validApproval(approvals: readonly ApprovalState[], now = new Date()): ApprovalState | null {
  return (
    approvals
      .filter((a) => a.status === "approved" && (a.expiresAt == null || new Date(a.expiresAt) > now))
      .sort((a, b) => (b.decidedAt ?? "").localeCompare(a.decidedAt ?? ""))[0] ?? null
  );
}

export function checkActionTransition(action: ActionState, to: ActionStatus, ctx: TransitionContext): Check {
  if (!canTransition("action", action.status, to)) {
    return fail("TEBOS_ILLEGAL_TRANSITION", `An action cannot move from ${action.status} to ${to}`);
  }
  if (action.riskTier >= 2 && !action.approvalRequired) {
    return fail("TEBOS_APPROVAL_REQUIRED", `Tier ${action.riskTier} actions always require approval`);
  }
  if (to === "ready" && !action.ownerUserId && !action.capabilityKey) {
    return fail("TEBOS_ACTION_UNASSIGNED", "Assign an owner or a capability before the action is ready");
  }
  if (to === "blocked" && !action.blockedReason) {
    return fail("TEBOS_VALIDATION", "A blocked action must say what it is blocked on");
  }
  if (to === "queued" && action.status === "ready" && action.approvalRequired) {
    return fail("TEBOS_APPROVAL_REQUIRED", "This action requires approval before it can be queued");
  }
  if (to === "approved" || ((to === "queued" || to === "running") && action.approvalRequired)) {
    if (!validApproval(ctx.approvals, ctx.now)) {
      return fail("TEBOS_APPROVAL_REQUIRED", "No valid (approved, unexpired, unused) approval exists");
    }
  }
  if (to === "queued" || to === "running") {
    const unmet = ctx.dependencyStatuses.filter((s) => s !== "completed" && s !== "verified").length;
    if (unmet > 0) return fail("TEBOS_DEPENDENCY_UNMET", `${unmet} dependenc${unmet === 1 ? "y is" : "ies are"} not complete`);
  }
  if (to === "completed" && !ctx.runs.some((r) => r.status === "succeeded")) {
    return fail("TEBOS_ACTION_UNPROVEN", "An action is completed only when a run has succeeded");
  }
  if (to === "verified" && !ctx.runs.some((r) => r.verified) && !ctx.hasVerifiedOutcome) {
    return fail("TEBOS_ACTION_UNVERIFIED", "Verification needs a verified run or a verified outcome");
  }
  return OK;
}

export function checkApprovalDecision(
  approval: ApprovalState,
  decision: "approved" | "rejected",
  decider: { userId: string; role: OrgRole | null },
): Check {
  if (!canTransition("approval", approval.status, decision)) {
    return fail("TEBOS_ILLEGAL_TRANSITION", `Approval is already ${approval.status}`);
  }
  if (!can(decider.role, "approval.decide")) {
    return fail("TEBOS_NOT_APPROVER", "Only approvers and organisation admins can decide approvals");
  }
  if (approvalPolicy(approval.riskTier).separateApprover && approval.requestedBy === decider.userId) {
    return fail("TEBOS_SELF_APPROVAL", "Consequential operations need a second person to approve");
  }
  return OK;
}
