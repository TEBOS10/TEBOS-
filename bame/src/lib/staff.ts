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
