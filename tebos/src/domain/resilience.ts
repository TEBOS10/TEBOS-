// Strategic Resilience, slice 1: financial resilience (docs/resilience/blueprint.md §2–3).
//
// The founder's money picture across Tidy's structure: essential costs, income by stream and how often it pays,
// liquid reserves, debts and commitments, and from them how many months the money lasts.
//
// The rules (mirrored in migration 20261017040000_resilience_money.sql):
//   * Unknown is not zero. An item recorded without an amount makes anything that needs it "not established".
//   * Speculative income never counts as cash: runway uses reliable income only. Trading income and lump sums
//     (commissions, once-off fees) are always speculative until they arrive, when they become reserves.
//   * Reliable income is verified: it names the contract or statement it rests on.
//   * Every result is labelled by its weakest input, as in Property Revenue Architecture.
//   * No secrets in notes: secret-shaped text (keys, tokens, passwords) is refused.
import { fail, OK, type Check } from "./rules";

/** Tidy's structure (founder, 17 Oct 2026). Personal money is kept apart from the businesses. */
export const ENTITIES = {
  tidy: "Tidy",
  tidy_capital: "Tidy Capital",
  tidy_enterprise: "Tidy Enterprise",
  tebos: "TEBOS",
  irekun: "IREKUN",
  personal: "Personal",
} as const;
export type Entity = keyof typeof ENTITIES;

export const MONEY_KINDS = {
  essential_cost: "Essential cost",
  other_cost: "Other cost",
  income: "Income",
  reserve: "Reserve",
  debt: "Debt",
  commitment: "Commitment or contingent liability",
} as const;
export type MoneyKind = keyof typeof MONEY_KINDS;

/** Tidy Capital's income streams (founder, 17 Oct 2026). */
export const STREAMS = {
  forex_trading: "Forex trading (software)",
  tebos_retainer: "TEBOS retainers",
  agent_commission: "Real-estate agent work",
  pra_retainer: "Property Revenue Architect retainers",
  other: "Other income",
} as const;
export type Stream = keyof typeof STREAMS;

export const CADENCES = { daily: "Daily", weekly: "Weekly", monthly: "Monthly", yearly: "Yearly", lump_sum: "Lump sum" } as const;
export type Cadence = keyof typeof CADENCES;

export const RELIABILITY = { reliable: "Reliable", speculative: "Speculative" } as const;
export type Reliability = keyof typeof RELIABILITY;

export const MONEY_BASES = { verified: "Verified", stated: "Stated", estimated: "Estimate" } as const;
export type MoneyBasis = keyof typeof MONEY_BASES;
const BASIS_STRENGTH: Record<MoneyBasis, number> = { verified: 2, stated: 1, estimated: 0 };

/** Income that is never reliable, however it is described. */
export const ALWAYS_SPECULATIVE_STREAMS: readonly Stream[] = ["forex_trading"];

/** Debts due within this many days are taken off the reserves before runway is worked out. */
export const DEBT_HORIZON_DAYS = 90;
/** A reserve balance older than this is flagged: balances move. */
export const RESERVE_STALE_DAYS = 45;
/** One stream above this share of reliable income is a single point of failure. */
export const CONCENTRATION_SHARE = 0.5;

export const LABEL_MAX = 160;
export const NOTE_MAX = 1000;
export const REF_MAX = 300;

export interface MoneyItem {
  id: string;
  entity: Entity;
  kind: MoneyKind;
  label: string;
  /** null: it exists, but its amount isn't known yet. Never treated as zero. */
  amount: number | null;
  cadence: Cadence | null;
  stream: Stream | null;
  reliability: Reliability | null;
  liquid: boolean | null;
  basis: MoneyBasis;
  evidenceRef: string | null;
  dueOn: string | null;
  asOf: string;
  note: string | null;
}

const blank = (s: string | null | undefined) => !s || s.trim().length === 0;

/** Secret-shaped text: provider keys, tokens, private keys, and "password: …" style notes. */
const SECRET_PATTERNS: readonly RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b(sk|rk|pk)_(live|test)_[A-Za-z0-9]{8,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./,
  /\b(password|passwd|pwd|pin|passcode|secret|api[ _-]?key)\s*[:=]\s*\S+/i,
];

/** True when text looks like it holds a secret. The schema refuses it (threat model T10). */
export function looksSecret(text: string | null | undefined): boolean {
  return !!text && SECRET_PATTERNS.some((p) => p.test(text));
}

/** The rules for one item, checked before anything is sent; the database enforces the same. */
export function checkMoneyItem(i: Omit<MoneyItem, "id">): Check {
  if (blank(i.label) || i.label.trim().length > LABEL_MAX) return fail("TEBOS_VALIDATION", "Give it a name (up to 160 characters).");
  if (i.note && i.note.length > NOTE_MAX) return fail("TEBOS_VALIDATION", "Keep the note under 1,000 characters.");
  if (i.evidenceRef && i.evidenceRef.length > REF_MAX) return fail("TEBOS_VALIDATION", "Keep the reference under 300 characters.");
  if ([i.label, i.note, i.evidenceRef].some(looksSecret)) {
    return fail("TEBOS_VALIDATION", "This looks like a password, key or token. Secrets are never stored here: keep them in a password manager.");
  }
  if (i.amount !== null && (!Number.isFinite(i.amount) || i.amount < 0)) return fail("TEBOS_VALIDATION", "Enter an amount of zero or more, or leave it blank if unknown.");

  const flows = i.kind === "income" || i.kind === "essential_cost" || i.kind === "other_cost";
  if (flows && !i.cadence) return fail("TEBOS_VALIDATION", "Say how often it is paid.");
  if (!flows && i.cadence) return fail("TEBOS_VALIDATION", "Only income and costs have a cadence.");
  if (i.kind !== "income" && i.cadence === "lump_sum") return fail("TEBOS_VALIDATION", "A once-off payment is a debt or a commitment, not a recurring cost.");
  if (i.kind !== "income" && (i.stream || i.reliability)) return fail("TEBOS_VALIDATION", "Only income has a stream and a reliability.");
  if (i.kind !== "reserve" && i.liquid !== null) return fail("TEBOS_VALIDATION", "Only a reserve is liquid or not.");
  if (i.kind === "reserve" && i.liquid === null) return fail("TEBOS_VALIDATION", "Say whether the reserve can be used within a week (liquid).");

  if (i.kind === "income") {
    if (!i.stream || !i.reliability) return fail("TEBOS_VALIDATION", "Income needs its stream and whether it is reliable.");
    if (i.reliability === "reliable") {
      if (ALWAYS_SPECULATIVE_STREAMS.includes(i.stream)) return fail("TEBOS_VALIDATION", "Trading income is always speculative: it never counts as cash until it arrives.");
      if (i.cadence === "lump_sum") return fail("TEBOS_VALIDATION", "A lump sum is speculative until it arrives; then record it as a reserve.");
      if (i.basis !== "verified") return fail("TEBOS_VALIDATION", "Reliable income is verified: name the signed contract or the statement it rests on.");
    }
  }
  if (i.basis === "verified" && blank(i.evidenceRef)) return fail("TEBOS_VALIDATION", "A verified item names its document (a statement, contract or invoice).");
  return OK;
}

// ---------------------------------------------------------------------------
// Runway
// ---------------------------------------------------------------------------

/** Monthly equivalent of a recurring amount. Lump sums have none. */
export function monthly(amount: number, cadence: Cadence): number | null {
  switch (cadence) {
    case "daily": return (amount * 365) / 12;
    case "weekly": return (amount * 52) / 12;
    case "monthly": return amount;
    case "yearly": return amount / 12;
    case "lump_sum": return null;
  }
}

export interface Figure {
  /** null when not established */
  value: number | null;
  /** the items whose amounts are unknown, or what has not been recorded at all */
  missing: string[];
  /** the weakest basis among the inputs */
  basis: MoneyBasis | null;
  formula: string;
}

export type RunwayResult =
  | { state: "not_established"; missing: string[] }
  | { state: "covered"; basis: MoneyBasis | null }
  | { state: "months"; months: number; basis: MoneyBasis | null };

export interface Flag {
  level: "warning" | "info";
  text: string;
}

export interface Resilience {
  scope: Entity | "all";
  essentialCosts: Figure;
  otherCosts: Figure;
  reliableIncome: Figure;
  /** monthly equivalent of recurring speculative income: shown, never counted */
  speculativeIncome: Figure;
  /** expected lump sums (commissions, once-offs): shown, never counted */
  lumpSums: { label: string; amount: number | null; dueOn: string | null; stream: Stream | null }[];
  liquidReserves: Figure;
  illiquidReserves: Figure;
  debtsDueSoon: Figure;
  available: Figure;
  /** reliable income keeps coming */
  base: RunwayResult;
  /** every income stops */
  downside: RunwayResult;
  /** income by how often it pays, monthly equivalents (lump sums at face value) */
  byCadence: { cadence: Cadence; reliable: number; speculative: number; unknown: number }[];
  /** income by stream, monthly equivalents of recurring income */
  byStream: { stream: Stream; reliable: number; speculative: number; lumpSums: number; unknown: number }[];
  commitments: MoneyItem[];
  flags: Flag[];
}

function weakest(items: MoneyItem[]): MoneyBasis | null {
  let w: MoneyBasis | null = null;
  for (const i of items) if (w === null || BASIS_STRENGTH[i.basis] < BASIS_STRENGTH[w]) w = i.basis;
  return w;
}

function sum(items: MoneyItem[], formula: string, toMonthly: boolean): Figure {
  let total = 0;
  const missing: string[] = [];
  for (const i of items) {
    if (i.amount === null) { missing.push(i.label); continue; }
    total += toMonthly && i.cadence ? monthly(i.amount, i.cadence) ?? 0 : i.amount;
  }
  return { value: missing.length ? null : total, missing, basis: weakest(items), formula };
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(to.slice(0, 10)) - Date.parse(from.slice(0, 10))) / 86_400_000);

/**
 * The money picture for one entity, or for everything. `today` is an ISO date.
 * Base runway: available ÷ (essential costs − reliable income). Downside: available ÷ essential costs.
 * Available is liquid reserves less debts due within 90 days.
 */
export function resilience(all: MoneyItem[], today: string, scope: Entity | "all" = "all"): Resilience {
  const items = scope === "all" ? all : all.filter((i) => i.entity === scope);
  const of = (k: MoneyKind) => items.filter((i) => i.kind === k);
  const income = of("income");
  const recurring = income.filter((i) => i.cadence !== "lump_sum");
  const reliable = recurring.filter((i) => i.reliability === "reliable");
  const speculative = recurring.filter((i) => i.reliability === "speculative");
  const reserves = of("reserve");
  const debts = of("debt");
  const soon = debts.filter((d) => d.dueOn !== null && daysBetween(today, d.dueOn) <= DEBT_HORIZON_DAYS);

  const essentialCosts = sum(of("essential_cost"), "Σ essential costs, monthly", true);
  const otherCosts = sum(of("other_cost"), "Σ other costs, monthly", true);
  const reliableIncome = sum(reliable, "Σ reliable recurring income, monthly", true);
  const speculativeIncome = sum(speculative, "Σ speculative recurring income, monthly (not counted)", true);
  const liquidReserves = sum(reserves.filter((r) => r.liquid), "Σ liquid reserves", false);
  const illiquidReserves = sum(reserves.filter((r) => r.liquid === false), "Σ reserves that can't be used within a week (not counted)", false);
  const debtsDueSoon = sum(soon, `Σ debts due within ${DEBT_HORIZON_DAYS} days`, false);

  const availMissing = [...liquidReserves.missing, ...debtsDueSoon.missing];
  const available: Figure = {
    value: availMissing.length || liquidReserves.value === null || debtsDueSoon.value === null ? null : liquidReserves.value - debtsDueSoon.value,
    missing: availMissing,
    basis: weakest([...reserves.filter((r) => r.liquid), ...soon]),
    formula: "liquid reserves − debts due within 90 days",
  };

  const notRecorded: string[] = [];
  if (of("essential_cost").length === 0) notRecorded.push("essential costs (none recorded)");
  if (reserves.filter((r) => r.liquid).length === 0) notRecorded.push("liquid reserves (none recorded)");

  const runway = (costs: Figure, income: Figure | null, inputs: MoneyItem[]): RunwayResult => {
    const missing = [...notRecorded, ...costs.missing, ...(income?.missing ?? []), ...available.missing];
    if (missing.length || costs.value === null || available.value === null || (income && income.value === null)) {
      return { state: "not_established", missing };
    }
    const burn = costs.value - (income?.value ?? 0);
    const basis = weakest(inputs);
    if (burn <= 0) return { state: "covered", basis };
    return { state: "months", months: Math.max(0, available.value) / burn, basis };
  };
  const essentialAndAvailable = [...of("essential_cost"), ...reserves.filter((r) => r.liquid), ...soon];
  const base = runway(essentialCosts, reliableIncome, [...essentialAndAvailable, ...reliable]);
  const downside = runway(essentialCosts, null, essentialAndAvailable);

  const byCadence = (Object.keys(CADENCES) as Cadence[]).map((cadence) => {
    const row = { cadence, reliable: 0, speculative: 0, unknown: 0 };
    for (const i of income.filter((x) => x.cadence === cadence)) {
      if (i.amount === null) { row.unknown += 1; continue; }
      const v = cadence === "lump_sum" ? i.amount : monthly(i.amount, cadence) ?? 0;
      if (i.reliability === "reliable") row.reliable += v; else row.speculative += v;
    }
    return row;
  }).filter((r) => r.reliable || r.speculative || r.unknown);

  const byStream = (Object.keys(STREAMS) as Stream[]).map((stream) => {
    const row = { stream, reliable: 0, speculative: 0, lumpSums: 0, unknown: 0 };
    for (const i of income.filter((x) => x.stream === stream)) {
      if (i.amount === null) { row.unknown += 1; continue; }
      if (i.cadence === "lump_sum") row.lumpSums += i.amount;
      else if (i.reliability === "reliable") row.reliable += monthly(i.amount, i.cadence!) ?? 0;
      else row.speculative += monthly(i.amount, i.cadence!) ?? 0;
    }
    return row;
  }).filter((r) => r.reliable || r.speculative || r.lumpSums || r.unknown);

  const flags: Flag[] = [];
  for (const d of debts) {
    if (d.dueOn !== null) {
      const days = daysBetween(today, d.dueOn);
      if (days < 0) flags.push({ level: "warning", text: `${d.label}: due date passed (${d.dueOn}).` });
      else if (days <= 30) flags.push({ level: "warning", text: `${d.label}: due within 30 days (${d.dueOn}).` });
    }
  }
  for (const r of reserves) {
    if (daysBetween(r.asOf, today) > RESERVE_STALE_DAYS) flags.push({ level: "warning", text: `${r.label}: balance is from ${r.asOf}; update it.` });
  }
  for (const c of of("essential_cost")) if (c.amount === null) flags.push({ level: "warning", text: `${c.label}: amount unknown, so runway can't be established.` });
  const reliableTotal = reliableIncome.value ?? 0;
  if (reliableTotal > 0) {
    for (const s of byStream) {
      if (s.reliable / reliableTotal > CONCENTRATION_SHARE && reliable.length > 0) {
        flags.push({ level: "info", text: `${STREAMS[s.stream]} is ${Math.round((100 * s.reliable) / reliableTotal)}% of reliable income: a single point of failure.` });
      }
    }
  }
  if (reliable.length === 0 && income.length > 0) flags.push({ level: "info", text: "No income is verified as reliable yet: runway assumes none." });
  for (const c of of("commitment")) flags.push({ level: "info", text: `${c.label}: a commitment that could become payable${c.dueOn ? ` (${c.dueOn})` : ""}.` });

  return {
    scope,
    essentialCosts, otherCosts, reliableIncome, speculativeIncome,
    lumpSums: income.filter((i) => i.cadence === "lump_sum").map((i) => ({ label: i.label, amount: i.amount, dueOn: i.dueOn, stream: i.stream })),
    liquidReserves, illiquidReserves, debtsDueSoon, available,
    base, downside, byCadence, byStream,
    commitments: of("commitment"),
    flags,
  };
}

/** "4.5 months", "Covered by reliable income", or "Not established". */
export function runwayText(r: RunwayResult): string {
  if (r.state === "not_established") return "Not established";
  if (r.state === "covered") return "Covered by reliable income";
  return `${r.months >= 10 ? Math.floor(r.months) : Math.floor(r.months * 10) / 10} months`;
}
