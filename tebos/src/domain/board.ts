// The Board and the Objective (ADR 0003). Mirrors the rules of migration
// board_objectives so the interface can explain and pre-check them; the
// database is the final authority.
//
//   Objective — what the business must achieve, in numbers, with an owner and
//               a date. Its target is fixed once active. It is achieved only
//               on a value read from a connected system, never on a typed one.
//   Board     — the pieces (tools, providers, channels, teams, roles, data)
//               and the flows the work moves through, step by step.

import { OK, fail, type Check } from "./rules";
import { canTransition, type ObjectiveStatus } from "./states";

export const OBJECTIVE_METRICS = {
  revenue: { label: "Revenue", unit: "ZAR", direction: "at_least" },
  gross_margin: { label: "Gross margin", unit: "percent", direction: "at_least" },
  recurring_revenue_share: { label: "Recurring share of revenue", unit: "percent", direction: "at_least" },
  founder_hours: { label: "Founder hours in operations", unit: "hours_per_week", direction: "at_most" },
  lead_response_time: { label: "Time to answer a new lead", unit: "hours", direction: "at_most" },
  client_retention: { label: "Client retention", unit: "percent", direction: "at_least" },
  custom: { label: "Other measure", unit: "count", direction: "at_least" },
} as const satisfies Record<string, { label: string; unit: ObjectiveUnit; direction: Direction }>;
export type ObjectiveMetric = keyof typeof OBJECTIVE_METRICS;

export const OBJECTIVE_UNITS = ["ZAR", "percent", "hours_per_week", "hours", "days", "count"] as const;
export type ObjectiveUnit = (typeof OBJECTIVE_UNITS)[number];
export type Direction = "at_least" | "at_most";
export const OBJECTIVE_PERIODS = ["week", "month", "quarter", "year", "point_in_time"] as const;
export type ObjectivePeriod = (typeof OBJECTIVE_PERIODS)[number];

export const COMPONENT_KINDS = ["software", "provider", "channel", "team", "role", "data_store", "document", "other"] as const;
export type ComponentKind = (typeof COMPONENT_KINDS)[number];

export const PERFORMERS = ["founder", "staff", "automation", "provider", "client"] as const;
export type Performer = (typeof PERFORMERS)[number];

/**
 * Evidence that can confirm a piece of the board (make it "observed"): obtained
 * and current. What the owner said (a user_statement source) makes a piece
 * stated, never observed. Mirrors tebos_private.guard_board_basis.
 */
export const OBSERVING_EVIDENCE_STATES = ["acquired", "partially_acquired", "system_generated"] as const;

export function canObserve(evidence: { state: string; sourceType: string } | null): Check {
  if (!evidence || !(OBSERVING_EVIDENCE_STATES as readonly string[]).includes(evidence.state)) {
    return fail("TEBOS_EVIDENCE_REQUIRED", "An observed piece must cite evidence TEBOS obtained and that is current.");
  }
  if (evidence.sourceType === "user_statement") {
    return fail("TEBOS_EVIDENCE_REQUIRED", "What the owner said makes a piece stated, not observed.");
  }
  return OK;
}

/** A piece evidence confirmed stays observed: it can cite newer evidence or be retired, never fall back. */
export function canChangeBasis(from: "proposed" | "stated" | "observed", to: "proposed" | "stated" | "observed"): Check {
  if (from === "observed" && to !== "observed") return fail("TEBOS_ILLEGAL_TRANSITION", "A piece evidence confirmed stays observed.");
  if (to === "proposed" && from !== "proposed") return fail("TEBOS_ILLEGAL_TRANSITION", "A stated or observed piece can't go back to being a proposal.");
  return OK;
}

export type MeasurementBasis = "measured" | "stated";

export interface ObjectiveTarget {
  id: string;
  status: ObjectiveStatus;
  direction: Direction;
  targetValue: number;
  dueOn: string; // YYYY-MM-DD
}

export interface MeasurementState {
  id: string;
  objectiveId: string;
  basis: MeasurementBasis;
  value: number;
  measuredAt: string;
}

export function meetsTarget(direction: Direction, target: number, value: number): boolean {
  return direction === "at_least" ? value >= target : value <= target;
}

/** Today's date as the database sees it (YYYY-MM-DD, UTC). */
export const isoDate = (d: Date = new Date()) => d.toISOString().slice(0, 10);

/**
 * Read a number from evidence the way the database does (`structured_value #>> path`):
 * a JSON number, or a string of plain digits. Anything else is not a measurement.
 */
export function extractMeasuredValue(structured: unknown, path: readonly string[]): number | null {
  if (path.length === 0 || path.length > 8) return null;
  let cur: unknown = structured;
  for (const key of path) {
    if (cur === null || typeof cur !== "object") return null;
    cur = Array.isArray(cur) ? (/^-?\d+$/.test(key) ? cur.at(Number(key)) : undefined) : (cur as Record<string, unknown>)[key];
  }
  const raw = typeof cur === "number" ? String(cur) : typeof cur === "string" ? cur : null;
  if (raw === null || !/^-?[0-9]+(\.[0-9]+)?$/.test(raw)) return null;
  return Number(raw);
}

/** Paths to every number in a connected system's evidence, for choosing what to measure. */
export function measurablePaths(structured: unknown, prefix: string[] = [], out: Array<{ path: string[]; value: number }> = []) {
  if (prefix.length >= 8 || structured === null || typeof structured !== "object") return out;
  for (const [k, v] of Object.entries(structured as Record<string, unknown>)) {
    const path = [...prefix, k];
    const n = extractMeasuredValue({ [k]: v }, [k]);
    if (n !== null) out.push({ path, value: n });
    else if (v && typeof v === "object") measurablePaths(v, path, out);
  }
  return out;
}

export interface MeasurementInput {
  basis: MeasurementBasis;
  sourceType: string;
  evidenceState: string;
  structuredValue?: unknown;
  valuePath?: readonly string[] | null;
  value?: number | null;
}

/** Whether a measurement may be recorded, and the value it will carry. */
export function checkMeasurement(m: MeasurementInput): Check & { value?: number } {
  if (m.evidenceState === "unavailable" || m.evidenceState === "unsupported") {
    return fail("TEBOS_MEASUREMENT_UNSUPPORTED", "A measurement must cite evidence that was obtained.");
  }
  if (m.basis === "measured") {
    if (!["connected_system", "system"].includes(m.sourceType) || !["acquired", "partially_acquired", "system_generated"].includes(m.evidenceState)) {
      return fail("TEBOS_MEASUREMENT_UNSUPPORTED", "A measured value must come from a connected system's evidence.");
    }
    const v = m.valuePath ? extractMeasuredValue(m.structuredValue, m.valuePath) : null;
    if (v === null) return fail("TEBOS_MEASUREMENT_UNSUPPORTED", "The evidence holds no number there.");
    if (m.value != null && m.value !== v) return fail("TEBOS_MEASUREMENT_UNSUPPORTED", "A measured value is read from the evidence, not typed in.");
    return { ok: true, value: v };
  }
  if (m.sourceType !== "user_statement") {
    return fail("TEBOS_MEASUREMENT_UNSUPPORTED", "A stated value must cite the owner's own statement.");
  }
  if (m.value == null || !Number.isFinite(m.value)) return fail("TEBOS_VALIDATION", "Enter the value the owner stated.");
  return { ok: true, value: m.value };
}

export interface ObjectiveTransitionContext {
  /** The measurement offered as proof when moving to achieved. */
  measurement?: MeasurementState | null;
  today?: string;
  reason?: string | null;
}

export function checkObjectiveTransition(o: ObjectiveTarget, to: ObjectiveStatus, ctx: ObjectiveTransitionContext = {}): Check {
  const today = ctx.today ?? isoDate();
  if (!canTransition("objective", o.status, to)) {
    return fail("TEBOS_ILLEGAL_TRANSITION", `An objective can't move from ${o.status} to ${to}.`);
  }
  if (to === "active" && o.dueOn < today) return fail("TEBOS_VALIDATION", "The due date is in the past.");
  if (to === "achieved") {
    const m = ctx.measurement;
    if (!m || m.objectiveId !== o.id || m.basis !== "measured" || !meetsTarget(o.direction, o.targetValue, m.value)) {
      return fail("TEBOS_OBJECTIVE_UNMEASURED", "An objective is achieved only on a measured value that meets its target.");
    }
  }
  if (to === "missed" && o.dueOn >= today) return fail("TEBOS_OBJECTIVE_NOT_DUE", "An objective can be missed only after its due date.");
  if ((to === "retired" || to === "cancelled") && !ctx.reason?.trim()) return fail("TEBOS_VALIDATION", "Say why.");
  return OK;
}

/** Target fields are fixed once an objective leaves draft. */
export function checkObjectiveEdit(status: ObjectiveStatus): Check {
  return status === "draft"
    ? OK
    : fail("TEBOS_INPUT_FROZEN", "An active objective's target is fixed. Retire it and set a new one.");
}

export interface ObjectiveProgress {
  /** The latest value read from a connected system: the only one that counts. */
  measured: MeasurementState | null;
  /** The latest value the owner stated: context, never proof. */
  stated: MeasurementState | null;
  met: boolean | null;
  /** How far the measured value is from the target, in the objective's unit (0 when met). */
  gap: number | null;
  /** The measurement that proves the target was met, if one does. */
  proof: MeasurementState | null;
}

export function objectiveProgress(o: Pick<ObjectiveTarget, "id" | "direction" | "targetValue">, measurements: MeasurementState[]): ObjectiveProgress {
  const mine = measurements.filter((m) => m.objectiveId === o.id).sort((a, b) => b.measuredAt.localeCompare(a.measuredAt));
  const measured = mine.find((m) => m.basis === "measured") ?? null;
  const stated = mine.find((m) => m.basis === "stated") ?? null;
  const met = measured ? meetsTarget(o.direction, o.targetValue, measured.value) : null;
  const gap = measured ? (met ? 0 : Math.abs(o.targetValue - measured.value)) : null;
  const proof = mine.find((m) => m.basis === "measured" && meetsTarget(o.direction, o.targetValue, m.value)) ?? null;
  return { measured, stated, met, gap, proof };
}

export interface StepState {
  performer: Performer;
  documented: boolean;
  componentId?: string | null;
  retired?: boolean;
}

export function checkStep(s: StepState): Check {
  if (s.performer === "automation" && !s.componentId) {
    return fail("TEBOS_VALIDATION", "An automated step needs the tool it runs on.");
  }
  return OK;
}

export interface FounderDependency {
  steps: number;
  founder: number;
  undocumented: number;
  automated: number;
  /** Steps the founder performs that are written down nowhere: the founder as middleware. */
  middleware: number;
  /** Founder steps as a share of all steps, 0..1 (null for an empty flow). */
  founderShare: number | null;
}

/** How much a flow depends on the founder, counted — not scored. */
export function founderDependency(steps: StepState[]): FounderDependency {
  const live = steps.filter((s) => !s.retired);
  const founder = live.filter((s) => s.performer === "founder").length;
  return {
    steps: live.length,
    founder,
    undocumented: live.filter((s) => !s.documented).length,
    automated: live.filter((s) => s.performer === "automation").length,
    middleware: live.filter((s) => s.performer === "founder" && !s.documented).length,
    founderShare: live.length ? founder / live.length : null,
  };
}
