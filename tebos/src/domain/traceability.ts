// The evidence graph (dossier §5/§13/§15).
//
// Answers "Why did TEBOS say this?" and "What evidence supports this action?"
// by walking source -> evidence -> finding -> action. When support cannot be
// established the answer says what is missing instead of filling the gap.

import { fail, OK, type Check } from "./rules";

export type EvidenceState =
  | "acquired"
  | "partially_acquired"
  | "unavailable"
  | "stale"
  | "conflicting"
  | "unsupported"
  | "user_supplied"
  | "system_generated";

/** Evidence states that can support a finding. Mirrors tebos_private.check_finding_supported. */
export const SUPPORTING_STATES: ReadonlySet<EvidenceState> = new Set<EvidenceState>([
  "acquired",
  "partially_acquired",
  "user_supplied",
  "system_generated",
  "stale",
  "conflicting",
]);

/** States that still support, but weaken what they support. */
export const CAVEAT_STATES: ReadonlySet<EvidenceState> = new Set<EvidenceState>([
  "partially_acquired",
  "stale",
  "conflicting",
  "user_supplied",
]);

export type EvidenceRelation = "supports" | "contradicts" | "context";

export interface SourceNode {
  id: string;
  sourceType: string;
  uri: string | null;
}

export interface EvidenceNode {
  id: string;
  businessId: string;
  sourceId: string;
  state: EvidenceState;
  fact: string | null;
  missingDescription: string | null;
  excerpt: string | null;
  retrievedAt: string | null;
}

export interface FindingNode {
  id: string;
  businessId: string;
  title: string;
  kind: "interpretation" | "hypothesis";
  status: "draft" | "active" | "superseded" | "dismissed";
  confidence: number;
  missingInformation: string[];
}

export interface EvidenceLink {
  findingId: string;
  evidenceId: string;
  relation: EvidenceRelation;
}

export interface ActionNode {
  id: string;
  findingId: string;
  title: string;
}

export interface EvidenceGraph {
  sources: ReadonlyMap<string, SourceNode>;
  evidence: ReadonlyMap<string, EvidenceNode>;
  findings: ReadonlyMap<string, FindingNode>;
  links: readonly EvidenceLink[];
  actions: ReadonlyMap<string, ActionNode>;
}

export interface CitedEvidence {
  evidence: EvidenceNode;
  source: SourceNode | null;
  caveat: EvidenceState | null;
}

export interface FindingExplanation {
  finding: FindingNode;
  supporting: CitedEvidence[];
  contradicting: CitedEvidence[];
  context: CitedEvidence[];
  /** Linked evidence that was never obtained — shown, not hidden. */
  unobtained: CitedEvidence[];
  missing: string[];
  support: Check;
}

export function assessFindingSupport(
  finding: Pick<FindingNode, "id" | "businessId">,
  links: readonly EvidenceLink[],
  evidence: ReadonlyMap<string, EvidenceNode>,
): Check {
  const supports = links.filter((l) => l.findingId === finding.id && l.relation === "supports");
  for (const l of supports) {
    const e = evidence.get(l.evidenceId);
    if (e && e.businessId !== finding.businessId) {
      return fail("TEBOS_FINDING_UNSUPPORTED", `Evidence ${e.id} belongs to a different business`);
    }
  }
  const usable = supports.map((l) => evidence.get(l.evidenceId)).filter((e) => e && SUPPORTING_STATES.has(e.state));
  return usable.length > 0
    ? OK
    : fail("TEBOS_FINDING_UNSUPPORTED", "No obtained evidence supports this finding");
}

export function explainFinding(graph: EvidenceGraph, findingId: string): FindingExplanation | null {
  const finding = graph.findings.get(findingId);
  if (!finding) return null;

  const cite = (e: EvidenceNode): CitedEvidence => ({
    evidence: e,
    source: graph.sources.get(e.sourceId) ?? null,
    caveat: CAVEAT_STATES.has(e.state) ? e.state : null,
  });

  const out: FindingExplanation = {
    finding,
    supporting: [],
    contradicting: [],
    context: [],
    unobtained: [],
    missing: [...finding.missingInformation],
    support: assessFindingSupport(finding, graph.links, graph.evidence),
  };

  for (const link of graph.links) {
    if (link.findingId !== findingId) continue;
    const e = graph.evidence.get(link.evidenceId);
    if (!e) {
      out.missing.push(`Linked evidence ${link.evidenceId} is not available to this view`);
      continue;
    }
    if (!SUPPORTING_STATES.has(e.state)) {
      out.unobtained.push(cite(e));
      if (e.missingDescription) out.missing.push(e.missingDescription);
      continue;
    }
    if (link.relation === "supports") out.supporting.push(cite(e));
    else if (link.relation === "contradicts") out.contradicting.push(cite(e));
    else out.context.push(cite(e));
  }
  return out;
}

export interface ActionExplanation {
  action: ActionNode;
  because: FindingExplanation | null;
}

/** "What evidence supports this action?" */
export function explainAction(graph: EvidenceGraph, actionId: string): ActionExplanation | null {
  const action = graph.actions.get(actionId);
  if (!action) return null;
  return { action, because: explainFinding(graph, action.findingId) };
}
