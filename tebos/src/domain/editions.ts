// Operating-system editions (founder, 21 Oct 2026): every industry's operating system comes in the three plan sizes,
// and is tailored to the kind of business within the industry ("what kind of academy?").
//
//   Small    the industry's core system: its pieces and its core flows.
//   Medium   the core, plus the team module: roles, onboarding and a weekly review on real numbers.
//   Company  the medium edition, plus the company module: departments, leadership review and spend approvals.
//
// A plan's edition is a ceiling the database enforces, not a promise in the interface: the board of a business on a
// plan holds at most that plan's flows and pieces (migration tier_board_limits, mirrored by BOARD_LIMITS below), so a
// Small client can't build a Company system by hand either. Shared modules are built once for every industry
// (ADR 0008 rule 1): no client-specific code.
import { blueprintByKey, type Blueprint, type BlueprintFlow, type BlueprintPiece } from "./blueprints";

export const TIERS = ["starter", "growth", "company"] as const;
export type Tier = (typeof TIERS)[number];
export const TIER_NAMES: Record<Tier, string> = { starter: "Small", growth: "Medium", company: "Company" };

/** The most active flows and pieces one business's board may hold on each plan (mirrors plan_board_limit). */
export const BOARD_LIMITS: Record<Tier, { flows: number; pieces: number }> = {
  starter: { flows: 4, pieces: 10 },
  growth: { flows: 10, pieces: 30 },
  company: { flows: 40, pieces: 120 },
};
/** With no active plan a board gets the Small ceiling, so nothing beyond it is ever free. */
export const NO_PLAN_TIER: Tier = "starter";

export interface Variant {
  key: string;
  label: string;
  /** What this kind of business needs on top of the industry's core. */
  pieces: BlueprintPiece[];
}

const p = (name: string, kind: BlueprintPiece["kind"], ownerRole: string, description: string): BlueprintPiece => ({ name, kind, ownerRole, description });

// The kinds of business within each industry. Each adds only the pieces that kind really has; the flows stay shared.
export const VARIANTS: Record<string, Variant[]> = {
  "education-centre": [
    { key: "tutoring", label: "Tutoring centre", pieces: [p("Lesson booking calendar", "software", "Centre manager", "Every session, tutor and room.")] },
    { key: "music", label: "Music academy", pieces: [p("Instrument and room schedule", "software", "Centre manager", "Which instrument and practice room each lesson uses."), p("Exam entries register", "document", "Head teacher", "Graded exam entries, dates and fees.")] },
    { key: "sports", label: "Sports academy", pieces: [p("Training ground bookings", "software", "Head coach", "Fields, courts and sessions."), p("Player development records", "data_store", "Head coach", "Each player's progress, signed off by a coach.")] },
    { key: "driving", label: "Driving school", pieces: [p("Vehicle and instructor schedule", "software", "Office manager", "Which car and instructor each lesson uses."), p("Test bookings register", "document", "Office manager", "Learner and driving test dates.")] },
    { key: "skills", label: "Coding or skills academy", pieces: [p("Learning platform", "software", "Programme lead", "Courses, assignments and completion.")] },
  ],
  "marketing-agency": [
    { key: "marketing", label: "Marketing or creative agency", pieces: [p("Asset library", "data_store", "Creative lead", "Approved logos, images and templates per client.")] },
    { key: "recruitment", label: "Recruitment agency", pieces: [p("Candidate database", "data_store", "Recruiter", "Candidates, consent and placements.")] },
    { key: "events", label: "Events agency", pieces: [p("Supplier list", "document", "Event manager", "Venues, caterers and rates, agreed in advance.")] },
  ],
  "sports-agency": [
    { key: "athlete-management", label: "Athlete management", pieces: [p("Player portfolio site", "software", "Marketing", "Each player's public profile and highlights.")] },
    { key: "events", label: "Sports events", pieces: [p("Ticketing system", "software", "Event manager", "Tickets, entries and gate lists.")] },
    { key: "club", label: "Club or academy", pieces: [p("Membership register", "data_store", "Club secretary", "Members, fees and fixtures.")] },
  ],
  "real-estate": [
    { key: "sales", label: "Sales agency", pieces: [p("Buyer register", "data_store", "Agent", "Qualified buyers and what they're looking for.")] },
    { key: "rentals", label: "Rentals agency", pieces: [p("Lease and inspection register", "document", "Rentals manager", "Lease dates, inspections and deposits.")] },
    { key: "solo", label: "Independent agent", pieces: [p("Listings portal account", "software", "Agent", "Where the agent's listings are published.")] },
  ],
  "restaurant": [
    { key: "restaurant", label: "Sit-down restaurant", pieces: [p("Reservations system", "software", "Front of house", "Bookings and table plan.")] },
    { key: "takeaway", label: "Takeaway or fast food", pieces: [p("Delivery apps", "provider", "Manager", "Orders from delivery platforms.")] },
    { key: "catering", label: "Catering", pieces: [p("Event quotes register", "document", "Owner", "Every quote, menu and deposit.")] },
  ],
  "medical-practice": [
    { key: "gp", label: "General practice", pieces: [p("Medical aid claims portal", "provider", "Practice manager", "Claims submitted and paid.")] },
    { key: "dental", label: "Dental practice", pieces: [p("Recall list", "data_store", "Reception", "Patients due for check-ups.")] },
    { key: "therapy", label: "Therapy or allied health", pieces: [p("Session notes system", "software", "Therapist", "Notes kept to the professional standard.")] },
  ],
  "trades-construction": [
    { key: "plumbing", label: "Plumbing", pieces: [p("Call-out schedule", "software", "Dispatcher", "Every call-out, plumber and slot.")] },
    { key: "building", label: "Building and renovations", pieces: [p("Site diary", "document", "Site manager", "Daily progress, deliveries and sign-offs.")] },
    { key: "electrical", label: "Electrical", pieces: [p("Compliance certificate register", "document", "Owner", "Every certificate issued.")] },
  ],
  "online-retail": [
    { key: "own-store", label: "Own online store", pieces: [p("Courier account", "provider", "Fulfilment", "Collections and tracking.")] },
    { key: "marketplace", label: "Marketplace seller", pieces: [p("Marketplace seller account", "provider", "Owner", "Listings, orders and payouts.")] },
  ],
  "accounting-firm": [
    { key: "bookkeeping", label: "Bookkeeping", pieces: [p("Client document inbox", "channel", "Bookkeeper", "Where clients send statements and slips.")] },
    { key: "tax", label: "Tax practice", pieces: [p("Tax deadline calendar", "software", "Tax practitioner", "Every filing deadline per client.")] },
  ],
  "logistics": [
    { key: "courier", label: "Courier", pieces: [p("Route planner", "software", "Dispatcher", "Daily routes and stops.")] },
    { key: "freight", label: "Freight and haulage", pieces: [p("Fleet maintenance log", "document", "Fleet manager", "Services, licences and roadworthies.")] },
  ],
  "gym-fitness": [
    { key: "gym", label: "Gym", pieces: [p("Equipment service log", "document", "Manager", "Every service and repair.")] },
    { key: "studio", label: "Studio (yoga, pilates, boxing)", pieces: [p("Class booking app", "software", "Studio manager", "Classes, spaces and waitlists.")] },
    { key: "personal-training", label: "Personal training", pieces: [p("Client programmes", "document", "Trainer", "Each client's programme and progress.")] },
  ],
};

const flow = (name: string, startsWhen: string, doneWhen: string, ownerRole: string, steps: BlueprintFlow["steps"]): BlueprintFlow => ({ name, startsWhen, doneWhen, ownerRole, steps });

/** Added at Medium: the team runs the business without the founder in every step. */
export const TEAM_MODULE = {
  pieces: [
    p("Team handbook", "document", "Operations lead", "Roles, rules and how work is handed over, written once."),
    p("Weekly numbers sheet", "software", "Operations lead", "The few numbers the team reviews every week."),
  ],
  flows: [
    flow("New team member to working on their own", "Someone joins the team", "They run their part of the work without help", "Operations lead", [
      { name: "Give them the handbook and their role", performer: "staff", role: "Operations lead", rule: "Every new person gets the handbook and a named buddy on day one.", piece: "Team handbook" },
      { name: "Shadow the work for a week", performer: "staff", role: "Buddy", rule: "They watch each flow once before doing it." },
      { name: "Sign them off on each flow", performer: "staff", role: "Operations lead", rule: "Signed off only after doing the flow once under supervision without a mistake." },
    ]),
    flow("Weekly numbers to decisions", "Monday morning", "Each number off target has an owner and a next step", "Operations lead", [
      { name: "Update the numbers", performer: "staff", role: "Operations lead", rule: "Numbers come from the systems, never typed from memory.", piece: "Weekly numbers sheet" },
      { name: "Review them as a team", performer: "staff", role: "Team", rule: "Fifteen minutes; only numbers off target are discussed." },
      { name: "Decide on anything above the team's limit", performer: "founder", role: "Owner", rule: "Only spend or changes above the agreed limit go to the owner." },
    ]),
  ] as BlueprintFlow[],
};

/** Added at Company: departments that run themselves, and a leadership that reviews rather than chases. */
export const COMPANY_MODULE = {
  pieces: [
    p("Department leads", "role", "Managing director", "One accountable lead per department."),
    p("Approval register", "document", "Finance", "Every approval above a limit: who, what and why."),
    p("Leadership dashboard", "software", "Managing director", "Each department's numbers in one place."),
  ],
  flows: [
    flow("Handover between departments", "Work moves from one department to another", "The receiving department confirms it has everything", "Department leads", [
      { name: "Send the work with its checklist", performer: "staff", role: "Sending department", rule: "Nothing moves without the department's handover checklist complete." },
      { name: "Confirm or return within a day", performer: "staff", role: "Receiving department", rule: "Return incomplete work with what's missing, never fix it silently." },
    ]),
    flow("Monthly leadership review", "The first week of the month", "Every department's numbers are reviewed and actions owned", "Managing director", [
      { name: "Each lead reports their numbers", performer: "staff", role: "Department leads", rule: "From the dashboard, with a sentence on anything off target.", piece: "Leadership dashboard" },
      { name: "Agree the month's priorities", performer: "founder", role: "Managing director", rule: "No more than three company priorities a month." },
    ]),
    flow("Spend above the limit to approved", "Someone needs to spend above their limit", "It's approved or declined, on the record", "Finance", [
      { name: "Request with the reason and quote", performer: "staff", role: "Requester", rule: "Every request has a quote and the objective it serves." },
      { name: "Approve or decline", performer: "founder", role: "Managing director", rule: "Decided within two working days.", piece: "Approval register" },
    ]),
  ] as BlueprintFlow[],
};

export const tierAtLeast = (have: Tier, need: Tier) => TIERS.indexOf(have) >= TIERS.indexOf(need);

/**
 * The operating system a business gets: its industry's blueprint, tailored to the kind of business, at the plan's
 * edition. Pieces a variant or module adds are skipped if the blueprint already has one of the same name.
 */
export function edition(base: Blueprint, tier: Tier, variantKey?: string): Blueprint {
  const variant = (VARIANTS[base.key] ?? []).find((v) => v.key === variantKey);
  const pieces = [...base.pieces];
  const flows = [...base.flows];
  const add = (more: BlueprintPiece[]) => { for (const m of more) if (!pieces.some((x) => x.name.toLowerCase() === m.name.toLowerCase())) pieces.push(m); };
  if (variant) add(variant.pieces);
  if (tierAtLeast(tier, "growth")) { add(TEAM_MODULE.pieces); flows.push(...TEAM_MODULE.flows); }
  if (tierAtLeast(tier, "company")) { add(COMPANY_MODULE.pieces); flows.push(...COMPANY_MODULE.flows); }
  return {
    ...base,
    name: [base.name, variant?.label, TIER_NAMES[tier]].filter(Boolean).join(" · "),
    pieces,
    flows,
  };
}

/** The edition for an industry key, or undefined for an unknown industry. */
export function editionFor(key: string, tier: Tier, variantKey?: string): Blueprint | undefined {
  const b = blueprintByKey(key);
  return b ? edition(b, tier, variantKey) : undefined;
}

/** The plan's edition, from a billing plan key; no plan (or one without a board, like equity) means the Small ceiling. */
export function tierOf(plan: string | null | undefined): Tier {
  return (TIERS as readonly string[]).includes(plan ?? "") ? (plan as Tier) : NO_PLAN_TIER;
}

/** What a plan adds to every industry's core, in words, for the pricing and systems pages. */
export const EDITION_ADDS: Record<Tier, string[]> = {
  starter: ["The industry's core system, tailored to your kind of business"],
  growth: ["The core system", "The team module: roles, onboarding and a weekly review on real numbers"],
  company: ["The core and team modules", "The company module: departments, handovers, a monthly leadership review and spend approvals"],
};
