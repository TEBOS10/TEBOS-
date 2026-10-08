export const DEPARTMENTS = ["sales", "production", "pr", "finance", "tech", "admin"] as const;
export type Department = (typeof DEPARTMENTS)[number];

export const DEPARTMENT_LABELS: Record<Department, string> = {
  sales: "Sales",
  production: "Production",
  pr: "PR",
  finance: "Finance",
  tech: "Technology",
  admin: "Administration",
};

export interface StaffProfile {
  id: string;
  full_name: string;
  email: string;
  department: Department;
  is_admin: boolean;
}

// Which diagnostic intake sections matter most to each department, so a
// routed case highlights what that team actually needs to act on instead of
// making them read all 14 sections looking for their part.
export const DEPARTMENT_HIGHLIGHT_SECTIONS: Record<Department, string[]> = {
  sales: ["control", "representation", "sponsorship", "business", "goals", "event"],
  production: ["athlete_identity", "performance", "production_content"],
  pr: ["brand_audience", "pr_commercial"],
  finance: ["control", "sponsorship", "business"],
  tech: ["production_content"],
  admin: [],
};

// Client-facing monthly package fees (ZAR) — Custom is scoped and priced
// separately per client, so it has no fixed fee.
export const PACKAGE_CLIENT_FEES: Record<"foundation" | "growth", number> = {
  foundation: 6500,
  growth: 10000,
};

export function formatZAR(amount: number): string {
  return `R${amount.toLocaleString("en-ZA")}`;
}

export const OPPORTUNITY_STATUSES = ["new", "reviewed", "in_progress", "awaiting_response", "closed"] as const;
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

export const OPPORTUNITY_STATUS_LABELS: Record<OpportunityStatus, string> = {
  new: "New",
  reviewed: "Reviewed",
  in_progress: "In progress",
  awaiting_response: "Awaiting response",
  closed: "Closed",
};

export const OPPORTUNITY_CATEGORIES = ["sponsorship", "partnership", "media", "event", "business", "other"] as const;
export type OpportunityCategory = (typeof OPPORTUNITY_CATEGORIES)[number];

export const OPPORTUNITY_CATEGORY_LABELS: Record<OpportunityCategory, string> = {
  sponsorship: "Sponsorship",
  partnership: "Partnership",
  media: "Media",
  event: "Event",
  business: "Business",
  other: "Other",
};

export interface Opportunity {
  id: string;
  player_id: string;
  title: string;
  category: OpportunityCategory;
  status: OpportunityStatus;
  outcome: "won" | "lost" | null;
  source: string | null;
  value_estimate: number | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_org: string | null;
  notes: string | null;
  assigned_department: Department | null;
  created_at: string;
  updated_at: string;
}

// --- Sales prospecting / call sheet ---

export const PROSPECT_CONTACT_TYPES = ["athlete", "club", "event", "brand", "other"] as const;
export type ProspectContactType = (typeof PROSPECT_CONTACT_TYPES)[number];
export const PROSPECT_CONTACT_TYPE_LABELS: Record<ProspectContactType, string> = {
  athlete: "Athlete",
  club: "Club",
  event: "Event",
  brand: "Brand / sponsor",
  other: "Other",
};

export const PROSPECT_CHANNELS = ["instagram", "whatsapp", "email", "call", "linkedin", "referral", "other"] as const;
export type ProspectChannel = (typeof PROSPECT_CHANNELS)[number];
export const PROSPECT_CHANNEL_LABELS: Record<ProspectChannel, string> = {
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  email: "Email",
  call: "Call",
  linkedin: "LinkedIn",
  referral: "Referral",
  other: "Other",
};

export const PROSPECT_STATUSES = ["new", "contacted", "in_conversation", "deferred", "won", "lost"] as const;
export type ProspectStatus = (typeof PROSPECT_STATUSES)[number];
export const PROSPECT_STATUS_LABELS: Record<ProspectStatus, string> = {
  new: "New",
  contacted: "Contacted",
  in_conversation: "In conversation",
  deferred: "Deferred",
  won: "Won",
  lost: "Lost",
};

export const PROSPECT_SOURCES = ["outreach", "referral", "inbound_social", "event", "other"] as const;
export type ProspectSource = (typeof PROSPECT_SOURCES)[number];
export const PROSPECT_SOURCE_LABELS: Record<ProspectSource, string> = {
  outreach: "Outreach",
  referral: "Referral",
  inbound_social: "Inbound (social)",
  event: "Event",
  other: "Other",
};

export const PROSPECT_PRIORITIES = ["high", "medium", "low"] as const;
export type ProspectPriority = (typeof PROSPECT_PRIORITIES)[number];

export const OUTREACH_OUTCOMES = [
  "no_answer",
  "connected",
  "deferred",
  "interested",
  "not_interested",
  "referral_given",
  "won",
  "lost",
  "other",
] as const;
export type OutreachOutcome = (typeof OUTREACH_OUTCOMES)[number];
export const OUTREACH_OUTCOME_LABELS: Record<OutreachOutcome, string> = {
  no_answer: "No answer",
  connected: "Connected",
  deferred: "Deferred",
  interested: "Interested",
  not_interested: "Not interested",
  referral_given: "Referral given",
  won: "Won",
  lost: "Lost",
  other: "Other",
};

export interface Prospect {
  id: string;
  full_name: string;
  org_name: string | null;
  contact_type: ProspectContactType;
  channel: ProspectChannel;
  handle_or_contact: string | null;
  status: ProspectStatus;
  source: ProspectSource;
  referred_by: string | null;
  added_by: string | null;
  assigned_department: Department;
  priority: ProspectPriority;
  notes: string | null;
  last_contact_at: string | null;
  next_follow_up_at: string | null;
  created_at: string;
  updated_at: string;
  is_due?: boolean;
  contact_count?: number;
}

export interface OutreachLogEntry {
  id: string;
  prospect_id: string;
  logged_by: string | null;
  channel: string;
  outcome: OutreachOutcome;
  summary: string | null;
  follow_up_at: string | null;
  created_at: string;
}
