// The private vault: the founder's own papers in a private storage bucket. The database decides who may upload
// and open what, logs every opening and marks a file stored only when it sees it; these calls only ask.
import { fingerprint } from "@core/vault";
import type { Database } from "../database.types";
import type { Db } from "../lib/supabase";

export const VAULT_BUCKET = "tepos-vault";
const LINK_SECONDS = 60;

export type VaultDocumentRow = Database["public"]["Tables"]["vault_documents"]["Row"];
export type VaultReadRow = Database["public"]["Tables"]["vault_reads"]["Row"];

function must<R extends { data: unknown; error: unknown }>(res: R): NonNullable<R["data"]> {
  if (res.error) throw res.error;
  return res.data as NonNullable<R["data"]>;
}

export async function listVault(db: Db, orgId: string) {
  return must(await db.from("vault_documents").select("*").eq("org_id", orgId).order("folder").order("title"));
}

export async function listVaultReads(db: Db, orgId: string) {
  return must(await db.from("vault_reads").select("*").eq("org_id", orgId).order("opened_at", { ascending: false }).limit(20));
}

export interface Filing { folder: string; packItem: string | null; title: string; note: string | null }

/**
 * Files one document: the record first (it names where the file may go), then the upload, then the database
 * checks the file arrived. If the upload fails, the record stays "not stored" and the same file can be sent again.
 */
export async function fileDocument(db: Db, orgId: string, file: File, f: Filing): Promise<VaultDocumentRow> {
  const id = crypto.randomUUID();
  const path = `${orgId}/${id}`;
  const sha256 = await fingerprint(await file.arrayBuffer());
  const row = must(await db.from("vault_documents").insert({
    id, org_id: orgId, folder: f.folder, pack_item: f.packItem, title: f.title, note: f.note,
    file_name: file.name.slice(0, 200), mime_type: file.type, size_bytes: file.size, sha256, storage_path: path,
  }).select().single());
  await sendFile(db, row, file);
  return row;
}

/** Uploads the file to the path its record names (never over an existing one), then has the database confirm it. */
export async function sendFile(db: Db, row: VaultDocumentRow, file: File) {
  if ((await fingerprint(await file.arrayBuffer())) !== row.sha256) throw new Error("This is not the same file as the one recorded. Choose the original.");
  const up = await db.storage.from(VAULT_BUCKET).upload(row.storage_path, file, { contentType: row.mime_type, upsert: false });
  if (up.error) throw up.error;
  must(await db.rpc("vault_confirm", { p_document: row.id }));
}

/** Opens a file: the opening is logged first, then a link valid for one minute is signed. */
export async function openDocument(db: Db, id: string): Promise<string> {
  const path = must(await db.rpc("vault_open", { p_document: id }));
  const signed = await db.storage.from(VAULT_BUCKET).createSignedUrl(path, LINK_SECONDS);
  if (signed.error) throw signed.error;
  return signed.data.signedUrl;
}

export async function updateFiling(db: Db, id: string, f: Partial<Filing> & { archived?: boolean }) {
  return must(await db.from("vault_documents").update({
    ...(f.folder !== undefined && { folder: f.folder }),
    ...(f.title !== undefined && { title: f.title }),
    ...(f.note !== undefined && { note: f.note }),
    ...(f.packItem !== undefined && { pack_item: f.packItem }),
    ...(f.archived !== undefined && { archived_at: f.archived ? new Date().toISOString() : null }),
  }).eq("id", id).select().single());
}
