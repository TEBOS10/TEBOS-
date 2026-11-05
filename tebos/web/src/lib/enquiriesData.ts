// Property enquiries (migration property_enquiries, ADR 0022). The database decides who reads them, how they move on
// and what the public may send; these calls only read and write, and a refusal carries the database's reason.
import type { Database } from "../database.types";
import type { Db } from "./supabase";

type Tables = Database["public"]["Tables"];
export type PropertyEnquiry = Tables["property_enquiries"]["Row"];
export type EnquirySettings = Tables["property_enquiry_settings"]["Row"];

function must<R extends { data: unknown; error: unknown }>(res: R): NonNullable<R["data"]> {
  if (res.error) throw res.error;
  return res.data as NonNullable<R["data"]>;
}

/** This organisation's enquiry setting, or null when it doesn't take enquiries from a website. */
export async function enquirySettings(db: Db, org: string): Promise<EnquirySettings | null> {
  const rows = must(await db.from("property_enquiry_settings").select("*").eq("org_id", org).limit(1));
  return rows[0] ?? null;
}

export async function setAccepting(db: Db, org: string, accepting: boolean): Promise<void> {
  must(await db.from("property_enquiry_settings").update({ accepting, updated_at: new Date().toISOString() }).eq("org_id", org).select());
}

/** Newest first. Only the organisation's admins and operators get rows back. */
export async function enquiries(db: Db, org: string): Promise<PropertyEnquiry[]> {
  return must(await db.from("property_enquiries").select("*").eq("org_id", org).order("created_at", { ascending: false }).limit(200));
}

export async function moveEnquiry(db: Db, id: string, status: "contacted" | "closed", note: string): Promise<void> {
  must(await db.from("property_enquiries").update({ status, status_note: note.trim() }).eq("id", id).select());
}

/** Removes an enquiry and the person's details, when they ask. Only an admin can. */
export async function deleteEnquiry(db: Db, id: string): Promise<void> {
  const rows = must(await db.from("property_enquiries").delete().eq("id", id).select("id"));
  if (rows.length === 0) throw new Error("Only an admin can delete an enquiry.");
}
