// What a client's maintainer should look at, derived from the client's own
// records: objectives slipping or unmeasured, connections broken, findings
// and approvals left waiting. TEBOS raises each signal as a queue item once,
// keeps it while the condition holds, and resolves it itself when the
// condition clears. A maintainer closes an item as done, or dismisses it
// (with a note); a dismissed signal isn't raised again for a while.

export type SignalKind =
  | "objective_past_due"
  | "objective_at_risk"
  | "objective_unmeasured"
  | "connection_broken"
  | "findings_waiting"
  | "approvals_waiting";

export type Severity = "high" | "medium";

export interface Signal {
  kind: SignalKind;
  /** The record it's about (objective, connection); null for a count across the client. */
  subjectId: string | null;
  severity: Severity;
  title: string;
  detail: string;
}

export interface ObjectiveState {
  id: string;
  title: string;
  direction: "at_least" | "at_most";
  targetValue: number;
  dueOn: string;
  activatedAt: string;
  /** The latest measured value and when it was read; null if never measured. */
  latest: { value: number; measuredAt: string } | null;
}

export interface ClientState {
  objectives: ObjectiveState[];
  connections: Array<{ id: string; label: string; status: string; since: string }>;
  /** Draft findings waiting for a person, with the oldest one's date. */
  findingsWaiting: { count: number; oldest: string | null };
  approvalsWaiting: { count: number; oldest: string | null };
}

export const AT_RISK_WITHIN_DAYS = 14;
export const UNMEASURED_AFTER_DAYS = 35;
export const WAITING_AFTER_DAYS = 3;
/** A dismissed signal isn't raised again for this long. */
export const DISMISS_FOR_DAYS = 14;

const DAY = 86_400_000;
const daysBetween = (fromIso: string, to: Date) => Math.floor((to.getTime() - new Date(fromIso).getTime()) / DAY);
const meets = (o: ObjectiveState, v: number) => (o.direction === "at_least" ? v >= o.targetValue : v <= o.targetValue);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function signalsFor(c: ClientState, now: Date = new Date()): Signal[] {
  const out: Signal[] = [];
  const today = now.toISOString().slice(0, 10);

  for (const o of c.objectives) {
    const daysLeft = Math.ceil((new Date(`${o.dueOn}T23:59:59Z`).getTime() - now.getTime()) / DAY);
    const met = o.latest !== null && meets(o, o.latest.value);
    if (o.dueOn < today) {
      out.push({ kind: "objective_past_due", subjectId: o.id, severity: "high", title: `"${o.title}" was due on ${o.dueOn}`,
        detail: met ? "Its latest measured value meets the target: mark it achieved." : "Mark it achieved (if a measured value meets the target) or missed, with the owner." });
      continue;
    }
    if (!met && daysLeft <= AT_RISK_WITHIN_DAYS) {
      out.push({ kind: "objective_at_risk", subjectId: o.id, severity: daysLeft <= 7 ? "high" : "medium", title: `"${o.title}" is at risk`,
        detail: `${plural(daysLeft, "day")} left and ${o.latest ? `the latest measured value (${o.latest.value}) doesn't meet the target (${o.direction === "at_least" ? "at least" : "at most"} ${o.targetValue})` : "no measured value yet"}.` });
    }
    const lastRead = o.latest?.measuredAt ?? o.activatedAt;
    if (daysBetween(lastRead, now) > UNMEASURED_AFTER_DAYS) {
      out.push({ kind: "objective_unmeasured", subjectId: o.id, severity: "medium", title: `"${o.title}" isn't being measured`,
        detail: o.latest ? `The last measured value was read ${daysBetween(o.latest.measuredAt, now)} days ago. Check its connection, or bind it to a reading.` : `No measured value in ${daysBetween(o.activatedAt, now)} days. Connect the system that reports it, or bind it to a reading.` });
    }
  }

  for (const k of c.connections) {
    if (["authentication_required", "expired", "unavailable"].includes(k.status)) {
      out.push({ kind: "connection_broken", subjectId: k.id, severity: "high", title: `${k.label} is disconnected`,
        detail: `Status: ${k.status.replace(/_/g, " ")}, since ${k.since.slice(0, 10)}. Readings and measurements from it have stopped.` });
    } else if (k.status === "degraded") {
      out.push({ kind: "connection_broken", subjectId: k.id, severity: "medium", title: `${k.label} is degraded`, detail: `Some readings are failing since ${k.since.slice(0, 10)}.` });
    }
  }

  if (c.findingsWaiting.count > 0 && c.findingsWaiting.oldest && daysBetween(c.findingsWaiting.oldest, now) >= WAITING_AFTER_DAYS) {
    out.push({ kind: "findings_waiting", subjectId: null, severity: "medium", title: `${plural(c.findingsWaiting.count, "finding")} waiting for review`,
      detail: `The oldest has waited ${plural(daysBetween(c.findingsWaiting.oldest, now), "day")}. Review them with the client: confirm or dismiss each one.` });
  }
  if (c.approvalsWaiting.count > 0 && c.approvalsWaiting.oldest && daysBetween(c.approvalsWaiting.oldest, now) >= WAITING_AFTER_DAYS) {
    out.push({ kind: "approvals_waiting", subjectId: null, severity: "high", title: `${plural(c.approvalsWaiting.count, "approval")} waiting on the client`,
      detail: `The oldest has waited ${plural(daysBetween(c.approvalsWaiting.oldest, now), "day")}. Remind the approver, or cancel what's no longer needed.` });
  }
  return out;
}

/** The identity of a signal: one open item per client, kind and subject. */
export const signalKey = (s: Pick<Signal, "kind" | "subjectId">) => `${s.kind}:${s.subjectId ?? "-"}`;
