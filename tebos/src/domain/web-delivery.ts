// The Web Delivery Division, milestone 1 (founder's operating specification, 1 Nov 2026; docs/web-delivery/,
// ADR 0011): what a website project is, what scope a package holds, what "ready to build" means, when the
// three-business-day clock runs, and when a project may go to client review and release. The database enforces the
// same rules (migration 20261101090000_web_delivery.sql); test/schema-parity.test.ts keeps the lists in step.
import { BOARD_LIMITS, type Tier } from "./editions";
import { fail, OK, type Check } from "./rules";
import type { WebProjectStatus, WebTaskStatus } from "./states";

export const WEBSITE_TYPES = {
  landing_page: "Landing page",
  corporate: "Corporate website",
  service_business: "Service business website",
  portfolio: "Portfolio or media website",
  ecommerce: "E-commerce store",
  booking: "Booking website",
  property: "Property website",
  membership: "Membership portal",
  saas_dashboard: "SaaS or dashboard",
  custom_application: "Custom application",
} as const;
export type WebsiteType = keyof typeof WEBSITE_TYPES;

export const PRIMARY_OBJECTIVES = {
  leads: "Generate qualified leads",
  sell_online: "Sell products online",
  bookings: "Book appointments",
  showcase: "Showcase services or portfolio",
  corporate_presence: "Establish a corporate presence",
  content: "Publish content or media",
  client_portal: "Build a membership or client portal",
  web_application: "Deliver a web application",
  other: "Other",
} as const;
export type PrimaryObjective = keyof typeof PRIMARY_OBJECTIVES;

/** The readiness items a person confirms with evidence. The other checks are computed from records. */
export const READINESS_ITEMS = {
  commercial_terms: "Payment or agreed commercial terms are satisfied",
  intake_complete: "Required intake fields are complete",
  assets: "Required assets are received, or their absence is explicitly accepted",
  technical_access: "Technical access has been verified",
  dependencies: "External dependencies have been identified",
  delivery_window: "The delivery window is feasible",
  security_privacy: "Security and privacy requirements are recorded",
  release_authority: "Who approves the production release is identified",
} as const;
export type ReadinessItem = keyof typeof READINESS_ITEMS;
export type ReadinessStatus = "missing" | "met" | "waived";
/** Only missing assets may be knowingly accepted; every other item must be met. */
export const WAIVABLE: ReadonlySet<ReadinessItem> = new Set<ReadinessItem>(["assets"]);

export const WEB_STATUS_LABEL: Record<WebProjectStatus, string> = {
  lead: "Lead",
  intake: "Intake",
  scope_review: "Scope review",
  approval: "Awaiting approval",
  build: "Build",
  qa: "QA",
  qa_failed: "QA failed",
  client_review: "Client review",
  release: "Release",
  handover: "Handover",
  closed: "Closed",
  blocked_client: "Waiting on the client",
  blocked_technical: "Blocked (technical)",
  scope_change: "Scope change",
  cancelled: "Cancelled",
};

/** Turnaround once a project is ready to build: a target for defined scope, not a guarantee. */
export const DELIVERY_BUSINESS_DAYS = 3;
const PACKAGE_NAME: Record<Tier, string> = { starter: "Small", growth: "Medium", company: "Company" };

/** A default sitemap for each website type, for the client to approve or change. */
export const DEFAULT_SITEMAP: Record<WebsiteType, string[]> = {
  landing_page: ["Home"],
  corporate: ["Home", "About", "Services", "Contact"],
  service_business: ["Home", "Services", "About", "FAQ", "Contact"],
  portfolio: ["Home", "Work", "About", "Contact"],
  ecommerce: ["Home", "Shop", "Product", "Cart", "Checkout", "Contact"],
  booking: ["Home", "Services", "Book", "About", "Contact"],
  property: ["Home", "Properties", "Property", "About", "Contact"],
  membership: ["Home", "Join", "Sign in", "Member area", "Contact"],
  saas_dashboard: ["Home", "Pricing", "Sign in", "Dashboard"],
  custom_application: ["Home", "Sign in", "Application"],
};

// ---------------------------------------------------------------------------
// Business days (Africa/Johannesburg dates; weekends only, as in the database: public holidays are not yet counted)
// ---------------------------------------------------------------------------
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const weekday = (d: Date) => d.getUTCDay() !== 0 && d.getUTCDay() !== 6;

export function addBusinessDays(from: string, days: number): string {
  const d = day(from);
  let n = 0;
  while (n < days) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (weekday(d)) n++;
  }
  return iso(d);
}

/** Business days after `from`, up to and including `to`; 0 when `to` isn't after `from`. */
export function businessDaysBetween(from: string, to: string): number {
  const d = day(from);
  const end = day(to);
  let n = 0;
  while (d < end) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (weekday(d)) n++;
  }
  return n;
}

export interface Clock {
  deadlineOn: string | null;
  pausedOn: string | null;
}

/** The delivery clock after a change of state on `today`: it starts at build and pauses while the client blocks it. */
export function nextClock(clock: Clock, from: WebProjectStatus, to: WebProjectStatus, today: string): Clock {
  if (to === "build") {
    if (clock.deadlineOn === null) return { deadlineOn: addBusinessDays(today, DELIVERY_BUSINESS_DAYS), pausedOn: null };
    if (clock.pausedOn !== null) return { deadlineOn: addBusinessDays(clock.deadlineOn, businessDaysBetween(clock.pausedOn, today)), pausedOn: null };
    return { deadlineOn: clock.deadlineOn, pausedOn: null };
  }
  if (to === "blocked_client" && clock.deadlineOn !== null) return { deadlineOn: clock.deadlineOn, pausedOn: today };
  if (from === "blocked_client" && clock.pausedOn !== null && clock.deadlineOn !== null) {
    return { deadlineOn: addBusinessDays(clock.deadlineOn, businessDaysBetween(clock.pausedOn, today)), pausedOn: null };
  }
  return clock;
}

// ---------------------------------------------------------------------------
// Scope against the package
// ---------------------------------------------------------------------------
export interface ScopeDraft {
  pages: string[];
  features: string[];
  workflows: string[];
  exclusions: string;
  primaryConversion: string;
  acceptanceCriteria: string[];
  recurringCosts: string;
}

/** Scope fits the package's ceiling (the board limits): workflows, and parts counted as pages plus features. */
export function checkScope(plan: Tier, s: ScopeDraft): Check {
  if (s.pages.length < 1) return fail("TEBOS_VALIDATION", "Name at least one page.");
  if (s.exclusions.trim().length < 10) return fail("TEBOS_VALIDATION", "Say what is excluded, in at least 10 characters.");
  if (s.primaryConversion.trim().length < 10) return fail("TEBOS_VALIDATION", "Say what visitors should do first, in at least 10 characters.");
  if (s.acceptanceCriteria.length < 1) return fail("TEBOS_VALIDATION", "Write at least one testable acceptance criterion.");
  if (s.recurringCosts.trim().length < 4) return fail("TEBOS_VALIDATION", "State the recurring costs, or \"None\".");
  const limit = BOARD_LIMITS[plan];
  const parts = s.pages.length + s.features.length;
  if (s.workflows.length > limit.flows || parts > limit.pieces) {
    return fail("TEBOS_OUT_OF_PLAN",
      `The ${PACKAGE_NAME[plan]} package holds up to ${limit.flows} workflows and ${limit.pieces} parts (pages and features); this scope has ${s.workflows.length} and ${parts}. Offer a revised quote, a smaller launch scope or a later phase.`);
  }
  return OK;
}

// ---------------------------------------------------------------------------
// Readiness and gates
// ---------------------------------------------------------------------------
export interface ProjectFacts {
  plan: Tier;
  activePlan: string | null;
  hasScope: boolean;
  scopeApproved: boolean;
  designApproved: boolean;
  readiness: Partial<Record<ReadinessItem, ReadinessStatus>>;
}

/** What still stands between a project and its build, in plain words; empty means ready (mirrors web_readiness_gaps). */
export function readinessGaps(p: ProjectFacts): string[] {
  const gaps: string[] = [];
  if (p.activePlan !== p.plan) gaps.push("package: the project's package is not the client's active plan");
  if (!p.hasScope) gaps.push("scope: no scope has been written");
  else {
    if (!p.scopeApproved) gaps.push("scope: the client has not approved the latest scope, its exclusions and recurring costs");
    if (!p.designApproved) gaps.push("design: the client has not approved the design direction for the latest scope");
  }
  for (const item of Object.keys(READINESS_ITEMS) as ReadinessItem[]) {
    const s = p.readiness[item];
    if (!(s === "met" || (s === "waived" && WAIVABLE.has(item)))) gaps.push(`${item}: not confirmed with evidence`);
  }
  return gaps;
}

export interface QaRun {
  revision: number;
  verdict: "pass" | "conditional_pass" | "fail";
  criticalOpen: number;
  at: string;
}

/** The latest QA verdict on the latest scope passes with nothing critical open (mirrors web_qa_passed). */
export function qaPassed(runs: QaRun[], latestRevision: number | null): boolean {
  const latest = runs.filter((r) => r.revision === latestRevision).sort((a, b) => b.at.localeCompare(a.at))[0];
  return !!latest && latest.verdict !== "fail" && latest.criticalOpen === 0;
}

/** Can a project move to client review or release? Build is gated by readinessGaps. */
export function checkRelease(to: "client_review" | "release", qaOk: boolean, releaseApproved: boolean): Check {
  if (!qaOk) return fail("TEBOS_VALIDATION", `${to === "release" ? "Release" : "Client review"} needs a QA pass on the latest scope with no critical defect open.`);
  if (to === "release" && !releaseApproved) return fail("TEBOS_VALIDATION", "Release needs the client's release approval on the latest scope.");
  return OK;
}

// ---------------------------------------------------------------------------
// Milestone 2: the task ledger, assets, deployments (migration 20261101120000_web_delivery_ledger.sql)
// ---------------------------------------------------------------------------

/** The specification's roles. They are roles, not processes: a person or an agent does the work. */
export const WEB_ROLES = {
  director: "Web Delivery Director",
  intake: "Client Intake and Scope Analyst",
  creative: "Creative Director",
  ux: "UX/UI Architect",
  assets: "Visual Asset and 3D Specialist",
  architect: "Solution Architect",
  frontend: "Frontend Engineer",
  backend: "Backend and Integration Engineer",
  content: "Content and Conversion Strategist",
  qa: "Independent QA and Security Auditor",
  deployment: "Deployment and Handover Engineer",
  librarian: "Delivery Intelligence and Template Librarian",
} as const;
export type WebRole = keyof typeof WEB_ROLES;

export const WEB_TASK_STATUS_LABEL: Record<WebTaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  review: "In review",
  done: "Done",
  blocked: "Blocked",
  cancelled: "Cancelled",
};

export const ASSET_KINDS = {
  logo: "Logo", photo: "Photograph", video: "Video", model_3d: "3D model", font: "Font", copy: "Copy", icon: "Icon", other: "Other",
} as const;
export const ASSET_SOURCES = {
  client_supplied: "Supplied by the client", licensed: "Licensed", commissioned: "Commissioned", tebos_made: "Made by TEBOS", unknown: "Source unknown",
} as const;
export const ASSET_STATUSES = {
  received: "Received", missing: "Missing", client_approval_required: "Needs the client's approval", not_applicable: "Not applicable",
} as const;
export type AssetSource = keyof typeof ASSET_SOURCES;
export type AssetStatus = keyof typeof ASSET_STATUSES;

/** An asset counts as received only with its source and licence written down (mirrors the web_assets check). */
export function checkAsset(a: { status: AssetStatus; source: AssetSource; licenceNote: string }): Check {
  if (a.status === "received" && a.source === "unknown") return fail("TEBOS_VALIDATION", "Say where this asset came from before marking it received.");
  if (a.status === "received" && a.licenceNote.trim().length < 10) return fail("TEBOS_VALIDATION", "Write down the licence or permission (at least 10 characters) before marking it received.");
  return OK;
}

export interface TaskLite { id: string; status: WebTaskStatus; dependsOn: string[] }

/** Tasks that may start: not started, and everything they depend on is done (mirrors guard_web_task). */
export function canStart(task: TaskLite, all: TaskLite[]): boolean {
  if (task.status !== "todo" && task.status !== "blocked") return false;
  const byId = new Map(all.map((t) => [t.id, t]));
  return task.dependsOn.every((d) => byId.get(d)?.status === "done");
}

/** Would adding "task depends on dependsOn" close a loop? (mirrors guard_web_dependency) */
export function makesLoop(taskId: string, dependsOn: string, edges: Array<[string, string]>): boolean {
  if (taskId === dependsOn) return true;
  const next = new Map<string, string[]>();
  for (const [t, d] of edges) next.set(t, [...(next.get(t) ?? []), d]);
  const seen = new Set<string>();
  const stack = [dependsOn];
  while (stack.length) {
    const id = stack.pop()!;
    if (id === taskId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(next.get(id) ?? []));
  }
  return false;
}

/** Completion counted from accepted (done) tasks, never estimated. Cancelled tasks don't count. */
export function completion(total: number, done: number): number | null {
  return total > 0 ? Math.round((done / total) * 100) : null;
}

export type DeadlineState = "not_started" | "paused" | "overdue" | "due_today" | "at_risk" | "on_track" | "finished";

/** Where a project stands against its clock on `today` (Johannesburg date). */
export function deadlineState(p: { status: WebProjectStatus; deadlineOn: string | null; pausedOn: string | null }, today: string): { state: DeadlineState; businessDaysLeft: number | null } {
  if (["release", "handover", "closed", "cancelled"].includes(p.status)) return { state: "finished", businessDaysLeft: null };
  if (p.deadlineOn === null) return { state: "not_started", businessDaysLeft: null };
  if (p.pausedOn !== null) return { state: "paused", businessDaysLeft: businessDaysBetween(p.pausedOn, p.deadlineOn) };
  if (today > p.deadlineOn) return { state: "overdue", businessDaysLeft: -businessDaysBetween(p.deadlineOn, today) };
  const left = businessDaysBetween(today, p.deadlineOn);
  return { state: left === 0 ? "due_today" : left === 1 ? "at_risk" : "on_track", businessDaysLeft: left };
}

/** The production deployment rule (mirrors guard_web_deployment). */
export function checkDeployment(d: { environment: "preview" | "production"; url: string; commitRef: string; checked: string },
  project: { status: WebProjectStatus; releaseApproved: boolean }): Check {
  if (!/^https:\/\/\S+$/.test(d.url)) return fail("TEBOS_VALIDATION", "The address must start with https://.");
  if (!/^[0-9a-f]{7,40}$/.test(d.commitRef)) return fail("TEBOS_VALIDATION", "Give the commit it was built from (7 to 40 hex characters).");
  if (d.checked.trim().length < 10) return fail("TEBOS_VALIDATION", "Say what you checked at that address.");
  if (d.environment === "production") {
    if (project.status !== "release" && project.status !== "handover") return fail("TEBOS_VALIDATION", "Production deploys happen in release.");
    if (!project.releaseApproved) return fail("TEBOS_APPROVAL_REQUIRED", "Production needs the client's release approval.");
  }
  return OK;
}

// ---------------------------------------------------------------------------
// Milestone 3: maintainers and capacity, client-owned accounts, costs (migration 20261101150000_web_delivery_portal.sql)
// ---------------------------------------------------------------------------

/** The most open projects one maintainer runs at once (mirrors guard_web_assignment and web_team_load). */
export const WEB_PROJECTS_PER_MAINTAINER = 8;

/** How many maintainers a number of open projects needs. 50 clients, one project each, need 7. */
export function maintainersNeeded(openProjects: number): number {
  return Math.ceil(openProjects / WEB_PROJECTS_PER_MAINTAINER);
}

export const INTEGRATION_SERVICES = {
  hosting: "Hosting", domain: "Domain", dns: "DNS", repository: "Code repository", database: "Database", email: "Email sending",
  payments: "Payments", analytics: "Analytics", cms: "Content editing", booking: "Bookings", maps: "Maps", other: "Other",
} as const;
export const TEBOS_ACCESS = {
  none: "No access", read: "Read only", deploy: "Can deploy", admin: "Full admin",
} as const;
export const INTEGRATION_STATUSES = {
  requested: "Access requested", granted: "Access granted", verified: "Access verified", revoked: "Access revoked",
} as const;
export type TebosAccess = keyof typeof TEBOS_ACCESS;
export type IntegrationStatus = keyof typeof INTEGRATION_STATUSES;

/** The client owns their accounts; TEBOS's access is recorded with how it ends (mirrors the web_integrations checks). */
export function checkIntegration(i: { accountOwner: "client" | "tebos"; access: TebosAccess; status: IntegrationStatus; purpose: string; revocationPlan: string; transferPlan: string; verifiedOn: string | null }): Check {
  if (i.purpose.trim().length < 10) return fail("TEBOS_VALIDATION", "Say what the site uses this account for (at least 10 characters).");
  if (i.access !== "none" && i.revocationPlan.trim().length < 10) return fail("TEBOS_VALIDATION", "Say how TEBOS's access is removed when the work ends.");
  if (i.accountOwner === "tebos" && i.transferPlan.trim().length < 10) return fail("TEBOS_VALIDATION", "An account TEBOS holds for a client needs a plan to hand it over to them.");
  if (i.status === "verified" && !i.verifiedOn) return fail("TEBOS_VALIDATION", "Give the date the access was checked.");
  if (i.status === "revoked" && i.access !== "none") return fail("TEBOS_VALIDATION", "Revoked access means TEBOS has no access left.");
  return OK;
}

export const COST_KINDS = {
  hosting: "Hosting", domain: "Domain", software: "Software", assets: "Assets", ai_usage: "AI usage", labour: "Labour", other: "Other",
} as const;
export type CostRecurrence = "once" | "monthly" | "yearly";

/** A recurring cost the client pays must have been disclosed to them (mirrors the web_project_costs check). */
export function checkCost(c: { description: string; amountCents: number; recurrence: CostRecurrence; paidBy: "client" | "tebos"; disclosed: boolean }): Check {
  if (c.description.trim().length < 5) return fail("TEBOS_VALIDATION", "Describe the cost.");
  if (!Number.isInteger(c.amountCents) || c.amountCents < 0) return fail("TEBOS_VALIDATION", "Give the amount in rand, zero or more.");
  if (c.paidBy === "client" && c.recurrence !== "once" && !c.disclosed) return fail("TEBOS_VALIDATION", "A recurring cost the client pays must be disclosed to them first.");
  return OK;
}

/** Monthly equivalent of the recurring costs, in cents (yearly divided by 12, rounded). */
export function monthlyRunningCents(costs: Array<{ amountCents: number; recurrence: CostRecurrence }>): number {
  return costs.reduce((n, c) => n + (c.recurrence === "monthly" ? c.amountCents : c.recurrence === "yearly" ? Math.round(c.amountCents / 12) : 0), 0);
}

/** What a client still has to decide or supply, from their project's records. */
export function clientToDos(p: {
  status: WebProjectStatus; isAdmin: boolean; hasScope: boolean; approved: { scope: boolean; design: boolean; release: boolean };
  qaPassed: boolean; assetsNeeded: number;
}): string[] {
  const out: string[] = [];
  if (p.hasScope && !p.approved.scope) out.push(p.isAdmin ? "Approve the scope and its costs" : "Your admin approves the scope and its costs");
  if (p.hasScope && !p.approved.design) out.push(p.isAdmin ? "Approve the design direction" : "Your admin approves the design direction");
  if (p.qaPassed && !p.approved.release && (p.status === "client_review")) out.push(p.isAdmin ? "Review the preview and approve the release" : "Your admin approves the release");
  if (p.assetsNeeded > 0) out.push(`Send ${p.assetsNeeded} item${p.assetsNeeded === 1 ? "" : "s"} TEBOS needs from you`);
  return out;
}
