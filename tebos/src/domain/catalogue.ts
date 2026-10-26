// The template catalogue (founder's master blueprint, 23 Oct 2026, §5 and §7.2): each industry archetype is an
// internal product, versioned, with its three tiers' workflow and part counts and the evidence behind it. The
// database enforces every rule here (migration template_catalogue); this mirror lets the interface and REEDS explain
// a refusal before it happens, and builds a draft record from a blueprint's editions.
//
// A template is never offered because it was built: a person approves it with its tests, and it goes on sale only
// with evidence that the customer's problem is real.

import { blueprintByKey } from "./blueprints";
import { BOARD_LIMITS, TIERS, TIER_NAMES, edition, type Tier } from "./editions";
import type { RuleCode } from "./rules";
import { canTransition, type CatalogueTemplateStatus } from "./states";

export const VALIDATION_STATES = ["evidence_backed", "promising", "speculative"] as const;
export type ValidationState = (typeof VALIDATION_STATES)[number];
export const VALIDATION_LABEL: Record<ValidationState, string> = {
  evidence_backed: "Evidence-backed",
  promising: "Promising but unverified",
  speculative: "Speculative",
};

export const CATALOGUE_STATUS_LABEL: Record<CatalogueTemplateStatus, string> = {
  draft: "Draft",
  ready_for_qa: "Ready for QA",
  blocked: "Blocked",
  approved_internal: "Approved internal template",
  available_for_sale: "Available for sale",
  deprecated: "Deprecated",
};

export const FACTORY_OUTCOMES = ["completed", "blocked", "deferred"] as const;
export type FactoryOutcome = (typeof FACTORY_OUTCOMES)[number];

export type TierCounts = Record<Tier, { workflows: number; parts: number }>;

export interface TemplateRecord {
  blueprintKey: string;
  version: number;
  industry: string;
  archetypeName: string;
  problemStatement?: string | null;
  targetCustomer?: string | null;
  buyer?: string | null;
  successMetric?: string | null;
  evidence?: string | null;
  validationState: ValidationState;
  status: CatalogueTemplateStatus;
  counts: TierCounts;
  setupSteps?: string | null;
  testReport?: string | null;
  knownLimitations?: string | null;
  rollbackPlan?: string | null;
  blocker?: string | null;
}

export interface Refusal {
  code: RuleCode;
  message: string;
}

const filled = (s: string | null | undefined) => (s ?? "").trim().length > 0;

/** Each tier's workflows and parts as its edition lays them down, for an industry (and optionally a kind). */
export function tierCounts(blueprintKey: string, variantKey?: string): TierCounts | undefined {
  const base = blueprintByKey(blueprintKey);
  if (!base) return undefined;
  const out = {} as TierCounts;
  for (const t of TIERS) {
    const e = edition(base, t, variantKey);
    out[t] = { workflows: e.flows.length, parts: e.pieces.length };
  }
  return out;
}

/** Why the counts can't be catalogued: a tier over its plan's ceiling, or a larger tier holding less. */
export function countProblems(counts: TierCounts): Refusal[] {
  const out: Refusal[] = [];
  for (const t of TIERS) {
    const { workflows, parts } = counts[t];
    const cap = BOARD_LIMITS[t];
    if (workflows > cap.flows || parts > cap.pieces) {
      out.push({
        code: "TEBOS_OUT_OF_PLAN",
        message: `${TIER_NAMES[t]} has ${workflows} workflows and ${parts} parts; its ceiling is ${cap.flows} and ${cap.pieces}`,
      });
    }
  }
  for (let i = 1; i < TIERS.length; i++) {
    const a = counts[TIERS[i - 1]!], b = counts[TIERS[i]!];
    if (a.workflows > b.workflows || a.parts > b.parts) {
      out.push({ code: "TEBOS_VALIDATION", message: `${TIER_NAMES[TIERS[i]!]} includes ${TIER_NAMES[TIERS[i - 1]!]}, so its counts can't be lower` });
    }
  }
  return out;
}

/**
 * Why a template can't move to `to`, as the database would refuse it. `byPlatformAdmin` is whether the person making
 * the change is a signed-in platform admin; REEDS and the server never are.
 */
export function gateProblems(t: TemplateRecord, to: CatalogueTemplateStatus, byPlatformAdmin: boolean): Refusal[] {
  if (!canTransition("catalogue_template", t.status, to)) {
    return [{ code: "TEBOS_ILLEGAL_TRANSITION", message: `${CATALOGUE_STATUS_LABEL[t.status]} can't become ${CATALOGUE_STATUS_LABEL[to]}` }];
  }
  const out = countProblems(t.counts);
  if (to === "ready_for_qa") {
    if (!(filled(t.problemStatement) && filled(t.targetCustomer) && filled(t.buyer) && filled(t.successMetric))) {
      out.push({ code: "TEBOS_VALIDATION", message: "Say whose problem it is, who pays, and how success is measured" });
    }
    if (t.counts.starter.workflows === 0 || t.counts.starter.parts === 0) {
      out.push({ code: "TEBOS_VALIDATION", message: "Every tier needs at least one workflow and one part" });
    }
  } else if (to === "blocked") {
    if (!filled(t.blocker)) out.push({ code: "TEBOS_VALIDATION", message: "Name what is blocking the template" });
  } else if (to === "approved_internal" || to === "available_for_sale" || to === "deprecated") {
    if (!byPlatformAdmin) {
      out.push({ code: "TEBOS_PERMISSION_DENIED", message: "Only a signed-in platform admin approves, sells or retires a template" });
    }
    if (to === "approved_internal" && !(filled(t.testReport) && filled(t.setupSteps) && filled(t.knownLimitations) && filled(t.rollbackPlan))) {
      out.push({ code: "TEBOS_EVIDENCE_REQUIRED", message: "Approval needs the test report, setup steps, known limitations and rollback plan" });
    }
    if (to === "available_for_sale" && (t.validationState !== "evidence_backed" || !filled(t.evidence))) {
      out.push({ code: "TEBOS_EVIDENCE_REQUIRED", message: "A template goes on sale only with evidence that the customer's problem is real" });
    }
  }
  return out;
}

/** Why a factory run can't be recorded with this outcome. */
export function factoryRunProblems(
  outcome: FactoryOutcome,
  run: { evidence?: string | null; blocker?: string | null },
  templateStatus: CatalogueTemplateStatus,
): Refusal[] {
  if (outcome === "completed") {
    if (!filled(run.evidence)) return [{ code: "TEBOS_EVIDENCE_REQUIRED", message: "A completed run needs its evidence: the tests and what changed" }];
    if (!["ready_for_qa", "approved_internal", "available_for_sale"].includes(templateStatus)) {
      return [{ code: "TEBOS_EVIDENCE_REQUIRED", message: "A run is completed only when its template has at least reached QA" }];
    }
  }
  if (outcome === "blocked" && !filled(run.blocker)) return [{ code: "TEBOS_VALIDATION", message: "Name what blocked the run" }];
  return [];
}

/**
 * A first draft for an industry's blueprint: the counts its editions lay down, speculative until someone records
 * evidence. The customer, buyer and problem stay empty: they come from real conversations, never from the template.
 */
export function draftFromBlueprint(blueprintKey: string, version = 1): TemplateRecord | undefined {
  const base = blueprintByKey(blueprintKey);
  const counts = tierCounts(blueprintKey);
  if (!base || !counts) return undefined;
  return {
    blueprintKey: base.key,
    version,
    industry: base.industry,
    archetypeName: base.name,
    validationState: "speculative",
    status: "draft",
    counts,
  };
}
