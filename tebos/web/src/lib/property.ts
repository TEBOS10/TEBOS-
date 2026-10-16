// Converts the property tables' rows into the domain's shapes, so the
// interface, the report and the exports all compute from one place
// (@core/property). Nothing here computes a figure of its own.
import {
  composeAssessment, type Actual, type ActualBasis, type AssessmentInput, type ApprovalState, type Baseline, type OutcomeKey, type Review,
  type Workstream, type WorkstreamStatus, type Authority, type Basis, type Confidence, type Disposition, type EvidenceItem,
  type EvidenceStatus, type Figure, type FigureKey, type GateKey, type GateState, type GateStatus, type Objective, type PathwayKey,
  type PathwayStatus, type Problem, type PropertyType, type Specialist, type SuspectedCause,
} from "@core/property";
import type {
  PropertyActual, PropertyBaseline, PropertyCase, PropertyEvidence, PropertyFigure, PropertyGate, PropertyPathway, PropertyReview, PropertyWorkstream,
} from "./data";

type CaseData = {
  case: PropertyCase; evidence: PropertyEvidence[]; figures: PropertyFigure[]; pathways: PropertyPathway[]; gates: PropertyGate[];
  workstreams?: PropertyWorkstream[]; baseline?: PropertyBaseline | null; reviews?: PropertyReview[]; actuals?: PropertyActual[];
};

export const toWorkstream = (w: PropertyWorkstream): Workstream => ({
  id: w.id, title: w.title, owner: w.owner, dueOn: w.due_on, status: w.status as WorkstreamStatus, dependsOn: w.depends_on,
  budget: w.budget === null ? null : Number(w.budget), approval: w.approval as ApprovalState, approvedBy: w.approved_by, approvedOn: w.approved_on,
  completionEvidence: w.completion_evidence, completedOn: w.completed_on, note: w.note,
});

export const toBaseline = (b: PropertyBaseline): Baseline => ({
  capturedOn: b.captured_on,
  figures: (b.figures as Array<{ key: string; value: number | string; basis: string; as_of: string; evidence_id: string | null }>).map((f) => ({
    key: f.key as FigureKey, value: Number(f.value), basis: f.basis as Basis, asOf: f.as_of, evidenceId: f.evidence_id,
  })),
  targetCashFlow: b.target_cash_flow === null ? null : Number(b.target_cash_flow),
});

export const toReviews = (reviews: PropertyReview[], actuals: PropertyActual[]): Review[] =>
  reviews.map((r) => ({
    id: r.id, reviewOn: r.review_on,
    values: actuals.filter((a) => a.review_id === r.id).map((a): Actual => ({ key: a.key as OutcomeKey, value: Number(a.value), basis: a.basis as ActualBasis, evidenceId: a.evidence_id })),
  }));

export const toFigure = (f: PropertyFigure): Figure => ({
  key: f.key as FigureKey, value: Number(f.value), basis: f.basis as Basis, asOf: f.as_of, evidenceId: f.evidence_id,
});

export const toEvidence = (e: Pick<PropertyEvidence, "id" | "kind" | "title" | "status" | "source" | "period_end" | "received_on" | "confidence">): EvidenceItem => ({
  id: e.id, kind: e.kind, title: e.title, status: e.status as EvidenceStatus, source: e.source,
  periodEnd: e.period_end, receivedOn: e.received_on, confidence: e.confidence as Confidence | null,
});

export const toGate = (g: PropertyGate): GateState => ({ gate: g.gate as GateKey, status: g.status as GateStatus, owner: g.owner, note: g.note });

export function assessmentInput(data: CaseData, asOf: string): AssessmentInput {
  const c = data.case;
  return {
    case: {
      ref: c.ref, label: c.label, propertyType: c.property_type as PropertyType | null, problem: c.problem as Problem,
      objective: c.objective as Objective, suspectedCause: c.suspected_cause as SuspectedCause, authority: c.authority as Authority,
      constraints: c.constraints, desiredOutcome: c.desired_outcome, disposition: c.disposition as Disposition,
      dispositionReason: c.disposition_reason, dispositionAt: c.disposition_at, updatedAt: c.updated_at,
    },
    evidence: data.evidence.map((e) => ({ ...toEvidence(e), notes: e.notes, followUp: e.follow_up })),
    figures: data.figures.map(toFigure),
    pathways: data.pathways.map((p) => ({
      pathway: p.pathway as PathwayKey, status: p.status as PathwayStatus, rationale: p.rationale, whyPreferred: p.why_preferred,
      evidenceSummary: p.evidence_summary, decisionOwner: p.decision_owner, wouldChange: p.would_change, risks: p.risks,
      specialists: p.specialists as Specialist[], downside: p.downside, disqualifiers: p.disqualifiers, timeline: p.timeline,
      costOnceOff: p.cost_once_off === null ? null : Number(p.cost_once_off),
    })),
    gates: data.gates.map(toGate),
    workstreams: (data.workstreams ?? []).map(toWorkstream),
    baseline: data.baseline ? toBaseline(data.baseline) : null,
    reviews: toReviews(data.reviews ?? [], data.actuals ?? []),
    nextReviewOn: c.next_review_on ?? null,
    asOf,
  };
}

export const assess = (data: CaseData, asOf = new Date().toISOString()) => composeAssessment(assessmentInput(data, asOf));

/** The structured export: the case's records as stored, plus the computed assessment. No personal data beyond the case's own. */
export function caseExport(data: CaseData, asOf = new Date().toISOString()) {
  const { created_by: _by, ...caseRow } = data.case;
  return {
    format: "tidy-enterprise.property-case/v1",
    exportedAt: asOf,
    case: caseRow,
    evidence: data.evidence,
    figures: data.figures.map(({ recorded_by: _r, ...f }) => f),
    pathways: data.pathways,
    gates: data.gates,
    workstreams: data.workstreams ?? [],
    baseline: data.baseline ? (({ captured_by: _c, ...b }) => b)(data.baseline) : null,
    reviews: (data.reviews ?? []).map((r) => ({ ...r, actuals: (data.actuals ?? []).filter((a) => a.review_id === r.id).map(({ recorded_by: _r, ...a }) => a) })),
    assessment: assess(data, asOf),
  };
}
