// REEDS executive intake (founder's executive-team build specification, 26 Oct 2026): what came in, what it asks
// for, and what only the founder can decide, each linked to its source. The database enforces the rules (migration
// reeds_intake); this mirror shapes the founder's daily brief and explains a refusal before it happens.
//
// Nothing here pretends a source is connected. A source is "connected" only once a real sync has succeeded.

import type { Refusal } from "./catalogue";
import { canTransition, type ReedsCommitmentStatus } from "./states";

export const SOURCE_TYPES = ["manual", "email", "whatsapp_export", "calendar", "document"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];
export const SOURCE_LABEL: Record<SourceType, string> = {
  manual: "Typed or pasted",
  email: "Email",
  whatsapp_export: "WhatsApp (exported or shared)",
  calendar: "Calendar",
  document: "Document",
};

export const TRIAGE = ["untriaged", "information", "commitment", "meeting", "decision", "opportunity", "property_case", "client_delivery", "restricted"] as const;
export type Triage = (typeof TRIAGE)[number];
export const WORKSPACES = ["personal", "agency", "pra", "tebos", "client", "finance", "technology"] as const;
export type Workspace = (typeof WORKSPACES)[number];
export const OWNERS = ["founder", "reeds", "intake", "analyst", "revenue", "pra", "delivery", "other"] as const;
export type Owner = (typeof OWNERS)[number];
export const OWNER_LABEL: Record<Owner, string> = {
  founder: "You",
  reeds: "REEDS (chief of staff)",
  intake: "Intake and records",
  analyst: "Intelligence analyst",
  revenue: "Revenue operations",
  pra: "PRA case analyst",
  delivery: "TEBOS delivery",
  other: "Someone else",
};
/** How a date is known: verified, reported by a person, inferred, unknown, or explicitly none. */
export const DUE_BASIS = ["verified", "reported", "inferred", "unknown", "none"] as const;
export type DueBasis = (typeof DUE_BASIS)[number];
export const INTEGRATION_STATES = ["not_connected", "connected", "failing"] as const;
export type IntegrationState = (typeof INTEGRATION_STATES)[number];

export const COMMITMENT_STATUS_LABEL: Record<ReedsCommitmentStatus, string> = {
  captured: "Captured",
  ready: "Ready",
  in_progress: "In progress",
  blocked: "Blocked",
  awaiting_approval: "Awaiting approval",
  review: "In review",
  done: "Done",
  cancelled: "Cancelled",
};

/** The same normalisation the database uses to recognise a note pasted twice. */
export function normaliseForDedupe(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

export interface Commitment {
  id: string;
  title: string;
  owner: Owner;
  dueOn: string | null;
  dueBasis: DueBasis;
  priority: "high" | "normal" | "low";
  status: ReedsCommitmentStatus;
  approval: "not_needed" | "required" | "approved" | "rejected";
  nextAction: string | null;
}

const OPEN: ReedsCommitmentStatus[] = ["captured", "ready", "in_progress", "blocked", "awaiting_approval", "review"];
const PRIORITY_RANK = { high: 0, normal: 1, low: 2 } as const;

export interface DailyBrief<C extends Commitment> {
  /** At most three: overdue first, then due today, then high priority; never more than three. */
  priorities: C[];
  overdue: C[];
  dueToday: C[];
  awaitingApproval: C[];
  blocked: C[];
  /** Open work with no date: shown so it can't hide, never given an invented date. */
  undated: C[];
}

/** The founder's brief for today from the open commitments: what matters, what is late, what waits on them. */
export function dailyBrief<C extends Commitment>(commitments: C[], today: string): DailyBrief<C> {
  const open = commitments.filter((c) => OPEN.includes(c.status));
  const overdue = open.filter((c) => c.dueOn !== null && c.dueOn < today && c.status !== "blocked");
  const dueToday = open.filter((c) => c.dueOn === today && c.status !== "blocked");
  const rank = (c: C) => (c.dueOn !== null && c.dueOn < today ? 0 : c.dueOn === today ? 1 : 2) * 10 + PRIORITY_RANK[c.priority];
  const priorities = open
    .filter((c) => c.owner === "founder" && c.status !== "blocked" && c.status !== "awaiting_approval")
    .filter((c) => rank(c) < 20 || c.priority === "high")
    .sort((a, b) => rank(a) - rank(b) || (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999"))
    .slice(0, 3);
  return {
    priorities,
    overdue,
    dueToday,
    awaitingApproval: open.filter((c) => c.status === "awaiting_approval" || c.approval === "required"),
    blocked: open.filter((c) => c.status === "blocked"),
    undated: open.filter((c) => c.dueOn === null),
  };
}

/** Why a commitment can't move to `to`, as the database would refuse it. */
export function commitmentProblems(
  c: Pick<Commitment, "status" | "approval">,
  to: ReedsCommitmentStatus,
  input: { evidence?: string | null; blockedReason?: string | null },
): Refusal[] {
  if (!canTransition("reeds_commitment", c.status, to)) {
    return [{ code: "TEBOS_ILLEGAL_TRANSITION", message: `${COMMITMENT_STATUS_LABEL[c.status]} can't become ${COMMITMENT_STATUS_LABEL[to]}` }];
  }
  const out: Refusal[] = [];
  if (to === "done") {
    if (!(input.evidence ?? "").trim()) out.push({ code: "TEBOS_EVIDENCE_REQUIRED", message: "Done needs its evidence: what was sent, saved, booked or tested" });
    if (c.approval === "required") out.push({ code: "TEBOS_APPROVAL_REQUIRED", message: "This needs your approval before it can be done" });
  }
  if (to === "blocked" && !(input.blockedReason ?? "").trim()) {
    out.push({ code: "TEBOS_VALIDATION", message: "Say what is blocking it, and who can unblock it" });
  }
  return out;
}
