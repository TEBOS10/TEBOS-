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

// Slice 2: the documents a deal has (tracked, never stored) and the FFC path.
export type DealItemRow = Tables["agent_deal_items"]["Row"];
export type FfcStepRow = Tables["agent_ffc_steps"]["Row"];
export type DealItemInput = Omit<DealItemRow, "id" | "created_by" | "created_at" | "updated_at">;
export type FfcStepInput = Omit<FfcStepRow, "id" | "created_by" | "created_at" | "updated_at">;

export async function listDealItems(db: Db, orgId: string) {
  return must(await db.from("agent_deal_items").select("*").eq("org_id", orgId));
}

/** One entry per deal and document: recording it again updates it. */
export async function saveDealItem(db: Db, id: string | null, row: DealItemInput) {
  if (id) return must(await db.from("agent_deal_items").update(row).eq("id", id).select().single());
  return must(await db.from("agent_deal_items").insert(row).select().single());
}

export async function listFfcSteps(db: Db, orgId: string) {
  return must(await db.from("agent_ffc_steps").select("*").eq("org_id", orgId).order("position").order("created_at"));
}

export async function saveFfcStep(db: Db, id: string | null, row: FfcStepInput) {
  if (id) return must(await db.from("agent_ffc_steps").update(row).eq("id", id).select().single());
  return must(await db.from("agent_ffc_steps").insert(row).select().single());
}

export async function addFfcSteps(db: Db, rows: FfcStepInput[]) {
  return must(await db.from("agent_ffc_steps").insert(rows).select());
}

export async function deleteFfcStep(db: Db, id: string) {
  const { error } = await db.from("agent_ffc_steps").delete().eq("id", id);
  if (error) throw error;
}
