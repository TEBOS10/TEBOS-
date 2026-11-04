// Tidy Property Operations (ADR 0023): reads and writes. The database decides who may do what, what a lease or an entry
// must contain, and how money is counted; these calls only read and write, and a refusal carries the database's reason.
import type { Database } from "../database.types";
import type { Db } from "./supabase";

type Tables = Database["public"]["Tables"];
export type OpsProperty = Tables["ops_properties"]["Row"];
export type OpsUnit = Tables["ops_units"]["Row"];
export type OpsTenant = Tables["ops_tenants"]["Row"];
export type OpsLease = Tables["ops_leases"]["Row"];
export type OpsEntry = Tables["ops_ledger"]["Row"];
export type OpsSupplier = Tables["ops_suppliers"]["Row"];
export type OpsMaintenance = Tables["ops_maintenance"]["Row"];
export type OpsPhoto = Tables["ops_maintenance_photos"]["Row"];
export type OpsSubscription = Tables["ops_subscriptions"]["Row"];
export type OpsPosition = Database["public"]["Functions"]["ops_lease_positions"]["Returns"][number];

export interface MonthSummary {
  month: string; as_of: string; properties: number; units: number; occupied: number; held_back: number; vacant: number;
  expected_cents: number; billed_cents: number; received_cents: number; outstanding_cents: number; overdue_cents: number;
  deposits_held_cents: number; maintenance_spend_cents: number; maintenance_open: number; vacancy_estimate_cents: number;
  vacant_without_market_rent: number;
}

function must<R extends { data: unknown; error: unknown }>(res: R): NonNullable<R["data"]> {
  if (res.error) throw res.error;
  return res.data as NonNullable<R["data"]>;
}

// --- the whole account, loaded together (a small landlord's portfolio is small; pagination comes with scale) --------
export interface Portfolio {
  subscription: OpsSubscription | null;
  properties: OpsProperty[];
  units: OpsUnit[];
  tenants: OpsTenant[];
  leases: OpsLease[];
}

export async function portfolio(db: Db, org: string): Promise<Portfolio> {
  const [subscription, properties, units, tenants, leases] = await Promise.all([
    db.from("ops_subscriptions").select("*").eq("org_id", org).maybeSingle(),
    db.from("ops_properties").select("*").eq("org_id", org).is("archived_at", null).order("name"),
    db.from("ops_units").select("*").eq("org_id", org).order("label"),
    db.from("ops_tenants").select("*").eq("org_id", org).order("full_name"),
    db.from("ops_leases").select("*").eq("org_id", org).order("starts_on", { ascending: false }),
  ]);
  return {
    subscription: (subscription.error ? null : subscription.data) ?? null,
    properties: must(properties), units: must(units), tenants: must(tenants), leases: must(leases),
  };
}

export async function monthSummary(db: Db, org: string, month: string, property?: string): Promise<MonthSummary> {
  return must(await db.rpc("ops_month_summary", { p_org: org, p_month: month, p_property: property ?? null })) as unknown as MonthSummary;
}

export async function positions(db: Db, org: string, asOf?: string): Promise<OpsPosition[]> {
  return must(await db.rpc("ops_lease_positions", { p_org: org, p_as_of: asOf ?? null }));
}

export async function generateRent(db: Db, org: string, month: string): Promise<number> {
  return must(await db.rpc("ops_generate_rent", { p_org: org, p_month: month })) as number;
}

// --- portfolio -------------------------------------------------------------------------------------------------------
export async function addProperty(db: Db, row: Tables["ops_properties"]["Insert"]): Promise<OpsProperty> {
  return must(await db.from("ops_properties").insert(row).select().single());
}
export async function addUnit(db: Db, row: Tables["ops_units"]["Insert"]): Promise<OpsUnit> {
  return must(await db.from("ops_units").insert(row).select().single());
}
export async function updateUnit(db: Db, id: string, patch: Tables["ops_units"]["Update"]): Promise<void> {
  must(await db.from("ops_units").update(patch).eq("id", id).select());
}

// --- tenants and leases ----------------------------------------------------------------------------------------------
export async function addTenant(db: Db, row: Tables["ops_tenants"]["Insert"]): Promise<OpsTenant> {
  return must(await db.from("ops_tenants").insert(row).select().single());
}
export async function addLease(db: Db, row: Tables["ops_leases"]["Insert"]): Promise<OpsLease> {
  return must(await db.from("ops_leases").insert(row).select().single());
}
export async function endLease(db: Db, id: string, endedOn: string, reason: string): Promise<void> {
  must(await db.from("ops_leases").update({ status: "ended", ended_on: endedOn, end_reason: reason.trim() }).eq("id", id).select());
}
export async function ledger(db: Db, lease: string): Promise<OpsEntry[]> {
  return must(await db.from("ops_ledger").select("*").eq("lease_id", lease).order("effective_on").order("created_at"));
}
export async function ledgerBetween(db: Db, org: string, from: string, toExclusive: string): Promise<OpsEntry[]> {
  return must(await db.from("ops_ledger").select("*").eq("org_id", org).gte("effective_on", from).lt("effective_on", toExclusive)
    .order("effective_on").order("created_at"));
}
export async function addEntry(db: Db, row: Tables["ops_ledger"]["Insert"]): Promise<OpsEntry> {
  return must(await db.from("ops_ledger").insert(row).select().single());
}
export async function reverseEntry(db: Db, original: OpsEntry, on: string, reason: string): Promise<OpsEntry> {
  // the database copies the amount and account from the entry it reverses; these values only satisfy the shape
  return addEntry(db, { org_id: original.org_id, lease_id: original.lease_id, kind: "reversal", account: original.account,
    amount_cents: original.amount_cents, effective_on: on, reverses_id: original.id, note: reason.trim() });
}

// --- maintenance -----------------------------------------------------------------------------------------------------
export async function suppliers(db: Db, org: string): Promise<OpsSupplier[]> {
  return must(await db.from("ops_suppliers").select("*").eq("org_id", org).order("name"));
}
export async function addSupplier(db: Db, row: Tables["ops_suppliers"]["Insert"]): Promise<OpsSupplier> {
  return must(await db.from("ops_suppliers").insert(row).select().single());
}
export async function maintenance(db: Db, org: string): Promise<OpsMaintenance[]> {
  return must(await db.from("ops_maintenance").select("*").eq("org_id", org).order("created_at", { ascending: false }));
}
export async function addRequest(db: Db, row: Tables["ops_maintenance"]["Insert"]): Promise<OpsMaintenance> {
  return must(await db.from("ops_maintenance").insert(row).select().single());
}
export async function updateRequest(db: Db, id: string, patch: Tables["ops_maintenance"]["Update"]): Promise<void> {
  must(await db.from("ops_maintenance").update(patch).eq("id", id).select());
}
export async function photos(db: Db, request: string): Promise<OpsPhoto[]> {
  return must(await db.from("ops_maintenance_photos").select("*").eq("request_id", request).order("created_at"));
}

/** A photo: the record first (which names the exact path), then the file into that path. */
export async function addPhoto(db: Db, org: string, request: string, file: File): Promise<void> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("Photos must be JPEG, PNG or WebP.");
  if (file.size > 10 * 1024 * 1024) throw new Error("A photo can be at most 10 MB.");
  const id = crypto.randomUUID();
  const path = `${org}/maintenance/${request}/${id}`;
  must(await db.from("ops_maintenance_photos").insert({ id, org_id: org, request_id: request, path, file_name: file.name.slice(0, 200) }).select());
  const { error } = await db.storage.from("ops-files").upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
}

export async function photoUrl(db: Db, path: string): Promise<string | null> {
  const { data, error } = await db.storage.from("ops-files").createSignedUrl(path, 300);
  return error ? null : data.signedUrl;
}
