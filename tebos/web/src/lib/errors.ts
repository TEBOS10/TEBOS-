// Turns database refusals into explanations a person can act on (dossier §46).
// The database attaches a TEBOS_* hint to every rule it enforces; each one maps
// to a sentence that says what happened and what to do next.
import { ruleFromDatabaseError, type RuleCode } from "@core/rules";

const MESSAGES: Record<RuleCode, string> = {
  TEBOS_ILLEGAL_TRANSITION: "That step isn't possible from the current state.",
  TEBOS_SCAN_UNRESOLVED_TARGETS: "The scan still has pages that haven't been attempted.",
  TEBOS_SCAN_NOT_COMPLETE: "The scan can't be marked complete while some pages weren't read.",
  TEBOS_SCAN_NOT_PARTIAL: "The scan's pages don't match a partial result.",
  TEBOS_SCAN_HIDES_EVIDENCE: "The scan holds evidence, so it must be reported as partial, not failed.",
  TEBOS_EVIDENCE_IMMUTABLE: "Recorded evidence can't be changed. Record new evidence instead.",
  TEBOS_FINDING_UNSUPPORTED: "A finding needs at least one piece of evidence that was actually obtained.",
  TEBOS_FINDING_NOT_ACTIVE: "Actions can only be proposed from an active finding.",
  TEBOS_ACTION_UNASSIGNED: "Give the action an owner or a capability before marking it ready.",
  TEBOS_APPROVAL_REQUIRED: "This action needs a valid approval first.",
  TEBOS_APPROVAL_TIER: "The approval must cover the action's risk tier.",
  TEBOS_APPROVAL_IMMUTABLE: "A recorded approval can't be rewritten.",
  TEBOS_NOT_APPROVER: "Only approvers and organisation admins can decide approvals.",
  TEBOS_SELF_APPROVAL: "Consequential actions need a second person to approve them.",
  TEBOS_DEPENDENCY_UNMET: "Actions this one depends on aren't complete yet.",
  TEBOS_ACTION_UNPROVEN: "An action is complete only once a run has succeeded.",
  TEBOS_ACTION_UNVERIFIED: "Verification needs a verified run or a verified outcome.",
  TEBOS_CONNECTION_UNVERIFIED: "A connection shows as connected only after a fresh, successful check.",
  TEBOS_TENANT_KEY_FROZEN: "Records can't move between organisations or businesses.",
  TEBOS_PERMISSION_DENIED: "Your role doesn't allow this.",
  TEBOS_UNSAFE_URL: "That address isn't a public website TEBOS can read.",
  TEBOS_VALIDATION: "Some required information is missing.",
  TEBOS_CAPABILITY_TIER: "The risk tier can't be lower than the capability it uses.",
};

export interface Explained {
  message: string;
  code: RuleCode | null;
  detail: string | null;
}

interface PgLikeError {
  message?: string;
  hint?: string | null;
  code?: string | null;
  details?: string | null;
}

export function explainError(err: unknown): Explained {
  const e = (err ?? {}) as PgLikeError;
  const rule = ruleFromDatabaseError({ hint: e.hint ?? null, message: e.message });
  if (rule) return { message: MESSAGES[rule.code], code: rule.code, detail: e.message ?? null };
  if (e.code === "42501") return { message: MESSAGES.TEBOS_PERMISSION_DENIED, code: "TEBOS_PERMISSION_DENIED", detail: e.message ?? null };
  if (e.code === "23505") return { message: "That already exists.", code: null, detail: e.message ?? null };
  return { message: e.message || "Something went wrong. Nothing was changed.", code: null, detail: null };
}
