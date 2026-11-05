// Property enquiries (ADR 0022): a property owner, or someone acting for one, tells a property business about a property
// problem from its public website. Mirrors migration 20261102190000_property_enquiries; the schema parity test keeps the
// lists and limits identical to the database's.

/** The problems a property business works on, in the founder's words (Tidy Enterprise, 2 Nov 2026). */
export const ENQUIRY_SITUATIONS = [
  { key: "arrears", label: "Bond arrears, municipal debt or levy debt" },
  { key: "low_rental", label: "The building isn't earning enough rent" },
  { key: "underused", label: "The property is underused" },
  { key: "redevelopment", label: "It could be redeveloped or converted to rentals" },
  { key: "life_event", label: "An estate, divorce or financial distress" },
  { key: "financing", label: "I need to improve my financing position" },
  { key: "landlord_ops", label: "Running the rentals and the admin is too much" },
  { key: "other", label: "Something else" },
] as const;
export type EnquirySituation = (typeof ENQUIRY_SITUATIONS)[number]["key"];

export const ENQUIRY_RELATIONSHIPS = [
  { key: "owner", label: "I own it" },
  { key: "co_owner", label: "I own it with others" },
  { key: "family_or_executor", label: "Family member or executor" },
  { key: "adviser", label: "Adviser (attorney, accountant, agent)" },
  { key: "other", label: "Other" },
] as const;
export type EnquiryRelationship = (typeof ENQUIRY_RELATIONSHIPS)[number]["key"];

export const ENQUIRY_LIMITS = { messageMin: 20, messageMax: 2000, areaMin: 2, areaMax: 120, nameMax: 120, phoneMax: 40, maxNewPerEmail: 2 } as const;

export interface EnquiryDraft {
  situation: string; relationship: string; area: string; message: string; name: string; email: string; phone: string; consent: boolean;
}

/** Same test as tebos_private.looks_personal: an email address, a South African phone number or a 13-digit ID number. */
export function looksPersonal(text: string): boolean {
  return /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(text)
    || /(\+27|\b0)[ -]?[1-9][0-9][ -]?[0-9]{3}[ -]?[0-9]{4}\b/.test(text)
    || /\b[0-9]{13}\b/.test(text);
}

/** The first thing stopping this enquiry being sent, in plain words, or null when it can go. */
export function checkEnquiry(d: EnquiryDraft): string | null {
  if (!ENQUIRY_SITUATIONS.some((s) => s.key === d.situation)) return "Choose what is happening with the property.";
  if (!ENQUIRY_RELATIONSHIPS.some((r) => r.key === d.relationship)) return "Say how you are connected to the property.";
  const area = d.area.trim();
  if (area.length < ENQUIRY_LIMITS.areaMin || area.length > ENQUIRY_LIMITS.areaMax) return "Say roughly where the property is: the suburb and town.";
  const message = d.message.trim();
  if (message.length < ENQUIRY_LIMITS.messageMin) return "Say a little more about what is happening with the property.";
  if (message.length > ENQUIRY_LIMITS.messageMax) return `Keep the description under ${ENQUIRY_LIMITS.messageMax} characters.`;
  if (looksPersonal(message) || looksPersonal(area)) return "Leave ID numbers, phone numbers and email addresses out of the description; your contact details have their own boxes.";
  if (!d.name.trim() || d.name.trim().length > ENQUIRY_LIMITS.nameMax) return "Add your name.";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email.trim()) || d.email.trim().length > 254) return "Add an email address we can reply to.";
  if (d.phone.trim().length > ENQUIRY_LIMITS.phoneMax) return "That phone number is too long.";
  if (!d.consent) return "Agree to your details being used to reply about this enquiry.";
  return null;
}
