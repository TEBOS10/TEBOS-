// Monthly billing after the first payment. TEBOS issues each month's invoice
// on the date the agreement sets, emails a payment link and reminds the
// client if it's late. It never charges a card by itself: paying is the
// client's action (money is tier 3 in the autonomy policy), and pausing a
// late client is a person's decision.
//
// Mirrored in migration monthly_billing (billing_accounts, invoices).

export type BillingStatus = "awaiting_fee" | "active" | "paused" | "ended";
export type InvoiceStatus = "open" | "paid" | "void";

/** Days a client has to pay an invoice. */
export const PAYMENT_TERMS_DAYS = 7;
/** Reminders, in days after the due date. */
export const REMINDERS: Array<{ kind: "invoice_reminder_1" | "invoice_reminder_2"; daysLate: number }> = [
  { kind: "invoice_reminder_1", daysLate: 3 },
  { kind: "invoice_reminder_2", daysLate: 10 },
];
/** The agreement lets TEBOS pause the service when a payment is this late; a person decides. */
export const PAUSE_AFTER_DAYS_LATE = 14;

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * The same day next month, or the month's last day when it has fewer days
 * (31 January -> 28 or 29 February). `day` keeps the original anchor so a
 * client billed on the 31st goes back to the 31st when the month allows.
 */
export function addMonth(dateIso: string, anchorDay?: number): string {
  const [y, m, d] = dateIso.split("-").map(Number) as [number, number, number];
  const day = anchorDay ?? d;
  const nextMonth = m === 12 ? 1 : m + 1;
  const year = m === 12 ? y + 1 : y;
  const last = new Date(Date.UTC(year, nextMonth, 0)).getUTCDate();
  return `${year}-${String(nextMonth).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
}

/** The period an invoice issued on `startIso` covers: up to the day before the next one. */
export function periodOf(startIso: string, anchorDay?: number): { start: string; end: string } {
  const next = new Date(`${addMonth(startIso, anchorDay)}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() - 1);
  return { start: startIso, end: iso(next) };
}

export function dueDate(issuedIso: string): string {
  const d = new Date(`${issuedIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + PAYMENT_TERMS_DAYS);
  return iso(d);
}

export function daysLate(dueIso: string, today: Date = new Date()): number {
  const due = new Date(`${dueIso}T00:00:00Z`).getTime();
  const t = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.max(0, Math.floor((t - due) / 86_400_000));
}

/** Which reminders are due for an open invoice, given which were already queued. */
export function remindersDue(dueIso: string, alreadyQueued: readonly string[], today: Date = new Date()) {
  const late = daysLate(dueIso, today);
  return REMINDERS.filter((r) => late >= r.daysLate && !alreadyQueued.includes(r.kind));
}

export const mayPause = (dueIso: string, today: Date = new Date()) => daysLate(dueIso, today) >= PAUSE_AFTER_DAYS_LATE;
