// The week board's reads and writes. The database checks every rule (migration tepos_week): who may see the board,
// that only the signed-in person marks a task done, that blocked, deferred and skipped work says why. These calls
// only read and write.
import { WEEK_PLAN } from "@core/week";
import type { Database } from "../database.types";
import type { Db } from "../lib/supabase";

type Tables = Database["public"]["Tables"];
export type WeekRow = Tables["tepos_weeks"]["Row"];
export type WeekDayRow = Tables["tepos_week_days"]["Row"];
export type WeekTaskRow = Tables["tepos_week_tasks"]["Row"];

function must<R extends { data: unknown; error: unknown }>(res: R): NonNullable<R["data"]> {
  if (res.error) throw res.error;
  return res.data as NonNullable<R["data"]>;
}

/**
 * Lays down the recurring plan the first time, from the brief's seven scenes. Safe to run again: the plan's keys
 * (one scene per weekday, one item per position) make a second run add nothing, and an edited plan is kept.
 */
export async function ensurePlan(db: Db, orgId: string) {
  const existing = must(await db.from("tepos_plan_days").select("id").eq("org_id", orgId).limit(1));
  if (existing.length > 0) return;
  must(await db.from("tepos_plan_days").upsert(
    WEEK_PLAN.days.map((d) => ({ org_id: orgId, weekday: d.weekday, scene: d.scene, focus: d.focus, lens: d.lens, deliverable: d.deliverable, saved_to: d.savedTo })),
    { onConflict: "org_id,weekday", ignoreDuplicates: true },
  ).select("id"));
  must(await db.from("tepos_plan_items").upsert(
    WEEK_PLAN.items.map((i) => ({ org_id: orgId, weekday: i.weekday, position: i.position, title: i.title, lens: i.lens, action: i.action,
      definition_of_done: i.definitionOfDone, est_minutes: i.estMinutes })),
    { onConflict: "org_id,weekday,position", ignoreDuplicates: true },
  ).select("id"));
}

/** Opens (or re-opens) the week starting on this Monday, and reads it back. */
export async function openWeek(db: Db, orgId: string, weekStart: string) {
  const weekId = must(await db.rpc("tepos_open_week", { p_org: orgId, p_week_start: weekStart })) as string;
  const [days, tasks] = await Promise.all([
    db.from("tepos_week_days").select("*").eq("week_id", weekId).order("weekday"),
    db.from("tepos_week_tasks").select("*").eq("week_id", weekId).order("local_date").order("position"),
  ]);
  return { weekId, days: must(days), tasks: must(tasks) };
}

export type TaskUpdate = Partial<Pick<WeekTaskRow, "status" | "status_reason" | "defer_until" | "owner_label" | "evidence_note" | "output_link">>;

export async function updateTask(db: Db, id: string, patch: TaskUpdate) {
  return must(await db.from("tepos_week_tasks").update(patch).eq("id", id).select().single());
}

export type DayClose = Pick<WeekDayRow, "outcomes" | "blockers" | "learning" | "carried_forward">;

export async function closeDay(db: Db, id: string, close: DayClose) {
  return must(await db.from("tepos_week_days").update(close).eq("id", id).select().single());
}

/** The records the scoreboard reads, each from its own module; anything this session can't read is left unknown. */
export interface Signals {
  openLeads: number | null;
  verifiedIncomeItems: number | null;
  expectedCommissionItems: number | null;
  propertyCasesTouched: number | null;
  factoryRuns: number | null;
}

async function count(q: PromiseLike<{ count: number | null; error: unknown }>): Promise<number | null> {
  try {
    const { count: n, error } = await q;
    return error ? null : n ?? 0;
  } catch {
    return null;
  }
}

export async function loadSignals(db: Db, orgId: string, weekStart: string): Promise<Signals> {
  const since = `${weekStart}T00:00:00+02:00`;
  const head = { count: "exact" as const, head: true };
  const [openLeads, verifiedIncomeItems, expectedCommissionItems, propertyCasesTouched, factoryRuns] = await Promise.all([
    count(db.from("agent_contacts").select("id", head).eq("org_id", orgId).not("stage", "in", "(completed,lost)")),
    count(db.from("res_money_items").select("id", head).eq("org_id", orgId).eq("kind", "income").eq("basis", "verified")),
    count(db.from("res_money_items").select("id", head).eq("org_id", orgId).eq("kind", "income").eq("stream", "agent_commission").neq("basis", "verified")),
    count(db.from("property_cases").select("id", head).gte("updated_at", since)),
    count(db.from("factory_runs").select("id", head).gte("run_on", weekStart)),
  ]);
  return { openLeads, verifiedIncomeItems, expectedCommissionItems, propertyCasesTouched, factoryRuns };
}
