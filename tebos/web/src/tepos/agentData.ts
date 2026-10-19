// The agent's office: listings and contacts in the founder's private organisation. The database checks every
// rule, numbers the references and keeps a redacted audit trail; these calls only read and write.
import type { Database } from "../database.types";
import type { Db } from "../lib/supabase";

type Tables = Database["public"]["Tables"];
export type ListingRow = Tables["agent_listings"]["Row"];
export type ContactRow = Tables["agent_contacts"]["Row"];
type Fixed = "id" | "ref" | "stage_at" | "created_by" | "created_at" | "updated_at";
export type ListingInput = Omit<ListingRow, Fixed>;
export type ContactInput = Omit<ContactRow, Fixed>;

function must<R extends { data: unknown; error: unknown }>(res: R): NonNullable<R["data"]> {
  if (res.error) throw res.error;
  return res.data as NonNullable<R["data"]>;
}

export async function listListings(db: Db, orgId: string) {
  return must(await db.from("agent_listings").select("*").eq("org_id", orgId).order("ref"));
}

export async function listContacts(db: Db, orgId: string) {
  return must(await db.from("agent_contacts").select("*").eq("org_id", orgId).order("ref"));
}

export async function saveListing(db: Db, id: string | null, row: ListingInput) {
  if (id) return must(await db.from("agent_listings").update(row).eq("id", id).select().single());
  return must(await db.from("agent_listings").insert(row).select().single());
}

export async function saveContact(db: Db, id: string | null, row: ContactInput) {
  if (id) return must(await db.from("agent_contacts").update(row).eq("id", id).select().single());
  return must(await db.from("agent_contacts").insert(row).select().single());
}

export async function deleteListing(db: Db, id: string) {
  const { error } = await db.from("agent_listings").delete().eq("id", id);
  if (error) throw error;
}

export async function deleteContact(db: Db, id: string) {
  const { error } = await db.from("agent_contacts").delete().eq("id", id);
  if (error) throw error;
}
