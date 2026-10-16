import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AUTHORITY, BASES, CONFIDENCE, DISPOSITION_REASON_MIN, DISPOSITIONS, EVIDENCE_CATEGORIES, FIGURE_KEYS, FIGURES, GATES, OBJECTIVES, PATHWAYS,
  PROBLEMS, PROPERTY_TYPES, SPECIALISTS, SUSPECTED_CAUSES,
  APPROVALS, OUTCOME_KEYS, WORKSTREAM_STATUSES, checkWorkstream, scorecard, workstreamExceptions,
  type Actual, type Baseline, type OutcomeKey, type Review, type Workstream,
  checkDisposition, checkEvidence, checkFigure, checkGate, checkPathway, composeAssessment, economics, evidenceReadiness,
  EVIDENCE_CHECKLIST, isStale, money, type AssessmentInput, type EvidenceItem, type Figure, type FigureKey, type GateState,
} from "../src/domain/property";

const AS_OF = "2026-10-16T12:00:00Z";
const fig = (key: FigureKey, value: number, basis: Figure["basis"] = "verified"): Figure => ({ key, value, basis, asOf: "2026-10-01", evidenceId: basis === "verified" ? "ev" : null });

// a complete, reconciling set: 10 units, 1 vacant, R5,000 each
const FULL: Figure[] = [
  fig("units", 10), fig("vacant_units", 1),
  fig("scheduled_rent", 50_000), fig("other_income", 1_000), fig("vacancy_loss", 5_000),
  fig("rent_due", 45_000), fig("rent_collected", 40_500),
  fig("operating_expenses", 12_000), fig("debt_service", 15_000), fig("reserve", 2_000),
];

describe("property economics: unknown is not zero", () => {
  it("shows nothing until every input of a figure is supplied, and names what is missing", () => {
    const e = economics([fig("scheduled_rent", 50_000)]);
    expect(e.effectiveIncome.value).toBeNull();
    expect(e.effectiveIncome.missing).toEqual(["other_income", "vacancy_loss", "rent_due", "rent_collected"]);
    expect(e.cashFlow.value).toBeNull();
    expect(e.annual.cashFlow).toBeNull();
  });

  it("a supplied zero is a real zero", () => {
    const e = economics(FULL.map((f) => (f.key === "other_income" ? { ...f, value: 0 } : f)));
    expect(e.effectiveIncome.value).toBe(40_500);
  });

  it("calculates the documented formulas", () => {
    const e = economics(FULL);
    // 50,000 + 1,000 − 5,000 − (45,000 − 40,500)
    expect(e.collectionShortfall.value).toBe(4_500);
    expect(e.effectiveIncome.value).toBe(41_500);
    expect(e.noi.value).toBe(29_500);
    expect(e.cashFlow.value).toBe(12_500);
    expect(e.annual.cashFlow).toBe(150_000);
    expect(e.collectionRate.value).toBeCloseTo(90);
    expect(e.occupancy.value).toBeCloseTo(90);
    expect(e.expenseRatio.value).toBeCloseTo((12_000 / 41_500) * 100);
    expect(e.breakEvenOccupancy.value).toBeCloseTo((27_000 / 51_000) * 100);
    expect(e.warnings).toEqual([]);
  });

  it("counts vacancy and the collection shortfall once each, and flags a rent roll that doesn't reconcile", () => {
    // rent due should be scheduled − vacancy = 45,000; 50,000 means the vacant units' rent is in both
    const e = economics(FULL.map((f) => (f.key === "rent_due" ? { ...f, value: 50_000 } : f)));
    expect(e.warnings[0]).toMatch(/doesn't reconcile.*R45 000.*R50 000/);
  });

  it("flags collections above what was due and impossible occupancy, and leaves occupancy unknown", () => {
    const e = economics([...FULL.filter((f) => !["rent_collected", "vacant_units"].includes(f.key)), fig("rent_collected", 46_000), fig("vacant_units", 11)]);
    expect(e.warnings.some((w) => /More rent was collected/.test(w))).toBe(true);
    expect(e.warnings.some((w) => /more vacant units/.test(w))).toBe(true);
    expect(e.occupancy.value).toBeNull();
  });

  it("is only as strong as its weakest input", () => {
    const e = economics(FULL.map((f) => (f.key === "debt_service" ? { ...f, basis: "owner_reported" as const } : f)));
    expect(e.noi.basis).toBe("verified");
    expect(e.cashFlow.basis).toBe("owner_reported");
  });

  it("keeps forecasts as estimates, one-off costs out of monthly cash flow, and payback undefined at zero benefit", () => {
    const e = economics([...FULL, fig("uplift", 3_000, "estimated"), fig("implementation_cost", 18_000, "estimated"), fig("downside_impact", 4_000, "estimated"), fig("one_off_capex", 90_000)]);
    expect(e.scenarios.optimisation).toMatchObject({ value: 15_500, basis: "estimated" });
    expect(e.scenarios.downside.value).toBe(8_500);
    expect(e.scenarios.payback.value).toBe(6);
    expect(e.cashFlow.value).toBe(12_500);
    expect(e.oneOffCapex.value).toBe(90_000);
    expect(economics([...FULL, fig("uplift", 0, "estimated"), fig("implementation_cost", 1, "estimated")]).scenarios.payback.value).toBeNull();
  });

  it("formats rand without inventing precision", () => {
    expect(money(12_500.4)).toBe("R12 500");
    expect(money(-300)).toBe("−R300");
  });
});

describe("property figures", () => {
  it("refuse negatives, fractional units, a verified figure without checked evidence, and a forecast that isn't an estimate", () => {
    expect(checkFigure({ key: "rent_due", value: -1, basis: "owner_reported" }).ok).toBe(false);
    expect(checkFigure({ key: "units", value: 2.5, basis: "owner_reported" }).ok).toBe(false);
    expect(checkFigure({ key: "rent_due", value: 1, basis: "verified" }).ok).toBe(false);
    expect(checkFigure({ key: "rent_due", value: 1, basis: "verified", evidenceId: "e" }, { status: "received" }).ok).toBe(false);
    expect(checkFigure({ key: "rent_due", value: 1, basis: "verified", evidenceId: "e" }, { status: "checked" }).ok).toBe(true);
    expect(checkFigure({ key: "uplift", value: 1, basis: "owner_reported" }).ok).toBe(false);
    expect(checkFigure({ key: "uplift", value: 1, basis: "estimated" }).ok).toBe(true);
  });
});

describe("evidence readiness reflects material quality, not ticked boxes", () => {
  const item = (kind: string, status: EvidenceItem["status"], periodEnd: string | null = "2026-09-30"): EvidenceItem =>
    ({ id: `${kind}-${status}`, kind, title: kind, status, source: "s", periodEnd, receivedOn: "2026-10-01", confidence: "high" });

  it("weights material items, half-counts received or stale ones, and ignores requested ones", () => {
    const totalWeight = EVIDENCE_CHECKLIST.reduce((s, c) => s + c.weight, 0);
    expect(evidenceReadiness([], AS_OF).percent).toBe(0);
    expect(evidenceReadiness([item("rent_roll", "checked")], AS_OF).percent).toBe(Math.round((3 / totalWeight) * 100));
    expect(evidenceReadiness([item("rent_roll", "received")], AS_OF).percent).toBe(Math.round((1.5 / totalWeight) * 100));
    expect(evidenceReadiness([item("rent_roll", "requested")], AS_OF).percent).toBe(0);
    // checking the light "management process" item counts for less than the rent roll
    expect(evidenceReadiness([item("management", "checked")], AS_OF).percent).toBeLessThan(evidenceReadiness([item("rent_roll", "checked")], AS_OF).percent);
  });

  it("flags stale statements and conflicting items, and lists what is missing", () => {
    const r = evidenceReadiness([item("receipts", "checked", "2025-12-31"), item("debt", "conflicting")], AS_OF);
    expect(r.stale.map((s) => s.title)).toEqual(["receipts"]);
    expect(r.conflicting.map((s) => s.title)).toEqual(["debt"]);
    expect(r.missing.map((m) => m.kind)).toContain("rent_roll");
    expect(r.checked).toBe(0);
    expect(isStale({ kind: "leases", periodEnd: "2020-01-01", receivedOn: null }, AS_OF)).toBe(false); // undated kinds don't go stale
  });

  it("checks an item's own consistency", () => {
    const base = { status: "checked" as const, source: "Bank", confidence: "high" as const, receivedOn: "2026-10-01", notes: null, periodStart: null, periodEnd: null };
    expect(checkEvidence(base).ok).toBe(true);
    expect(checkEvidence({ ...base, source: " " }).ok).toBe(false);
    expect(checkEvidence({ ...base, receivedOn: null }).ok).toBe(false);
    expect(checkEvidence({ ...base, status: "conflicting", notes: null }).ok).toBe(false);
    expect(checkEvidence({ ...base, periodStart: "2026-09-01", periodEnd: "2026-08-01" }).ok).toBe(false);
  });
});

describe("dispositions, pathways and gates", () => {
  it("a disposition carries its reason, and PROCEED needs confirmed authority", () => {
    expect(checkDisposition({ authority: "confirmed" }, "nurture", "short").ok).toBe(false);
    expect(checkDisposition({ authority: "unconfirmed" }, "proceed", "Rent roll and statements received").ok).toBe(false);
    expect(checkDisposition({ authority: "confirmed" }, "proceed", "Rent roll and statements received").ok).toBe(true);
  });

  it("a recommendation explains itself; a rejection says why", () => {
    const p = { pathway: "keep_optimise" as const, status: "recommended" as const, rationale: "r", whyPreferred: "w", evidenceSummary: "e", decisionOwner: "Owner", wouldChange: null };
    expect(checkPathway(p).ok).toBe(false);
    expect(checkPathway({ ...p, wouldChange: "a lender offer" }).ok).toBe(true);
    expect(checkPathway({ ...p, status: "rejected", rationale: null }).ok).toBe(false);
  });

  it("gates pass in order, with an owner and evidence; the evidence gate needs authority and no conflicts; no reopening under a passed gate", () => {
    const passed = (gate: GateState["gate"]): GateState => ({ gate, status: "passed", owner: "T", note: "n" });
    const ctx = { authority: "confirmed" as const, conflicting: 0 };
    expect(checkGate([], passed("root_cause"), ctx).ok).toBe(false);
    expect(checkGate([], { ...passed("evidence"), owner: null }, ctx).ok).toBe(false);
    expect(checkGate([], passed("evidence"), { ...ctx, authority: "unconfirmed" }).ok).toBe(false);
    expect(checkGate([], passed("evidence"), { ...ctx, conflicting: 1 }).ok).toBe(false);
    expect(checkGate([], passed("evidence"), ctx).ok).toBe(true);
    expect(checkGate([passed("evidence")], passed("root_cause"), ctx).ok).toBe(true);
    const both = [passed("evidence"), passed("root_cause")];
    expect(checkGate(both, { gate: "evidence", status: "in_progress", owner: "T", note: null }, ctx).ok).toBe(false);
    expect(checkGate(both, { gate: "feasibility", status: "blocked", owner: null, note: null }, ctx).ok).toBe(false);
  });
});

describe("the assessment report", () => {
  const input = (over: Partial<AssessmentInput> = {}): AssessmentInput => ({
    case: {
      ref: "PA-001", label: "Case", propertyType: "residential_multi", problem: "underperforming_income", objective: "improve_cash_flow",
      suspectedCause: "collection", authority: "confirmed", constraints: null, desiredOutcome: null, disposition: "hold_optimise",
      dispositionReason: "Evidence incomplete; establish the baseline first.", dispositionAt: "2026-10-16T10:00:00Z", updatedAt: "2026-10-16T11:00:00Z",
    },
    evidence: [], figures: [], pathways: [], gates: [], asOf: AS_OF, ...over,
  });

  it("separates verified facts, owner statements and estimates, and lists every unknown", () => {
    const r = composeAssessment(input({ figures: [fig("rent_due", 45_000), fig("operating_expenses", 12_000, "owner_reported"), fig("uplift", 3_000, "estimated")] }));
    expect(r.verified.map((l) => l.label)).toEqual(["Rent due from occupied units"]);
    expect(r.ownerReported.map((l) => l.value)).toEqual(["R12 000"]);
    expect(r.estimates.map((l) => l.basis)).toEqual(["estimated"]);
    expect(r.unknowns).toContain("Scheduled rent, all units let: not supplied");
    expect(r.unknowns).toContain("Current rent roll: not obtained");
    expect(r.executive.join(" ")).toMatch(/not established: missing/);
    expect(r.recommendation).toBeNull();
    expect(r.meta).toMatchObject({ ref: "PA-001", version: "2026-10-16T11:00:00Z", generatedAt: AS_OF });
    expect(r.meta.confidentiality).toMatch(/not a valuation/);
  });

  it("reports the recommendation, the specialists of live pathways, and the next gate", () => {
    const pw = { risks: "Tenants push back", specialists: ["letting" as const], downside: null, disqualifiers: null, timeline: null, costOnceOff: null };
    const r = composeAssessment(input({
      figures: FULL,
      pathways: [
        { pathway: "keep_optimise", status: "recommended", rationale: "r", whyPreferred: "w", evidenceSummary: "e", decisionOwner: "Owner", wouldChange: "x", ...pw },
        { pathway: "sell_redeploy", status: "rejected", rationale: "Holding outperforms", whyPreferred: null, evidenceSummary: null, decisionOwner: null, wouldChange: null, ...pw, specialists: ["lender" as const] },
      ],
      gates: [{ gate: "evidence", status: "passed", owner: "T", note: "n" }],
    }));
    expect(r.recommendation?.pathway).toBe("keep_optimise");
    expect(r.specialists).toEqual(["Letting / property practitioner"]);
    expect(r.risks).toEqual(["Keep / optimise: Tenants push back"]);
    expect(r.executive.join(" ")).toMatch(/R12 500 \(verified basis\)/);
    expect(r.nextActions.at(-1)).toMatch(/Root-cause confirmation/);
  });
});

describe("property rules mirror the database", () => {
  const sql = readFileSync(join(__dirname, "..", "supabase", "migrations", "20261016150000_property_cases.sql"), "utf8");
  const exec = readFileSync(join(__dirname, "..", "supabase", "migrations", "20261016200000_property_execution.sql"), "utf8");
  const list = (column: string) => {
    const m = sql.match(new RegExp(`${column}\\s+text[^\\n]*?check \\(${column} in \\(([^)]*)\\)\\)`));
    expect(m, column).toBeTruthy();
    return [...m![1]!.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort();
  };
  it("lists the same dispositions, problems, objectives, causes, types, figures, pathways, statuses and gates", () => {
    expect(list("disposition")).toEqual(Object.keys(DISPOSITIONS).sort());
    expect(list("problem")).toEqual(Object.keys(PROBLEMS).sort());
    expect(list("objective")).toEqual(Object.keys(OBJECTIVES).sort());
    expect(list("suspected_cause")).toEqual(Object.keys(SUSPECTED_CAUSES).sort());
    expect(list("property_type")).toEqual([...PROPERTY_TYPES].sort());
    expect(list("authority")).toEqual(Object.keys(AUTHORITY).sort());
    expect(list("category")).toEqual(Object.keys(EVIDENCE_CATEGORIES).sort());
    expect(list("confidence")).toEqual([...CONFIDENCE].sort());
    expect(list("basis")).toEqual(Object.keys(BASES).sort());
    expect(list("pathway")).toEqual(Object.keys(PATHWAYS).sort());
    expect(list("gate")).toEqual(GATES.map((g) => g.key).sort());
    // the figure keys' latest definition: the execution migration widened them
    const keys = exec.match(/add constraint property_figures_key_check check \(key in \(([^)]*)\)\)/s)![1]!;
    expect([...keys.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort()).toEqual([...FIGURE_KEYS].sort());
    const forecasts = sql.match(/check \(key not in \(([^)]*)\) or basis = 'estimated'\)/)![1]!;
    expect([...forecasts.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort()).toEqual(FIGURE_KEYS.filter((k) => FIGURES[k].forecast).sort());
    const specialists = sql.match(/specialists <@ array\[([^\]]*)\]/)![1]!;
    expect([...specialists.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort()).toEqual(Object.keys(SPECIALISTS).sort());
    expect(sql).toMatch(/between 10 and 2000/);
    expect(DISPOSITION_REASON_MIN).toBe(10);
  });

  it("lists the same workstream statuses, approvals and outcome actuals", () => {
    const listIn = (src: string, column: string) => [...src.match(new RegExp(`${column}\\s+text[^\\n]*?check \\(${column} in \\(([^)]*)\\)\\)`))![1]!.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort();
    const ws = exec.slice(exec.indexOf("create table public.property_workstreams"));
    expect(listIn(ws, "status")).toEqual([...WORKSTREAM_STATUSES].sort());
    expect(listIn(ws, "approval")).toEqual(Object.keys(APPROVALS).sort());
    const ov = exec.slice(exec.indexOf("create table public.property_outcome_values"));
    expect([...ov.match(/key\s+text not null check \(key in \(([^)]*)\)\)/s)![1]!.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort()).toEqual([...OUTCOME_KEYS].sort());
    expect(listIn(ov, "basis")).toEqual(["owner_reported", "verified"]);
    // the baseline copies every figure except the forecasts
    expect([...exec.match(/f\.key not in \(([^)]*)\)/)![1]!.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort()).toEqual(FIGURE_KEYS.filter((k) => FIGURES[k].forecast).sort());
  });
});

describe("execution workstreams", () => {
  const ws = (over: Partial<Workstream> = {}): Workstream => ({
    id: "w1", title: "Reconcile arrears", owner: "Tidy", dueOn: "2026-10-20", status: "planned", dependsOn: null, budget: null,
    approval: "not_needed", approvedBy: null, approvedOn: null, completionEvidence: null, completedOn: null, note: null, ...over,
  });
  it("need an owner and deadline; a budget needs approval before it is spent; done needs evidence; blocked says why", () => {
    expect(checkWorkstream(ws({ owner: " " }), []).ok).toBe(false);
    expect(checkWorkstream(ws({ budget: 3500 }), []).ok).toBe(false);
    expect(checkWorkstream(ws({ budget: 3500, approval: "pending" }), []).ok).toBe(true);
    expect(checkWorkstream(ws({ budget: 3500, approval: "pending", status: "in_progress" }), []).ok).toBe(false);
    expect(checkWorkstream(ws({ budget: 3500, approval: "approved" }), []).ok).toBe(false);
    expect(checkWorkstream(ws({ budget: 3500, approval: "approved", approvedBy: "Owner", approvedOn: "2026-10-16", status: "in_progress" }), []).ok).toBe(true);
    expect(checkWorkstream(ws({ status: "done" }), []).ok).toBe(false);
    expect(checkWorkstream(ws({ status: "done", completionEvidence: "Ledger reconciled", completedOn: "2026-10-16" }), []).ok).toBe(true);
    expect(checkWorkstream(ws({ status: "blocked" }), []).ok).toBe(false);
  });
  it("start only after what they depend on is done, and never depend on themselves", () => {
    const first = ws({ id: "a" });
    const second = ws({ id: "b", dependsOn: "a", status: "in_progress" });
    expect(checkWorkstream(second, [first, second]).ok).toBe(false);
    expect(checkWorkstream(second, [{ ...first, status: "done", completionEvidence: "x", completedOn: "2026-10-16" }, second]).ok).toBe(true);
    expect(checkWorkstream({ ...first, dependsOn: "b" }, [first, { ...second, status: "planned" }]).ok).toBe(false);
  });
  it("raise overdue, blocked and awaiting-approval exceptions, and none for finished work", () => {
    const list = [ws({ id: "a", dueOn: "2026-10-01" }), ws({ id: "b", status: "blocked", note: "No quote" }), ws({ id: "c", budget: 900, approval: "pending" }),
      ws({ id: "d", dueOn: "2026-10-01", status: "done", completionEvidence: "x", completedOn: "2026-10-02" })];
    const ex = workstreamExceptions(list, "2026-10-16");
    expect(ex.map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(ex[2]!.reason).toMatch(/R900 awaiting approval/);
  });
});

describe("the outcome scorecard", () => {
  const baseline: Baseline = { capturedOn: "2026-09-01", figures: FULL.concat([fig("arrears_balance", 18_000, "owner_reported")]), targetCashFlow: 15_000 };
  const actual = (key: OutcomeKey, value: number): Actual => ({ key, value, basis: "owner_reported" });
  const review = (reviewOn: string, collected: number, arrears: number): Review => ({
    id: reviewOn, reviewOn,
    values: [...FULL.filter((f) => f.key !== "rent_collected").map((f) => actual(f.key as OutcomeKey, f.value)), actual("rent_collected", collected), actual("arrears_balance", arrears), actual("implementation_spent", 4_000)],
  });
  it("measures realised change against the frozen baseline and the target", () => {
    const s = scorecard(baseline, [review("2026-10-15", 43_000, 12_000)], "2026-10-16T00:00:00Z", "2026-11-15");
    expect(s.baseline?.economics.cashFlow.value).toBe(12_500);
    const r = s.rows[0]!;
    expect(r.cashFlowChange.value).toBe(2_500);
    expect(r.cashFlowChange.basis).toBe("owner_reported");
    expect(r.collectionChange.value).toBeCloseTo((43_000 / 45_000) * 100 - 90);
    expect(r.arrears).toEqual({ baseline: 18_000, actual: 12_000, change: -6_000 });
    expect(r.vsTarget).toBe(0);
    expect(r.implementationSpent).toBe(4_000);
    expect(s.flags).toEqual([]);
  });
  it("flags a fall below baseline or target, growing arrears and an overdue review; and says so when nothing can be measured", () => {
    const s = scorecard(baseline, [review("2026-10-15", 39_000, 20_000)], "2026-12-01T00:00:00Z", "2026-11-15");
    expect(s.flags.join(" ")).toMatch(/below the baseline/);
    expect(s.flags.join(" ")).toMatch(/short of the target/);
    expect(s.flags.join(" ")).toMatch(/Arrears have grown by R2 000/);
    expect(s.flags.join(" ")).toMatch(/2026-11-15 is overdue/);
    expect(scorecard(null, [], "2026-10-16T00:00:00Z", null).flags[0]).toMatch(/No baseline/);
    const partial = scorecard(baseline, [{ id: "p", reviewOn: "2026-10-15", values: [actual("rent_collected", 44_000)] }], "2026-10-16T00:00:00Z", null);
    expect(partial.rows[0]!.cashFlowChange.value).toBeNull();
    expect(partial.flags.join(" ")).toMatch(/can't be compared on cash flow: missing/);
  });
  it("the outcome gate needs a baseline and actuals", () => {
    const passed = (gate: GateState["gate"]): GateState => ({ gate, status: "passed", owner: "T", note: "n" });
    const four = [passed("evidence"), passed("root_cause"), passed("feasibility"), passed("authorisation")];
    const ctx = { authority: "confirmed" as const, conflicting: 0 };
    expect(checkGate(four, passed("outcome"), ctx).ok).toBe(false);
    expect(checkGate(four, passed("outcome"), { ...ctx, hasBaseline: true, actuals: 0 }).ok).toBe(false);
    expect(checkGate(four, passed("outcome"), { ...ctx, hasBaseline: true, actuals: 3 }).ok).toBe(true);
  });
});
