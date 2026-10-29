// The property journey's reads and writes (migration property_journey; docs/pra-platform/release-1.md). Every call
// runs under the person's own session: row-level security keeps each owner to their own organisation, and the
// database enforces the integrity rules. Stage, milestones and next actions are computed from what is read here
// (@core/journey), never stored or typed in.
import type { JourneyInput, ProblemCategory, ProblemStatus } from "@core/journey";
import type { EvidenceStatus, WorkstreamStatus } from "@core/property";
import type { PropertyBaseline, PropertyCase, PropertyEvidence, PropertyReview, PropertyWorkstream } from "./data";
import type { Database } from "../database.types";
import type { Db } from "./supabase";

export type PropertyProblem = Database["public"]["Tables"]["property_problems"]["Row"];

function must<R extends { data: unknown; error: unknown }>(res: R): NonNullable<R["data"]> {
  if (res.error) throw res.error;
  if (res.data === null || res.data === undefined) throw new Error("The database returned no data");
  return res.data as NonNullable<R["data"]>;
}

/** The disposition a property case needs. An owner's own property isn't a firm's assessment, and doesn't claim to be. */
export const OWNER_DISPOSITION_REASON = "The owner is tracking this property to improve it; no professional assessment has been made.";

export interface PropertyJourney {
  case: PropertyCase;
  problems: PropertyProblem[];
  evidence: PropertyEvidence[];
  actions: PropertyWorkstream[];
  baseline: PropertyBaseline | null;
  reviews: PropertyReview[];
}

export function journeyInput(d: Pick<PropertyJourney, "case" | "problems" | "evidence" | "actions" | "baseline" | "reviews">, today: string): JourneyInput {
  return {
    property: { createdAt: d.case.created_at, propertyType: d.case.property_type, nextReviewOn: d.case.next_review_on },
    problems: d.problems.map((p) => ({
      id: p.id, title: p.title, category: p.category as ProblemCategory, status: p.status as ProblemStatus, measure: p.measure, createdAt: p.created_at, closedOn: p.closed_on,
    })),
    evidence: d.evidence.map((e) => ({ id: e.id, problemId: e.problem_id, title: e.title, status: e.status as EvidenceStatus, receivedOn: e.received_on, updatedAt: e.updated_at })),
    actions: d.actions.map((a) => ({
      id: a.id, problemId: a.problem_id, title: a.title, owner: a.owner, dueOn: a.due_on, status: a.status as WorkstreamStatus,
      completedOn: a.completed_on, note: a.note, createdAt: a.created_at,
    })),
    baseline: d.baseline ? { capturedOn: d.baseline.captured_on } : null,
    reviews: d.reviews.map((r) => ({ reviewOn: r.review_on })),
    today,
  };
}

/** Every property in the organisation, with what the portfolio needs to place each one on its journey. */
export async function listProperties(db: Db, orgId: string) {
  const cases = must(await db.from("property_cases").select("*").eq("org_id", orgId).order("updated_at", { ascending: false }).limit(200));
  const ids = cases.map((c) => c.id);
  if (ids.length === 0) return [];
  const [problems, evidence, actions, baselines, reviews] = await Promise.all([
    db.from("property_problems").select("*").in("case_id", ids),
    db.from("property_evidence").select("*").in("case_id", ids),
    db.from("property_workstreams").select("*").in("case_id", ids),
    db.from("property_baselines").select("*").in("case_id", ids),
    db.from("property_outcome_reviews").select("*").in("case_id", ids),
  ]);
  const p = must(problems), e = must(evidence), a = must(actions), b = must(baselines), r = must(reviews);
  return cases.map((c): PropertyJourney => ({
    case: c,
    problems: p.filter((x) => x.case_id === c.id),
    evidence: e.filter((x) => x.case_id === c.id),
    actions: a.filter((x) => x.case_id === c.id),
    baseline: b.find((x) => x.case_id === c.id) ?? null,
    reviews: r.filter((x) => x.case_id === c.id),
  }));
}

export async function getPropertyJourney(db: Db, id: string): Promise<PropertyJourney | null> {
  const c = await db.from("property_cases").select("*").eq("id", id).maybeSingle();
  if (c.error) throw c.error;
  if (!c.data) return null;
  const [problems, evidence, actions, baselines, reviews] = await Promise.all([
    db.from("property_problems").select("*").eq("case_id", id).order("created_at"),
    db.from("property_evidence").select("*").eq("case_id", id).order("created_at"),
    db.from("property_workstreams").select("*").eq("case_id", id).order("due_on"),
    db.from("property_baselines").select("*").eq("case_id", id),
    db.from("property_outcome_reviews").select("*").eq("case_id", id).order("review_on"),
  ]);
  return {
    case: c.data, problems: must(problems), evidence: must(evidence), actions: must(actions),
    baseline: must(baselines)[0] ?? null, reviews: must(reviews),
  };
}

export interface NewProperty {
  label: string; property_type: string | null; area: string | null; current_use: string | null;
  problem: string; objective: string; desired_outcome: string | null;
}

export async function createProperty(db: Db, orgId: string, p: NewProperty) {
  return must(await db.from("property_cases").insert({ org_id: orgId, ...p, disposition_reason: OWNER_DISPOSITION_REASON }).select().single());
}

export async function updateProperty(db: Db, id: string, patch: Partial<Pick<PropertyCase, "property_type" | "area" | "current_use" | "desired_outcome" | "next_review_on">>) {
  return must(await db.from("property_cases").update(patch).eq("id", id).select().single());
}

export interface NewProblem {
  category: string; title: string; experienced: string; consequence: string | null; workaround: string | null;
  intervention: string | null; specialist: string | null; expected_result: string | null; measure: string | null;
}

export async function addProblem(db: Db, orgId: string, caseId: string, p: NewProblem) {
  return must(await db.from("property_problems").insert({ org_id: orgId, case_id: caseId, ...p }).select().single());
}

export async function updateProblem(db: Db, id: string, patch: Partial<Pick<PropertyProblem, "status" | "intervention" | "expected_result" | "measure" | "result_note" | "closed_on">>) {
  return must(await db.from("property_problems").update(patch).eq("id", id).select().single());
}

export interface NewEvidence {
  problem_id: string | null; category: string; title: string; source: string | null; document_ref: string | null;
  status: string; received_on: string | null; confidence: string | null; notes: string | null;
}

export async function addEvidence(db: Db, orgId: string, caseId: string, e: NewEvidence) {
  return must(await db.from("property_evidence").insert({ org_id: orgId, case_id: caseId, kind: "owner_record", ...e }).select().single());
}

export async function updateEvidence(db: Db, id: string, patch: Partial<Pick<PropertyEvidence, "status" | "received_on" | "confidence" | "notes" | "source">>) {
  return must(await db.from("property_evidence").update(patch).eq("id", id).select().single());
}

export interface NewAction { problem_id: string; title: string; owner: string; due_on: string; reason: string; done_when: string }

export async function addAction(db: Db, orgId: string, caseId: string, a: NewAction) {
  return must(await db.from("property_workstreams").insert({ org_id: orgId, case_id: caseId, ...a }).select().single());
}

export async function updateAction(
  db: Db, id: string,
  patch: Partial<Pick<PropertyWorkstream, "status" | "note" | "due_on" | "completion_evidence" | "completed_on" | "completion_evidence_id">>,
) {
  return must(await db.from("property_workstreams").update(patch).eq("id", id).select().single());
}

/** The owner's own records, as stored, with the journey computed from them. No one else's data; no user identifiers. */
export function journeyExport(d: PropertyJourney, computed: unknown, history: unknown[], exportedAt: string) {
  const { created_by: _c, ...property } = d.case;
  return {
    format: "tebos.property-journey/v1",
    exportedAt,
    property,
    problems: d.problems.map(({ created_by: _b, ...p }) => p),
    evidence: d.evidence,
    actions: d.actions,
    baseline: d.baseline ? (({ captured_by: _x, ...b }) => b)(d.baseline) : null,
    reviews: d.reviews,
    journey: computed,
    history,
  };
}
