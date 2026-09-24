// Risk tiers and the approval policy (dossier §17/§23).
//
// Read safely by default; require approval when access, privacy, money,
// external communication or consequence requires it.

export type RiskTier = 0 | 1 | 2 | 3;

export interface OperationProfile {
  /** Only reads public information / performs non-consequential analysis. */
  readOnly: boolean;
  /** Visible to or received by anyone outside the organisation. */
  external: boolean;
  /** Can be fully undone. */
  reversible: boolean;
  /** Moves money, makes legal commitments, changes credentials, deletes irreversibly or touches sensitive data. */
  consequential: boolean;
  /** Needs private access or credentials. */
  usesPrivateAccess?: boolean;
}

export const RISK_TIER_LABEL: Record<RiskTier, string> = {
  0: "Read",
  1: "Internal / reversible",
  2: "External but reversible",
  3: "Consequential",
};

/** Classify an operation. When in doubt the higher tier wins. */
export function classifyRisk(op: OperationProfile): RiskTier {
  if (op.consequential || (op.external && !op.reversible)) return 3;
  if (op.external) return 2;
  if (!op.reversible) return 3;
  if (op.readOnly && !op.usesPrivateAccess) return 0;
  return 1;
}

export interface ApprovalPolicy {
  required: boolean;
  /** A single approval authorises one execution only. */
  singleUse: boolean;
  /** The approver must be a different person from the requester. */
  separateApprover: boolean;
}

export function approvalPolicy(tier: RiskTier): ApprovalPolicy {
  switch (tier) {
    case 0:
    case 1:
      return { required: false, singleUse: false, separateApprover: false };
    case 2:
      return { required: true, singleUse: true, separateApprover: false };
    case 3:
      return { required: true, singleUse: true, separateApprover: true };
  }
}

/** An action's tier is never lower than the capability it relies on. */
export function effectiveRiskTier(actionTier: RiskTier, capabilityTier: RiskTier | null | undefined): RiskTier {
  return Math.max(actionTier, capabilityTier ?? 0) as RiskTier;
}
