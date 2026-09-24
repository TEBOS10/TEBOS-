// Data access for the operator interface.
//
// Every call runs under the signed-in user's own session: row-level security
// decides what they see, and the schema's guards decide what they may change.
// Nothing here uses elevated keys. Related rows are fetched with separate,
// explicit queries (the schema's composite keys make implicit embedding
// ambiguous) and joined in memory.

import type { Database } from "../database.types";
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
}

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
