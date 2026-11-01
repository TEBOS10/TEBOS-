// The Web Delivery Division, milestone 1 (founder's operating specification, 1 Nov 2026; docs/web-delivery/,
// ADR 0011): what a website project is, what scope a package holds, what "ready to build" means, when the
// three-business-day clock runs, and when a project may go to client review and release. The database enforces the
// same rules (migration 20261101090000_web_delivery.sql); test/schema-parity.test.ts keeps the lists in step.
import { BOARD_LIMITS, type Tier } from "./editions";
import { fail, OK, type Check } from "./rules";
import type { WebProjectStatus } from "./states";

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
