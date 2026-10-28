// The daily sales desk (migration sales_prospects): who to call today, and what an outcome needs. The database
// enforces the same rules; this mirrors them so the interface and the tests say the same thing.
import type { SalesProspectStatus } from "./states";

export const PROSPECT_STATUS_LABEL: Record<SalesProspectStatus, string> = {
  new: "Not called yet",
  no_answer: "No answer",
  interested: "Interested",
  meeting_booked: "Meeting booked",
  not_interested: "Not interested",
  became_enquiry: "Became an enquiry",
  do_not_contact: "Do not contact",
};

/** Statuses that are still on the call list (when due). */
export const ACTIVE_PROSPECT: readonly SalesProspectStatus[] = ["new", "no_answer", "interested", "meeting_booked"];

/** The default number of calls a day. */
export const CALLS_PER_DAY = 10;

/** These outcomes need a note of what was said. */
export function needsOutcome(status: SalesProspectStatus): boolean {
  return status === "interested" || status === "meeting_booked" || status === "not_interested";
}

/** When to call again after this outcome, from today (South African date, yyyy-mm-dd); null means not again. */
export function nextCallAfter(status: SalesProspectStatus, today: string): string | null {
  const days: Partial<Record<SalesProspectStatus, number>> = { no_answer: 2, interested: 3, meeting_booked: 7 };
  const d = days[status];
  if (d === undefined) return null;
  const t = new Date(`${today}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + d);
  return t.toISOString().slice(0, 10);
}

/** Today's order, as the database's sales_calls_today(): meetings, then interest, then no answer, then new. */
export function callOrder(status: SalesProspectStatus): number {
  return { meeting_booked: 0, interested: 1, no_answer: 2, new: 3 }[status as "new"] ?? 9;
}
