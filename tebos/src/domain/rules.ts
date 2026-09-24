// Rule violations and failure classes shared by the domain layer and the
// database. Violation codes are identical to the HINT the database attaches
// to the matching exception, so a database error can be mapped back to a
// structured, user-explainable state (dossier §46) instead of a raw string.

export const RULE_CODES = [
  "TEBOS_ILLEGAL_TRANSITION",
  "TEBOS_SCAN_UNRESOLVED_TARGETS",
  "TEBOS_SCAN_NOT_COMPLETE",
  "TEBOS_SCAN_NOT_PARTIAL",
  "TEBOS_SCAN_HIDES_EVIDENCE",
  "TEBOS_EVIDENCE_IMMUTABLE",
  "TEBOS_FINDING_UNSUPPORTED",
  "TEBOS_FINDING_NOT_ACTIVE",
  "TEBOS_ACTION_UNASSIGNED",
  "TEBOS_APPROVAL_REQUIRED",
  "TEBOS_APPROVAL_TIER",
  "TEBOS_APPROVAL_IMMUTABLE",
  "TEBOS_NOT_APPROVER",
  "TEBOS_SELF_APPROVAL",
  "TEBOS_DEPENDENCY_UNMET",
  "TEBOS_ACTION_UNPROVEN",
  "TEBOS_ACTION_UNVERIFIED",
  "TEBOS_CONNECTION_UNVERIFIED",
  "TEBOS_TENANT_KEY_FROZEN",
  "TEBOS_PERMISSION_DENIED",
  "TEBOS_UNSAFE_URL",
  "TEBOS_VALIDATION",
  "TEBOS_CAPABILITY_TIER",
] as const;
export type RuleCode = (typeof RULE_CODES)[number];

/** Failure classes (dossier §46). Each maps to an actionable next step. */
export type FailureClass =
  | "acquisition"
  | "extraction"
  | "reasoning_limitation"
  | "integration"
  | "permission"
  | "validation"
  | "dependency"
  | "internal";

export const FAILURE_NEXT_STEP: Record<FailureClass, string> = {
  acquisition: "Source could not be reached. Retry later or provide the content another way.",
  extraction: "Source loaded but usable content could not be extracted. Supply a readable copy or accept partial evidence.",
  reasoning_limitation: "Evidence is insufficient for a confident finding. Add the missing information listed.",
  integration: "The provider refused or failed the operation. Check the connection's health and retry.",
  permission: "The operation is understood but not authorised. Request the required access or approval.",
  validation: "Required input is missing or invalid. Correct the input and resubmit.",
  dependency: "This cannot run until the actions it depends on are completed.",
  internal: "TEBOS hit an internal error. The attempt is recorded; retry or escalate to support.",
};

export class RuleViolation extends Error {
  constructor(
    readonly code: RuleCode,
    message: string,
  ) {
    super(message);
    this.name = "RuleViolation";
  }
}

export type Check = { ok: true } | { ok: false; code: RuleCode; reason: string };
export const OK: Check = { ok: true };
export const fail = (code: RuleCode, reason: string): Check => ({ ok: false, code, reason });

/** Map a Postgres error (as surfaced by supabase-js / pg) to a rule violation when it is one. */
export function ruleFromDatabaseError(err: { hint?: string | null; message?: string }): RuleViolation | null {
  const hint = err.hint ?? "";
  return (RULE_CODES as readonly string[]).includes(hint)
    ? new RuleViolation(hint as RuleCode, err.message ?? hint)
    : null;
}
