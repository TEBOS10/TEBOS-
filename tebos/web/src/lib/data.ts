// Data access for the operator interface.
//
// Every call runs under the signed-in user's own session: row-level security
// decides what they see, and the schema's guards decide what they may change.
// Nothing here uses elevated keys. Related rows are fetched with separate,
// explicit queries (the schema's composite keys make implicit embedding
// ambiguous) and joined in memory.

import { blueprintPayload, type Blueprint } from "@core/blueprints";
import { OBSERVING_EVIDENCE_STATES } from "@core/board";
import type { Database, Json } from "../database.types";
import { domainOf } from "./format";
import type { Db } from "./supabase";

type Tables = Database["public"]["Tables"];
export type Row<T extends keyof Tables> = Tables[T]["Row"];
export type Business = Row<"businesses">;
export type Scan = Row<"scans">;
export type ScanTarget = Row<"scan_targets">;
export type Evidence = Row<"evidence">;
export type Finding = Row<"findings">;
export type FindingEvidence = Row<"finding_evidence">;
export type Action = Row<"actions">;
export type Approval = Row<"approvals">;
export type ActionRun = Row<"action_runs">;
export type Outcome = Row<"outcomes">;
export type AgentRun = Row<"agent_runs">;
export type AuditEvent = Row<"audit_events">;
export type Capability = Row<"capabilities">;
export type Source = Row<"sources">;
export type Membership = Row<"memberships">;
export type Organisation = Row<"organisations">;

/** Throws the PostgREST error so callers can explain it; returns the (non-null) data otherwise. */
function must<R extends { data: unknown; error: unknown }>(res: R): NonNullable<R["data"]> {
  if (res.error) throw res.error;
  if (res.data === null || res.data === undefined) throw new Error("The database returned no data");
  return res.data as NonNullable<R["data"]>;
}

/** For single-row lookups that may legitimately find nothing (not found, or not visible to this user). */
function maybe<R extends { data: unknown; error: unknown }>(res: R): R["data"] | null {
  if (res.error) throw res.error;
  return res.data ?? null;
}

export const OPEN_ACTION_STATUSES = ["proposed", "ready", "awaiting_approval", "approved", "queued", "running", "blocked", "completed", "failed"] as const;

// ---------------------------------------------------------------------------
// Organisations
// ---------------------------------------------------------------------------

export async function myOrganisations(db: Db, userId: string) {
  const memberships = must(await db.from("memberships").select("*").eq("user_id", userId));
  if (memberships.length === 0) return [];
  const orgs = must(await db.from("organisations").select("*").in("id", memberships.map((m) => m.org_id)));
  return memberships
    .map((m) => ({ membership: m, organisation: orgs.find((o) => o.id === m.org_id)! }))
    .filter((x) => x.organisation)
    .sort((a, b) => a.organisation.name.localeCompare(b.organisation.name));
}

/** TEBOS's own staff: the only people who can create an organisation (migration invite_only). */
export async function isPlatformAdmin(db: Db, userId: string): Promise<boolean> {
  const { data, error } = await db.from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return !!data;
}

export async function createOrganisation(db: Db, name: string, slug: string) {
  return must(await db.rpc("create_organisation", { p_name: name, p_slug: slug }));
}

export const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

export async function homeSummary(db: Db, orgId: string) {
  const [businesses, scans, openActions, pendingApprovals, runs, connections] = await Promise.all([
    db.from("businesses").select("*", { count: "exact" }).eq("org_id", orgId).is("archived_at", null).order("updated_at", { ascending: false }).limit(5),
    db.from("scans").select("*").eq("org_id", orgId).order("created_at", { ascending: false }).limit(6),
    db.from("actions").select("id", { count: "exact", head: true }).eq("org_id", orgId).in("status", [...OPEN_ACTION_STATUSES]),
    db.from("approvals").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("status", "pending"),
    db.from("agent_runs").select("agent_role, status, started_at, finished_at, error_detail").eq("org_id", orgId).order("started_at", { ascending: false }).limit(20),
    db.from("connection_instances").select("status").eq("org_id", orgId),
  ]);
  const scanRows = must(scans);
  const targets = scanRows.length
    ? must(await db.from("scan_targets").select("scan_id, uri, status, failure_detail").in("scan_id", scanRows.map((s) => s.id)))
    : [];
  const bizIds = [...new Set(scanRows.map((s) => s.business_id))];
  const scanBusinesses = bizIds.length ? must(await db.from("businesses").select("id, name, website").in("id", bizIds)) : [];
  return {
    businesses: must(businesses),
    businessCount: businesses.count ?? 0,
    scans: scanRows.map((s) => ({ scan: s, business: scanBusinesses.find((b) => b.id === s.business_id) ?? null, targets: targets.filter((t) => t.scan_id === s.id) })),
    openActionCount: openActions.count ?? 0,
    pendingApprovalCount: pendingApprovals.count ?? 0,
    runs: must(runs),
    connections: must(connections),
  };
}

// ---------------------------------------------------------------------------
// Scans
// ---------------------------------------------------------------------------

/**
 * Request a scan of a public website: reuse the organisation's business for
 * that domain, or create it, then queue the scan. The acquisition worker picks
 * it up; nothing is fetched from the browser.
 */
export async function requestScan(db: Db, orgId: string, userId: string, input: { website: string; objective: string; context: string }) {
  const domain = domainOf(input.website);
  if (!domain) throw new Error("Enter a valid public website address.");

  const existing = maybe(
    await db.from("businesses").select("*").eq("org_id", orgId).eq("primary_domain", domain).is("archived_at", null).maybeSingle(),
  );
  const business =
    existing ??
    must(
      await db
        .from("businesses")
        .insert({ org_id: orgId, name: domain, website: input.website, primary_domain: domain, created_by: userId })
        .select()
        .single(),
    );

  if (input.context.trim()) {
    must(await db.from("business_contexts").insert({ org_id: orgId, business_id: business.id, kind: "note", statement: input.context.trim(), supplied_by: userId }));
  }
  const scan = must(
    await db
      .from("scans")
      .insert({ org_id: orgId, business_id: business.id, objective: input.objective.trim() || null, scope: { url: input.website }, requested_by: userId })
      .select()
      .single(),
  );
  return { business, scan };
}

export async function listScans(db: Db, orgId: string) {
  const scans = must(await db.from("scans").select("*").eq("org_id", orgId).order("created_at", { ascending: false }).limit(100));
  if (!scans.length) return [];
  const [targets, businesses] = await Promise.all([
    db.from("scan_targets").select("scan_id, uri, status, failure_detail").in("scan_id", scans.map((s) => s.id)),
    db.from("businesses").select("id, name").in("id", [...new Set(scans.map((s) => s.business_id))]),
  ]);
  return scans.map((s) => ({
    scan: s,
    business: must(businesses).find((b) => b.id === s.business_id) ?? null,
    targets: must(targets).filter((t) => t.scan_id === s.id),
  }));
}

export async function getScan(db: Db, scanId: string) {
  const scan = maybe(await db.from("scans").select("*").eq("id", scanId).maybeSingle());
  if (!scan) return null;
  const [business, targets, evidence, findings, runs, sources] = await Promise.all([
    db.from("businesses").select("*").eq("id", scan.business_id).single(),
    db.from("scan_targets").select("*").eq("scan_id", scanId).order("created_at"),
    db.from("evidence").select("*").eq("scan_id", scanId).order("created_at"),
    db.from("findings").select("*").eq("scan_id", scanId).order("confidence", { ascending: false }),
    db.from("agent_runs").select("*").eq("scan_id", scanId).order("started_at"),
    db.from("sources").select("*").eq("business_id", scan.business_id),
  ]);
  return {
    scan,
    business: must(business),
    targets: must(targets),
    evidence: must(evidence),
    findings: must(findings),
    runs: must(runs),
    sources: must(sources),
  };
}

// ---------------------------------------------------------------------------
// Businesses
// ---------------------------------------------------------------------------

export async function listBusinesses(db: Db, orgId: string) {
  const businesses = must(await db.from("businesses").select("*").eq("org_id", orgId).is("archived_at", null).order("name"));
  if (!businesses.length) return [];
  const ids = businesses.map((b) => b.id);
  const [scans, findings, actions] = await Promise.all([
    db.from("scans").select("id, business_id, status, confidence, created_at").in("business_id", ids).order("created_at", { ascending: false }),
    db.from("findings").select("id, business_id").in("business_id", ids).eq("status", "active"),
    db.from("actions").select("id, business_id").in("business_id", ids).in("status", [...OPEN_ACTION_STATUSES]),
  ]);
  return businesses.map((b) => ({
    business: b,
    lastScan: must(scans).find((s) => s.business_id === b.id) ?? null,
    activeFindings: must(findings).filter((f) => f.business_id === b.id).length,
    openActions: must(actions).filter((a) => a.business_id === b.id).length,
  }));
}

export async function getBusiness(db: Db, businessId: string) {
  const business = maybe(await db.from("businesses").select("*").eq("id", businessId).maybeSingle());
  if (!business) return null;
  const [contexts, scans, findings, actions] = await Promise.all([
    db.from("business_contexts").select("*").eq("business_id", businessId).is("retired_at", null).order("created_at"),
    db.from("scans").select("*").eq("business_id", businessId).order("created_at", { ascending: false }),
    db.from("findings").select("*").eq("business_id", businessId).order("created_at", { ascending: false }),
    db.from("actions").select("*").eq("business_id", businessId).order("created_at", { ascending: false }),
  ]);
  return { business, contexts: must(contexts), scans: must(scans), findings: must(findings), actions: must(actions) };
}

export async function updateBusiness(db: Db, businessId: string, patch: Partial<Pick<Business, "name" | "industry" | "geography" | "business_model" | "legal_name">>) {
  return must(await db.from("businesses").update(patch).eq("id", businessId).select().single());
}

export const CONTEXT_KINDS = ["objective", "problem", "constraint", "system", "provider", "stakeholder", "desired_outcome", "note"] as const;

export async function addContext(db: Db, orgId: string, businessId: string, userId: string, kind: (typeof CONTEXT_KINDS)[number], statement: string) {
  return must(await db.from("business_contexts").insert({ org_id: orgId, business_id: businessId, kind, statement, supplied_by: userId }).select().single());
}

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

export async function getFinding(db: Db, findingId: string) {
  const finding = maybe(await db.from("findings").select("*").eq("id", findingId).maybeSingle());
  if (!finding) return null;
  const [business, links, actions] = await Promise.all([
    db.from("businesses").select("*").eq("id", finding.business_id).single(),
    db.from("finding_evidence").select("*").eq("finding_id", findingId),
    db.from("actions").select("*").eq("finding_id", findingId).order("created_at"),
  ]);
  const linkRows = must(links);
  const evidence = linkRows.length ? must(await db.from("evidence").select("*").in("id", linkRows.map((l) => l.evidence_id))) : [];
  const sources = evidence.length ? must(await db.from("sources").select("*").in("id", [...new Set(evidence.map((e) => e.source_id))])) : [];
  return { finding, business: must(business), links: linkRows, evidence, sources, actions: must(actions) };
}

export async function listFindings(db: Db, orgId: string) {
  const findings = must(await db.from("findings").select("*").eq("org_id", orgId).eq("status", "active").order("created_at", { ascending: false }).limit(200));
  const businesses = findings.length ? must(await db.from("businesses").select("id, name").in("id", [...new Set(findings.map((f) => f.business_id))])) : [];
  return findings.map((f) => ({ finding: f, business: businesses.find((b) => b.id === f.business_id) ?? null }));
}

// ---------------------------------------------------------------------------
// Actions, approvals, runs
// ---------------------------------------------------------------------------

export async function capabilities(db: Db) {
  return must(await db.from("capabilities").select("*").order("default_risk_tier").order("name"));
}

export interface ActionDraft {
  title: string;
  objective: string;
  expectedOutcome: string;
  capabilityKey: string | null;
  riskTier: number;
  approvalRequired: boolean;
  priority: number;
  evidenceRequirement: string;
  /** When set, TEBOS sends this email through a connected provider after approval. */
  email?: EmailDraft | null;
}

export interface EmailDraft {
  to: string[];
  subject: string;
  text: string;
  replyTo: string | null;
}

export const EMAIL_CAPABILITY = "email.send_transactional";

export async function proposeAction(db: Db, finding: Finding, userId: string, draft: ActionDraft) {
  return must(
    await db
      .from("actions")
      .insert({
        org_id: finding.org_id,
        business_id: finding.business_id,
        finding_id: finding.id,
        title: draft.title,
        objective: draft.objective,
        expected_outcome: draft.expectedOutcome || null,
        capability_key: draft.capabilityKey,
        risk_tier: draft.riskTier,
        approval_required: draft.approvalRequired,
        priority: draft.priority,
        evidence_requirement: draft.evidenceRequirement || null,
        execution_method: draft.email ? "api" : "manual",
        execution_input: draft.email ? { ...draft.email } : null,
        owner_user_id: userId,
        created_by: userId,
      })
      .select()
      .single(),
  );
}

export async function listActions(db: Db, orgId: string) {
  const actions = must(await db.from("actions").select("*").eq("org_id", orgId).order("priority").order("created_at", { ascending: false }).limit(200));
  const businesses = actions.length ? must(await db.from("businesses").select("id, name").in("id", [...new Set(actions.map((a) => a.business_id))])) : [];
  return actions.map((a) => ({ action: a, business: businesses.find((b) => b.id === a.business_id) ?? null }));
}

export async function getAction(db: Db, actionId: string) {
  const action = maybe(await db.from("actions").select("*").eq("id", actionId).maybeSingle());
  if (!action) return null;
  const [finding, business, approvals, runs, outcomes, deps] = await Promise.all([
    db.from("findings").select("*").eq("id", action.finding_id).single(),
    db.from("businesses").select("*").eq("id", action.business_id).single(),
    db.from("approvals").select("*").eq("action_id", actionId).order("requested_at", { ascending: false }),
    db.from("action_runs").select("*").eq("action_id", actionId).order("created_at", { ascending: false }),
    db.from("outcomes").select("*").eq("action_id", actionId).order("created_at", { ascending: false }),
    db.from("action_dependencies").select("depends_on_action_id").eq("action_id", actionId),
  ]);
  const depIds = must(deps).map((d) => d.depends_on_action_id);
  const dependencies = depIds.length ? must(await db.from("actions").select("id, title, status").in("id", depIds)) : [];
  return {
    action,
    finding: must(finding),
    business: must(business),
    approvals: must(approvals),
    runs: must(runs),
    outcomes: must(outcomes),
    dependencies,
  };
}

export async function setActionStatus(db: Db, actionId: string, status: Action["status"], extra: { blocked_reason?: string | null; result?: string | null } = {}) {
  return must(await db.from("actions").update({ status, ...extra }).eq("id", actionId).select().single());
}

export async function requestApproval(db: Db, action: Action, note: string) {
  // The database moves the action to awaiting_approval when the request is recorded.
  return must(
    await db
      .from("approvals")
      .insert({
        org_id: action.org_id,
        action_id: action.id,
        requested_operation: action.title,
        risk_tier: action.risk_tier,
        data_scope: note || null,
        proposed_action: { title: action.title, objective: action.objective, capability: action.capability_key, execution_method: action.execution_method },
      })
      .select()
      .single(),
  );
}

export async function decideApproval(db: Db, approvalId: string, decision: "approved" | "rejected", note: string) {
  // The decider is recorded as the signed-in user by the database, whatever is sent.
  return must(await db.from("approvals").update({ status: decision, decision_note: note || null }).eq("id", approvalId).select().single());
}

export async function listApprovals(db: Db, orgId: string) {
  const approvals = must(await db.from("approvals").select("*").eq("org_id", orgId).order("requested_at", { ascending: false }).limit(100));
  const actions = approvals.length ? must(await db.from("actions").select("id, title, business_id, risk_tier").in("id", [...new Set(approvals.map((a) => a.action_id))])) : [];
  return approvals.map((a) => ({ approval: a, action: actions.find((x) => x.id === a.action_id) ?? null }));
}

/**
 * Record the result of a manually executed action as a run: queued -> running
 * -> succeeded / failed, then move the action on. Each step is a guarded,
 * audited write; a failure part-way leaves an honest partial record.
 */
export async function recordManualRun(
  db: Db,
  action: Action,
  result: { succeeded: boolean; summary: string },
) {
  const approval = action.approval_required
    ? must(await db.from("approvals").select("id").eq("action_id", action.id).eq("status", "consumed").order("consumed_at", { ascending: false }).limit(1)).at(0)
    : undefined;
  const run = must(
    await db
      .from("action_runs")
      .insert({
        org_id: action.org_id,
        action_id: action.id,
        approval_id: approval?.id ?? null,
        capability_key: action.capability_key,
        execution_method: "manual",
        idempotency_key: `${action.id}:manual:${crypto.randomUUID()}`,
        request_summary: { recordedFrom: "operator interface" },
      })
      .select()
      .single(),
  );
  must(await db.from("action_runs").update({ status: "running" }).eq("id", run.id).select().single());
  const finished = must(
    await db
      .from("action_runs")
      .update(
        result.succeeded
          ? { status: "succeeded", response_summary: { summary: result.summary } }
          : { status: "failed", error_class: "internal", error_detail: result.summary },
      )
      .eq("id", run.id)
      .select()
      .single(),
  );
  await setActionStatus(db, action.id, result.succeeded ? "completed" : "failed", { result: result.summary });
  return finished;
}

export async function verifyAction(db: Db, action: Action, runId: string, method: string) {
  must(await db.from("action_runs").update({ verified: true, verification_method: method }).eq("id", runId).select().single());
  return setActionStatus(db, action.id, "verified");
}

// ---------------------------------------------------------------------------
// System
// ---------------------------------------------------------------------------

export async function systemOverview(db: Db, orgId: string) {
  const [caps, connectors, connections, runs] = await Promise.all([
    db.from("capabilities").select("*").order("default_risk_tier"),
    db.from("connectors").select("*"),
    db.from("connection_instances").select("*").eq("org_id", orgId),
    db.from("agent_runs").select("*").eq("org_id", orgId).order("started_at", { ascending: false }).limit(25),
  ]);
  return { capabilities: must(caps), connectors: must(connectors), connections: must(connections), runs: must(runs) };
}

export async function auditTrail(db: Db, orgId: string, entityId?: string) {
  let q = db.from("audit_events").select("*").eq("org_id", orgId).order("id", { ascending: false }).limit(entityId ? 100 : 50);
  if (entityId) q = q.eq("entity_id", entityId);
  return must(await q);
}

// ---------------------------------------------------------------------------
// People: profiles, members, invitations
// ---------------------------------------------------------------------------

export type Profile = Row<"profiles">;
export type Invitation = Omit<Row<"invitations">, "token_hash">;
export const ORG_ROLE_LABEL: Record<string, string> = {
  org_admin: "Admin",
  operator: "Operator",
  approver: "Approver",
  viewer: "Viewer",
};

export async function myProfile(db: Db, userId: string) {
  return maybe(await db.from("profiles").select("*").eq("user_id", userId).maybeSingle());
}

/** The database records the email from the signed-in identity; only the name is ours to set. */
export async function saveMyProfile(db: Db, userId: string, displayName: string) {
  return must(await db.from("profiles").upsert({ user_id: userId, display_name: displayName.trim() }, { onConflict: "user_id" }).select().single());
}

export async function listMembers(db: Db, orgId: string) {
  const memberships = must(await db.from("memberships").select("*").eq("org_id", orgId).order("created_at"));
  const profiles = memberships.length ? must(await db.from("profiles").select("*").in("user_id", memberships.map((m) => m.user_id))) : [];
  return memberships.map((m) => ({ membership: m, profile: profiles.find((p) => p.user_id === m.user_id) ?? null }));
}

export async function setMemberRole(db: Db, orgId: string, userId: string, role: string) {
  return must(await db.from("memberships").update({ role }).eq("org_id", orgId).eq("user_id", userId).select().single());
}

export async function removeMember(db: Db, orgId: string, userId: string) {
  const res = await db.from("memberships").delete().eq("org_id", orgId).eq("user_id", userId).select();
  const rows = must(res);
  if (rows.length === 0) throw new Error("The member wasn't removed. You may not have permission.");
}

const INVITATION_COLUMNS = "id, org_id, email, role, status, invited_by, accepted_by, created_at, expires_at, accepted_at";

export async function listInvitations(db: Db, orgId: string): Promise<Invitation[]> {
  return must(await db.from("invitations").select(INVITATION_COLUMNS).eq("org_id", orgId).order("created_at", { ascending: false }).limit(50));
}

/** Returns the one-time token. It is never stored in readable form, so it can only be shown now. */
export async function createInvitation(db: Db, orgId: string, email: string, role: string): Promise<string> {
  return must(await db.rpc("create_invitation", { p_org: orgId, p_email: email, p_role: role }));
}

export async function revokeInvitation(db: Db, id: string) {
  return must(await db.from("invitations").update({ status: "revoked" }).eq("id", id).select(INVITATION_COLUMNS).single());
}

/** Resolves to the organisation joined, or null when the invitation had expired. */
export async function acceptInvitation(db: Db, token: string): Promise<string | null> {
  const res = await db.rpc("accept_invitation", { p_token: token });
  if (res.error) throw res.error;
  return (res.data as string | null) ?? null;
}

export const inviteLink = (token: string, origin = window.location.origin) => `${origin}/invite/${encodeURIComponent(token)}`;

// ---------------------------------------------------------------------------
// Outcomes
// ---------------------------------------------------------------------------

export interface OutcomeDraft {
  metric: string;
  unit: string;
  baseline: number | null;
  expected: number | null;
  observed: number | null;
  observedAt: string | null;
  note: string;
  /** How the observed value was checked; only when it was actually checked. */
  verificationMethod: string;
}

export async function recordOutcome(db: Db, action: Action, d: OutcomeDraft) {
  const verified = d.verificationMethod.trim().length > 0 && d.observed !== null;
  return must(
    await db
      .from("outcomes")
      .insert({
        org_id: action.org_id,
        action_id: action.id,
        metric: d.metric.trim(),
        unit: d.unit.trim() || null,
        baseline_value: d.baseline,
        expected_value: d.expected,
        observed_value: d.observed,
        observed_at: d.observedAt,
        note: d.note.trim() || null,
        verified_at: verified ? new Date().toISOString() : null,
        verification_method: verified ? d.verificationMethod.trim() : null,
      })
      .select()
      .single(),
  );
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

/** Everything a business report needs, as recorded — nothing is summarised away. */
export async function businessReport(db: Db, businessId: string) {
  const base = await getBusiness(db, businessId);
  if (!base) return null;
  const latestScan = base.scans.find((s) => s.status === "completed" || s.status === "partial") ?? null;
  const activeFindings = base.findings.filter((f) => f.status === "active");
  const findingIds = activeFindings.map((f) => f.id);
  const actionIds = base.actions.map((a) => a.id);
  const [links, evidence, sources, outcomes, targets] = await Promise.all([
    findingIds.length ? db.from("finding_evidence").select("*").in("finding_id", findingIds) : Promise.resolve({ data: [], error: null }),
    latestScan ? db.from("evidence").select("*").eq("scan_id", latestScan.id).order("created_at") : Promise.resolve({ data: [], error: null }),
    db.from("sources").select("*").eq("business_id", businessId),
    actionIds.length ? db.from("outcomes").select("*").in("action_id", actionIds) : Promise.resolve({ data: [], error: null }),
    latestScan ? db.from("scan_targets").select("*").eq("scan_id", latestScan.id).order("created_at") : Promise.resolve({ data: [], error: null }),
  ]);
  const linkRows = must(links) as FindingEvidence[];
  let evidenceRows = must(evidence) as Evidence[];
  // include evidence cited by findings from earlier scans, so every citation resolves
  const missingIds = [...new Set(linkRows.map((l) => l.evidence_id))].filter((id) => !evidenceRows.some((e) => e.id === id));
  if (missingIds.length) evidenceRows = evidenceRows.concat(must(await db.from("evidence").select("*").in("id", missingIds)));
  return {
    ...base,
    activeFindings,
    latestScan,
    targets: must(targets) as ScanTarget[],
    links: linkRows,
    evidence: evidenceRows,
    sources: must(sources),
    outcomes: must(outcomes) as Outcome[],
  };
}

/** Change what a provider action sends. The database refuses once approval has been requested. */
export async function setExecutionInput(db: Db, actionId: string, email: EmailDraft) {
  return must(await db.from("actions").update({ execution_input: { ...email } }).eq("id", actionId).select().single());
}

export function emailOf(input: unknown): EmailDraft | null {
  const i = (input ?? null) as Partial<EmailDraft> | null;
  if (!i || !Array.isArray(i.to)) return null;
  return { to: i.to.map(String), subject: String(i.subject ?? ""), text: String(i.text ?? ""), replyTo: i.replyTo ? String(i.replyTo) : null };
}

// ---------------------------------------------------------------------------
// Connections
// ---------------------------------------------------------------------------

export type Connection = Row<"connection_instances">;

export async function listConnections(db: Db, orgId: string) {
  const [connections, connectors] = await Promise.all([
    db.from("connection_instances").select("*").eq("org_id", orgId).order("created_at"),
    db.from("connectors").select("*"),
  ]);
  return { connections: must(connections), connectors: must(connectors) };
}

export async function createConnection(db: Db, orgId: string, connectorKey: string, settings: Record<string, string>) {
  return must(await db.from("connection_instances").insert({ org_id: orgId, connector_key: connectorKey, settings }).select().single());
}

export async function updateConnectionSettings(db: Db, id: string, settings: Record<string, string>) {
  return must(await db.from("connection_instances").update({ settings }).eq("id", id).select().single());
}

/** Hands a secret to the database, which stores it in Vault. It is never read back. */
export async function setConnectionSecret(db: Db, id: string, purpose: "api_key" | "webhook_signing_secret", secret: string) {
  return must(await db.rpc("set_connection_secret", { p_connection: id, p_purpose: purpose, p_secret: secret }));
}

/** Asks TEBOS's worker to check the connection with the provider. Only the worker can mark it connected. */
export async function requestVerification(db: Db, id: string) {
  return must(await db.from("connection_instances").update({ verification_requested_at: new Date().toISOString() }).eq("id", id).select().single());
}

export async function setConnectionEnabled(db: Db, id: string, enabled: boolean) {
  return must(await db.from("connection_instances").update({ status: enabled ? "configured" : "disabled" }).eq("id", id).select().single());
}

/** Where a provider should send webhooks for a connection, when the worker's public address is known. */
export const webhookUrl = (connectionId: string, workerUrl: string | undefined = import.meta.env.VITE_TEBOS_WORKER_URL) =>
  workerUrl ? `${workerUrl.replace(/\/+$/, "")}/webhooks/resend/${connectionId}` : null;

// ---------------------------------------------------------------------------
// Diagnostic interviews
// ---------------------------------------------------------------------------

export type Interview = Row<"interview_sessions">;

export interface InterviewAnswer {
  evidenceId: string;
  questionKey: string;
  question: string;
  summary: string;
  quote: string | null;
  location: string | null;
  channel: string;
}

export async function listInterviews(db: Db, businessId: string) {
  return must(await db.from("interview_sessions").select("*").eq("business_id", businessId).order("created_at", { ascending: false }));
}

export async function bookInterviewCall(
  db: Db,
  business: { id: string; org_id: string },
  input: { playbookKey: string; playbookVersion: number; phone: string; at: Date; consentText: string; userId: string },
) {
  return must(
    await db
      .from("interview_sessions")
      .insert({
        org_id: business.org_id,
        business_id: business.id,
        channel: "voice",
        playbook_key: input.playbookKey,
        playbook_version: input.playbookVersion,
        status: "scheduled",
        phone_number: input.phone,
        scheduled_for: input.at.toISOString(),
        consent_text: input.consentText,
        // the database records consent as given by the signed-in person, now
        consent_given_by: input.userId,
        consent_given_at: new Date().toISOString(),
      })
      .select()
      .single(),
  );
}

export async function startWrittenInterview(db: Db, business: { id: string; org_id: string }, playbookKey: string, playbookVersion: number) {
  return must(
    await db
      .from("interview_sessions")
      .insert({ org_id: business.org_id, business_id: business.id, channel: "form", playbook_key: playbookKey, playbook_version: playbookVersion, status: "open" })
      .select()
      .single(),
  );
}

export async function submitInterviewAnswers(db: Db, interviewId: string, answers: Array<{ question_key: string; question: string; answer: string }>) {
  return must(await db.rpc("submit_interview_answers", { p_session: interviewId, p_answers: answers }));
}

export async function cancelInterview(db: Db, id: string) {
  return must(await db.from("interview_sessions").update({ status: "cancelled" }).eq("id", id).select().single());
}

export async function rescheduleInterview(db: Db, id: string, at: Date) {
  return must(await db.from("interview_sessions").update({ scheduled_for: at.toISOString() }).eq("id", id).select().single());
}

export async function getInterview(db: Db, id: string) {
  const interview = maybe(await db.from("interview_sessions").select("*").eq("id", id).maybeSingle());
  if (!interview) return null;
  const [business, source] = await Promise.all([
    db.from("businesses").select("id, name, org_id").eq("id", interview.business_id).single(),
    db.from("sources").select("id").eq("business_id", interview.business_id).eq("source_type", "user_statement").eq("uri", `interview:${id}`).maybeSingle(),
  ]);
  const sourceRow = maybe(source);
  const evidence = sourceRow ? must(await db.from("evidence").select("*").eq("source_id", sourceRow.id).order("created_at")) : [];
  const answers: InterviewAnswer[] = evidence.map((e) => {
    const v = (e.structured_value ?? {}) as { question_key?: string; question?: string; channel?: string };
    return {
      evidenceId: e.id,
      questionKey: v.question_key ?? "",
      question: v.question ?? "",
      summary: e.fact ?? "",
      quote: v.channel === "voice" ? e.excerpt : null,
      location: e.content_location,
      channel: v.channel ?? "",
    };
  });
  return { interview, business: must(business), answers };
}

// ---------------------------------------------------------------------------
// Live operations (connected platforms, read-only)
// ---------------------------------------------------------------------------

export interface OperationsFact {
  metric: string;
  fact: string;
  retrievedAt: string | null;
}

/** The latest reading of each operational metric from this business's connected platforms. */
export async function liveOperations(db: Db, businessId: string) {
  const [connections, sources] = await Promise.all([
    db.from("connection_instances").select("*").eq("business_id", businessId).eq("connector_key", "bame-ops"),
    db.from("sources").select("id, uri, label").eq("business_id", businessId).eq("source_type", "connected_system"),
  ]);
  const src = must(sources);
  const evidence = src.length
    ? must(await db.from("evidence").select("fact, structured_value, retrieved_at").in("source_id", src.map((s) => s.id)).order("retrieved_at", { ascending: false }).limit(200))
    : [];
  const latest = new Map<string, OperationsFact>();
  for (const e of evidence) {
    const metric = ((e.structured_value ?? {}) as { metric?: string }).metric ?? "";
    if (metric && !latest.has(metric)) latest.set(metric, { metric, fact: e.fact ?? "", retrievedAt: e.retrieved_at });
  }
  return { connections: must(connections), facts: [...latest.values()].sort((a, b) => a.metric.localeCompare(b.metric)) };
}

// ---------------------------------------------------------------------------
// Public enquiries (pricing page). Insert-only: the API never reads them back.
// ---------------------------------------------------------------------------

export interface EnquiryDraft {
  plan: "starter" | "growth" | "company" | "equity";
  name: string;
  business: string;
  email: string;
  phone?: string;
  website?: string;
  message?: string;
  /** Joining the waiting list, with their kind of business (a blueprint key, or empty for "other"). */
  waitlist?: boolean;
  industry?: string;
}

export async function submitEnquiry(db: Db, e: EnquiryDraft): Promise<void> {
  const clean = (v?: string) => (v && v.trim() ? v.trim() : null);
  const { error } = await db.from("enquiries").insert({
    plan: e.plan, name: e.name.trim(), business: e.business.trim(), email: e.email.trim(),
    phone: clean(e.phone), website: clean(e.website), message: clean(e.message),
    ...(e.waitlist ? { kind: "waitlist", industry: e.industry || null } : {}),
  });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// The operating board: objectives, pieces and flows (ADR 0003)
// ---------------------------------------------------------------------------

export type Objective = Row<"objectives">;
export type ObjectiveMeasurement = Row<"objective_measurements">;
export type BoardComponent = Row<"board_components">;
export type BoardFlow = Row<"board_flows">;
export type BoardStep = Row<"board_steps">;

/** A reading from a connected system that an objective can be measured against. */
export interface MeasurableEvidence {
  evidenceId: string;
  fact: string;
  structuredValue: unknown;
  retrievedAt: string | null;
  sourceLabel: string | null;
}

/** An owner's statement a stated value can cite. */
export interface Statement {
  evidenceId: string;
  fact: string;
  createdAt: string;
}

export async function getBoard(db: Db, businessId: string) {
  const business = maybe(await db.from("businesses").select("*").eq("id", businessId).maybeSingle());
  if (!business) return null;
  const [objectives, measurements, components, flows, steps, sources] = await Promise.all([
    db.from("objectives").select("*").eq("business_id", businessId).order("created_at"),
    db.from("objective_measurements").select("*").eq("business_id", businessId).order("measured_at", { ascending: false }),
    db.from("board_components").select("*").eq("business_id", businessId).is("retired_at", null).order("name"),
    db.from("board_flows").select("*").eq("business_id", businessId).is("retired_at", null).order("created_at"),
    db.from("board_steps").select("*").eq("business_id", businessId).is("retired_at", null).order("position"),
    db.from("sources").select("id, source_type, label").eq("business_id", businessId).in("source_type", ["connected_system", "system", "user_statement"]),
  ]);
  const src = must(sources);
  const evidence = src.length
    ? must(await db.from("evidence").select("id, source_id, state, fact, structured_value, retrieved_at, created_at").in("source_id", src.map((s) => s.id))
        .order("created_at", { ascending: false }).limit(300))
    : [];
  const typeOf = new Map(src.map((s) => [s.id, s]));
  const measurable: MeasurableEvidence[] = [];
  const seen = new Set<string>();
  const statements: Statement[] = [];
  for (const e of evidence) {
    const s = typeOf.get(e.source_id);
    if (!s || !e.fact) continue;
    if (s.source_type === "user_statement") {
      if (e.state !== "unavailable") statements.push({ evidenceId: e.id, fact: e.fact, createdAt: e.created_at });
      continue;
    }
    if (!["acquired", "partially_acquired", "system_generated"].includes(e.state)) continue;
    // the latest reading of each metric is the one worth measuring against
    const metric = ((e.structured_value ?? {}) as { metric?: string }).metric ?? e.id;
    if (seen.has(metric)) continue;
    seen.add(metric);
    measurable.push({ evidenceId: e.id, fact: e.fact, structuredValue: e.structured_value, retrievedAt: e.retrieved_at, sourceLabel: s.label });
  }
  // Evidence that can confirm a piece of the board: obtained, current, and not the owner's own word.
  const allSources = must(await db.from("sources").select("id, source_type, label").eq("business_id", businessId));
  const confirming = allSources.filter((s) => s.source_type !== "user_statement");
  const observable: ObservableEvidence[] = confirming.length
    ? must(await db.from("evidence").select("id, source_id, state, fact, retrieved_at, created_at").in("source_id", confirming.map((s) => s.id))
        .in("state", [...OBSERVING_EVIDENCE_STATES]).order("created_at", { ascending: false }).limit(200))
        .filter((e) => e.fact)
        .map((e) => ({ evidenceId: e.id, fact: e.fact!, sourceLabel: confirming.find((s) => s.id === e.source_id)?.label ?? null, retrievedAt: e.retrieved_at }))
    : [];
  // What each observed piece cites, even when that evidence is no longer current
  const proposals = must(await db.from("step_proposals").select("*").eq("business_id", businessId).order("created_at", { ascending: false }).limit(200));
  const cited = [...new Set(must(components).filter((c) => c.evidence_id).map((c) => c.evidence_id!))];
  const citedRows = cited.length ? must(await db.from("evidence").select("id, fact, state, retrieved_at").in("id", cited)) : [];
  return {
    business,
    proposals,
    observable,
    citedEvidence: new Map(citedRows.map((e) => [e.id, e])),
    objectives: must(objectives),
    measurements: must(measurements),
    components: must(components),
    flows: must(flows),
    steps: must(steps),
    measurable,
    statements,
  };
}

export interface ObjectiveDraft {
  title: string;
  metric: string;
  unit: string;
  direction: "at_least" | "at_most";
  targetValue: number;
  period: string;
  dueOn: string;
  ownerId: string;
  activate: boolean;
}

export async function createObjective(db: Db, orgId: string, businessId: string, d: ObjectiveDraft) {
  return must(await db.from("objectives").insert({
    org_id: orgId, business_id: businessId, title: d.title.trim(), metric: d.metric, unit: d.unit, direction: d.direction,
    target_value: d.targetValue, period: d.period, due_on: d.dueOn, owner_id: d.ownerId, status: d.activate ? "active" : "draft",
  }).select().single());
}

export async function activateObjective(db: Db, objectiveId: string) {
  return must(await db.from("objectives").update({ status: "active" }).eq("id", objectiveId).select().single());
}

export async function achieveObjective(db: Db, objectiveId: string, measurementId: string) {
  return must(await db.from("objectives").update({ status: "achieved", achieved_measurement_id: measurementId }).eq("id", objectiveId).select().single());
}

export async function closeObjective(db: Db, objectiveId: string, status: "retired" | "cancelled" | "missed", reason: string | null) {
  return must(await db.from("objectives").update({ status, status_reason: reason }).eq("id", objectiveId).select().single());
}

/** A measured value: the database reads the number from the evidence at `path`. */
export async function recordMeasured(db: Db, o: Objective, evidenceId: string, path: string[]) {
  return must(await db.from("objective_measurements").insert({
    org_id: o.org_id, business_id: o.business_id, objective_id: o.id, basis: "measured", evidence_id: evidenceId, value_path: path,
  }).select().single());
}

/**
 * Keep measuring an objective from this reading: every new reading of the
 * metric records a measured value (the database reads it). Once the
 * objective is active, what it is measured by can be set but not changed.
 */
export async function measureAutomatically(db: Db, objectiveId: string, metric: string, path: string[]) {
  return must(await db.from("objectives").update({ measure_metric: metric, measure_path: path }).eq("id", objectiveId).select().single());
}

/** A value the owner stated, citing their statement. It never counts toward achieving the objective. */
export async function recordStated(db: Db, o: Objective, evidenceId: string, value: number) {
  return must(await db.from("objective_measurements").insert({
    org_id: o.org_id, business_id: o.business_id, objective_id: o.id, basis: "stated", evidence_id: evidenceId, value,
  }).select().single());
}

export async function addComponent(db: Db, orgId: string, businessId: string, c: { name: string; kind: string; supplier?: string; ownerRole?: string; description?: string }) {
  const clean = (v?: string) => (v && v.trim() ? v.trim() : null);
  return must(await db.from("board_components").insert({
    org_id: orgId, business_id: businessId, name: c.name.trim(), kind: c.kind, supplier: clean(c.supplier), owner_role: clean(c.ownerRole), description: clean(c.description),
  }).select().single());
}

export async function retireComponent(db: Db, componentId: string) {
  return must(await db.from("board_components").update({ retired_at: new Date().toISOString() }).eq("id", componentId).select().single());
}

export async function addFlow(db: Db, orgId: string, businessId: string, f: { name: string; startsWhen: string; doneWhen: string; objectiveId?: string | null; ownerRole?: string }) {
  return must(await db.from("board_flows").insert({
    org_id: orgId, business_id: businessId, name: f.name.trim(), starts_when: f.startsWhen.trim(), done_when: f.doneWhen.trim(),
    objective_id: f.objectiveId || null, owner_role: f.ownerRole?.trim() || null,
  }).select().single());
}

export async function addStep(db: Db, flow: BoardFlow, position: number, s: { name: string; performer: string; performerRole?: string; componentId?: string | null; decisionRule?: string; documented: boolean }) {
  return must(await db.from("board_steps").insert({
    org_id: flow.org_id, business_id: flow.business_id, flow_id: flow.id, position, name: s.name.trim(), performer: s.performer,
    performer_role: s.performerRole?.trim() || null, component_id: s.componentId || null, decision_rule: s.decisionRule?.trim() || null, documented: s.documented,
  }).select().single());
}

export async function updateStep(db: Db, stepId: string, patch: Partial<Pick<BoardStep, "documented" | "performer" | "component_id" | "decision_rule">>) {
  return must(await db.from("board_steps").update(patch).eq("id", stepId).select().single());
}

export async function retireStep(db: Db, stepId: string) {
  return must(await db.from("board_steps").update({ retired_at: new Date().toISOString() }).eq("id", stepId).select().single());
}

/** Lays an operating-system blueprint onto a business's board, as proposals the owner then confirms. */
export async function applyBlueprint(db: Db, businessId: string, blueprint: Blueprint) {
  return must(await db.rpc("apply_blueprint", { p_business: businessId, p_blueprint: blueprintPayload(blueprint) as unknown as Json })) as
    { blueprint: string; pieces: number; flows: number; steps: number };
}

/** The owner confirms a proposed flow: the flow and its proposed steps become what the business stated. */
export async function confirmFlow(db: Db, flowId: string) {
  must(await db.from("board_steps").update({ basis: "stated" }).eq("flow_id", flowId).eq("basis", "proposed").select());
  return must(await db.from("board_flows").update({ basis: "stated" }).eq("id", flowId).select().single());
}

export type StepProposal = Row<"step_proposals">;

export interface StepProposalInput {
  performer: string;
  performerRole: string;
  componentId: string;
  decisionRule: string;
  reason: string;
}

/** The team proposes a rule and a new owner for a step only the founder does today. */
export async function proposeStepRule(db: Db, step: BoardStep, d: StepProposalInput) {
  return must(await db.from("step_proposals").insert({
    org_id: step.org_id, business_id: step.business_id, step_id: step.id, performer: d.performer,
    performer_role: d.performerRole.trim() || null, component_id: d.componentId || null,
    decision_rule: d.decisionRule.trim(), reason: d.reason.trim(),
  }).select().single());
}

/** The owner approves: the founder step is retired and the new step takes its place, in one step. */
export async function approveStepProposal(db: Db, id: string, note: string) {
  const { data, error } = await db.rpc("approve_step_proposal", { p_proposal: id, p_note: note.trim() || null });
  if (error) throw error;
  return data as string;
}

export async function rejectStepProposal(db: Db, id: string, note: string) {
  return must(await db.from("step_proposals").update({ status: "rejected", decision_note: note.trim() }).eq("id", id).select().single());
}

export async function withdrawStepProposal(db: Db, id: string) {
  return must(await db.from("step_proposals").update({ status: "withdrawn" }).eq("id", id).select().single());
}

export interface ObservableEvidence {
  evidenceId: string;
  fact: string;
  sourceLabel: string | null;
  retrievedAt: string | null;
}

/** Evidence TEBOS obtained confirms a piece: it becomes observed, citing that evidence. */
export async function observeComponent(db: Db, componentId: string, evidenceId: string) {
  return must(await db.from("board_components").update({ basis: "observed", evidence_id: evidenceId }).eq("id", componentId).select().single());
}

export async function confirmComponent(db: Db, componentId: string) {
  return must(await db.from("board_components").update({ basis: "stated" }).eq("id", componentId).select().single());
}

// ---------------------------------------------------------------------------
// The client pipeline (TEBOS's own staff). Row-level security shows it only
// to platform admins and people with the sales role; maintainers see the
// clients they look after. The server records payments, contracts and
// onboarding; people decide.
// ---------------------------------------------------------------------------

export type OpportunityRow = Row<"opportunities">;
export type PaymentRow = Row<"payments">;
export type ContractRow = Row<"contracts">;
export type ContractTemplate = Row<"contract_templates">;
export type OutboxEmail = Row<"outbox_emails">;

export interface StaffAccess {
  admin: boolean;
  sales: boolean;
  maintainer: boolean;
}

export async function staffAccess(db: Db, userId: string): Promise<StaffAccess> {
  const [admin, roles] = await Promise.all([
    db.from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle(),
    db.from("platform_staff").select("role").eq("user_id", userId),
  ]);
  const r = new Set((roles.data ?? []).map((x) => x.role));
  const isAdmin = !admin.error && !!admin.data;
  return { admin: isAdmin, sales: isAdmin || r.has("sales"), maintainer: isAdmin || r.has("maintainer") };
}

export async function listOpportunities(db: Db) {
  const [opps, calls] = await Promise.all([
    db.from("opportunities").select("*").order("created_at", { ascending: false }).limit(500),
    db.from("intake_calls").select("enquiry_id, status, wants_to_proceed").limit(1000),
  ]);
  const byEnquiry = new Map((calls.data ?? []).map((c) => [c.enquiry_id, c]));
  return must(opps).map((o) => ({ ...o, intake: byEnquiry.get(o.enquiry_id) ?? null }));
}

// ---------------------------------------------------------------------------
// Intake calls from meetings
// ---------------------------------------------------------------------------
export const INTAKE_COLUMNS =
  "id, enquiry_id, requested_by, phone_number, status, started_at, ended_at, transcript, duration_secs, wants_to_proceed, outcome_source, outcome_note, failure_detail, follow_up_due_at, follow_up_queued_at, created_at";
export type IntakeCall = Row<"intake_calls">;

export interface MeetingCallDraft {
  name: string;
  business: string;
  email: string;
  phone: string;
  industry: string;
  size: string;
  consent: string;
}

/** Starts the intake call: the database checks staff, consent and the number, and records the waiting-list lead. */
export async function startMeetingCall(db: Db, d: MeetingCallDraft): Promise<string> {
  const { data, error } = await db.rpc("start_meeting_call", {
    p_name: d.name.trim(), p_business: d.business.trim(), p_email: d.email.trim(), p_phone: d.phone.trim(),
    p_industry: d.industry || null, p_size: d.size, p_consent: d.consent,
  });
  if (error) throw error;
  return data as string;
}

export async function getIntakeCall(db: Db, id: string): Promise<IntakeCall | null> {
  return maybe(await db.from("intake_calls").select(INTAKE_COLUMNS).eq("id", id).maybeSingle()) as IntakeCall | null;
}

/** Staff record the prospect's yes or no when the call didn't capture it. */
export async function recordIntakeAnswer(db: Db, id: string, wantsToProceed: boolean, note: string) {
  return must(await db.from("intake_calls").update({ wants_to_proceed: wantsToProceed, outcome_note: note.trim() || null }).eq("id", id).select(INTAKE_COLUMNS).single());
}

export async function getOpportunity(db: Db, id: string) {
  const opportunity = maybe(await db.from("opportunities").select("*").eq("id", id).maybeSingle());
  if (!opportunity) return null;
  const [payments, contracts, emails, intake] = await Promise.all([
    db.from("payments").select("id, opportunity_id, provider, reference, amount_cents, currency, status, paid_at, note, recorded_by, created_at").eq("opportunity_id", id).order("created_at"),
    db.from("contracts").select("id, opportunity_id, template_key, template_version, title, body, body_hash, status, sent_at, expires_at, accepted_at, accepted_name, accepted_ip, accepted_agent, created_at").eq("opportunity_id", id),
    db.from("outbox_emails").select("id, opportunity_id, kind, to_email, subject, created_at, attempts, last_try, sent_at, error").eq("opportunity_id", id).order("created_at"),
    db.from("intake_calls").select(INTAKE_COLUMNS).eq("enquiry_id", opportunity.enquiry_id).maybeSingle(),
  ]);
  return {
    opportunity,
    intake: (intake.data ?? null) as IntakeCall | null,
    payments: (payments.data ?? []) as PaymentRow[],
    contract: ((contracts.data ?? [])[0] ?? null) as ContractRow | null,
    emails: (emails.data ?? []) as OutboxEmail[],
  };
}

export async function decideOpportunity(db: Db, id: string, status: "approved" | "declined" | "cancelled", note: string | null) {
  return must(await db.from("opportunities").update({ status, decision_note: note?.trim() || null }).eq("id", id).select().single());
}

export async function assignMaintainer(db: Db, id: string, userId: string | null) {
  return must(await db.from("opportunities").update({ maintainer_id: userId }).eq("id", id).select().single());
}

/** An EFT seen on the bank statement, recorded by a platform admin in their own name. */
export async function recordEft(db: Db, opportunityId: string, reference: string, amountCents: number, paidAt: string, note: string) {
  const { error } = await db.from("payments").insert({
    opportunity_id: opportunityId, provider: "manual", reference: reference.trim(), amount_cents: amountCents, status: "success", paid_at: paidAt, note: note.trim(),
  });
  if (error) throw error;
}

export async function listStaff(db: Db) {
  return must(await db.from("platform_staff").select("*").order("created_at"));
}

export async function listContractTemplates(db: Db) {
  return must(await db.from("contract_templates").select("*").order("plan").order("version", { ascending: false }));
}

export async function saveTemplateDraft(db: Db, t: { key: string; version: number; plan: string; title: string; body: string }) {
  return must(await db.from("contract_templates").insert(t).select().single());
}

export async function updateTemplateDraft(db: Db, key: string, version: number, patch: { title: string; body: string }) {
  return must(await db.from("contract_templates").update(patch).eq("key", key).eq("version", version).select().single());
}

export async function setTemplateStatus(db: Db, key: string, version: number, status: "approved" | "retired", note: string | null) {
  return must(await db.from("contract_templates").update(status === "approved" ? { status, approval_note: note } : { status }).eq("key", key).eq("version", version).select().single());
}

// The client's side: no account, just the link.
export async function contractForToken(db: Db, token: string) {
  const { data, error } = await db.rpc("contract_for_token", { p_token: token });
  if (error) throw error;
  return (data ?? [])[0] ?? null;
}

export async function acceptContract(db: Db, token: string, name: string, bodyHash: string) {
  return must(await db.rpc("accept_contract", { p_token: token, p_name: name, p_body_hash: bodyHash }));
}

// ---------------------------------------------------------------------------
// The sales team. Staff join by an invitation bound to their email; a lead a
// salesperson adds is theirs (the database marks it, from who sent it).
// ---------------------------------------------------------------------------

export type StaffInvitation = Row<"staff_invitations">;
export type StaffMember = { user_id: string; display_name: string; email: string; roles: string[] };

/** Names and roles of TEBOS's staff, readable only by staff. */
export async function staffDirectory(db: Db): Promise<StaffMember[]> {
  return must(await db.rpc("staff_directory")) as StaffMember[];
}

export interface NewLead {
  plan: "starter" | "growth" | "company" | "equity";
  name: string;
  business: string;
  email: string;
  phone?: string;
  website?: string;
  message?: string;
}

/** A lead from a salesperson's own outreach. The database records it as theirs; TEBOS screens it within seconds. */
export async function addLead(db: Db, lead: NewLead) {
  const blank = (v?: string) => (v?.trim() ? v.trim() : null);
  const { error } = await db.from("enquiries").insert({
    plan: lead.plan, name: lead.name.trim(), business: lead.business.trim(), email: lead.email.trim(),
    phone: blank(lead.phone), website: blank(lead.website), message: blank(lead.message),
  });
  if (error) throw error;
}

/** Take an unowned lead (yourself), or reassign one (platform admins). */
export async function setLeadOwner(db: Db, id: string, ownerId: string | null) {
  return must(await db.from("opportunities").update({ owner_id: ownerId }).eq("id", id).select().single());
}

export async function listStaffInvitations(db: Db) {
  return must(await db.from("staff_invitations").select("id, email, role, status, invited_by, accepted_by, created_at, expires_at, accepted_at").order("created_at", { ascending: false }).limit(100)) as StaffInvitation[];
}

/** Returns the one-time token for the link; it is shown once and never stored. */
export async function createStaffInvitation(db: Db, email: string, role: "sales" | "maintainer") {
  return must(await db.rpc("create_staff_invitation", { p_email: email.trim(), p_role: role })) as string;
}

export async function revokeStaffInvitation(db: Db, id: string) {
  const { error } = await db.from("staff_invitations").update({ status: "revoked" }).eq("id", id);
  if (error) throw error;
}

export async function removeStaffRole(db: Db, userId: string, role: string) {
  const { error } = await db.from("platform_staff").delete().eq("user_id", userId).eq("role", role);
  if (error) throw error;
}

export async function staffInvitationForToken(db: Db, token: string) {
  const { data, error } = await db.rpc("staff_invitation_for_token", { p_token: token });
  if (error) throw error;
  return (data ?? [])[0] ?? null;
}

/** The role granted, or null when the link had expired (the expiry is recorded). */
export async function acceptStaffInvitation(db: Db, token: string) {
  return maybe(await db.rpc("accept_staff_invitation", { p_token: token })) as string | null;
}

export type PlaybookSection = Row<"sales_playbook">;

/** The playbook, readable only by staff (row-level security). */
export async function listPlaybook(db: Db) {
  return must(await db.from("sales_playbook").select("*").order("position")) as PlaybookSection[];
}

export async function savePlaybookSection(db: Db, id: string, patch: { title: string; body: string }) {
  return must(await db.from("sales_playbook").update(patch).eq("id", id).select().single());
}

// ---------------------------------------------------------------------------
// Client delivery: the dated plan TEBOS owes each onboarded client. The
// maintainer (or an admin) closes each step with a note; the client's team
// can read their own plan.
// ---------------------------------------------------------------------------

export type DeliveryTask = Row<"delivery_tasks">;
const DELIVERY_COLUMNS = "id, opportunity_id, org_id, key, position, title, done_means, due_at, status, note, closed_by, closed_at, created_at";

/** Every step the caller maintains (all of them, for admins), with the client's name. */
export async function deliveryQueue(db: Db) {
  const tasks = must(await db.from("delivery_tasks").select(DELIVERY_COLUMNS).order("due_at").limit(1000)) as DeliveryTask[];
  const ids = [...new Set(tasks.map((t) => t.opportunity_id))];
  const clients = ids.length ? must(await db.from("opportunities").select("id, business, plan, maintainer_id").in("id", ids)) : [];
  return { tasks, clients };
}

export async function deliveryFor(db: Db, filter: { opportunityId?: string; orgId?: string }) {
  let q = db.from("delivery_tasks").select(DELIVERY_COLUMNS).order("position");
  if (filter.opportunityId) q = q.eq("opportunity_id", filter.opportunityId);
  if (filter.orgId) q = q.eq("org_id", filter.orgId);
  return must(await q) as DeliveryTask[];
}

/** A signal TEBOS raised from a client's records for their maintainer (migration maintainer_signals). */
export type MaintainerItem = Row<"maintainer_items">;

/** Open signals for the clients the caller maintains (all, for admins), with each organisation's name. */
export async function maintainerSignals(db: Db) {
  const items = must(await db.from("maintainer_items").select("*").eq("status", "open").order("raised_at").limit(500)) as MaintainerItem[];
  const orgIds = [...new Set(items.map((i) => i.org_id))];
  const orgs = orgIds.length ? must(await db.from("organisations").select("id, name").in("id", orgIds)) : [];
  return { items, orgs };
}

export async function closeSignal(db: Db, id: string, status: "done" | "dismissed", note: string) {
  const { error } = await db.from("maintainer_items").update({ status, note: note.trim() }).eq("id", id);
  if (error) throw error;
}

export async function closeDeliveryStep(db: Db, id: string, status: "done" | "skipped", note: string) {
  const { error } = await db.from("delivery_tasks").update({ status, note: note.trim() }).eq("id", id);
  if (error) throw error;
}

/** The free self-check: anonymous answers in, the database's score out. */
export async function submitSelfCheck(db: Db, answers: number[], size: string | null, region: string | null) {
  const { data, error } = await db.rpc("submit_self_check", { p_answers: answers, p_size: size, p_region: region });
  if (error) throw error;
  return data as number;
}

// ---------------------------------------------------------------------------
// Monthly billing. TEBOS issues invoices and payment links; people set a
// Company fee, pause or end billing, void an invoice or record an EFT, each
// with a reason. The client's team sees their own invoices.
// ---------------------------------------------------------------------------

export type BillingAccount = Row<"billing_accounts">;
export type Invoice = Row<"invoices">;

export async function billingOverview(db: Db) {
  const [accounts, invoices] = await Promise.all([
    db.from("billing_accounts").select("*").order("created_at"),
    db.from("invoices").select("*").order("issued_on", { ascending: false }).limit(500),
  ]);
  const acc = must(accounts) as BillingAccount[];
  const ids = [...new Set(acc.map((a) => a.opportunity_id))];
  const clients = ids.length ? must(await db.from("opportunities").select("id, business, plan, email").in("id", ids)) : [];
  return { accounts: acc, invoices: must(invoices) as Invoice[], clients };
}

export async function orgInvoices(db: Db, orgId: string) {
  return must(await db.from("invoices").select("*").eq("org_id", orgId).order("issued_on", { ascending: false }).limit(24)) as Invoice[];
}

/** A Company-plan fee from the agreed proposal, and the first invoice date: billing starts. */
export async function startBilling(db: Db, id: string, monthlyCents: number, firstInvoiceOn: string, note: string) {
  const { error } = await db.from("billing_accounts").update({
    monthly_cents: monthlyCents, fee_note: note.trim(), next_invoice_on: firstInvoiceOn, status: "active", status_note: note.trim(),
  }).eq("id", id);
  if (error) throw error;
}

export async function setBillingStatus(db: Db, id: string, status: "active" | "paused" | "ended", note: string) {
  const { error } = await db.from("billing_accounts").update({ status, status_note: note.trim() }).eq("id", id);
  if (error) throw error;
}

export async function changeFee(db: Db, id: string, monthlyCents: number, note: string) {
  const { error } = await db.from("billing_accounts").update({ monthly_cents: monthlyCents, fee_note: note.trim() }).eq("id", id);
  if (error) throw error;
}

export async function voidInvoice(db: Db, id: string, reason: string) {
  const { error } = await db.from("invoices").update({ status: "void", void_reason: reason.trim() }).eq("id", id);
  if (error) throw error;
}

/** An EFT seen on the bank statement, against an invoice; the database marks the invoice paid if it covers it. */
export async function recordInvoiceEft(db: Db, inv: Invoice, reference: string, amountCents: number, paidAt: string, note: string) {
  const { error } = await db.from("payments").insert({
    opportunity_id: inv.opportunity_id, invoice_id: inv.id, provider: "manual", reference: reference.trim(), amount_cents: amountCents,
    status: "success", paid_at: paidAt, note: note.trim(),
  });
  if (error) throw error;
}
