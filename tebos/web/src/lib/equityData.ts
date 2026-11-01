// The equity programme (migration equity_programme, ADR 0013). The database decides who qualifies, who approves, what
// the terms are and who sees a partner's sales; these calls only read and write, and a refusal is the database's reason.
import type { EquityApplicationStatus } from "@core/states";
import type { Database } from "../database.types";
import type { Db } from "./supabase";

type Tables = Database["public"]["Tables"];
export type Application = Tables["equity_applications"]["Row"];
export type Terms = Tables["equity_terms"]["Row"];
export type Sale = Tables["partner_sales"]["Row"];
export type MonthClose = Tables["partner_month_closes"]["Row"];
export type AuditMonth = Database["public"]["Functions"]["equity_audit"]["Returns"][number];

function must<R extends { data: unknown; error: unknown }>(res: R): NonNullable<R["data"]> {
  if (res.error) throw res.error;
  return res.data as NonNullable<R["data"]>;
}

export async function applications(db: Db): Promise<Application[]> {
  return must(await db.from("equity_applications").select("*").order("created_at", { ascending: false }));
}

export async function allTerms(db: Db): Promise<Terms[]> {
  return must(await db.from("equity_terms").select("*"));
}

export async function clientOrgs(db: Db) {
  return must(await db.rpc("equity_client_orgs")) as Array<{ org_id: string; org_name: string }>;
}

export async function openApplication(db: Db, a: { business_name: string; sector: string; revenue_band: string; org_id: string | null; status_note: string }) {
  return must(await db.from("equity_applications").insert({ ...a, business_name: a.business_name.trim(), status_note: a.status_note.trim() }).select().single());
}

export type Facts = Pick<Application, "registration_number" | "trading_since" | "sector" | "revenue_band" | "employees" | "owner_full_time" | "revenue_evidence_note" | "reporting_consent" | "package" | "org_id">;

export async function saveFacts(db: Db, id: string, f: Facts) {
  return must(await db.from("equity_applications").update(f).eq("id", id).select().single());
}

export async function moveApplication(db: Db, id: string, status: EquityApplicationStatus, note: string, agreementRef?: string) {
  return must(await db.from("equity_applications").update({ status, status_note: note.trim(), ...(agreementRef ? { agreement_ref: agreementRef.trim() } : {}) }).eq("id", id).select().single());
}

export async function recordTerms(db: Db, a: Application, startsOn: string) {
  return must(await db.from("equity_terms").insert({ org_id: a.org_id!, application_id: a.id, package: a.package, agreement_ref: a.agreement_ref!, starts_on: startsOn }).select().single());
}

export async function audit(db: Db, orgId: string, months = 6): Promise<AuditMonth[]> {
  return must(await db.rpc("equity_audit", { p_org: orgId, p_months: months })) as AuditMonth[];
}

// the partner's own side
export async function myTerms(db: Db, orgId: string): Promise<Terms | null> {
  const res = await db.from("equity_terms").select("*").eq("org_id", orgId).is("ended_on", null).maybeSingle();
  if (res.error) throw res.error;
  return res.data ?? null;
}

export async function recentSales(db: Db, orgId: string): Promise<Sale[]> {
  return must(await db.from("partner_sales").select("*").eq("org_id", orgId).order("sold_on", { ascending: false }).order("created_at", { ascending: false }).limit(50));
}

export async function recordSale(db: Db, orgId: string, s: { sold_on: string; kind: "sale" | "refund" | "correction"; amount_cents: number; reference: string; channel: string; note: string }) {
  return must(await db.from("partner_sales").insert({
    org_id: orgId, sold_on: s.sold_on, kind: s.kind, amount_cents: s.amount_cents, channel: s.channel,
    reference: s.reference.trim() || null, note: s.note.trim() || null,
  }).select().single());
}

export async function closeMonth(db: Db, orgId: string, period: string, note: string) {
  return must(await db.from("partner_month_closes").insert({ org_id: orgId, period, note: note.trim() || null }).select().single());
}
