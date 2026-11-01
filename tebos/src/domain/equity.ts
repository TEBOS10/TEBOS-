// The equity programme (ADR 0013; migration 20261101220000_equity_programme.sql): a business that can't pay can work
// with TEBOS for 5% equity and 5.1% voting rights, if it qualifies, with the founder's approval and a signed agreement,
// and while it records its sales in TEBOS. TEBOS never sees bank accounts. The database enforces every rule here;
// test/schema-parity.test.ts keeps the numbers and lists in step.
import type { EquityApplicationStatus } from "./states";

/** The founder's terms (1 Nov 2026). Changing them is a founder decision and a migration. */
export const EQUITY_PCT = 5;
export const VOTING_PCT = 5.1;
/** At most this many equity partners at once, so the programme can't swallow TEBOS's capacity. */
export const MAX_EQUITY_PARTNERS = 5;
export const MIN_TRADING_MONTHS = 6;

export const ELIGIBLE_SECTORS = {
  practice: "Practice (medical, dental, legal, accounting)",
  education: "Education and tutoring",
  trades: "Trades and call-outs",
  hospitality: "Hospitality and food",
  retail: "Retail",
  property: "Property",
  beauty_wellness: "Beauty and wellness",
  creative_services: "Creative services",
  logistics: "Logistics and transport",
  other: "Something else (not eligible)",
} as const;
export type Sector = keyof typeof ELIGIBLE_SECTORS;

export const REVENUE_BANDS = {
  none: "No revenue yet",
  under_10k: "Under R10,000 a month",
  "10k_50k": "R10,000 to R50,000 a month",
  "50k_200k": "R50,000 to R200,000 a month",
  over_200k: "Over R200,000 a month",
} as const;
export type RevenueBand = keyof typeof REVENUE_BANDS;
export const QUALIFYING_BANDS: ReadonlySet<RevenueBand> = new Set<RevenueBand>(["10k_50k", "50k_200k", "over_200k"]);

export const EQUITY_STATUS_LABEL: Record<EquityApplicationStatus, string> = {
  applied: "Applied",
  screening: "Being screened",
  qualified: "Qualifies: waiting for the founder",
  approved: "Approved: agreement to sign",
  agreement_signed: "Agreement signed",
  active: "Equity partner",
  declined: "Declined",
  withdrawn: "Withdrawn",
  exited: "Ended",
};

export interface EquityApplicationFacts {
  registrationNumber: string | null;
  tradingSince: string | null;
  sector: Sector;
  revenueBand: RevenueBand;
  revenueEvidenceNote: string | null;
  ownerFullTime: boolean;
  reportingConsent: boolean;
}

export const CIPC_NUMBER = /^[0-9]{4}\/[0-9]{6}\/[0-9]{2}$/;

const monthsBefore = (iso: string, months: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
};

/** What stops an application qualifying, in plain words; empty means it qualifies (mirrors equity_qualification_gaps). */
export function qualificationGaps(a: EquityApplicationFacts, today: string): string[] {
  const out: string[] = [];
  if (!a.registrationNumber || !CIPC_NUMBER.test(a.registrationNumber)) out.push("registration: a CIPC registration number (e.g. 2019/123456/07)");
  if (!a.tradingSince || a.tradingSince > monthsBefore(today, MIN_TRADING_MONTHS)) out.push(`trading: at least ${MIN_TRADING_MONTHS} months of trading`);
  if (a.sector === "other") out.push("sector: an eligible kind of business");
  if (!QUALIFYING_BANDS.has(a.revenueBand)) out.push("revenue: at least R10,000 a month");
  if ((a.revenueEvidenceNote ?? "").trim().length < 20) out.push("evidence: what was seen to confirm the revenue");
  if (!a.ownerFullTime) out.push("owner: an owner working in the business full time");
  if (!a.reportingConsent) out.push("consent: the owner agrees to record every sale in TEBOS");
  return out;
}

export type AuditFlag = "close_overdue" | "no_sales" | "heavy_corrections" | "sharp_drop";
export const AUDIT_FLAG_LABEL: Record<AuditFlag, string> = {
  close_overdue: "Month not closed a week after it ended",
  no_sales: "No sales recorded in a finished month",
  heavy_corrections: "Corrections above 10% of sales",
  sharp_drop: "Less than half the average of the three months before",
};

export interface MonthTotals { period: string; closed: boolean; sales: number; refunds: number; corrections: number; count: number }

/** The audit's flags for each month, newest first in, newest first out (mirrors equity_audit). */
export function auditFlags(months: MonthTotals[], today: string): Array<MonthTotals & { net: number; flags: AuditFlag[] }> {
  const asc = [...months].sort((a, b) => a.period.localeCompare(b.period));
  const nets = asc.map((m) => m.sales + m.refunds + m.corrections);
  const addMonths = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
  const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const out = asc.map((m, i) => {
    const ended = addMonths(m.period, 1) <= today;
    const prior = nets.slice(Math.max(0, i - 3), i);
    const avg = prior.length ? prior.reduce((s, n) => s + n, 0) / prior.length : 0;
    const flags: AuditFlag[] = [];
    if (!m.closed && addDays(addMonths(m.period, 1), 7) < today) flags.push("close_overdue");
    if (m.count === 0 && ended) flags.push("no_sales");
    if (Math.abs(m.corrections) > 0.1 * Math.max(m.sales, 1)) flags.push("heavy_corrections");
    if (ended && avg > 0 && nets[i]! < 0.5 * avg) flags.push("sharp_drop");
    return { ...m, net: nets[i]!, flags };
  });
  return out.reverse();
}

