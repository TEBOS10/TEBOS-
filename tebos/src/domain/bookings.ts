// Bookings (ADR 0016; migration 20261102120000_bookings.sql): a business that sells time lists its services and
// rates; a customer requests a time inside working hours, at least a day ahead and within six months, that doesn't
// overlap another open booking; the team confirms once half the price has arrived as a deposit. The database enforces
// every rule here; test/schema-parity.test.ts keeps the numbers in step.
import type { BookingStatus } from "./states";

export const DEPOSIT_SHARE = 0.5;
export const MIN_NOTICE_HOURS = 24;
export const MAX_AHEAD_MONTHS = 6;
export const SLOT_STEP_MINUTES = 30;
export const SA_TIME_ZONE = "Africa/Johannesburg";
/** Requests one email may have waiting at once. */
export const MAX_OPEN_REQUESTS = 2;

export const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  requested: "Requested",
  confirmed: "Confirmed",
  declined: "Declined",
  cancelled: "Cancelled",
  completed: "Shot",
  no_show: "No-show",
  delivered: "Delivered",
};

/** What the customer should expect next, in plain words. */
export const BOOKING_NEXT: Record<BookingStatus, string> = {
  requested: "Waiting for the team to confirm. Your date is held once the deposit has arrived.",
  confirmed: "Confirmed. See you on the day.",
  declined: "The team couldn't take this booking.",
  cancelled: "This booking was cancelled.",
  completed: "Shot. Your images are being edited.",
  no_show: "Marked as missed.",
  delivered: "Your images have been sent.",
};

export function deposit(priceCents: number): { deposit: number; balance: number } {
  const d = Math.round(priceCents * DEPOSIT_SHARE);
  return { deposit: d, balance: priceCents - d };
}

export interface Interval { starts_at: string; ends_at: string }
export interface Hours { weekday: number; opens: string; closes: string }

/** The wall-clock date and time of an instant in South Africa (UTC+2, no daylight saving). */
export function saLocal(iso: string): { date: string; time: string; isoWeekday: number } {
  const d = new Date(new Date(iso).getTime() + 2 * 3600_000);
  const date = d.toISOString().slice(0, 10);
  const time = d.toISOString().slice(11, 16);
  const wd = d.getUTCDay();
  return { date, time, isoWeekday: wd === 0 ? 7 : wd };
}

/** Why a time can't be booked, or null; the same order of reasons as tebos_private.booking_slot_problem. */
export function slotProblem(start: string, end: string, now: Date, hours: Hours[], timeOff: Interval[], taken: Interval[]): string | null {
  const s = new Date(start).getTime(), e = new Date(end).getTime();
  if (s < now.getTime() + MIN_NOTICE_HOURS * 3600_000) return "a booking is made at least a day ahead";
  const limit = new Date(now); limit.setUTCMonth(limit.getUTCMonth() + MAX_AHEAD_MONTHS);
  if (s > limit.getTime()) return "bookings open up to six months ahead";
  const a = saLocal(start), b = saLocal(end);
  if (a.date !== b.date) return "a booking starts and ends on the same day";
  const h = hours.find((x) => x.weekday === a.isoWeekday);
  if (!h || a.time < h.opens.slice(0, 5) || b.time > h.closes.slice(0, 5)) return "that is outside working hours";
  const overlaps = (x: Interval) => new Date(x.starts_at).getTime() < e && new Date(x.ends_at).getTime() > s;
  if (timeOff.some(overlaps)) return "the studio is closed then";
  if (taken.some(overlaps)) return "that time is already taken";
  return null;
}

/** The working days to delivery, as a date range after the shoot (weekends skipped). */
export function deliveryWindow(shootIso: string, minDays: number, maxDays: number): { from: string; to: string } {
  const add = (n: number) => {
    const d = new Date(saLocal(shootIso).date + "T00:00:00Z");
    let left = n;
    while (left > 0) { d.setUTCDate(d.getUTCDate() + 1); const w = d.getUTCDay(); if (w !== 0 && w !== 6) left--; }
    return d.toISOString().slice(0, 10);
  };
  return { from: add(minDays), to: add(maxDays) };
}

// ---------------------------------------------------------------------------
// Studio crew (ADR 0018; migration 20261102150000_studio_crew.sql): who does each shoot, the shoot-day checklist
// and paid delivery, so the business runs without its owner on every booking.
// ---------------------------------------------------------------------------

/** Team roles that can be assigned to a booking. */
export const CREW_ROLES = ["org_admin", "operator"] as const;
export const RELEASES_NOTE = { min: 5, max: 300 } as const;
export const GALLERY_URL = /^https:\/\/[^\s]+$/;

export interface CrewRecord {
  status: BookingStatus;
  assignee_id: string | null;
  call_sheet_at: string | null;
  releases_note: string | null;
  backed_up_at: string | null;
  balance_ref: string | null;
  gallery_url: string | null;
  price_cents: number | null;
  deposit_cents: number | null;
}

/** Why a booking can't move to `next` yet, by the crew rules; null when it can. Mirrors tebos_private.guard_booking_crew. */
export function crewBlocker(b: CrewRecord, next: BookingStatus): string | null {
  if (next === "confirmed" && !b.assignee_id) return "assign the photographer before confirming";
  if (next === "completed" && (!b.backed_up_at || !b.releases_note)) return "a shoot is done once its files are backed up and releases are noted";
  if (next === "delivered") {
    if (!b.gallery_url) return "add the gallery link before delivering";
    if ((b.price_cents ?? 0) - (b.deposit_cents ?? 0) > 0 && !b.balance_ref) return "the gallery is released once the balance is paid: record its reference";
  }
  return null;
}

/** The shoot-day checklist, in order, with what is still to do. */
export function shootChecklist(b: CrewRecord): Array<{ key: string; label: string; done: boolean }> {
  return [
    { key: "assignee", label: "Photographer assigned", done: Boolean(b.assignee_id) },
    { key: "call_sheet", label: "Call sheet sent", done: Boolean(b.call_sheet_at) },
    { key: "releases", label: "Releases signed or noted", done: Boolean(b.releases_note) },
    { key: "backup", label: "Files backed up", done: Boolean(b.backed_up_at) },
    { key: "balance", label: "Balance paid", done: Boolean(b.balance_ref) || (b.price_cents ?? 0) - (b.deposit_cents ?? 0) <= 0 },
    { key: "gallery", label: "Gallery delivered", done: b.status === "delivered" },
  ];
}
