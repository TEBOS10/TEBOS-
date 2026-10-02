// What TEBOS delivers after a client is onboarded, and by when. The plan is
// the runbook: each step says what "done" means. The server creates a
// client's steps when they're onboarded (dates count from that moment); the
// maintainer completes each one with a note of what was done, and the client
// sees their own plan. Overdue steps count against TEBOS on its own board.

import type { PlanKey } from "./plans";

export interface DeliveryStep {
  key: string;
  title: string;
  /** What "done" means, for the maintainer and the client. */
  done: string;
  /** Days after onboarding. */
  dueDays: number;
}

// A client's draft operating system is on their board within a day of
// onboarding (from the blueprint for their kind of business), and confirmed
// with the owner by day 3: an operating system in 1 to 3 days, not weeks.
const SMALL: DeliveryStep[] = [
  { key: "kickoff", title: "Kick-off call", dueDays: 1,
    done: "Met the owner; chose the operating-system blueprint for their kind of business, agreed the one or two flows that matter most, and who the contact is." },
  { key: "board", title: "Draft operating system on the board", dueDays: 1,
    done: "The blueprint is laid onto the client's board as proposed pieces, flows and steps, and fitted to what the kick-off revealed." },
  { key: "diagnostic", title: "Diagnostic interview", dueDays: 2,
    done: "Held the interview (call or written) and recorded the owner's answers as statements on TEBOS." },
  { key: "objectives", title: "Operating system confirmed, objectives set", dueDays: 3,
    done: "Walked the owner through the board: every proposed piece is confirmed, changed or removed, the founder-only steps are marked, and two or three objectives are active with a target, a date and an owner." },
  { key: "review", title: "First monthly review", dueDays: 30,
    done: "Walked the owner through the board, the findings and the first readings, and agreed the next change to make." },
];

const COMPANY: DeliveryStep[] = [
  { key: "kickoff", title: "Kick-off with leadership", dueDays: 1,
    done: "Met the leadership team; agreed the departments in scope, a contact per department, the blueprint for each, and the interview schedule." },
  { key: "draft", title: "Draft operating system on the board", dueDays: 3,
    done: "Each department's blueprint is laid onto the company board as proposals, ready to be confirmed or corrected in the interviews." },
  { key: "interviews", title: "Leadership and department interviews", dueDays: 10,
    done: "Interviewed every department head against the draft; their answers are recorded as statements on TEBOS and the draft is corrected." },
  { key: "systems", title: "Systems connected or listed", dueDays: 14,
    done: "Every tool and provider is on the board; the ones that can report numbers are connected read-only, or the reason they aren't is noted." },
  { key: "board", title: "Company board confirmed", dueDays: 21,
    done: "Every department's flows are confirmed on the board with owners and founder-dependent steps marked; objectives are drafted for leadership." },
  { key: "proposal", title: "Architecture proposal delivered", dueDays: 30,
    done: "Leadership has the written proposal: the changes, their order, the objectives they serve and the fixed monthly fee." },
];

export const DELIVERY_PLANS: Record<PlanKey, DeliveryStep[]> = {
  starter: SMALL,
  growth: SMALL,
  company: COMPANY,
  equity: SMALL,
};

export type DeliveryStatus = "open" | "done" | "skipped";

export interface DeliveryTaskState {
  status: DeliveryStatus;
  dueAt: string;
}

/** Whether an open step is past its due date. */
export const isOverdue = (t: DeliveryTaskState, now: Date = new Date()) => t.status === "open" && new Date(t.dueAt).getTime() < now.getTime();

/** A step is closed with a note of what was done, or why it was skipped. */
export function checkCompletion(status: DeliveryStatus, note: string | null | undefined): { ok: true } | { ok: false; reason: string } {
  if (status === "open") return { ok: false, reason: "Choose done or skipped" };
  if (!note || note.trim().length < 3) return { ok: false, reason: status === "done" ? "Say what was done" : "Say why it was skipped" };
  return { ok: true };
}
