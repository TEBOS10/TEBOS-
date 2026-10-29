// The property journey (Property Revenue Architect Platform, Release 1; docs/pra-platform/release-1.md).
// A landlord's property keeps a register of problems. Each problem moves through the journey (Discover → Assess →
// Strategise → Execute → Optimise) as its records do: evidence, actions, proof and a written result. Mirrors migration
// property_journey so the interface can explain a refusal before sending anything; the database is the final authority.
//
// Integrity rules:
//   * Nothing is scored. A stage, a milestone or a next action comes from a record, and says which one.
//   * A milestone is reached only when its record exists, and is dated from that record.
//   * Every next action says what triggered it, what it rests on, what is still uncertain, and what happens next.
//     Rules only: it never proposes redevelopment, rezoning, refinancing or selling because routine work is late.
//   * A held-up problem is investigated before another action is added.

import { looksPersonal } from "./agent";
import type { EvidenceStatus, WorkstreamStatus } from "./property";
import { OK, fail, type Check } from "./rules";

// ---------------------------------------------------------------------------
// The problem register
// ---------------------------------------------------------------------------

export const PROBLEM_CATEGORIES = {
  income: "Rental income",
  arrears: "Arrears and late payment",
  vacancy: "Vacancy",
  expenses: "Expenses and accounts",
  maintenance: "Maintenance and condition",
  security: "Security and access",
  tenancy: "Leases and tenancy",
  records: "Records and administration",
  approvals: "Plans, zoning and approvals",
  other: "Other",
} as const;
export type ProblemCategory = keyof typeof PROBLEM_CATEGORIES;

export const PROBLEM_STATUS_LABEL = {
  open: "Open",
  investigating: "Investigating",
  planned: "Action planned",
  resolved: "Resolved",
  not_resolved: "Not resolved",
  parked: "Parked",
} as const;
export type ProblemStatus = keyof typeof PROBLEM_STATUS_LABEL;
/** On the journey: still being worked. Resolved and parked problems are off it until they reopen. */
export const ACTIVE_PROBLEM: readonly ProblemStatus[] = ["open", "investigating", "planned", "not_resolved"];

export const PROBLEM_TEXT_MIN = 10;
export const RESULT_MIN = 10;
export const REASON_MIN = 10;
export const DONE_WHEN_MIN = 5;

export interface ProblemDraft {
  category: ProblemCategory;
  title: string;
  experienced: string;
  consequence?: string | null;
  workaround?: string | null;
  intervention?: string | null;
  resultNote?: string | null;
}

const len = (s: string | null | undefined) => (s ?? "").trim().length;

/** Mirrors property_problems' checks: say what is happening; no email addresses, phone numbers or ID numbers. */
export function checkProblem(p: ProblemDraft): Check {
  if (!(p.category in PROBLEM_CATEGORIES)) return fail("TEBOS_VALIDATION", "Choose what kind of problem it is.");
  if (len(p.title) < 3 || len(p.title) > 160) return fail("TEBOS_VALIDATION", "Give the problem a short name (3 to 160 characters).");
  if (len(p.experienced) < PROBLEM_TEXT_MIN) return fail("TEBOS_VALIDATION", `Say what is happening (at least ${PROBLEM_TEXT_MIN} characters).`);
  const text = [p.title, p.experienced, p.consequence, p.workaround, p.intervention, p.resultNote];
  if (text.some(looksPersonal)) {
    return fail("TEBOS_VALIDATION", "Leave out phone numbers, email addresses and ID numbers. Tenants' details aren't stored here yet.");
  }
  return OK;
}

/** Mirrors the problem guard: planned states its intervention; a resolved problem rests on a done action and checked evidence. */
export function checkProblemStatus(
  next: ProblemStatus,
  p: { intervention: string | null; resultNote: string | null },
  records: { doneActions: number; checkedEvidence: number },
): Check {
  if (next === "planned" && len(p.intervention) < 10) return fail("TEBOS_VALIDATION", "Describe the intervention before planning it.");
  if (next === "resolved" || next === "not_resolved" || next === "parked") {
    if (len(p.resultNote) < RESULT_MIN) {
      return fail("TEBOS_VALIDATION", next === "parked" ? "Say why it is parked." : "Write down what happened: the result, in at least 10 characters.");
    }
  }
  if (next === "resolved") {
    if (records.doneActions === 0) return fail("TEBOS_VALIDATION", "A problem is resolved only once an action on it is done.");
    if (records.checkedEvidence === 0) return fail("TEBOS_VALIDATION", "A problem is resolved only with checked evidence that it worked.");
  }
  return OK;
}

/** Mirrors property_workstreams: an action on a problem says why, and how we'll know it's done; done needs received proof. */
export function checkAction(a: {
  problemId: string | null; reason: string | null; doneWhen: string | null; status: WorkstreamStatus; proofStatus: EvidenceStatus | null;
}): Check {
  if (a.problemId && len(a.reason) < REASON_MIN) return fail("TEBOS_VALIDATION", `Say why this action is needed (at least ${REASON_MIN} characters).`);
  if (a.problemId && len(a.doneWhen) < DONE_WHEN_MIN) return fail("TEBOS_VALIDATION", "Say how we'll know it's done.");
  if (a.status === "done" && a.problemId && !a.proofStatus) return fail("TEBOS_VALIDATION", "Done needs its proof: choose the evidence that shows it.");
  if (a.proofStatus && a.proofStatus !== "received" && a.proofStatus !== "checked") {
    return fail("TEBOS_VALIDATION", "Proof must be evidence that was received or checked.");
  }
  return OK;
}

// ---------------------------------------------------------------------------
// Records the journey reads
// ---------------------------------------------------------------------------

export interface JourneyProblem {
  id: string;
  title: string;
  category: ProblemCategory;
  status: ProblemStatus;
  measure: string | null;
  createdAt: string;
  closedOn: string | null;
}
export interface JourneyEvidence {
  id: string;
  problemId: string | null;
  title: string;
  status: EvidenceStatus;
  receivedOn: string | null;
  updatedAt: string;
}
export interface JourneyAction {
  id: string;
  problemId: string | null;
  title: string;
  owner: string;
  dueOn: string;
  status: WorkstreamStatus;
  completedOn: string | null;
  note: string | null;
  createdAt: string;
}
export interface JourneyInput {
  property: { createdAt: string; propertyType: string | null; nextReviewOn: string | null };
  problems: JourneyProblem[];
  evidence: JourneyEvidence[];
  actions: JourneyAction[];
  baseline: { capturedOn: string } | null;
  reviews: Array<{ reviewOn: string }>;
  today: string;
}

// ---------------------------------------------------------------------------
// What is verified, received, missing or in conflict
// ---------------------------------------------------------------------------

export type EvidenceState = "none" | "missing" | "received" | "verified" | "conflicting";
export const EVIDENCE_STATE_LABEL: Record<EvidenceState, string> = {
  none: "No evidence recorded",
  missing: "Evidence missing",
  received: "Received, not yet checked",
  verified: "Checked",
  conflicting: "Evidence conflicts",
};

export interface ProblemEvidence { state: EvidenceState; checked: number; received: number; missing: number; conflicting: number }

/** A problem's evidence, counted honestly. A conflict outranks everything; checked outranks received. */
export function problemEvidence(problemId: string, evidence: JourneyEvidence[]): ProblemEvidence {
  const mine = evidence.filter((e) => e.problemId === problemId);
  const count = (s: EvidenceStatus[]) => mine.filter((e) => s.includes(e.status)).length;
  const r = { checked: count(["checked"]), received: count(["received"]), missing: count(["missing", "requested"]), conflicting: count(["conflicting"]) };
  const state: EvidenceState = r.conflicting ? "conflicting" : r.checked ? "verified" : r.received ? "received" : r.missing ? "missing" : "none";
  return { state, ...r };
}

// ---------------------------------------------------------------------------
// The journey's stages
// ---------------------------------------------------------------------------

export const STAGES = [
  { key: "discover", label: "Discover", moves: "Record the property and what is holding it back." },
  { key: "assess", label: "Assess", moves: "Gather the evidence: what the records show, not what is assumed." },
  { key: "strategise", label: "Strategise", moves: "Agree an action: who does it, by when, and how we'll know it's done." },
  { key: "execute", label: "Execute", moves: "Do the work and keep its proof." },
  { key: "optimise", label: "Optimise", moves: "Check the result against the evidence, and review the property again." },
] as const;
export type StageKey = (typeof STAGES)[number]["key"];
const order = (s: StageKey) => STAGES.findIndex((x) => x.key === s);

const LIVE_ACTION: readonly WorkstreamStatus[] = ["planned", "in_progress", "blocked", "done"];

/** Where one problem stands, from its records. Parked problems are off the journey (null). */
export function problemStage(p: JourneyProblem, evidence: JourneyEvidence[], actions: JourneyAction[]): StageKey | null {
  if (p.status === "parked") return null;
  if (p.status === "resolved") return "optimise";
  const live = actions.filter((a) => a.problemId === p.id && LIVE_ACTION.includes(a.status));
  if (live.length > 0) return "execute";
  const ev = problemEvidence(p.id, evidence).state;
  if (ev === "received" || ev === "verified") return "strategise";
  return "assess";
}

export interface PropertyStage { stage: StageKey; reason: string }

/** Where the property stands: the earliest stage of any problem still being worked. */
export function propertyStage(input: JourneyInput): PropertyStage {
  const active = input.problems.filter((p) => ACTIVE_PROBLEM.includes(p.status));
  if (input.problems.length === 0) return { stage: "discover", reason: "No problem has been recorded yet." };
  if (active.length === 0) {
    return { stage: "optimise", reason: "No problem is open. The property is in its review cycle until something new is recorded." };
  }
  let earliest: { stage: StageKey; problem: JourneyProblem } | null = null;
  for (const p of active) {
    const s = problemStage(p, input.evidence, input.actions);
    if (s && (!earliest || order(s) < order(earliest.stage))) earliest = { stage: s, problem: p };
  }
  const e = earliest!;
  return { stage: e.stage, reason: `"${e.problem.title}" is at ${STAGES[order(e.stage)]!.label}${active.length > 1 ? `, the earliest of ${active.length} open problems` : ""}.` };
}

// ---------------------------------------------------------------------------
// Milestones: reached only with a record, dated from it
// ---------------------------------------------------------------------------

export interface Milestone { key: string; label: string; on: string; detail: string; approximate?: boolean }

const day = (iso: string) => iso.slice(0, 10);
const earliestBy = <T>(list: T[], date: (x: T) => string | null): T | null =>
  list.filter((x) => date(x)).sort((a, b) => date(a)!.localeCompare(date(b)!))[0] ?? null;

export function milestones(input: JourneyInput): Milestone[] {
  const out: Milestone[] = [{ key: "property_recorded", label: "Property recorded", on: day(input.property.createdAt), detail: "The journey started." }];
  const firstProblem = earliestBy(input.problems, (p) => p.createdAt);
  if (firstProblem) out.push({ key: "first_problem", label: "First problem recorded", on: day(firstProblem.createdAt), detail: firstProblem.title });
  const firstReceived = earliestBy(input.evidence.filter((e) => e.status !== "missing" && e.status !== "requested"), (e) => e.receivedOn);
  if (firstReceived) out.push({ key: "first_evidence", label: "First evidence received", on: firstReceived.receivedOn!, detail: firstReceived.title });
  // when evidence was checked isn't stored, only that it was by its last change: say "by", never a made-up day
  const firstChecked = earliestBy(input.evidence.filter((e) => e.status === "checked"), (e) => e.updatedAt);
  if (firstChecked) {
    out.push({ key: "first_checked", label: "First evidence checked", on: day(firstChecked.updatedAt), detail: firstChecked.title, approximate: true });
  }
  const firstAction = earliestBy(input.actions.filter((a) => a.status !== "cancelled"), (a) => a.createdAt);
  if (firstAction) out.push({ key: "first_action", label: "First action agreed", on: day(firstAction.createdAt), detail: `${firstAction.title} (${firstAction.owner})` });
  const firstDone = earliestBy(input.actions.filter((a) => a.status === "done"), (a) => a.completedOn);
  if (firstDone) out.push({ key: "first_done", label: "First action completed, with proof", on: firstDone.completedOn!, detail: firstDone.title });
  if (input.baseline) out.push({ key: "baseline", label: "Baseline captured", on: input.baseline.capturedOn, detail: "The figures to measure progress against." });
  const firstReview = earliestBy(input.reviews, (r) => r.reviewOn);
  if (firstReview) out.push({ key: "first_review", label: "First outcome review", on: firstReview.reviewOn, detail: "Actual results recorded against the baseline." });
  for (const p of input.problems.filter((x) => x.status === "resolved" && x.closedOn)) {
    out.push({ key: `resolved:${p.id}`, label: "Problem resolved, with checked evidence", on: p.closedOn!, detail: p.title });
  }
  return out.sort((a, b) => a.on.localeCompare(b.on));
}

// ---------------------------------------------------------------------------
// Next actions: rules, each explaining itself
// ---------------------------------------------------------------------------

export interface NextAction {
  key: string;
  title: string;
  /** What in the records caused this. */
  trigger: string;
  /** The records it rests on. */
  evidence: string;
  /** What isn't known yet. */
  uncertain: string;
  /** What should happen now. */
  next: string;
  problemId?: string;
  actionId?: string;
}

/** How many times an open problem has been held up: actions blocked, overdue, or cancelled. */
export function holdUps(problemId: string, actions: JourneyAction[], today: string): number {
  return actions.filter((a) => a.problemId === problemId
    && (a.status === "blocked" || a.status === "cancelled" || ((a.status === "planned" || a.status === "in_progress") && a.dueOn < today))).length;
}

export function nextActions(input: JourneyInput): NextAction[] {
  const { today } = input;
  const out: NextAction[] = [];
  const active = input.problems.filter((p) => ACTIVE_PROBLEM.includes(p.status));
  const actionsOf = (id: string) => input.actions.filter((a) => a.problemId === id);

  if (!input.property.propertyType) {
    out.push({
      key: "profile", title: "Complete the property profile", trigger: "The property type isn't recorded.",
      evidence: "The property record.", uncertain: "What kind of property this is.", next: "Record the property type on the profile.",
    });
  }
  if (input.problems.length === 0) {
    out.push({
      key: "discover", title: "Record what is holding the property back", trigger: "No problem has been recorded yet.",
      evidence: "None yet.", uncertain: "What is preventing the property from performing better.",
      next: "Record one problem you can see today: what is happening, and what it costs you.",
    });
  }

  for (const p of active) {
    const ev = problemEvidence(p.id, input.evidence);
    const mine = actionsOf(p.id);
    const conflicts = input.evidence.filter((e) => e.problemId === p.id && e.status === "conflicting");
    const held = holdUps(p.id, input.actions, today);

    // 1. a conflict comes first: no plan should rest on records that disagree
    for (const e of conflicts) {
      out.push({
        key: `conflict:${e.id}`, problemId: p.id, title: `Resolve the conflicting evidence: ${e.title}`,
        trigger: `"${e.title}" is marked as conflicting.`, evidence: e.title,
        uncertain: "Which record is correct.", next: "Compare the sources, note which one is right, and mark the item checked.",
      });
    }
    // 2. held up more than once: find the common cause before adding another action
    if (held >= 2) {
      out.push({
        key: `repeated:${p.id}`, problemId: p.id, title: `Find out why "${p.title}" keeps being held up`,
        trigger: `${held} actions on this problem have been blocked, cancelled or have passed their deadline.`,
        evidence: mine.filter((a) => a.status === "blocked" || a.status === "cancelled" || a.dueOn < today).map((a) => a.title).join("; "),
        uncertain: "Whether the cause is the same each time: access, money, a person, or a missing document.",
        next: "Talk to the people responsible and record the common cause before adding another action. Don't change the strategy yet.",
      });
    }
    // 3. blocked and overdue actions
    for (const a of mine) {
      if (a.status === "blocked") {
        out.push({
          key: `blocked:${a.id}`, problemId: p.id, actionId: a.id, title: `Unblock "${a.title}"`,
          trigger: `It is blocked: ${a.note ?? "no reason recorded"}.`, evidence: `The action, owned by ${a.owner}.`,
          uncertain: "Whether the blocker can be removed, and by whom.", next: `Ask ${a.owner} what would unblock it, and record the answer.`,
        });
      } else if ((a.status === "planned" || a.status === "in_progress") && a.dueOn < today) {
        out.push({
          key: `overdue:${a.id}`, problemId: p.id, actionId: a.id, title: `Follow up "${a.title}"`,
          trigger: `It was due on ${a.dueOn} and isn't done.`, evidence: `The action, owned by ${a.owner}.`,
          uncertain: "Whether it is still possible, and what is in the way.",
          next: `Confirm with ${a.owner} what is in the way. Set a new date, or mark it blocked with the reason.`,
        });
      }
    }
    // 4. no usable evidence yet
    if (ev.state === "none" || ev.state === "missing") {
      out.push({
        key: `evidence:${p.id}`, problemId: p.id, title: `Gather evidence for "${p.title}"`,
        trigger: ev.state === "none" ? "No evidence is recorded for this problem." : `${ev.missing} evidence item${ev.missing === 1 ? " is" : "s are"} still missing or requested.`,
        evidence: "The problem as described.",
        uncertain: "How big the problem is, and what is causing it.",
        next: "Record what exists: statements, invoices, messages, photos or reports, with where each one is kept.",
      });
    }
    // 5. evidence in hand, nothing agreed yet
    const live = mine.filter((a) => LIVE_ACTION.includes(a.status));
    if ((ev.state === "received" || ev.state === "verified") && live.length === 0 && held < 2) {
      out.push({
        key: `plan:${p.id}`, problemId: p.id, title: `Agree an action for "${p.title}"`,
        trigger: "There is evidence for this problem, but no action is agreed.",
        evidence: `${ev.checked} checked, ${ev.received} received but not yet checked.`,
        uncertain: ev.state === "received" ? "The evidence hasn't been checked yet, so the cause may still be wrong." : "Which intervention fits best.",
        next: "Agree one action: who does it, by when, why it's needed, and how we'll know it's done.",
      });
    }
    // 6. work done, result not yet recorded
    const done = mine.filter((a) => a.status === "done");
    if (done.length > 0 && !mine.some((a) => a.status === "planned" || a.status === "in_progress" || a.status === "blocked")) {
      const last = done.sort((a, b) => (b.completedOn ?? "").localeCompare(a.completedOn ?? ""))[0]!;
      out.push({
        key: `result:${p.id}`, problemId: p.id, title: `Check whether "${p.title}" is fixed`,
        trigger: `"${last.title}" was completed on ${last.completedOn}.`,
        evidence: `${done.length} completed action${done.length === 1 ? "" : "s"}; ${ev.checked} checked evidence item${ev.checked === 1 ? "" : "s"}.`,
        uncertain: "Whether the problem has actually gone away.",
        next: p.measure
          ? `Measure it as agreed (${p.measure}), record the evidence, then close it as resolved or not resolved.`
          : "Record checked evidence of the result, then close it as resolved or not resolved.",
      });
    }
  }

  if (input.property.nextReviewOn && input.property.nextReviewOn <= today) {
    out.push({
      key: "review", title: "Review the property's position", trigger: `A review was due on ${input.property.nextReviewOn}.`,
      evidence: input.baseline ? `The baseline of ${input.baseline.capturedOn}.` : "No baseline yet.",
      uncertain: "Whether the property is better than its baseline.", next: "Record an outcome review with the actual figures.",
    });
  }
  if (input.problems.length > 0 && active.length === 0) {
    out.push({
      key: "cycle", title: "Look for the next constraint", trigger: "No problem is open.",
      evidence: `${input.problems.filter((p) => p.status === "resolved").length} resolved problem(s).`,
      uncertain: "What is holding the property back now.", next: "Record any new problem, or set the next review date.",
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// One line per property, for the portfolio
// ---------------------------------------------------------------------------

export interface PropertySummary { stage: PropertyStage; openProblems: number; overdueActions: number; next: NextAction | null; reached: number }

export function propertySummary(input: JourneyInput): PropertySummary {
  return {
    stage: propertyStage(input),
    openProblems: input.problems.filter((p) => ACTIVE_PROBLEM.includes(p.status)).length,
    overdueActions: input.actions.filter((a) => (a.status === "planned" || a.status === "in_progress") && a.dueOn < input.today).length,
    next: nextActions(input)[0] ?? null,
    reached: milestones(input).length,
  };
}
