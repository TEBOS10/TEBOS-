// The daily sales desk (migration sales_prospects): today's calls and their outcomes. The database decides who may
// see the list, which status changes are allowed, and that "do not contact" is final; these calls only read and write.
import type { SalesProspectStatus } from "@core/states";
import { CALLS_PER_DAY, nextCallAfter } from "@core/prospects";
import type { Database } from "../database.types";
import type { Db } from "./supabase";

export type ProspectRow = Database["public"]["Tables"]["sales_prospects"]["Row"];

function must<R extends { data: unknown; error: unknown }>(res: R): NonNullable<R["data"]> {
  if (res.error) throw res.error;
  return res.data as NonNullable<R["data"]>;
}

export async function callsToday(db: Db): Promise<ProspectRow[]> {
  return must(await db.rpc("sales_calls_today", { p_limit: CALLS_PER_DAY })) as ProspectRow[];
}

export async function prospectCounts(db: Db) {
  const rows = must(await db.from("sales_prospects").select("status"));
  const by: Record<string, number> = {};
  for (const r of rows) by[r.status] = (by[r.status] ?? 0) + 1;
  return { total: rows.length, by };
}

export async function recordCall(db: Db, id: string, status: SalesProspectStatus, outcome: string, today: string) {
  return must(await db.from("sales_prospects").update({
    status, last_outcome: outcome.trim() || null, next_call_on: nextCallAfter(status, today),
  }).eq("id", id).select().single());
}

export interface NewProspect { business_name: string; industry: string; area: string; website: string; phone: string; source_url: string; why_fit: string }

export async function addProspect(db: Db, p: NewProspect) {
  return must(await db.from("sales_prospects").insert({
    business_name: p.business_name.trim(), industry: p.industry.trim(), area: p.area.trim(),
    website: p.website.trim() || null, phone: p.phone.trim() || null, source_url: p.source_url.trim(), why_fit: p.why_fit.trim(),
  }).select().single());
}
