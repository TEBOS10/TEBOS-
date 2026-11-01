// The AI crew (migration ai_crew, ADR 0020). The database decides who may approve, what may be published and what
// can change; these calls only read and write, and a refusal carries the database's reason.
import type { Database } from "../database.types";
import type { Db } from "./supabase";

type Tables = Database["public"]["Tables"];
export type Agent = Tables["ai_agents"]["Row"];
export type Task = Tables["ai_tasks"]["Row"];
export type OnDuty = Database["public"]["Functions"]["ai_on_duty"]["Returns"][number];

function must<R extends { data: unknown; error: unknown }>(res: R): NonNullable<R["data"]> {
  if (res.error) throw res.error;
  return res.data as NonNullable<R["data"]>;
}

export async function agents(db: Db, org: string): Promise<Agent[]> {
  return must(await db.from("ai_agents").select("*").eq("org_id", org).order("team").order("shift").order("name"));
}
export async function onDuty(db: Db, org: string): Promise<OnDuty[]> {
  return must(await db.rpc("ai_on_duty", { p_org: org })) as OnDuty[];
}
export async function addAgent(db: Db, a: Tables["ai_agents"]["Insert"]): Promise<void> {
  must(await db.from("ai_agents").insert(a).select());
}
export async function setAgentStatus(db: Db, id: string, status: "active" | "paused"): Promise<void> {
  must(await db.from("ai_agents").update({ status }).eq("id", id).select());
}
/** Work waiting on people (drafts to decide, approved work to send) and work waiting on an agent, oldest first. */
export async function openTasks(db: Db, org: string): Promise<Task[]> {
  return must(await db.from("ai_tasks").select("*").eq("org_id", org).in("status", ["queued", "drafted", "approved"]).order("created_at"));
}
export async function updateTask(db: Db, id: string, patch: Tables["ai_tasks"]["Update"]): Promise<Task> {
  return must(await db.from("ai_tasks").update(patch).eq("id", id).select().single());
}
