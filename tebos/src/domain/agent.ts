// The agent's office (TEPOS, Real Estate Job portal; ROADMAP priority 3), slice 1: every listing, buyer and
// seller with its next step and date, and what is overdue (founder, 17 Oct 2026).
//
// The rules (mirrored in migration 20261019100000_agent_office.sql):
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

// ---------------------------------------------------------------------------------------------------------------
// Slice 2 (founder, 19 Oct 2026): documents and compliance per deal, and the FFC path.
// On the founder's condition, "no tampering with actual legal documents": nothing here stores, edits, signs or
// sends a document. It tracks which documents a deal has, where the agency keeps them, and what is missing.
// Mirrored in migration 20261019120000_agent_compliance.sql.
// ---------------------------------------------------------------------------------------------------------------

/** Where each requirement comes from. Nothing is encoded from memory. */
export const SOURCES_OF_RULES = {
  checklist: "Pelser Real Estate, Property Check list (Office use)",
  welcome: "Pelser Real Estate, New Agent Welcome package",
  founder: "The founder, 19 Oct 2026",
  ppra_form: "PPRA application for a Fidelity Fund Certificate (natural person), section 13",
} as const;
export type RuleSource = keyof typeof SOURCES_OF_RULES;

export const DEAL_GROUPS = {
  deal: "The deal",
  buyer: "Purchaser or tenant (FICA)",
  seller: "Seller or landlord (FICA)",
  property: "Property certificates",
  transfer: "Bond and transfer",
  agent: "Your own papers",
  close: "Commission and closing",
} as const;
export type DealGroup = keyof typeof DEAL_GROUPS;

export interface DealItemDef { key: string; group: DealGroup; label: string; source: RuleSource }

const item = (key: string, group: DealGroup, label: string, source: RuleSource): DealItemDef => ({ key, group, label, source });

/** Every document a deal needs, in the agency's order. The database accepts exactly these keys. */
export const DEAL_ITEMS: readonly DealItemDef[] = [
  item("mandate_signed", "deal", "Mandate signed", "founder"),
  item("mandate_cosigned", "deal", "Mandate co-signed by a full-status practitioner (while you are a candidate)", "welcome"),
  item("condition_report", "deal", "Immovable property condition report (mandatory disclosure)", "checklist"),
  item("otp_or_lease_signed", "deal", "Offer to purchase or lease signed", "founder"),
  item("otp_cosigned", "deal", "Offer to purchase co-signed by a full-status practitioner (while you are a candidate)", "welcome"),
  item("proof_of_payment", "deal", "Proof of payment", "founder"),
  item("property24_update", "deal", "Property24 updated", "checklist"),
  item("buyer_nda", "buyer", "Non-disclosure document", "checklist"),
  item("buyer_identity", "buyer", "Identity document", "checklist"),
  item("buyer_proof_of_address", "buyer", "Proof of address", "checklist"),
  item("buyer_marriage_certificate", "buyer", "Marriage certificate", "checklist"),
  item("buyer_entity_documents", "buyer", "Company, close corporation or trust documents", "checklist"),
  item("buyer_resolution", "buyer", "Resolution or letter of authority", "checklist"),
  item("buyer_vat", "buyer", "VAT document", "checklist"),
  item("buyer_income_tax", "buyer", "Income tax document", "checklist"),
  item("buyer_sanctions_search", "buyer", "Targeted financial sanctions search", "checklist"),
  item("buyer_risk_assessment_popia", "buyer", "Risk assessment, POPIA consent and due diligence", "checklist"),
  item("seller_entity_documents", "seller", "Company, close corporation or trust documents", "checklist"),
  item("seller_resolution", "seller", "Resolution or letter of authority", "checklist"),
  item("seller_vat", "seller", "VAT document", "checklist"),
  item("seller_proof_of_address", "seller", "Proof of address", "checklist"),
  item("seller_marriage_certificate", "seller", "Marriage certificate", "checklist"),
  item("seller_income_tax", "seller", "Income tax document", "checklist"),
  item("seller_sanctions_search", "seller", "Targeted financial sanctions search", "checklist"),
  item("seller_risk_assessment_popia", "seller", "Risk assessment, POPIA consent and due diligence", "checklist"),
  item("electrical_coc", "property", "Electrical certificate of compliance", "checklist"),
  item("electric_fence_certificate", "property", "Electric fence certificate", "checklist"),
  item("gas_certificate", "property", "Gas certificate", "checklist"),
  item("bond_approved", "transfer", "Bond approved (or cash sale)", "checklist"),
  item("suspensive_conditions_met", "transfer", "Suspensive conditions met", "checklist"),
  item("sent_to_transfer_attorney", "transfer", "Documents sent to the transferring attorney (through the agency)", "welcome"),
  item("agent_ffc", "agent", "Your Fidelity Fund Certificate (the attorney asks for it before commission is paid)", "welcome"),
  item("agent_sars_confirmation", "agent", "Your SARS confirmation letter", "checklist"),
  item("agent_bank_confirmation", "agent", "Your bank account confirmation letter", "checklist"),
  item("commission_invoice", "close", "Commission invoice", "checklist"),
  item("commission_paid", "close", "Commission paid", "checklist"),
  item("file_closed", "close", "File closed", "checklist"),
];

export const ITEM_STATUSES = {
  missing: "Missing",
  requested: "Requested",
  received: "Received",
  checked: "Checked and filed",
  not_applicable: "Not applicable",
} as const;
export type ItemStatus = keyof typeof ITEM_STATUSES;

export interface DealItem {
  item: string;
  status: ItemStatus;
  dueOn: string | null;
  receivedOn: string | null;
  /** Where the agency keeps it (PropCtrl, Doxit, the agency file). The document itself is never stored here. */
  keptIn: string | null;
  reason: string | null;
  note: string | null;
}

/** The rules for one checklist entry, checked before anything is sent; the database enforces the same. */
export function checkDealItem(i: DealItem): Check {
  if (!DEAL_ITEMS.some((d) => d.key === i.item)) return fail("TEBOS_VALIDATION", "That isn't a document on the agency's checklist.");
  const text = checkText([i.keptIn, i.reason, i.note]);
  if (!text.ok) return text;
  if ((i.status === "received" || i.status === "checked") && !i.receivedOn) return fail("TEBOS_VALIDATION", "Give the date it was received.");
  if (i.status === "checked" && blank(i.keptIn)) return fail("TEBOS_VALIDATION", "Say where it is kept, e.g. PropCtrl or Doxit.");
  if (i.status === "not_applicable" && blank(i.reason)) return fail("TEBOS_VALIDATION", "Say why it doesn't apply, e.g. no gas installation.");
  return OK;
}

export interface ChecklistRow extends DealItemDef { entry: DealItem; overdue: boolean }
export interface Checklist {
  groups: { group: DealGroup; rows: ChecklistRow[] }[];
  /** Documents that apply (everything not marked not applicable). */
  applicable: number;
  /** Received or checked. */
  inHand: number;
  missing: ChecklistRow[];
  overdue: ChecklistRow[];
}

/** A deal's checklist: every document on the agency's list, with what was recorded for it. Unrecorded is missing. */
export function dealChecklist(entries: DealItem[], today: string): Checklist {
  const byKey = new Map(entries.map((e) => [e.item, e]));
  const rows: ChecklistRow[] = DEAL_ITEMS.map((d) => {
    const entry = byKey.get(d.key) ?? { item: d.key, status: "missing" as const, dueOn: null, receivedOn: null, keptIn: null, reason: null, note: null };
    const open = entry.status === "missing" || entry.status === "requested";
    return { ...d, entry, overdue: open && !!entry.dueOn && entry.dueOn < today };
  });
  const applicable = rows.filter((r) => r.entry.status !== "not_applicable");
  const missing = applicable.filter((r) => r.entry.status === "missing" || r.entry.status === "requested");
  return {
    groups: (Object.keys(DEAL_GROUPS) as DealGroup[]).map((group) => ({ group, rows: rows.filter((r) => r.group === group) })),
    applicable: applicable.length,
    inHand: applicable.length - missing.length,
    missing,
    overdue: rows.filter((r) => r.overdue),
  };
}

// --------------------------------------------------------------------------------------------------- the FFC path

export const STEP_STATUSES = { to_do: "To do", in_progress: "In progress", done: "Done" } as const;
export type StepStatus = keyof typeof STEP_STATUSES;

export interface FfcStep {
  id: string;
  position: number;
  title: string;
  /** Where this requirement comes from. A step without a source isn't accepted. */
  source: string;
  status: StepStatus;
  dueOn: string | null;
  doneOn: string | null;
  /** Where the proof is kept. */
  evidence: string | null;
  note: string | null;
}

/**
 * A candidate's registration with the PPRA, as the PPRA's own application form lists it (section 13). The later
 * steps towards full status are not in that form: the founder adds them, each with who confirmed it.
 */
export const PPRA_CANDIDATE_STEPS: readonly { title: string; source: string }[] = [
  { title: "Register on the PPRA portal and get the seven-digit reference number", source: `${SOURCES_OF_RULES.ppra_form}, 13.1` },
  { title: "Submit the fully completed and signed application form", source: `${SOURCES_OF_RULES.ppra_form}, 13.2.1` },
  { title: "Submit a certified copy of your identity document", source: `${SOURCES_OF_RULES.ppra_form}, 13.2.2` },
  { title: "Submit the employment letter signed by the principal and you, with your mentor's details", source: `${SOURCES_OF_RULES.ppra_form}, 13.2.3` },
  { title: "Submit proof of payment of the fees on the published schedule", source: `${SOURCES_OF_RULES.ppra_form}, 13.2.4` },
];

/** The rules for one step, checked before anything is sent; the database enforces the same. */
export function checkFfcStep(s: Omit<FfcStep, "id" | "position">): Check {
  if (blank(s.title) || s.title.trim().length > LABEL_MAX) return fail("TEBOS_VALIDATION", "Name the step (up to 160 characters).");
  if (blank(s.source) || s.source.trim().length < 3) return fail("TEBOS_VALIDATION", "Say where this requirement comes from: the PPRA, the principal, or a document.");
  const text = checkText([s.title, s.source, s.evidence, s.note]);
  if (!text.ok) return text;
  if (s.status === "done" && (!s.doneOn || blank(s.evidence))) return fail("TEBOS_VALIDATION", "A done step needs its date and where the proof is kept.");
  return OK;
}
