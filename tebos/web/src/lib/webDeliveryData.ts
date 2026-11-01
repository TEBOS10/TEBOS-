// The Web Delivery Division's records (migrations web_delivery and web_delivery_ledger). The database decides who may
// read and write, which state changes are allowed and when a project is ready; these calls only read and write, and a
// refusal comes back as the database's own reason.
import type { WebProjectStatus, WebTaskStatus } from "@core/states";
import type { IntakeAnswers, ReadinessItem, ReadinessStatus, WebRole } from "@core/web-delivery";
import type { Database, Json } from "../database.types";
import type { Db } from "./supabase";

type Tables = Database["public"]["Tables"];
export type BoardRow = Database["public"]["Functions"]["web_delivery_board"]["Returns"][number];
export type ClientOption = Database["public"]["Functions"]["web_delivery_clients"]["Returns"][number];
export type WebProject = Tables["web_projects"]["Row"];
export type ScopeRevision = Tables["web_scope_revisions"]["Row"];
export type Approval = Tables["web_project_approvals"]["Row"];
export type ReadinessRow = Tables["web_readiness_items"]["Row"];
export type QaRun = Tables["web_qa_runs"]["Row"];
export type WebTask = Tables["web_tasks"]["Row"];
export type Dependency = Tables["web_task_dependencies"]["Row"];
export type WebAsset = Tables["web_assets"]["Row"];
export type Deployment = Tables["web_deployments"]["Row"];
export type Integration = Tables["web_integrations"]["Row"];
export type ProjectCost = Tables["web_project_costs"]["Row"];
export type ChangeRequestRow = Tables["change_requests"]["Row"];
export type TeamLoad = Database["public"]["Functions"]["web_team_load"]["Returns"][number];
export type HistoryRow = Database["public"]["Functions"]["web_project_history"]["Returns"][number];
export type Intake = Tables["web_intakes"]["Row"];
export type QueueItem = Database["public"]["Functions"]["web_work_queue"]["Returns"][number];

function must<R extends { data: unknown; error: unknown }>(res: R): NonNullable<R["data"]> {
  if (res.error) throw res.error;
  return res.data as NonNullable<R["data"]>;
}

export async function deliveryBoard(db: Db): Promise<BoardRow[]> {
  return must(await db.rpc("web_delivery_board")) as BoardRow[];
}

export async function deliveryClients(db: Db): Promise<ClientOption[]> {
  return must(await db.rpc("web_delivery_clients")) as ClientOption[];
}

export interface NewProject { org_id: string; name: string; website_type: string; primary_objective: string; plan: string; status_note: string; starting_point?: string; existing_url?: string | null }

export async function createProject(db: Db, p: NewProject): Promise<WebProject> {
  return must(await db.from("web_projects").insert({ ...p, name: p.name.trim(), status_note: p.status_note.trim(), existing_url: p.existing_url?.trim() || null }).select().single());
}

export interface ProjectFile {
  project: WebProject;
  scopes: ScopeRevision[];
  approvals: Approval[];
  readiness: ReadinessRow[];
  qa: QaRun[];
  tasks: WebTask[];
  dependencies: Dependency[];
  assets: WebAsset[];
  deployments: Deployment[];
  gaps: string[];
  clientName: string | null;
  integrations: Integration[];
  costs: ProjectCost[];
  changes: ChangeRequestRow[];
  history: HistoryRow[];
  intake: Intake | null;
}

export async function projectFile(db: Db, id: string): Promise<ProjectFile> {
  const [project, scopes, approvals, readiness, qa, tasks, dependencies, assets, deployments, gaps, board, integrations, costs, changes, history, intake] = await Promise.all([
    db.from("web_projects").select("*").eq("id", id).single(),
    db.from("web_scope_revisions").select("*").eq("project_id", id).order("revision", { ascending: false }),
    db.from("web_project_approvals").select("*").eq("project_id", id).order("created_at"),
    db.from("web_readiness_items").select("*").eq("project_id", id),
    db.from("web_qa_runs").select("*").eq("project_id", id).order("created_at", { ascending: false }),
    db.from("web_tasks").select("*").eq("project_id", id).order("created_at"),
    db.from("web_task_dependencies").select("*").eq("project_id", id),
    db.from("web_assets").select("*").eq("project_id", id).order("created_at"),
    db.from("web_deployments").select("*").eq("project_id", id).order("created_at", { ascending: false }),
    db.rpc("web_project_readiness", { p_project: id }),
    db.rpc("web_delivery_board"),
    db.from("web_integrations").select("*").eq("project_id", id).order("created_at"),
    db.from("web_project_costs").select("*").eq("project_id", id).order("incurred_on", { ascending: false }),
    db.from("change_requests").select("*").eq("web_project_id", id).order("created_at", { ascending: false }),
    db.rpc("web_project_history", { p_project: id }),
    db.from("web_intakes").select("*").eq("project_id", id).maybeSingle(),
  ]);
  if (intake.error) throw intake.error;
  return {
    project: must(project), scopes: must(scopes), approvals: must(approvals), readiness: must(readiness), qa: must(qa),
    tasks: must(tasks), dependencies: must(dependencies), assets: must(assets), deployments: must(deployments),
    gaps: (must(gaps) as string[]) ?? [],
    clientName: ((must(board) as BoardRow[]).find((b) => b.id === id)?.org_name) ?? null,
    integrations: must(integrations), costs: must(costs), changes: must(changes), history: (must(history) as HistoryRow[]) ?? [],
    intake: intake.data ?? null,
  };
}

export async function moveProject(db: Db, id: string, status: WebProjectStatus, note: string) {
  return must(await db.from("web_projects").update({ status, status_note: note.trim() }).eq("id", id).select().single());
}

export async function saveReadiness(db: Db, project: WebProject, existing: ReadinessRow | undefined, item: ReadinessItem, status: ReadinessStatus, evidence: string) {
  const ev = evidence.trim() || null;
  if (existing) return must(await db.from("web_readiness_items").update({ status, evidence: ev }).eq("id", existing.id).select().single());
  return must(await db.from("web_readiness_items").insert({ project_id: project.id, org_id: project.org_id, item, status, evidence: ev }).select().single());
}

export interface NewScope { pages: string[]; features: string[]; workflows: string[]; exclusions: string; primary_conversion: string; acceptance_criteria: string[]; recurring_costs: string }

export async function addScope(db: Db, project: WebProject, s: NewScope) {
  return must(await db.from("web_scope_revisions").insert({ project_id: project.id, org_id: project.org_id, ...s }).select().single());
}

export async function addTask(db: Db, project: WebProject, t: { role: WebRole; title: string; done_when: string; due_on: string | null; depends_on: string | null }) {
  const task = must(await db.from("web_tasks").insert({
    project_id: project.id, org_id: project.org_id, role: t.role, title: t.title.trim(), done_when: t.done_when.trim(), due_on: t.due_on || null,
  }).select().single());
  if (t.depends_on) must(await db.from("web_task_dependencies").insert({ task_id: task.id, depends_on: t.depends_on, project_id: project.id }));
  return task;
}

export async function moveTask(db: Db, id: string, status: WebTaskStatus, extra: { evidence?: string; blocked_reason?: string } = {}) {
  return must(await db.from("web_tasks").update({ status, ...extra }).eq("id", id).select().single());
}

export async function claimTask(db: Db, id: string, userId: string) {
  return must(await db.from("web_tasks").update({ assigned_to: userId }).eq("id", id).select().single());
}

export async function addAsset(db: Db, project: WebProject, a: { label: string; kind: string }) {
  return must(await db.from("web_assets").insert({ project_id: project.id, org_id: project.org_id, label: a.label.trim(), kind: a.kind }).select().single());
}

export async function updateAsset(db: Db, id: string, a: { status: string; source: string; licence_note: string; location: string }) {
  return must(await db.from("web_assets").update({ status: a.status, source: a.source, licence_note: a.licence_note.trim() || null, location: a.location.trim() || null }).eq("id", id).select().single());
}

export async function addQaRun(db: Db, project: WebProject, revisionId: string, r: { verdict: string; critical_open: number; checked: string[]; evidence: string; tested_url: string }) {
  return must(await db.from("web_qa_runs").insert({
    project_id: project.id, org_id: project.org_id, revision_id: revisionId, verdict: r.verdict, critical_open: r.critical_open,
    checked: r.checked, evidence: r.evidence.trim(), tested_url: r.tested_url.trim() || null,
  }).select().single());
}

export async function addDeployment(db: Db, project: WebProject, d: { environment: "preview" | "production"; url: string; commit_ref: string; outcome: "live" | "failed"; checked: string }) {
  return must(await db.from("web_deployments").insert({ project_id: project.id, org_id: project.org_id, ...d, url: d.url.trim(), commit_ref: d.commit_ref.trim(), checked: d.checked.trim() }).select().single());
}

export async function rollBack(db: Db, id: string, note: string) {
  return must(await db.from("web_deployments").update({ outcome: "rolled_back", rollback_note: note.trim() }).eq("id", id).select().single());
}

/** Split a textarea into one item per line, dropping blanks. */
export const lines = (text: string) => text.split("\n").map((l) => l.trim()).filter(Boolean);

// ---------------------------------------------------------------------------
// Milestone 3: maintainers, accounts, costs, and the client's side
// ---------------------------------------------------------------------------
export async function teamLoad(db: Db): Promise<TeamLoad[]> {
  return must(await db.rpc("web_team_load")) as TeamLoad[];
}

export async function projectMaintainers(db: Db): Promise<Record<string, string | null>> {
  const rows = must(await db.from("web_projects").select("id, maintainer_id"));
  return Object.fromEntries(rows.map((r) => [r.id, r.maintainer_id]));
}

export async function assignMaintainer(db: Db, id: string, userId: string) {
  return must(await db.from("web_projects").update({ maintainer_id: userId }).eq("id", id).select().single());
}

export interface NewIntegration { service: string; provider: string; account_owner: "client" | "tebos"; tebos_access: string; purpose: string; revocation_plan: string; transfer_plan: string }

export async function addIntegration(db: Db, project: WebProject, i: NewIntegration) {
  return must(await db.from("web_integrations").insert({
    project_id: project.id, org_id: project.org_id, service: i.service, provider: i.provider.trim(), account_owner: i.account_owner,
    tebos_access: i.tebos_access, purpose: i.purpose.trim(), revocation_plan: i.revocation_plan.trim() || null, transfer_plan: i.transfer_plan.trim() || null,
  }).select().single());
}

export async function setIntegrationStatus(db: Db, id: string, status: string, verifiedOn: string | null, access?: string) {
  return must(await db.from("web_integrations").update({ status, verified_on: verifiedOn, ...(access ? { tebos_access: access } : {}) }).eq("id", id).select().single());
}

export interface NewCost { kind: string; description: string; amount_cents: number; recurrence: string; paid_by: "client" | "tebos"; disclosed_to_client: boolean }

export async function addCost(db: Db, project: WebProject, c: NewCost) {
  return must(await db.from("web_project_costs").insert({ project_id: project.id, org_id: project.org_id, ...c, description: c.description.trim() }).select().single());
}

/** The client's own projects (the board returns only theirs) and, for each, what the portal shows. */
export interface ClientProject extends ProjectFile { row: BoardRow }

export async function clientProjects(db: Db): Promise<ClientProject[]> {
  const rows = (must(await db.rpc("web_delivery_board")) as BoardRow[]).filter((r) => r.status !== "cancelled");
  return Promise.all(rows.map(async (row) => ({ ...(await projectFile(db, row.id)), row })));
}

export async function approve(db: Db, project: WebProject, revisionId: string, kind: "scope" | "design" | "release", note: string) {
  return must(await db.from("web_project_approvals").insert({ project_id: project.id, org_id: project.org_id, revision_id: revisionId, kind, note: note.trim() || null }).select().single());
}

export async function askForChange(db: Db, project: WebProject, title: string, detail: string) {
  return must(await db.from("change_requests").insert({ org_id: project.org_id, web_project_id: project.id, title: title.trim(), detail: detail.trim() || null }).select().single());
}

// ---------------------------------------------------------------------------
// Milestone 4: the client's brief and the work queue
// ---------------------------------------------------------------------------
export async function saveIntake(db: Db, project: WebProject, existing: Intake | null, answers: IntakeAnswers, submit: boolean): Promise<Intake> {
  const row = existing ?? must(await db.from("web_intakes").insert({ project_id: project.id, org_id: project.org_id }).select().single());
  return must(await db.from("web_intakes").update({ answers: answers as unknown as Json, ...(submit ? { status: "submitted" } : {}) }).eq("id", row.id).select().single());
}

export async function reopenIntake(db: Db, id: string, reason: string) {
  return must(await db.from("web_intakes").update({ status: "draft", reopen_reason: reason.trim() }).eq("id", id).select().single());
}

export async function workQueue(db: Db): Promise<QueueItem[]> {
  return must(await db.rpc("web_work_queue")) as QueueItem[];
}
