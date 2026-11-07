// Channel referrals (migration channel_referrals, ADR 0025): someone met through the agency (Pelser Real Estate) who
// needs help the agency doesn't give, referred to Real Estate Assist or to Tidy Enterprise. The database enforces
// these rules; this mirrors them so the interface can say what is missing before it tries, and the tests can hold
// both to the same thing. Nothing here sends anything: a referral is a record of what a person did.
import type { ChannelReferralStatus } from "./states";

export const REFERRAL_DESTINATIONS = ["real_estate_assist", "tidy_enterprise"] as const;
export type ReferralDestination = (typeof REFERRAL_DESTINATIONS)[number];
export const DESTINATION_LABEL: Record<ReferralDestination, string> = {
  real_estate_assist: "Real Estate Assist",
  tidy_enterprise: "Tidy Enterprise",
};

export const CONSENT_METHODS = ["in_writing", "email", "message", "verbal_noted"] as const;
export type ConsentMethod = (typeof CONSENT_METHODS)[number];
export const CONSENT_LABEL: Record<ConsentMethod, string> = {
  in_writing: "In writing",
  email: "By email",
  message: "By message",
  verbal_noted: "Verbally, noted at the time",
};

export const FEE_TERMS = ["none", "agreed_in_writing", "not_agreed"] as const;
export type FeeTerms = (typeof FEE_TERMS)[number];
export const FEE_LABEL: Record<FeeTerms, string> = {
  none: "No fee",
  agreed_in_writing: "Agreed in writing",
  not_agreed: "Not agreed yet",
};

export const REFERRAL_STATUS_LABEL: Record<ChannelReferralStatus, string> = {
  identified: "Need identified",
  consent_given: "Consent recorded",
  introduced: "Introduced",
  accepted: "Accepted",
  declined: "Declined",
  served: "Being served",
  resolved: "Resolved",
  not_resolved: "Not resolved",
  withdrawn: "Withdrawn",
};

export const CLOSED_REFERRAL: readonly ChannelReferralStatus[] = ["declined", "resolved", "not_resolved", "withdrawn"];
/** Statuses that mean the person has been, or is being, introduced. */
const INTRODUCED: readonly ChannelReferralStatus[] = ["introduced", "accepted", "declined", "served", "resolved", "not_resolved"];

export interface ReferralDraft {
  destination: ReferralDestination;
  via_agency: boolean;
  contact_id: string | null;
  problem: string;
  status: ChannelReferralStatus;
  consent_on: string | null;
  consent_how: ConsentMethod | null;
  agency_permission_ref: string | null;
  partner_terms_ref: string | null;
  fee_terms: FeeTerms;
  fee_terms_ref: string | null;
  next_step: string | null;
  next_step_on: string | null;
  outcome: string | null;
}

const filled = (s: string | null | undefined, min = 1) => (s ?? "").trim().length >= min;

/** What the record still needs before the database will accept it; empty means it is complete. `today` is yyyy-mm-dd. */
export function referralGaps(r: ReferralDraft, today: string): string[] {
  const gaps: string[] = [];
  const closed = CLOSED_REFERRAL.includes(r.status);
  if (!filled(r.problem, 5)) gaps.push("Say in a few words what the person needs.");
  if (!closed && (!filled(r.next_step) || !r.next_step_on)) gaps.push("Give the next step and its date.");
  if (closed && !filled(r.outcome, 3)) gaps.push("Say how it ended.");
  if (r.status !== "identified" && r.status !== "withdrawn" && (!r.consent_on || !r.consent_how))
    gaps.push("Record when and how the person agreed to be introduced.");
  if (r.consent_on && r.consent_on > today) gaps.push("Consent is recorded once it has been given, not in advance.");
  if (INTRODUCED.includes(r.status)) {
    if (r.destination === "real_estate_assist" && !filled(r.partner_terms_ref))
      gaps.push("Record where Real Estate Assist's written referral arrangement is.");
    if (r.destination === "tidy_enterprise" && r.via_agency && !filled(r.agency_permission_ref))
      gaps.push("Someone met through the agency needs the agency's written permission first: record where it is.");
  }
  if (r.fee_terms === "agreed_in_writing" && !filled(r.fee_terms_ref)) gaps.push("Record where the fee agreement is.");
  if (r.contact_id && !r.via_agency) gaps.push("A person from the agency's book came through the agency.");
  return gaps;
}

export interface ReferralSummaryRow {
  destination: ReferralDestination;
  status: ChannelReferralStatus;
}

/** Per destination: open, introduced so far, accepted so far, resolved. Counts of records, never money. */
export function referralSummary(rows: readonly ReferralSummaryRow[]) {
  return REFERRAL_DESTINATIONS.map((destination) => {
    const mine = rows.filter((r) => r.destination === destination);
    return {
      destination,
      open: mine.filter((r) => !CLOSED_REFERRAL.includes(r.status)).length,
      introduced: mine.filter((r) => INTRODUCED.includes(r.status)).length,
      accepted: mine.filter((r) => ["accepted", "served", "resolved", "not_resolved"].includes(r.status)).length,
      resolved: mine.filter((r) => r.status === "resolved").length,
    };
  });
}
