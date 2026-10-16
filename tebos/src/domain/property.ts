// Property Revenue Architecture (Tidy Enterprise; docs/property-revenue-architecture.md).
// A property case goes from intake, through an evidence register and labelled
// economic figures, to a compared set of pathways, five decision gates and an
// assessment report. Mirrors the rules of migration property_cases so the
// interface can explain and pre-check them; the database is the final authority.
//
// Integrity rules, from the founder's dossier:
//   * Unknown is not zero: a figure that wasn't supplied has no row, and every
//     calculation that needs it says so instead of showing a number.
//   * Every figure says what it is: verified (against evidence that was
//     checked), stated by the owner, or estimated. A calculation is only as
//     strong as its weakest input, and says so.
//   * Losses are counted once: vacancy loss and the collection shortfall
//     (rent due less rent collected) are separate inputs, and a rent roll that
//     doesn't reconcile is flagged, never silently netted.
//   * Forecasts (uplift, implementation cost, downside) are always estimates.

import { OK, fail, type Check } from "./rules";

// ---------------------------------------------------------------------------
// Case record
// ---------------------------------------------------------------------------

export const DISPOSITIONS = {
  proceed: { label: "PROCEED", meaning: "Enough evidence and a credible problem to justify a scoped assessment." },
  nurture: { label: "NURTURE", meaning: "Potential fit, but timing, documents, authority or urgency is not ready." },
  hold_optimise: { label: "HOLD–OPTIMISE", meaning: "Stabilise or improve operations before any larger transaction." },
  do_nothing: { label: "DO NOTHING", meaning: "No intervention is justified now; the reason and review triggers are recorded." },
  reject: { label: "REJECT", meaning: "Outside capability, unacceptable risk, no authority, poor fit or no credible path to value." },
} as const;
export type Disposition = keyof typeof DISPOSITIONS;

export const PROBLEMS = {
  underperforming_income: "Underperforming rental income",
  arrears_distress: "Arrears / financial distress",
  underutilised: "Underutilised property",
  unclear_strategy: "Unclear property strategy",
} as const;
export type Problem = keyof typeof PROBLEMS;

export const OBJECTIVES = {
  improve_cash_flow: "Improve monthly cash flow",
  resolve_arrears: "Resolve arrears / reduce exposure",
  long_term_value: "Improve long-term asset value",
  release_capital: "Release capital or exit",
} as const;
export type Objective = keyof typeof OBJECTIVES;

export const SUSPECTED_CAUSES = {
  unknown: "Not yet known",
  collection: "Rent collection / arrears",
  vacancy: "Vacancy / slow tenant placement",
  pricing: "Rental pricing",
  expenses: "Operating / maintenance costs",
  debt: "Debt service pressure",
} as const;
export type SuspectedCause = keyof typeof SUSPECTED_CAUSES;

export const PROPERTY_TYPES = ["residential_multi", "single_residential", "mixed_use", "commercial", "other"] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];
export const PROPERTY_TYPE_LABEL: Record<PropertyType, string> = {
  residential_multi: "Residential multi-unit", single_residential: "Single residential rental", mixed_use: "Mixed-use",
  commercial: "Commercial", other: "Other",
};

export const AUTHORITY = { unconfirmed: "Not yet confirmed", confirmed: "Confirmed and recorded", issue: "Unclear / issue to resolve" } as const;
export type Authority = keyof typeof AUTHORITY;

export const DISPOSITION_REASON_MIN = 10;

/** A disposition always carries its reason; PROCEED needs the owner's authority confirmed. Mirrors guard_property_case. */
export function checkDisposition(c: { authority: Authority }, next: Disposition, reason: string): Check {
  if (reason.trim().length < DISPOSITION_REASON_MIN) {
    return fail("TEBOS_VALIDATION", `Give the reason and evidence for ${DISPOSITIONS[next].label} (at least ${DISPOSITION_REASON_MIN} characters).`);
  }
  if (next === "proceed" && c.authority !== "confirmed") {
    return fail("TEBOS_VALIDATION", "PROCEED needs the owner's authority confirmed and recorded first.");
  }
  return OK;
}

// ---------------------------------------------------------------------------
// Evidence register
// ---------------------------------------------------------------------------

export const EVIDENCE_CATEGORIES = {
  income: "Rental income",
  expenses_debt: "Expenses and debt",
  asset_operations: "Asset and operations",
  market: "Market",
  authority: "Ownership and authority",
} as const;
export type EvidenceCategory = keyof typeof EVIDENCE_CATEGORIES;

export const EVIDENCE_STATUSES = ["missing", "requested", "received", "checked", "conflicting"] as const;
export type EvidenceStatus = (typeof EVIDENCE_STATUSES)[number];
export const CONFIDENCE = ["high", "medium", "low"] as const;
export type Confidence = (typeof CONFIDENCE)[number];

/** The material evidence a case needs. Weight is how much it matters to the decision; dated items go stale. */
export const EVIDENCE_CHECKLIST = [
  { kind: "rent_roll", category: "income", title: "Current rent roll", hint: "Rent per unit, lease dates, occupancy and deposits.", weight: 3, dated: true },
  { kind: "receipts", category: "income", title: "6–12 month collection history", hint: "Rent due compared with actual cash receipts.", weight: 3, dated: true },
  { kind: "vacancy", category: "income", title: "Vacancy history", hint: "Vacant units, duration and lost rent.", weight: 2, dated: true },
  { kind: "leases", category: "income", title: "Lease and arrears records", hint: "Terms, balances, disputes and payment plans.", weight: 2, dated: false },
  { kind: "municipal", category: "expenses_debt", title: "Municipal statements", hint: "Rates, utilities and other applicable charges.", weight: 2, dated: true },
  { kind: "expenses", category: "expenses_debt", title: "Operating expense evidence", hint: "Invoices, insurance, management and recurring costs.", weight: 3, dated: true },
  { kind: "maintenance", category: "expenses_debt", title: "Maintenance records", hint: "Repairs, recurring faults, quotes and deferred work.", weight: 1, dated: false },
  { kind: "debt", category: "expenses_debt", title: "Debt / bond statement", hint: "Balance, instalment, rate and other obligations.", weight: 3, dated: true },
  { kind: "schedule", category: "asset_operations", title: "Property / unit schedule", hint: "Unit types, rentable units, use and occupancy.", weight: 1, dated: false },
  { kind: "condition", category: "asset_operations", title: "Condition and compliance information", hint: "Known defects, safety concerns and relevant approvals.", weight: 1, dated: false },
  { kind: "management", category: "asset_operations", title: "Management process", hint: "Rent collection, follow-ups, maintenance and approvals.", weight: 1, dated: false },
  { kind: "market", category: "market", title: "Comparable rental evidence", hint: "Comparable units, location, condition and actual demand.", weight: 2, dated: true },
] as const satisfies ReadonlyArray<{ kind: string; category: EvidenceCategory; title: string; hint: string; weight: number; dated: boolean }>;
export type ChecklistKind = (typeof EVIDENCE_CHECKLIST)[number]["kind"];

/** A dated statement older than this (from its period end, else its received date) is stale. */
export const STALE_AFTER_DAYS = 180;

export interface EvidenceItem {
  id: string;
  kind: string;
  title: string;
  status: EvidenceStatus;
  source: string | null;
  periodEnd: string | null;
  receivedOn: string | null;
  confidence: Confidence | null;
}

const DAY = 86_400_000;

export function isStale(item: Pick<EvidenceItem, "kind" | "periodEnd" | "receivedOn">, asOf: string): boolean {
  const spec = EVIDENCE_CHECKLIST.find((c) => c.kind === item.kind);
  if (!spec?.dated) return false;
  const ref = item.periodEnd ?? item.receivedOn;
  if (!ref) return false;
  return Date.parse(asOf) - Date.parse(ref) > STALE_AFTER_DAYS * DAY;
}

/** How much an item counts toward readiness: checked and current counts fully; received, or checked but stale, half; the rest nothing. */
export function evidenceQuality(item: EvidenceItem, asOf: string): number {
  if (item.status === "checked") return isStale(item, asOf) ? 0.5 : 1;
  if (item.status === "received") return 0.5;
  return 0;
}

export interface Readiness {
  /** 0..100, weighted by how material each kind of evidence is and by its quality. */
  percent: number;
  checked: number;
  total: number;
  missing: Array<{ kind: string; title: string }>;
  stale: Array<{ id: string; title: string }>;
  conflicting: Array<{ id: string; title: string }>;
}

/** Readiness reflects material evidence quality, not the number of boxes ticked. The best item of each kind counts. */
export function evidenceReadiness(items: EvidenceItem[], asOf: string): Readiness {
  let got = 0;
  let total = 0;
  let checked = 0;
  const missing: Readiness["missing"] = [];
  for (const spec of EVIDENCE_CHECKLIST) {
    total += spec.weight;
    const mine = items.filter((i) => i.kind === spec.kind);
    const best = Math.max(0, ...mine.map((i) => evidenceQuality(i, asOf)));
    got += spec.weight * best;
    if (mine.some((i) => i.status === "checked" && !isStale(i, asOf))) checked += 1;
    if (best === 0) missing.push({ kind: spec.kind, title: spec.title });
  }
  return {
    percent: Math.round((got / total) * 100),
    checked,
    total: EVIDENCE_CHECKLIST.length,
    missing,
    stale: items.filter((i) => i.status === "checked" && isStale(i, asOf)).map((i) => ({ id: i.id, title: i.title })),
    conflicting: items.filter((i) => i.status === "conflicting").map((i) => ({ id: i.id, title: i.title })),
  };
}

/** Mirrors the evidence checks in migration property_cases. */
export function checkEvidence(e: { status: EvidenceStatus; source: string | null; confidence: Confidence | null; receivedOn: string | null; notes: string | null; periodStart: string | null; periodEnd: string | null }): Check {
  if (e.periodStart && e.periodEnd && e.periodStart > e.periodEnd) return fail("TEBOS_VALIDATION", "The period starts after it ends.");
  if (["received", "checked", "conflicting"].includes(e.status) && !e.receivedOn) return fail("TEBOS_VALIDATION", "Record the date the document was received.");
  if (e.status === "checked" && (!e.source?.trim() || !e.confidence)) return fail("TEBOS_VALIDATION", "A checked item needs its source and your confidence in it.");
  if (e.status === "conflicting" && !e.notes?.trim()) return fail("TEBOS_VALIDATION", "Say what conflicts, in the reconciliation notes.");
  return OK;
}

// ---------------------------------------------------------------------------
// Economic figures (monthly, rand)
// ---------------------------------------------------------------------------

export const FIGURES = {
  units: { label: "Rentable units", group: "asset", money: false, forecast: false },
  vacant_units: { label: "Vacant units", group: "asset", money: false, forecast: false },
  scheduled_rent: { label: "Scheduled rent, all units let", group: "income", money: true, forecast: false },
  other_income: { label: "Other property income", group: "income", money: true, forecast: false },
  vacancy_loss: { label: "Vacancy loss (rent of vacant units)", group: "income", money: true, forecast: false },
  rent_due: { label: "Rent due from occupied units", group: "income", money: true, forecast: false },
  rent_collected: { label: "Rent actually collected", group: "income", money: true, forecast: false },
  operating_expenses: { label: "Operating expenses", group: "costs", money: true, forecast: false },
  debt_service: { label: "Debt service", group: "costs", money: true, forecast: false },
  reserve: { label: "Maintenance / capital reserve", group: "costs", money: true, forecast: false },
  one_off_capex: { label: "One-off capital need (not monthly)", group: "costs", money: true, forecast: false },
  uplift: { label: "Estimated monthly net benefit of the plan", group: "scenario", money: true, forecast: true },
  implementation_cost: { label: "Once-off implementation cost", group: "scenario", money: true, forecast: true },
  downside_impact: { label: "Monthly downside impact (stress test)", group: "scenario", money: true, forecast: true },
} as const;
export type FigureKey = keyof typeof FIGURES;
export const FIGURE_KEYS = Object.keys(FIGURES) as FigureKey[];

export const BASES = { verified: "Verified", owner_reported: "Owner-reported", estimated: "Estimate" } as const;
export type Basis = keyof typeof BASES;
const BASIS_RANK: Record<Basis, number> = { verified: 0, owner_reported: 1, estimated: 2 };

export interface Figure {
  key: FigureKey;
  value: number;
  basis: Basis;
  asOf: string;
  evidenceId?: string | null;
}

/** Mirrors the figure checks in migration property_cases. */
export function checkFigure(f: { key: FigureKey; value: number; basis: Basis; evidenceId?: string | null }, evidence?: { status: EvidenceStatus } | null): Check {
  if (!Number.isFinite(f.value) || f.value < 0) return fail("TEBOS_VALIDATION", "Enter a number of zero or more.");
  if ((f.key === "units" || f.key === "vacant_units") && !Number.isInteger(f.value)) return fail("TEBOS_VALIDATION", "Units are whole numbers.");
  if (FIGURES[f.key].forecast && f.basis !== "estimated") return fail("TEBOS_VALIDATION", "A forecast is always an estimate.");
  if (f.basis === "verified") {
    if (!f.evidenceId) return fail("TEBOS_VALIDATION", "A verified figure names the evidence it was checked against.");
    if (evidence && evidence.status !== "checked") return fail("TEBOS_VALIDATION", "Only evidence marked checked can verify a figure.");
  }
  return OK;
}

export interface Metric {
  /** null when an input is missing or the result is undefined (e.g. dividing by zero) */
  value: number | null;
  /** inputs that weren't supplied */
  missing: FigureKey[];
  /** the weakest basis among its inputs: a calculation is only as strong as that */
  basis: Basis | null;
  formula: string;
}

export interface Economics {
  effectiveIncome: Metric;
  collectionShortfall: Metric;
  noi: Metric;
  cashFlow: Metric;
  collectionRate: Metric;
  occupancy: Metric;
  expenseRatio: Metric;
  breakEvenOccupancy: Metric;
  annual: { effectiveIncome: number | null; noi: number | null; cashFlow: number | null };
  scenarios: { base: Metric; optimisation: Metric; downside: Metric; payback: Metric };
  oneOffCapex: Metric;
  warnings: string[];
}

function metric(figs: Map<FigureKey, Figure>, keys: FigureKey[], formula: string, compute: (v: Record<string, number>) => number | null): Metric {
  const missing = keys.filter((k) => !figs.has(k));
  const present = keys.map((k) => figs.get(k)).filter((f): f is Figure => !!f);
  const basis = present.length ? present.map((f) => f.basis).sort((a, b) => BASIS_RANK[b] - BASIS_RANK[a])[0]! : null;
  if (missing.length) return { value: null, missing, basis, formula };
  const v = Object.fromEntries(present.map((f) => [f.key, f.value]));
  const out = compute(v);
  return { value: out === null || !Number.isFinite(out) ? null : out, missing, basis, formula };
}

/** Combine two metrics' inputs: missing from either, weakest basis of both. */
function combine(a: Metric, b: Metric, formula: string, f: (x: number, y: number) => number | null): Metric {
  const missing = [...new Set([...a.missing, ...b.missing])];
  const bases = [a.basis, b.basis].filter((x): x is Basis => !!x);
  const basis = bases.length ? bases.sort((x, y) => BASIS_RANK[y] - BASIS_RANK[x])[0]! : null;
  const value = a.value === null || b.value === null ? null : f(a.value, b.value);
  return { value: value === null || !Number.isFinite(value) ? null : value, missing, basis, formula };
}

const ROUNDING = 0.5;

export function economics(list: Figure[]): Economics {
  const figs = new Map(list.map((f) => [f.key, f]));
  const warnings: string[] = [];

  const collectionShortfall = metric(figs, ["rent_due", "rent_collected"], "Rent due − rent collected", (v) => v.rent_due! - v.rent_collected!);
  const effectiveIncome = metric(figs, ["scheduled_rent", "other_income", "vacancy_loss", "rent_due", "rent_collected"],
    "Scheduled rent + other income − vacancy loss − collection shortfall",
    (v) => v.scheduled_rent! + v.other_income! - v.vacancy_loss! - (v.rent_due! - v.rent_collected!));
  const noi = combine(effectiveIncome, metric(figs, ["operating_expenses"], "", (v) => v.operating_expenses!),
    "Effective income − operating expenses", (x, y) => x - y);
  const cashFlow = combine(noi, metric(figs, ["debt_service", "reserve"], "", (v) => v.debt_service! + v.reserve!),
    "NOI − debt service − reserve", (x, y) => x - y);
  const collectionRate = metric(figs, ["rent_due", "rent_collected"], "Rent collected ÷ rent due",
    (v) => (v.rent_due! > 0 ? (v.rent_collected! / v.rent_due!) * 100 : null));
  const occupancy = metric(figs, ["units", "vacant_units"], "(Units − vacant units) ÷ units",
    (v) => (v.units! > 0 && v.vacant_units! <= v.units! ? ((v.units! - v.vacant_units!) / v.units!) * 100 : null));
  const expenseRatio = combine(metric(figs, ["operating_expenses"], "", (v) => v.operating_expenses!), effectiveIncome,
    "Operating expenses ÷ effective income", (opex, inc) => (inc > 0 ? (opex / inc) * 100 : null));
  const breakEvenOccupancy = metric(figs, ["operating_expenses", "debt_service", "scheduled_rent", "other_income"],
    "(Operating expenses + debt service) ÷ (scheduled rent + other income)",
    (v) => (v.scheduled_rent! + v.other_income! > 0 ? ((v.operating_expenses! + v.debt_service!) / (v.scheduled_rent! + v.other_income!)) * 100 : null));

  // reconciliation and sanity: flagged, never silently netted
  const sched = figs.get("scheduled_rent")?.value, vac = figs.get("vacancy_loss")?.value, due = figs.get("rent_due")?.value;
  if (sched !== undefined && vac !== undefined && due !== undefined && Math.abs(sched - vac - due) > ROUNDING) {
    warnings.push(`The rent roll doesn't reconcile: scheduled rent less vacancy loss is ${money(sched - vac)}, but rent due is ${money(due)}. A loss may be counted twice or missing.`);
  }
  const col = figs.get("rent_collected")?.value;
  if (due !== undefined && col !== undefined && col > due + ROUNDING) {
    warnings.push("More rent was collected than was due: arrears recovered from earlier months inflate this month. Check the period.");
  }
  const u = figs.get("units")?.value, vu = figs.get("vacant_units")?.value;
  if (u !== undefined && vu !== undefined && vu > u) warnings.push("There are more vacant units than rentable units.");

  const base = { ...cashFlow, formula: "Cash flow after debt and reserve" };
  const optimisation = combine(cashFlow, metric(figs, ["uplift"], "", (v) => v.uplift!), "Base cash flow + estimated net benefit (estimate)", (x, y) => x + y);
  const downside = combine(cashFlow, metric(figs, ["downside_impact"], "", (v) => v.downside_impact!), "Base cash flow − downside impact (stress test)", (x, y) => x - y);
  const payback = metric(figs, ["implementation_cost", "uplift"], "Implementation cost ÷ monthly net benefit, in months",
    (v) => (v.uplift! > 0 ? v.implementation_cost! / v.uplift! : null));
  const oneOffCapex = metric(figs, ["one_off_capex"], "One-off, kept out of monthly cash flow", (v) => v.one_off_capex!);

  const year = (m: Metric) => (m.value === null ? null : m.value * 12);
  return {
    effectiveIncome, collectionShortfall, noi, cashFlow, collectionRate, occupancy, expenseRatio, breakEvenOccupancy,
    annual: { effectiveIncome: year(effectiveIncome), noi: year(noi), cashFlow: year(cashFlow) },
    scenarios: { base, optimisation, downside, payback },
    oneOffCapex,
    warnings,
  };
}

export function money(n: number): string {
  // grouped by hand, so every browser and the server print the same thing
  const s = String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${n < 0 ? "−" : ""}R${s}`;
}

// ---------------------------------------------------------------------------
// Pathways
// ---------------------------------------------------------------------------

export const PATHWAYS = {
  keep_optimise: { label: "Keep / optimise", useWhen: "The asset can be improved without a major capital event.", tests: "Net cash flow, vacancy, costs, rent evidence, operating capability." },
  stabilise_resolve: { label: "Stabilise / resolve arrears", useWhen: "Arrears, municipal or levy debt must be brought under control first.", tests: "Arrears ageing, payment plans, liquidity, legal position." },
  refinance_capital: { label: "Refinance / finance-readiness", useWhen: "A capital event may improve the balance sheet or fund a viable plan.", tests: "Lender criteria, affordability, valuation, debt service, eligibility." },
  develop_convert: { label: "Develop / convert", useWhen: "Additional lawful use or density may create a stronger economic outcome.", tests: "Zoning, approvals, feasibility, capex, programme, demand, downside." },
  sell_redeploy: { label: "Sell / redeploy capital", useWhen: "Sale may outperform holding, or required capital exceeds capacity.", tests: "Net proceeds, liabilities, taxes and costs, alternatives, redeployment plan." },
  exit_resolve: { label: "Exit / resolve exposure", useWhen: "The position isn't sustainable under realistic assumptions.", tests: "Liability exposure, time pressure, legal advice, least-damaging exit." },
  do_nothing: { label: "Do nothing", useWhen: "Intervention costs or risks exceed likely benefits, or evidence is insufficient.", tests: "Opportunity cost, monitoring triggers, explicit rationale." },
} as const;
export type PathwayKey = keyof typeof PATHWAYS;

export const SPECIALISTS = {
  letting: "Letting / property practitioner",
  accounting: "Accountant / tax practitioner",
  legal: "Attorney",
  technical: "Qualified building / planning professional",
  lender: "Lender / finance specialist",
} as const;
export type Specialist = keyof typeof SPECIALISTS;

export const PATHWAY_STATUSES = ["considered", "recommended", "rejected"] as const;
export type PathwayStatus = (typeof PATHWAY_STATUSES)[number];

export interface PathwayRecord {
  pathway: PathwayKey;
  status: PathwayStatus;
  rationale: string | null;
  whyPreferred: string | null;
  evidenceSummary: string | null;
  decisionOwner: string | null;
  wouldChange: string | null;
}

/** A recommendation says why, why over the alternatives, on what evidence, who decides and what would change it. Mirrors the database check. */
export function checkPathway(p: PathwayRecord): Check {
  const blank = (s: string | null) => !s?.trim();
  if (p.status === "recommended") {
    if ([p.rationale, p.whyPreferred, p.evidenceSummary, p.decisionOwner, p.wouldChange].some(blank)) {
      return fail("TEBOS_VALIDATION", "A recommendation needs its rationale, why it beats the alternatives, the evidence, the decision owner and what would change it.");
    }
  }
  if (p.status === "rejected" && blank(p.rationale)) return fail("TEBOS_VALIDATION", "Say why this pathway was rejected.");
  return OK;
}

// ---------------------------------------------------------------------------
// Decision gates
// ---------------------------------------------------------------------------

export const GATES = [
  { key: "evidence", title: "Evidence sufficiency", question: "Can ownership authority, income, expenses, debt and material constraints be established?" },
  { key: "root_cause", title: "Root-cause confirmation", question: "Is underperformance traced to identifiable, material drivers rather than assumptions?" },
  { key: "feasibility", title: "Intervention feasibility", question: "Does the proposed action plausibly create net benefit after costs, timing and risk?" },
  { key: "authorisation", title: "Execution authorisation", question: "Are permissions, specialist scope, quotations, budget and owners confirmed?" },
  { key: "outcome", title: "Outcome verification", question: "Has actual post-intervention performance been measured against the baseline?" },
] as const;
export type GateKey = (typeof GATES)[number]["key"];
export const GATE_STATUSES = ["not_started", "in_progress", "passed", "blocked"] as const;
export type GateStatus = (typeof GATE_STATUSES)[number];

export interface GateState { gate: GateKey; status: GateStatus; owner: string | null; note: string | null }

/**
 * Gates pass in order, each with an owner and the evidence for passing; a gate
 * can't reopen while a later one stands passed; the evidence gate needs the
 * owner's authority confirmed and no conflicting evidence. Mirrors guard_property_gate.
 */
export function checkGate(
  gates: GateState[],
  next: GateState,
  ctx: { authority: Authority; conflicting: number },
): Check {
  const order = GATES.map((g) => g.key);
  const i = order.indexOf(next.gate);
  const statusOf = (k: GateKey) => gates.find((g) => g.gate === k)?.status ?? "not_started";
  if (next.status === "passed") {
    if (!next.owner?.trim() || !next.note?.trim()) return fail("TEBOS_VALIDATION", "A gate passes with an owner and the evidence for passing it.");
    if (i > 0 && statusOf(order[i - 1]!) !== "passed") return fail("TEBOS_VALIDATION", `"${GATES[i - 1]!.title}" must pass first.`);
    if (next.gate === "evidence") {
      if (ctx.authority !== "confirmed") return fail("TEBOS_VALIDATION", "The evidence gate needs the owner's authority confirmed.");
      if (ctx.conflicting > 0) return fail("TEBOS_VALIDATION", "Resolve conflicting evidence before passing the evidence gate.");
    }
  } else if (statusOf(next.gate) === "passed" && order.slice(i + 1).some((k) => statusOf(k) === "passed")) {
    return fail("TEBOS_VALIDATION", "Reopen the later gates first: a gate can't reopen while a later one stands passed.");
  }
  if (next.status === "blocked" && !next.note?.trim()) return fail("TEBOS_VALIDATION", "Say what is blocking this gate.");
  return OK;
}

// ---------------------------------------------------------------------------
// The Property Opportunity Assessment report
// ---------------------------------------------------------------------------

export const REPORT_CONFIDENTIALITY =
  "Confidential: prepared for the property owner named in this case. Decision support only: not a valuation, legal opinion, credit decision, " +
  "financing offer or guarantee of property performance. Legal, regulatory, tax, zoning and financing requirements must be confirmed with the relevant professionals.";

export interface AssessmentInput {
  case: {
    ref: string;
    label: string;
    propertyType: PropertyType | null;
    problem: Problem;
    objective: Objective;
    suspectedCause: SuspectedCause;
    authority: Authority;
    constraints: string | null;
    desiredOutcome: string | null;
    disposition: Disposition;
    dispositionReason: string;
    dispositionAt: string;
    updatedAt: string;
  };
  evidence: Array<EvidenceItem & { notes: string | null; followUp: string | null }>;
  figures: Figure[];
  pathways: Array<PathwayRecord & { risks: string | null; specialists: Specialist[]; downside: string | null; disqualifiers: string | null; timeline: string | null; costOnceOff: number | null }>;
  gates: GateState[];
  /** when the report is generated (ISO); every date judgement uses it */
  asOf: string;
}

export interface FactLine { label: string; value: string; basis: Basis; asOf: string }

export interface Assessment {
  meta: { ref: string; title: string; generatedAt: string; version: string; confidentiality: string };
  executive: string[];
  verified: FactLine[];
  ownerReported: FactLine[];
  estimates: FactLine[];
  unknowns: string[];
  sourceQuality: Readiness;
  economics: Economics;
  rootCause: string[];
  pathways: AssessmentInput["pathways"];
  recommendation: AssessmentInput["pathways"][number] | null;
  risks: string[];
  specialists: string[];
  gates: Array<{ title: string; status: GateStatus; owner: string | null; note: string | null }>;
  nextActions: string[];
}

const figureText = (f: Figure) => (FIGURES[f.key].money ? money(f.value) : String(f.value));

export function composeAssessment(input: AssessmentInput): Assessment {
  const c = input.case;
  const econ = economics(input.figures);
  const ready = evidenceReadiness(input.evidence, input.asOf);
  const line = (f: Figure): FactLine => ({ label: FIGURES[f.key].label, value: figureText(f), basis: f.basis, asOf: f.asOf });
  const supplied = new Set(input.figures.map((f) => f.key));
  const recommended = input.pathways.find((p) => p.status === "recommended") ?? null;

  const executive = [
    `${PROBLEMS[c.problem]}. Owner objective: ${OBJECTIVES[c.objective].toLowerCase()}.`,
    `Disposition: ${DISPOSITIONS[c.disposition].label}: ${c.dispositionReason}`,
    econ.cashFlow.value === null
      ? `Monthly cash flow after debt and reserve is not established: ${econ.cashFlow.missing.length ? `missing ${econ.cashFlow.missing.map((k) => FIGURES[k].label.toLowerCase()).join(", ")}` : "the figures don't allow it"}.`
      : `Monthly cash flow after debt and reserve: ${money(econ.cashFlow.value)} (${BASES[econ.cashFlow.basis!].toLowerCase()} basis).`,
    `Evidence readiness ${ready.percent}%: ${ready.checked} of ${ready.total} material items checked and current.`,
    recommended ? `Recommended pathway: ${PATHWAYS[recommended.pathway].label}.` : "No pathway is recommended yet.",
  ];

  const unknowns = [
    ...FIGURE_KEYS.filter((k) => !FIGURES[k].forecast && !supplied.has(k)).map((k) => `${FIGURES[k].label}: not supplied`),
    ...ready.missing.map((m) => `${m.title}: not obtained`),
    ...(c.authority !== "confirmed" ? [`Owner authority: ${AUTHORITY[c.authority].toLowerCase()}`] : []),
  ];

  const rootCause = [
    c.suspectedCause === "unknown"
      ? "The cause of underperformance is not yet known."
      : `Suspected cause (not yet verified): ${SUSPECTED_CAUSES[c.suspectedCause].toLowerCase()}.`,
    ...(econ.collectionRate.value !== null ? [`Rent collection rate ${econ.collectionRate.value.toFixed(1)}% (${BASES[econ.collectionRate.basis!].toLowerCase()}).`] : []),
    ...(econ.occupancy.value !== null ? [`Physical occupancy ${econ.occupancy.value.toFixed(1)}% (${BASES[econ.occupancy.basis!].toLowerCase()}).`] : []),
    ...(econ.expenseRatio.value !== null ? [`Operating expense ratio ${econ.expenseRatio.value.toFixed(1)}% (${BASES[econ.expenseRatio.basis!].toLowerCase()}).`] : []),
    ...econ.warnings,
  ];

  const risks = [
    ...input.pathways.filter((p) => p.status !== "rejected" && p.risks?.trim()).map((p) => `${PATHWAYS[p.pathway].label}: ${p.risks!.trim()}`),
    ...ready.conflicting.map((e) => `Conflicting evidence: ${e.title}`),
    ...ready.stale.map((e) => `Stale evidence: ${e.title}`),
  ];
  const specialists = [...new Set(input.pathways.filter((p) => p.status !== "rejected").flatMap((p) => p.specialists))].map((s) => SPECIALISTS[s]);

  const gateState = (k: GateKey) => input.gates.find((g) => g.gate === k);
  const gates = GATES.map((g) => ({ title: g.title, status: gateState(g.key)?.status ?? "not_started", owner: gateState(g.key)?.owner ?? null, note: gateState(g.key)?.note ?? null }));
  const nextGate = GATES.find((g) => (gateState(g.key)?.status ?? "not_started") !== "passed");

  const nextActions = [
    ...(c.authority !== "confirmed" ? ["Confirm and record the owner's authority and mandate."] : []),
    ...ready.conflicting.map((e) => `Reconcile the conflicting evidence: ${e.title}.`),
    ...ready.missing.slice(0, 6).map((m) => `Obtain: ${m.title.toLowerCase()}.`),
    ...input.evidence.filter((e) => e.followUp?.trim() && e.status !== "checked").map((e) => `${e.title}: ${e.followUp!.trim()}`),
    ...(nextGate ? [`Work toward gate "${nextGate.title}": ${nextGate.question}`] : ["All gates passed: keep measuring against the baseline."]),
  ];

  return {
    meta: {
      ref: c.ref,
      title: `Property Opportunity Assessment · ${c.ref}`,
      generatedAt: input.asOf,
      // the version is the moment of the case's last change, so two reports of an unchanged case match
      version: c.updatedAt,
      confidentiality: REPORT_CONFIDENTIALITY,
    },
    executive,
    verified: input.figures.filter((f) => f.basis === "verified").map(line),
    ownerReported: input.figures.filter((f) => f.basis === "owner_reported").map(line),
    estimates: input.figures.filter((f) => f.basis === "estimated").map(line),
    unknowns,
    sourceQuality: ready,
    economics: econ,
    rootCause,
    pathways: input.pathways,
    recommendation: recommended,
    risks,
    specialists,
    gates,
    nextActions,
  };
}
