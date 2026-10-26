// REEDS intake: reads and writes. The database decides everything that matters (migration reeds_intake): a source
// captured twice is one record, a disagreeing source becomes a conflict, done needs evidence, and connection health
// comes only from a sync that really ran. These calls only read and write.
import { SOURCE_TYPES, type SourceType } from "@core/reeds-intake";
import type { WorkerState } from "@core/worker-health";
import type { Database, Json } from "../database.types";
import type { Db } from "../lib/supabase";

type Tables = Database["public"]["Tables"];
export type SourceEventRow = Tables["reeds_source_events"]["Row"];
export type CommitmentRow = Tables["reeds_commitments"]["Row"];
export type DecisionRow = Tables["reeds_decisions"]["Row"];
export type ConflictRow = Tables["reeds_conflicts"]["Row"];
export type IntegrationRow = Tables["reeds_integrations"]["Row"];

function must<R extends { data: unknown; error: unknown }>(res: R): NonNullable<R["data"]> {
  if (res.error) throw res.error;
  return res.data as NonNullable<R["data"]>;
}

/** Every source has a health row; a new one starts as not connected, which is the truth until a sync succeeds. */
export async function ensureSources(db: Db, orgId: string) {
  const have = must(await db.from("reeds_integrations").select("source_type").eq("org_id", orgId)).map((r) => r.source_type);
  const missing = SOURCE_TYPES.filter((t) => !have.includes(t));
  if (missing.length) {
    must(await db.from("reeds_integrations").upsert(missing.map((t) => ({ org_id: orgId, source_type: t })), { onConflict: "org_id,source_type", ignoreDuplicates: true }).select("id"));
  }
}

export async function loadIntake(db: Db, orgId: string) {
  const [sources, events, commitments, decisions, conflicts] = await Promise.all([
    db.from("reeds_integrations").select("*").eq("org_id", orgId).order("source_type"),
    db.from("reeds_source_events").select("*").eq("org_id", orgId).order("received_at", { ascending: false }).limit(50),
    db.from("reeds_commitments").select("*").eq("org_id", orgId).order("created_at", { ascending: false }),
    db.from("reeds_decisions").select("*").eq("org_id", orgId).order("created_at", { ascending: false }),
    db.from("reeds_conflicts").select("*").eq("org_id", orgId).is("resolution", null),
  ]);
  return { sources: must(sources), events: must(events), commitments: must(commitments), decisions: must(decisions), conflicts: must(conflicts) };
}

export interface CaptureInput {
  sourceType: SourceType;
  sourceRef: string;
  sourceLink: string;
  sender: string;
  summary: string;
  triage: string;
  workspace: string;
  items: Array<Record<string, string | undefined>>;
}

export async function capture(db: Db, orgId: string, c: CaptureInput) {
  const r = must(await db.rpc("reeds_capture", {
    p_org: orgId, p_source_type: c.sourceType, p_source_ref: c.sourceRef || null, p_source_link: c.sourceLink || null,
    p_received_at: new Date().toISOString(), p_sender: c.sender || null, p_summary: c.summary, p_triage: c.triage, p_workspace: c.workspace,
    p_items: c.items as unknown as Json,
  })) as { source_event_id: string; duplicate: boolean; created: number; conflicts: number; skipped: number };
  return r;
}

export type CommitmentUpdate = Partial<Pick<CommitmentRow, "status" | "approval" | "completion_evidence" | "blocked_reason" | "due_on" | "due_basis" | "next_action">>;

export async function updateCommitment(db: Db, id: string, patch: CommitmentUpdate) {
  return must(await db.from("reeds_commitments").update(patch).eq("id", id).select().single());
}

export async function decide(db: Db, id: string, decision: string, rationale: string) {
  return must(await db.from("reeds_decisions").update({ status: "decided", decision, rationale: rationale || null }).eq("id", id).select().single());
}

/** Settles a conflict: keep the recorded value, or take the reported one onto the commitment. */
export async function resolveConflict(db: Db, conflict: ConflictRow, take: boolean) {
  if (take && conflict.field === "due_on" && conflict.reported_value) {
    must(await db.from("reeds_commitments").update({ due_on: conflict.reported_value, due_basis: "reported" }).eq("id", conflict.commitment_id).select("id"));
  }
  return must(await db.from("reeds_conflicts").update({ resolution: take ? "took_reported" : "kept_recorded" }).eq("id", conflict.id).select().single());
}

/** Whether the worker is running, from its heartbeat (migration worker_heartbeat). The database decides the state. */
export async function loadWorkerStatus(db: Db) {
  const rows = must(await db.rpc("worker_status"));
  const r = rows[0];
  return r ? { state: r.state as WorkerState, minutesSince: r.minutes_since, lastPassErrors: r.last_pass_errors, lastError: r.last_error } : null;
}
