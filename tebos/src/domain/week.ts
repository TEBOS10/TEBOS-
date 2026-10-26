// The TEPOS week board (founder's master execution brief, 26 Oct 2026): a recurring weekly plan of seven scenes,
// each with ordered actions and what "done" means, opened week by week so the plan can change without rewriting
// what happened. The database enforces the rules (migration tepos_week); this mirror plans the day, picks the next
// action and explains a refusal before it happens.
//
// Time blocks are planning estimates, never claims about the agency's hours: Pelser's appointments come first.
// Nothing is ever marked done except by the founder.

import type { Refusal } from "./catalogue";
import { canTransition, type WeekTaskStatus } from "./states";

export const LENSES = ["income", "impact", "intelligence"] as const;
export type Lens = (typeof LENSES)[number];
export const LENS_LABEL: Record<Lens, string> = { income: "Income", impact: "Impact", intelligence: "Intelligence" };

export const WEEK_TIMEZONE = "Africa/Johannesburg";

export const WEEK_TASK_STATUS_LABEL: Record<WeekTaskStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  done: "Done",
  blocked: "Blocked",
  deferred: "Deferred",
  skipped: "Skipped",
};

export interface PlanDay {
  weekday: number; // ISO: 1 Monday … 7 Sunday
  scene: string;
  focus: string;
  lens: Lens;
  deliverable: string;
  savedTo: string;
}

export interface PlanItem {
  weekday: number;
  position: number;
  title: string;
  lens: Lens;
  action: string;
  definitionOfDone: string;
  estMinutes: number;
}

/** The recurring week (brief §4). Monday's actions are the "Start now" queue for a week opened mid-Monday. */
export const WEEK_PLAN: { days: PlanDay[]; items: PlanItem[] } = {
  days: [
    { weekday: 1, scene: "Build the pipeline", focus: "Agency first: today's appointments, leads and follow-ups; pick one real property case.", lens: "income",
      deliverable: "Every active lead has its next step and date; one PRA case selected; the day-close note", savedTo: "Real Estate Job (pipeline) · Tidy Enterprise (case) · this board" },
    { weekday: 2, scene: "Capture the opportunity", focus: "Prospect, follow up, attend approved appointments and capture the property's facts.", lens: "income",
      deliverable: "Listing or case facts updated, unknowns marked unknown; follow-ups owned and dated", savedTo: "Real Estate Job · Listing studio" },
    { weekday: 3, scene: "Diagnose the economics", focus: "One protected 60–90 minute block on one property case, after agency work.", lens: "impact",
      deliverable: "Updated dossier and problem statement; options ranked with their gates", savedTo: "Tidy Enterprise · the case" },
    { weekday: 4, scene: "Coordinate the specialists", focus: "Advance offers and mandates within your authority; prepare one consented case handover.", lens: "impact",
      deliverable: "Handover sent only if authorised, or ready with its blocker recorded; dependencies owned and dated", savedTo: "Tidy Enterprise · the case's workstreams" },
    { weekday: 5, scene: "Measure and document", focus: "Pipeline numbers, the weekly evidence report, money received versus expected.", lens: "income",
      deliverable: "Weekly report saved; money updated without counting expected commission as cash; next week's priorities", savedTo: "Real Estate Job · Tidy Capital · this board" },
    { weekday: 6, scene: "Build the machine", focus: "One property workflow seen this week, built or improved, tested on a real or anonymised case.", lens: "intelligence",
      deliverable: "One tested workflow improvement, or its blocker with the next action", savedTo: "TEBOS · template catalogue and factory log" },
    { weekday: 7, scene: "Reset and prepare", focus: "Review, choose three outcomes for next week, protect recovery. BAME: 30–45 minutes at most.", lens: "intelligence",
      deliverable: "Three outcomes for next week with done-definitions and dates; low-value work deferred on purpose", savedTo: "This board" },
  ],
  items: [
    // Monday: the Start-now queue
    { weekday: 1, position: 1, lens: "income", estMinutes: 15, title: "Review what's left today",
      action: "Check the remaining agency appointments, training, live leads and follow-ups for today.",
      definitionOfDone: "You know today's real commitments and the time actually left." },
    { weekday: 1, position: 2, lens: "income", estMinutes: 10, title: "Pick the two highest-value next actions",
      action: "Choose the two actions that fit the time left and move a lead or a mandate forward.",
      definitionOfDone: "Two actions written here, each with when you'll do it." },
    { weekday: 1, position: 3, lens: "income", estMinutes: 90, title: "Advance the live leads",
      action: "Under the agency's supervision, contact suitable prospects, qualify needs and book viewings or listing appointments.",
      definitionOfDone: "Each lead you worked has its next step and date in the pipeline." },
    { weekday: 1, position: 4, lens: "impact", estMinutes: 20, title: "Select one PRA property case",
      action: "Pick one real case: the owner's problem, the outcome they want, the missing evidence and the next action. If none is ready, write how you'll get one.",
      definitionOfDone: "One case selected with its next step, or a written plan to find one." },
    { weekday: 1, position: 5, lens: "income", estMinutes: 15, title: "Update the pipeline and close the day",
      action: "Bring the pipeline up to date and write today's close: what happened, blockers, learning, what carries over.",
      definitionOfDone: "Pipeline current; the day-close note saved." },
    // Tuesday
    { weekday: 2, position: 1, lens: "income", estMinutes: 60, title: "Prospect and follow up",
      action: "Follow up suitable leads and prospect for new ones within the agency's process.",
      definitionOfDone: "Every follow-up has an owner and a date." },
    { weekday: 2, position: 2, lens: "income", estMinutes: 90, title: "Attend appointments and capture the facts",
      action: "At approved viewings or listing appointments, record asking price, comparable evidence, key features, constraints and document gaps.",
      definitionOfDone: "The listing or case is updated; unknowns are marked unknown, not guessed." },
    { weekday: 2, position: 3, lens: "impact", estMinutes: 20, title: "Line up the photographer, if authorised",
      action: "Where the agency approves, agree the shoot and the deliverables in writing.",
      definitionOfDone: "Shoot date and deliverables agreed, or recorded as not yet authorised." },
    // Wednesday
    { weekday: 3, position: 1, lens: "income", estMinutes: 30, title: "Agency work and training first",
      action: "Complete the day's agency obligations before the case block.",
      definitionOfDone: "Today's agency commitments done or rescheduled." },
    { weekday: 3, position: 2, lens: "impact", estMinutes: 90, title: "Diagnose one property case",
      action: "Organise objectives, property details, income, costs, occupancy, liabilities and documents; mark each fact verified, stated, estimated or missing.",
      definitionOfDone: "The case dossier and its problem statement are updated." },
    { weekday: 3, position: 3, lens: "impact", estMinutes: 30, title: "Compare the routes and their gates",
      action: "Compare the possible routes (letting, use, sale, specialist referral, more evidence) with their risks and decision gates.",
      definitionOfDone: "Options ranked, each with its dependencies and what must be verified." },
    // Thursday
    { weekday: 4, position: 1, lens: "income", estMinutes: 90, title: "Advance leads, offers and mandates",
      action: "Move viewings, offers, mandates and client communications forward within your legal authority and supervision.",
      definitionOfDone: "Each one moved or its blocker recorded." },
    { weekday: 4, position: 2, lens: "impact", estMinutes: 45, title: "Prepare one consented case handover",
      action: "For a suitable case, prepare a short handover for Wealth Assist or the right professional, with the owner's consent.",
      definitionOfDone: "Sent only if appropriate and authorised; otherwise ready, with its blocker recorded." },
    { weekday: 4, position: 3, lens: "impact", estMinutes: 15, title: "Name the one blocker",
      action: "Identify the document, approval, review or decision holding the case up; give it an owner and a date.",
      definitionOfDone: "The blocker has an owner, a deadline and a next action." },
    // Friday
    { weekday: 5, position: 1, lens: "income", estMinutes: 30, title: "Update the agency pipeline",
      action: "Leads, appointments, viewings, offers, mandates and unresolved issues.",
      definitionOfDone: "The pipeline reflects the week." },
    { weekday: 5, position: 2, lens: "intelligence", estMinutes: 30, title: "Write the weekly evidence report",
      action: "Outcomes, stalled work and why, risks and lessons.",
      definitionOfDone: "The report is saved and linked here." },
    { weekday: 5, position: 3, lens: "income", estMinutes: 20, title: "Money: received, spent, expected",
      action: "Record cash actually received and spent; keep expected commission separate from money in hand.",
      definitionOfDone: "Tidy Capital updated; no expected commission counted as cash." },
    { weekday: 5, position: 4, lens: "intelligence", estMinutes: 15, title: "Set next week's commitments",
      action: "Choose next week's top priorities from this week's evidence.",
      definitionOfDone: "Next week's priorities written." },
    // Saturday
    { weekday: 6, position: 1, lens: "intelligence", estMinutes: 20, title: "Choose one property workflow",
      action: "Pick one recurring property problem seen this week: arrears follow-up, vacancy pipeline, listing preparation, missing documents, maintenance, owner reporting or handover.",
      definitionOfDone: "One workflow chosen, with the evidence it came from." },
    { weekday: 6, position: 2, lens: "intelligence", estMinutes: 180, title: "Build the smallest useful version",
      action: "Input, decision steps, ownership, approval points, status and report; test it on a real or anonymised case.",
      definitionOfDone: "Implemented and tested, or a specific blocker with its next action." },
    { weekday: 6, position: 3, lens: "intelligence", estMinutes: 20, title: "Document it",
      action: "Who it's for, the problem, edge cases, delivery effort, limits, and the evidence needed before selling it.",
      definitionOfDone: "Recorded in the template catalogue or factory log." },
    // Sunday
    { weekday: 7, position: 1, lens: "intelligence", estMinutes: 30, title: "Review the week",
      action: "What advanced income, property impact and reusable intelligence; what distracted; what stayed unfinished.",
      definitionOfDone: "Review written in the day-close." },
    { weekday: 7, position: 2, lens: "intelligence", estMinutes: 20, title: "Choose three outcomes for next week",
      action: "One income outcome, one property-case outcome, one systems or evidence outcome.",
      definitionOfDone: "Each has a definition of done, a priority and a date." },
    { weekday: 7, position: 3, lens: "income", estMinutes: 45, title: "BAME weekly review (45 minutes at most)",
      action: "Review the BAME diagnostic and its 14-day validation plan only; nothing beyond it unless already authorised.",
      definitionOfDone: "Review noted; the decision date unchanged or deliberately moved." },
  ],
};

export interface WeekTask {
  id: string;
  localDate: string;
  position: number;
  title: string;
  lens: Lens;
  status: WeekTaskStatus;
  estMinutes: number | null;
  deferUntil: string | null;
}

/** Today's date in South Africa, as YYYY-MM-DD. */
export function saToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: WEEK_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

const asDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const toIso = (d: Date) => d.toISOString().slice(0, 10);

/** ISO weekday of a YYYY-MM-DD date: 1 Monday … 7 Sunday. */
export function isoWeekday(iso: string): number {
  const d = asDate(iso).getUTCDay();
  return d === 0 ? 7 : d;
}

/** The Monday that starts the week holding this date. */
export function weekStartOf(iso: string): string {
  const d = asDate(iso);
  d.setUTCDate(d.getUTCDate() - (isoWeekday(iso) - 1));
  return toIso(d);
}

export function addDays(iso: string, n: number): string {
  const d = asDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toIso(d);
}

const OPEN: WeekTaskStatus[] = ["not_started", "in_progress", "blocked", "deferred"];

/**
 * What to do today, in order: today's open tasks, then earlier days' tasks still open (never silently done), then
 * deferrals that have come due. Finished and skipped work, and deferrals still in the future, are left out.
 */
export function todaysQueue<T extends WeekTask>(tasks: T[], today: string): T[] {
  const due = (t: T) => t.status !== "deferred" || (t.deferUntil ?? t.localDate) <= today;
  const open = tasks.filter((t) => OPEN.includes(t.status) && t.localDate <= today && due(t));
  const rank = (t: T) => (t.localDate === today ? 0 : 1);
  return open.sort((a, b) => rank(a) - rank(b) || a.localDate.localeCompare(b.localDate) || a.position - b.position);
}

/** The one next action: the first queued task that isn't blocked. */
export function nextBestAction<T extends WeekTask>(tasks: T[], today: string): T | undefined {
  return todaysQueue(tasks, today).find((t) => t.status !== "blocked");
}

export interface LensProgress { done: number; total: number; open: number }

/** Each lens's tasks this week: done, open, and the total that weren't skipped. */
export function lensProgress(tasks: WeekTask[]): Record<Lens, LensProgress> {
  const out = Object.fromEntries(LENSES.map((l) => [l, { done: 0, total: 0, open: 0 }])) as Record<Lens, LensProgress>;
  for (const t of tasks) {
    if (t.status === "skipped") continue;
    out[t.lens].total++;
    if (t.status === "done") out[t.lens].done++;
    else out[t.lens].open++;
  }
  return out;
}

/** Why a task can't move to `to`, as the database would refuse it. */
export function statusProblems(
  from: WeekTaskStatus,
  to: WeekTaskStatus,
  input: { reason?: string | null; deferUntil?: string | null; byPerson: boolean },
  today: string,
): Refusal[] {
  if (!canTransition("week_task", from, to)) {
    return [{ code: "TEBOS_ILLEGAL_TRANSITION", message: `${WEEK_TASK_STATUS_LABEL[from]} can't become ${WEEK_TASK_STATUS_LABEL[to]}` }];
  }
  const out: Refusal[] = [];
  if ((to === "blocked" || to === "deferred" || to === "skipped") && !(input.reason ?? "").trim()) {
    out.push({ code: "TEBOS_VALIDATION", message: `Say why it is ${WEEK_TASK_STATUS_LABEL[to].toLowerCase()}` });
  }
  if (to === "deferred" && (!input.deferUntil || input.deferUntil < today)) {
    out.push({ code: "TEBOS_VALIDATION", message: "A deferral needs a new date, today or later" });
  }
  if (to === "blocked" && input.deferUntil && input.deferUntil < today) {
    out.push({ code: "TEBOS_VALIDATION", message: "A new date is today or later" });
  }
  if (to === "done" && !input.byPerson) {
    out.push({ code: "TEBOS_PERMISSION_DENIED", message: "Only you mark a task done; the system never does" });
  }
  return out;
}
