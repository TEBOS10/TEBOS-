// The agent's office (TEPOS, Real Estate Job portal; ROADMAP priority 3), slice 1: every listing, buyer and
// seller with its next step and date, and what is overdue (founder, 17 Oct 2026).
//
// The rules (mirrored in migration 20261017220000_agent_office.sql):
//   * Nothing open is left without a next step and its date; anything closed says how it ended.
//   * No personal details until the agency's principal allows them (operator log, decision 12): people are
//     references (B-001, S-001, ...), and email addresses, phone numbers and ID numbers are refused.
//   * No secrets in any text (looksSecret, as in Resilience).
//   * Unknown is not zero: a price that isn't known is left blank.
import { looksSecret } from "./resilience";
import { fail, OK, type Check } from "./rules";

export const DEALS = { sale: "Sale", rental: "Rental" } as const;
export type Deal = keyof typeof DEALS;

export const LISTING_STAGES = {
  prospect: "Prospect (no mandate yet)",
  mandate: "Mandate signed",
  marketed: "Marketed",
  under_offer: "Under offer",
  agreed: "Agreed (offer accepted or lease signed)",
  completed: "Completed (registered or tenant in)",
  withdrawn: "Withdrawn",
  lost: "Lost",
} as const;
export type ListingStage = keyof typeof LISTING_STAGES;

export const CONTACT_ROLES = { buyer: "Buyer", seller: "Seller", tenant: "Tenant", landlord: "Landlord" } as const;
export type ContactRole = keyof typeof CONTACT_ROLES;
/** The first letter of a contact's reference: B-001, S-001, T-001, O-001 (owner). Listings are L-001. */
export const ROLE_PREFIX: Record<ContactRole, string> = { buyer: "B", seller: "S", tenant: "T", landlord: "O" };

export const CONTACT_STAGES = {
  new: "New",
  contacted: "Contacted",
  viewing: "Viewing",
  offer: "Offer",
  agreed: "Agreed",
  completed: "Completed",
  lost: "Lost",
} as const;
export type ContactStage = keyof typeof CONTACT_STAGES;

export const SOURCES = { portal: "Listing portal", referral: "Referral", board: "Board", walk_in: "Walk-in", social: "Social media", other: "Other" } as const;
export type Source = keyof typeof SOURCES;

export const MANDATES = { sole: "Sole", open: "Open" } as const;
export type Mandate = keyof typeof MANDATES;

export const CLOSED_LISTING: readonly ListingStage[] = ["completed", "withdrawn", "lost"];
export const CLOSED_CONTACT: readonly ContactStage[] = ["completed", "lost"];

export const LABEL_MAX = 160;
export const STEP_MAX = 300;
export const TEXT_MAX = 1000;
/** A mandate ending within this many days is flagged. */
export const MANDATE_WARN_DAYS = 14;
/** The agenda's "this week": the next seven days after today. */
export const WEEK_DAYS = 7;

export interface Listing {
  id: string;
  ref: string;
  label: string;
  deal: Deal;
  stage: ListingStage;
  /** Asking price or monthly rent, in rand; null when not known. Never treated as zero. */
  price: number | null;
  mandate: Mandate | null;
  mandateEndsOn: string | null;
  nextStep: string | null;
  nextStepOn: string | null;
  outcome: string | null;
  note: string | null;
}

export interface Contact {
  id: string;
  ref: string;
  role: ContactRole;
  label: string;
  listingId: string | null;
  source: Source | null;
  stage: ContactStage;
  nextStep: string | null;
  nextStepOn: string | null;
  outcome: string | null;
  note: string | null;
}

const blank = (s: string | null | undefined) => !s || s.trim().length === 0;

const PERSONAL_PATTERNS: readonly RegExp[] = [
  /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i,
  /(\+27|\b0)[ -]?[1-9][0-9][ -]?[0-9]{3}[ -]?[0-9]{4}\b/,
  /\b[0-9]{13}\b/,
];

/** Text that looks like an email address, a South African phone number or an ID number. The schema refuses it. */
export function looksPersonal(text: string | null | undefined): boolean {
  return !!text && PERSONAL_PATTERNS.some((p) => p.test(text));
}

function checkText(fields: (string | null)[]): Check {
  if (fields.some(looksSecret)) {
    return fail("TEBOS_VALIDATION", "This looks like a password, key or token. Secrets are never stored here.");
  }
  if (fields.some(looksPersonal)) {
    return fail("TEBOS_VALIDATION", "No email addresses, phone numbers or ID numbers here until the agency allows it. Use the reference, and keep the details in the agency's system.");
  }
  return OK;
}

function checkStep(closed: boolean, nextStep: string | null, nextStepOn: string | null, outcome: string | null): Check {
  if (nextStep && nextStep.length > STEP_MAX) return fail("TEBOS_VALIDATION", "Keep the next step under 300 characters.");
  if (outcome && outcome.length > TEXT_MAX) return fail("TEBOS_VALIDATION", "Keep the outcome under 1,000 characters.");
  if (closed) return blank(outcome) ? fail("TEBOS_VALIDATION", "Say how it ended.") : OK;
  if (blank(nextStep) || !nextStepOn) return fail("TEBOS_VALIDATION", "Give it a next step and a date: nothing open is left without one.");
  return OK;
}

/** The rules for a listing, checked before anything is sent; the database enforces the same. */
export function checkListing(l: Omit<Listing, "id" | "ref">): Check {
  if (blank(l.label) || l.label.trim().length > LABEL_MAX) return fail("TEBOS_VALIDATION", "Describe the property (up to 160 characters).");
  if (l.note && l.note.length > TEXT_MAX) return fail("TEBOS_VALIDATION", "Keep the note under 1,000 characters.");
  if (l.price !== null && (!Number.isFinite(l.price) || l.price < 0)) return fail("TEBOS_VALIDATION", "Enter a price of zero or more, or leave it blank if unknown.");
  const text = checkText([l.label, l.nextStep, l.outcome, l.note]);
  if (!text.ok) return text;
  return checkStep(CLOSED_LISTING.includes(l.stage), l.nextStep, l.nextStepOn, l.outcome);
}

/** The rules for a contact, checked before anything is sent; the database enforces the same. */
export function checkContact(c: Omit<Contact, "id" | "ref">): Check {
  if (blank(c.label) || c.label.trim().length > LABEL_MAX) return fail("TEBOS_VALIDATION", "Describe them without a name (up to 160 characters), e.g. 'First-time buyer, R1.2m, pre-approved'.");
  if (c.note && c.note.length > TEXT_MAX) return fail("TEBOS_VALIDATION", "Keep the note under 1,000 characters.");
  const text = checkText([c.label, c.nextStep, c.outcome, c.note]);
  if (!text.ok) return text;
  return checkStep(CLOSED_CONTACT.includes(c.stage), c.nextStep, c.nextStepOn, c.outcome);
}

export const isOpenListing = (l: Pick<Listing, "stage">) => !CLOSED_LISTING.includes(l.stage);
export const isOpenContact = (c: Pick<Contact, "stage">) => !CLOSED_CONTACT.includes(c.stage);

export type When = "overdue" | "today" | "this_week" | "later";
export const WHEN: Record<When, string> = { overdue: "Overdue", today: "Today", this_week: "This week", later: "Later" };

export interface AgendaItem {
  kind: "listing" | "contact";
  id: string;
  ref: string;
  label: string;
  nextStep: string;
  nextStepOn: string;
  when: When;
  /** Days late (overdue) or days to go; 0 today. */
  days: number;
}

const DAY = 86_400_000;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

function whenOf(days: number): When {
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days <= WEEK_DAYS) return "this_week";
  return "later";
}

export interface Agenda {
  items: AgendaItem[];
  counts: Record<When, number>;
  /** Open listings whose mandate ends within MANDATE_WARN_DAYS, or has ended. */
  mandatesEnding: { id: string; ref: string; label: string; endsOn: string; days: number }[];
  openListings: number;
  openContacts: number;
}

/** Every open record's next step, soonest first, grouped by when it is due. Closed records are left out. */
export function agenda(listings: Listing[], contacts: Contact[], today: string): Agenda {
  const items: AgendaItem[] = [];
  const add = (kind: AgendaItem["kind"], r: Listing | Contact) => {
    if (!r.nextStep || !r.nextStepOn) return;
    const days = daysBetween(today, r.nextStepOn);
    items.push({ kind, id: r.id, ref: r.ref, label: r.label, nextStep: r.nextStep, nextStepOn: r.nextStepOn, when: whenOf(days), days });
  };
  const openL = listings.filter(isOpenListing);
  const openC = contacts.filter(isOpenContact);
  openL.forEach((l) => add("listing", l));
  openC.forEach((c) => add("contact", c));
  items.sort((a, b) => a.nextStepOn.localeCompare(b.nextStepOn) || a.ref.localeCompare(b.ref));
  const counts: Record<When, number> = { overdue: 0, today: 0, this_week: 0, later: 0 };
  for (const i of items) counts[i.when]++;
  const mandatesEnding = openL
    .filter((l) => l.mandateEndsOn && daysBetween(today, l.mandateEndsOn) <= MANDATE_WARN_DAYS)
    .map((l) => ({ id: l.id, ref: l.ref, label: l.label, endsOn: l.mandateEndsOn!, days: daysBetween(today, l.mandateEndsOn!) }))
    .sort((a, b) => a.endsOn.localeCompare(b.endsOn));
  return { items, counts, mandatesEnding, openListings: openL.length, openContacts: openC.length };
}

/** "3 days late", "today", "in 2 days". */
export function dueText(days: number): string {
  if (days === 0) return "today";
  if (days < 0) return days === -1 ? "1 day late" : `${-days} days late`;
  return days === 1 ? "tomorrow" : `in ${days} days`;
}
