// Tidy Property Operations: the rental ledger's arithmetic (ADR 0023). Mirrors migration 20261104090000_property_
// operations (ops_pro_rata, ops_lease_positions, ops_month_summary); test/opsLedger.test.ts proves the rules and the
// schema parity test keeps the lists identical. Money is integer cents throughout: no floating point touches an amount.

export const UNIT_TYPES = [
  { key: "bachelor", label: "Bachelor" },
  { key: "one_bed", label: "1 bedroom" },
  { key: "two_bed", label: "2 bedrooms" },
  { key: "three_bed_plus", label: "3+ bedrooms" },
  { key: "house", label: "House" },
  { key: "room", label: "Room" },
  { key: "shop", label: "Shop" },
  { key: "office", label: "Office" },
  { key: "other", label: "Other" },
] as const;
export type UnitType = (typeof UNIT_TYPES)[number]["key"];

export const PROVINCES = ["Eastern Cape", "Free State", "Gauteng", "KwaZulu-Natal", "Limpopo", "Mpumalanga", "North West",
  "Northern Cape", "Western Cape"] as const;

export const ENTRY_KINDS = ["charge", "payment", "credit", "refund", "reversal"] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];
export const CHARGE_CATEGORIES = [
  { key: "rent", label: "Rent" },
  { key: "deposit", label: "Deposit" },
  { key: "utilities", label: "Utilities" },
  { key: "damage", label: "Damage" },
  { key: "other", label: "Other" },
] as const;
export type ChargeCategory = (typeof CHARGE_CATEGORIES)[number]["key"];
export const PAYMENT_METHODS = [
  { key: "eft", label: "EFT" },
  { key: "cash", label: "Cash" },
  { key: "debit_order", label: "Debit order" },
  { key: "card", label: "Card" },
  { key: "other", label: "Other" },
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]["key"];
export type Account = "rent" | "deposit";

export const MAINTENANCE_PRIORITIES = ["low", "normal", "urgent"] as const;

export interface Entry {
  id: string;
  kind: EntryKind;
  account: Account;
  category: ChargeCategory | null;
  amount_cents: number;
  effective_on: string; // YYYY-MM-DD
  reverses_id: string | null;
  created_at?: string;
}

// ---------------------------------------------------------------------------
// Dates (calendar dates as YYYY-MM-DD strings; compared and counted in UTC so no time zone can shift a day)
// ---------------------------------------------------------------------------
const toDay = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
export const daysBetween = (from: string, to: string) => Math.round((toDay(to) - toDay(from)) / 86_400_000);
export const addDays = (d: string, n: number) => new Date(toDay(d) + n * 86_400_000).toISOString().slice(0, 10);
export const monthStart = (d: string) => `${d.slice(0, 7)}-01`;
export const nextMonth = (m: string) => {
  const y = Number(m.slice(0, 4)), mo = Number(m.slice(5, 7));
  return mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, "0")}-01`;
};
/** Today's date in South Africa. */
export const saToday = (now = new Date()) => new Date(now.getTime() + 2 * 3_600_000).toISOString().slice(0, 10);

/**
 * The rent for one month of a lease that covers only part of it: rent × days covered ÷ days in the month, rounded half
 * up to the cent, in integer arithmetic. `ended` is the last day of the lease, if it has ended.
 */
export function proRata(rentCents: number, month: string, start: string, ended: string | null): number {
  const first = monthStart(month), next = nextMonth(first);
  const a = start > first ? start : first;
  const end = ended ? addDays(ended, 1) : next;
  const b = end < next ? end : next;
  const days = daysBetween(a, b), dim = daysBetween(first, next);
  if (days <= 0) return 0;
  if (days === dim) return rentCents;
  return Math.floor((rentCents * days * 2 + dim) / (2 * dim));
}

// ---------------------------------------------------------------------------
// Positions: oldest charge settled first
// ---------------------------------------------------------------------------
export interface Position {
  balance_cents: number;
  overdue_cents: number;
  current_cents: number;
  d1_30: number;
  d31_60: number;
  d61_90: number;
  d90_plus: number;
  deposit_held_cents: number;
  last_payment_on: string | null;
}

/** Entries that still count: not reversed, and not a reversal themselves. */
export function liveEntries<E extends Entry>(entries: E[]): E[] {
  const reversed = new Set(entries.filter((e) => e.kind === "reversal" && e.reverses_id).map((e) => e.reverses_id));
  return entries.filter((e) => e.kind !== "reversal" && !reversed.has(e.id));
}

export function position(entries: Entry[], asOf: string): Position {
  const live = liveEntries(entries).filter((e) => e.effective_on <= asOf);
  let pool = live.filter((e) => e.account === "rent" && (e.kind === "payment" || e.kind === "credit")).reduce((s, e) => s + e.amount_cents, 0);
  const charges = live.filter((e) => e.account === "rent" && e.kind === "charge")
    .sort((x, y) => x.effective_on.localeCompare(y.effective_on) || (x.created_at ?? "").localeCompare(y.created_at ?? "") || x.id.localeCompare(y.id));
  const p: Position = { balance_cents: 0, overdue_cents: 0, current_cents: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0, deposit_held_cents: 0, last_payment_on: null };
  for (const c of charges) {
    const settled = Math.min(pool, c.amount_cents);
    pool -= settled;
    const left = c.amount_cents - settled;
    if (left <= 0) continue;
    const age = daysBetween(c.effective_on, asOf);
    if (age <= 0) p.current_cents += left;
    else if (age <= 30) p.d1_30 += left;
    else if (age <= 60) p.d31_60 += left;
    else if (age <= 90) p.d61_90 += left;
    else p.d90_plus += left;
  }
  p.overdue_cents = p.d1_30 + p.d31_60 + p.d61_90 + p.d90_plus;
  p.balance_cents = p.current_cents + p.overdue_cents - pool;
  p.deposit_held_cents = live.filter((e) => e.account === "deposit")
    .reduce((s, e) => s + (e.kind === "payment" ? e.amount_cents : e.kind === "refund" ? -e.amount_cents : 0), 0);
  const payments = liveEntries(entries).filter((e) => e.kind === "payment" && e.account === "rent").map((e) => e.effective_on).sort();
  p.last_payment_on = payments.length ? payments[payments.length - 1]! : null;
  return p;
}

/**
 * A statement: every entry on one account in date order, with a running figure. On the rent account it is what the
 * tenant owes (negative = in credit); on the deposit account it is the deposit held (paid in less refunded).
 */
export function statement<E extends Entry>(entries: E[], account: Account): Array<E & { running_cents: number; reversed: boolean }> {
  const reversed = new Set(entries.filter((e) => e.kind === "reversal").map((e) => e.reverses_id));
  const byId = new Map(entries.map((e) => [e.id, e]));
  const sorted = entries.filter((e) => e.account === account)
    .sort((x, y) => x.effective_on.localeCompare(y.effective_on) || (x.created_at ?? "").localeCompare(y.created_at ?? ""));
  let running = 0;
  return sorted.map((e) => {
    running += signed(e, byId);
    return { ...e, running_cents: running, reversed: reversed.has(e.id) };
  });
}

/**
 * What an entry does to its account's running figure. Rent account: owed (a charge raises it; a payment or credit
 * lowers it). Deposit account: held (a payment raises it, a refund lowers it; the deposit charge records what was
 * agreed and moves nothing). A reversal undoes what it reverses.
 */
export function signed(e: Entry, byId: Map<string, Entry>): number {
  if (e.kind === "reversal") {
    const o = e.reverses_id ? byId.get(e.reverses_id) : undefined;
    return o ? -signed(o, byId) : 0;
  }
  if (e.account === "deposit") return e.kind === "payment" ? e.amount_cents : e.kind === "refund" ? -e.amount_cents : 0;
  return e.kind === "charge" ? e.amount_cents : -e.amount_cents;
}

// ---------------------------------------------------------------------------
// Money, typed by people
// ---------------------------------------------------------------------------
/** "R1 234,50", "1234.5", "1 234" → cents. Null when it isn't a plain amount. Never via floating point. */
export function parseRand(input: string): number | null {
  const s = input.trim().replace(/^R\s*/i, "").replace(/[\s ]/g, "");
  // a comma followed by exactly 1–2 digits at the end is the decimal mark (South African style); other commas group
  const m = /^(\d{1,3}(?:[,]\d{3})*|\d+)(?:[.,](\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const whole = m[1]!.replace(/,/g, "");
  const frac = (m[2] ?? "").padEnd(2, "0");
  const cents = Number(whole) * 100 + Number(frac || "0");
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Cents → "R 1 234,50" (South African format). */
export function rand(cents: number): string {
  const neg = cents < 0, abs = Math.abs(cents);
  const whole = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${neg ? "−" : ""}R ${whole},${String(abs % 100).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Payments from a bank statement (CSV)
// ---------------------------------------------------------------------------
export interface ImportLine { line: number; date: string; reference: string; amount_cents: number }
export interface ImportProblem { line: number; problem: string }

/** Splits one CSV line, honouring quotes. */
function cells(row: string): string[] {
  const out: string[] = []; let cur = ""; let q = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i]!;
    if (q) {
      if (ch === '"' && row[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === "," || ch === ";") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/** Normalises 2026-11-03, 2026/11/03 and 03/11/2026 (day first, as South African banks write it) to YYYY-MM-DD. */
export function parseDate(s: string): string | null {
  let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(s.trim());
  if (m) return valid(m[1]!, m[2]!, m[3]!);
  m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(s.trim());
  if (m) return valid(m[3]!, m[2]!, m[1]!);
  return null;
}
function valid(y: string, mo: string, d: string): string | null {
  const iso = `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  const t = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === iso ? iso : null;
}

/**
 * Reads a CSV with columns date, reference, amount (a header row is optional; extra columns are ignored). Money in
 * (positive amounts) only: payments out of the account are skipped and reported.
 */
export function parsePaymentsCsv(text: string): { lines: ImportLine[]; problems: ImportProblem[] } {
  const lines: ImportLine[] = []; const problems: ImportProblem[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    if (!raw.trim()) return;
    const [d = "", ref = "", amt = ""] = cells(raw);
    const date = parseDate(d);
    if (!date) {
      if (i === 0) return; // a header row
      problems.push({ line: i + 1, problem: "The date isn't a date" });
      return;
    }
    const negative = /^\s*-/.test(amt);
    const cents = parseRand(amt.replace(/^\s*[-+]/, ""));
    if (cents === null || cents === 0) { problems.push({ line: i + 1, problem: "The amount isn't an amount" }); return; }
    if (negative) { problems.push({ line: i + 1, problem: "Money out of the account, skipped" }); return; }
    lines.push({ line: i + 1, date, reference: ref, amount_cents: cents });
  });
  return { lines, problems };
}

/** Finds a lease's payment reference (L-0001) inside a bank reference; null when none or more than one matches. */
export function matchReference(bankRef: string, leaseRefs: string[]): string | null {
  const up = bankRef.toUpperCase().replace(/\s+/g, "");
  const hits = leaseRefs.filter((r) => up.includes(r.toUpperCase()));
  return hits.length === 1 ? hits[0]! : null;
}

/** CSV out: quotes every cell, so names and references with commas survive. */
export function toCsv(rows: Array<Array<string | number | null>>): string {
  return rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n") + "\r\n";
}
