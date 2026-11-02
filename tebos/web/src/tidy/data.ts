// Tidy Enterprise's website talks to TEBOS (ADR 0022) only as the public does: is the enquiry form open, and send one.
// No account and no privileged key. Until Tidy Enterprise switches the form on in TEBOS, the site shows the email
// address instead.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import type { EnquiryDraft } from "@core/propertyEnquiry";

export const SLUG = "tidy-enterprise";
export const CONTACT_EMAIL = "tidyai.enterprise@gmail.com";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
const db = url && key ? createClient<Database>(url, key, { auth: { persistSession: false } }) : null;

export async function formOpen(): Promise<boolean> {
  if (!db) return false;
  const { data, error } = await db.rpc("property_enquiry_open", { p_slug: SLUG });
  return !error && data === true;
}

/** Sends the enquiry; returns its reference. A refusal carries the database's reason in plain words. */
export async function sendEnquiry(d: EnquiryDraft): Promise<string> {
  if (!db) throw new Error(`The form isn't open yet. Email ${CONTACT_EMAIL} instead.`);
  const { data, error } = await db.rpc("property_enquiry", {
    p_slug: SLUG, p_situation: d.situation, p_relationship: d.relationship, p_area: d.area.trim(), p_message: d.message.trim(),
    p_name: d.name.trim(), p_email: d.email.trim(), p_phone: d.phone.trim() || null, p_consent: d.consent,
  });
  if (error) {
    const reason = error.message ? error.message.charAt(0).toUpperCase() + error.message.slice(1) : "That didn't go through.";
    throw new Error(error.hint === "TEBOS_RATE_LIMITED" ? `${reason}.` : reason.endsWith(".") ? reason : `${reason}.`);
  }
  return data as string;
}
