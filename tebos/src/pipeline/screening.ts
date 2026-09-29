// Screening an enquiry before anyone spends time or money on it. Every flag
// is a plain, checkable reason, never a score: staff decide, and approving a
// flagged enquiry needs a written reason (migration client_pipeline).

export interface ScreeningInput {
  email: string;
  business: string;
  website: string | null;
  message: string | null;
}

export interface ScreeningHistory {
  /** Earlier enquiries from the same address or the same email domain. */
  sameEmail: number;
  sameDomain: number;
}

export type FlagCode = "free_email" | "disposable_email" | "no_website" | "domain_mismatch" | "competitor_terms" | "repeat_enquiry";

export interface Flag {
  code: FlagCode;
  detail: string;
}

export interface Screening {
  flags: Flag[];
  emailDomain: string | null;
  websiteDomain: string | null;
}

const FREE = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.za", "outlook.com", "hotmail.com", "live.com", "msn.com",
  "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com", "gmx.com", "gmx.net", "mail.com", "yandex.com", "zoho.com",
  "webmail.co.za", "mweb.co.za", "telkomsa.net", "vodamail.co.za",
]);
const DISPOSABLE = new Set([
  "mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com", "temp-mail.org", "yopmail.com", "trashmail.com",
  "sharklasers.com", "getnada.com", "dispostable.com", "maildrop.cc", "throwawaymail.com",
]);

// Words that describe businesses selling what TEBOS sells. A match is a
// reason to look closer, not a verdict: agencies and consultancies are
// also clients.
const COMPETITOR_TERMS = [
  "operating system", "business operating", "business architecture", "process automation", "automation agency",
  "ai agency", "ai automation", "systems integration", "systems integrator", "consultancy", "consulting",
  "digital transformation", "management consult", "workflow automation", "business process",
];

export function domainOf(email: string): string | null {
  const m = /@([^@\s]+)$/.exec(email.trim().toLowerCase());
  return m ? m[1]! : null;
}

export function websiteDomain(website: string | null): string | null {
  if (!website?.trim()) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(website.trim()) ? website.trim() : `https://${website.trim()}`);
    return u.hostname.toLowerCase().replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

/** Registrable-ish root: the last two labels, or three for second-level country domains (co.za, org.za …). */
function root(domain: string): string {
  const parts = domain.split(".");
  const cc2 = parts.length >= 3 && /^(co|org|net|ac|gov|com|edu)$/.test(parts.at(-2)!) && parts.at(-1)!.length === 2;
  return parts.slice(cc2 ? -3 : -2).join(".");
}

export function screenEnquiry(e: ScreeningInput, history: ScreeningHistory = { sameEmail: 0, sameDomain: 0 }): Screening {
  const flags: Flag[] = [];
  const emailDomain = domainOf(e.email);
  const site = websiteDomain(e.website);

  if (emailDomain && DISPOSABLE.has(emailDomain)) flags.push({ code: "disposable_email", detail: `A throwaway address (${emailDomain})` });
  else if (emailDomain && FREE.has(emailDomain)) flags.push({ code: "free_email", detail: `A personal address (${emailDomain}), not the business's own` });

  if (!site) flags.push({ code: "no_website", detail: e.website?.trim() ? "The website given isn't a valid address" : "No website given" });
  else if (emailDomain && !FREE.has(emailDomain) && !DISPOSABLE.has(emailDomain) && root(site) !== root(emailDomain)) {
    flags.push({ code: "domain_mismatch", detail: `The email (${emailDomain}) and the website (${site}) are on different domains` });
  }

  const text = `${e.business} ${e.message ?? ""} ${e.website ?? ""}`.toLowerCase();
  const hits = COMPETITOR_TERMS.filter((t) => text.includes(t));
  if (hits.length) flags.push({ code: "competitor_terms", detail: `Describes itself with words that overlap TEBOS's services: ${hits.map((h) => `"${h}"`).join(", ")}` });

  // many unrelated people share a personal-mail domain: only the business's own domain counts as a repeat
  const ownDomain = emailDomain !== null && !FREE.has(emailDomain) && !DISPOSABLE.has(emailDomain);
  if (history.sameEmail > 0 || (ownDomain && history.sameDomain > 0)) {
    flags.push({
      code: "repeat_enquiry",
      detail: history.sameEmail > 0 ? `${history.sameEmail} earlier enquir${history.sameEmail === 1 ? "y" : "ies"} from this address` : `${history.sameDomain} earlier enquir${history.sameDomain === 1 ? "y" : "ies"} from ${emailDomain}`,
    });
  }
  return { flags, emailDomain, websiteDomain: site };
}
