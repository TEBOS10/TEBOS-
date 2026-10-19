// The private vault (TEPOS): the founder's own papers, stored as they are, never changed. The database enforces
// these rules (migration 20261019130000_tepos_vault.sql); this mirror lets the screen explain them before upload.
//   * Only the folders, file types and sizes below.
//   * Every file keeps its SHA-256 fingerprint, so a copy can be checked against the original.
//   * No secrets in titles or notes (looksSecret, as everywhere else).
import { looksSecret } from "./resilience";
import { fail, OK, type Check } from "./rules";

export const VAULT_FOLDERS = {
  licence: "Licence and registration",
  agency_forms: "Agency forms (blank)",
  onboarding: "Onboarding and policies",
  deals: "Deal documents",
  marketing: "Marketing",
  personal: "Personal",
} as const;
export type VaultFolder = keyof typeof VAULT_FOLDERS;

export const VAULT_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export const VAULT_MAX_BYTES = 20 * 1024 * 1024;

/**
 * The papers Pelser Real Estate gave the founder on joining (19 Oct 2026), each with its folder. The vault shows
 * which are filed; titles name the document, never a person's details.
 */
export const AGENCY_PACK: readonly { key: string; title: string; folder: VaultFolder }[] = [
  { key: "ppra_application", title: "PPRA individual application", folder: "licence" },
  { key: "employment_letter", title: "Candidate employment letter", folder: "licence" },
  { key: "exclusive_mandate", title: "Exclusive mandate", folder: "agency_forms" },
  { key: "open_mandate", title: "Open mandate", folder: "agency_forms" },
  { key: "offer_to_purchase", title: "Residential offer to purchase", folder: "agency_forms" },
  { key: "mandatory_disclosure", title: "Mandatory disclosure form", folder: "agency_forms" },
  { key: "fica_form", title: "FICA form", folder: "agency_forms" },
  { key: "fica_risk_assessment", title: "FICA risk assessment", folder: "agency_forms" },
  { key: "popi_consent", title: "POPI consent form", folder: "agency_forms" },
  { key: "popi_consent_short", title: "POPI consent form (short)", folder: "agency_forms" },
  { key: "seventy_two_hour_clause", title: "72-hour clause", folder: "agency_forms" },
  { key: "property_checklist", title: "Property checklist (office use)", folder: "agency_forms" },
  { key: "welcome_package", title: "New agent welcome package", folder: "onboarding" },
  { key: "doxit_manual", title: "Doxit manual", folder: "onboarding" },
  { key: "nda", title: "Non-disclosure and confidentiality agreement", folder: "onboarding" },
  { key: "agent_flyer", title: "Agent flyer", folder: "marketing" },
];

export interface VaultDocumentDraft {
  folder: string;
  packItem: string | null;
  title: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  note: string | null;
}

/** The rules for filing a document, checked before upload; the database enforces the same. */
export function checkVaultDocument(d: VaultDocumentDraft): Check {
  if (!(d.folder in VAULT_FOLDERS)) return fail("TEBOS_VALIDATION", "Choose a folder.");
  if (d.packItem !== null && !AGENCY_PACK.some((p) => p.key === d.packItem)) return fail("TEBOS_VALIDATION", "That is not one of the agency's papers.");
  const title = d.title.trim();
  if (title.length < 2 || title.length > 160) return fail("TEBOS_VALIDATION", "Give it a title (up to 160 characters).");
  if (!(VAULT_MIME_TYPES as readonly string[]).includes(d.mimeType)) return fail("TEBOS_VALIDATION", "Only PDFs and photos (JPEG, PNG, WebP) go in the vault.");
  if (d.sizeBytes < 1 || d.sizeBytes > VAULT_MAX_BYTES) return fail("TEBOS_VALIDATION", "Files up to 20 MB.");
  if (d.note && d.note.length > 500) return fail("TEBOS_VALIDATION", "Keep the note under 500 characters.");
  if (looksSecret(d.title) || looksSecret(d.note)) {
    return fail("TEBOS_VALIDATION", "This looks like a password, key or token. Secrets are never stored here.");
  }
  return OK;
}

export interface FiledDocument { folder: string; packItem: string | null; storedAt: string | null; archivedAt: string | null }

/** Which of the agency's papers are filed (stored, not archived), and which are still to file. */
export function packProgress(docs: readonly FiledDocument[]) {
  const filed = new Set(docs.filter((d) => d.storedAt && !d.archivedAt && d.packItem).map((d) => d.packItem));
  const missing = AGENCY_PACK.filter((p) => !filed.has(p.key));
  return { total: AGENCY_PACK.length, filed: AGENCY_PACK.length - missing.length, missing };
}

/** The SHA-256 fingerprint of a file, as lowercase hex (Web Crypto, in the browser or Node). */
export async function fingerprint(bytes: ArrayBuffer): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
