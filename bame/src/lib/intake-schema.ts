// Single source of truth for the BAME diagnostic intake.
// Sections render as wizard steps in src/components/intake/IntakeWizard.tsx
// and double as the field list used to build the email/PDF packet server-side.

export type FieldType =
  | "text"
  | "email"
  | "tel"
  | "date"
  | "textarea"
  | "select"
  | "checkbox"
  | "radio"
  | "chips" // multi-select pill buttons, stored as a "; "-joined string
  | "cards"; // multi-select descriptive cards, stored as a "; "-joined string

export interface CardOption {
  value: string;
  label: string;
  description: string;
}

export interface IntakeField {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: string[];
  cardOptions?: CardOption[]; // used by type "cards"
  max?: number; // cap on selections for "chips" / "cards"
  placeholder?: string;
  help?: string;
  full?: boolean; // spans both grid columns
}

export interface IntakeSection {
  id: string;
  title: string;
  description?: string;
  // Only shown when the predicate over current form values returns true.
  showIf?: (v: Record<string, unknown>) => boolean;
  fields: IntakeField[];
}

const isAthlete = (v: Record<string, unknown>) => v.contact_type !== "event";
const isEvent = (v: Record<string, unknown>) => v.contact_type === "event";

export const BRAND_ARCHETYPES: CardOption[] = [
  { value: "Global Icon", label: "The Global Icon", description: "Worldwide recognition, universal appeal, blockbuster-scale partnerships." },
  { value: "Homegrown Hero", label: "The Homegrown Hero", description: "Deep community roots — an authentic local-to-global story." },
  { value: "Maverick", label: "The Maverick", description: "Bold, outspoken, unapologetically different." },
  { value: "Quiet Competitor", label: "The Quiet Competitor", description: "Letting performance do the talking — understated, elite." },
  { value: "Style Icon", label: "The Style Icon", description: "Fashion-forward, culture and lifestyle crossover." },
  { value: "Family First", label: "The Family First", description: "Grounded, relatable, values-led — trust before hype." },
  { value: "Next Generation", label: "The Next Generation", description: "Youthful, social-native, breakout energy." },
  { value: "Specialist", label: "The Specialist", description: "Deep expertise in a niche — respected by insiders." },
];

export const INTAKE_SECTIONS: IntakeSection[] = [
  {
    id: "control",
    title: "Path, package & consent",
    description:
      "BAME uses this master intake to understand you, your commercial position, and what you need before any work is scoped. Complete it once — every BAME department (sales, production, PR, tech, finance) works from the same record.",
    fields: [
      {
        name: "contact_type",
        label: "I am",
        type: "radio",
        required: true,
        options: ["An athlete", "A sports event organiser"],
      },
      { name: "full_name", label: "Full name", type: "text", required: true },
      { name: "email", label: "Email", type: "email", required: true },
      { name: "phone", label: "Mobile / WhatsApp", type: "tel" },
      {
        name: "package_interest",
        label: "Which package are you leaning towards?",
        type: "chips",
        required: true,
        options: ["Foundation", "Growth", "Custom", "Not sure yet — recommend one"],
        help: "Foundation R6,500/mo · Growth R10,000/mo · Custom is a tailored retainer.",
      },
      {
        name: "lead_source",
        label: "How did you hear about BAME?",
        type: "chips",
        options: [
          "Referral",
          "Social media",
          "Search / website",
          "Event / appearance",
          "Press / media",
          "BAME team outreach",
          "Other",
        ],
      },
      {
        name: "referrer_name",
        label: "If referred, who referred you? (they earn 10%)",
        type: "text",
      },
    ],
  },
  {
    id: "athlete_identity",
    title: "Athlete identity",
    showIf: isAthlete,
    fields: [
      { name: "athlete_full_name", label: "Full name", type: "text", required: true },
      { name: "athlete_preferred_name", label: "Preferred / public name", type: "text" },
      { name: "athlete_date_of_birth", label: "Date of birth", type: "date", required: true },
      { name: "athlete_nationality", label: "Nationality / country represented", type: "text" },
      { name: "athlete_residence", label: "Country / city of residence", type: "text" },
      { name: "athlete_socials", label: "Primary social links / handles", type: "text" },
      { name: "athlete_website", label: "Website / profile link", type: "text" },
      { name: "guardian_name", label: "Parent / guardian name (if applicable)", type: "text" },
      { name: "guardian_contact", label: "Parent / guardian contact (if applicable)", type: "text" },
    ],
  },
  {
    id: "performance",
    title: "Sport & performance profile",
    showIf: isAthlete,
    fields: [
      {
        name: "primary_sport",
        label: "Primary sport",
        type: "chips",
        required: true,
        options: [
          "Football / Soccer",
          "Tennis",
          "Rugby",
          "Cricket",
          "Athletics",
          "Basketball",
          "Combat Sports",
          "Motorsport",
          "Golf",
          "Swimming",
          "Other",
        ],
      },
      { name: "discipline", label: "Discipline / category / event", type: "text" },
      { name: "position_role", label: "Position / role / playing position", type: "text" },
      { name: "current_team_club", label: "Current team / club / academy", type: "text" },
      { name: "league_circuit", label: "League / circuit / competition", type: "text" },
      {
        name: "competition_level",
        label: "Competition level",
        type: "chips",
        options: ["Grassroots / academy", "Semi-professional", "National", "Continental", "International / world level"],
      },
      {
        name: "current_status",
        label: "Current status",
        type: "chips",
        options: ["Active", "Injured", "Unsigned", "Trialling", "Retired", "Other"],
      },
      {
        name: "performance_profile",
        label: "Key performance facts, ranking, statistics, achievements",
        type: "textarea",
        full: true,
      },
      {
        name: "season_calendar",
        label: "Current and upcoming competitive calendar",
        type: "textarea",
        full: true,
      },
      {
        name: "sport_specific_details",
        label: "Anything sport-specific worth adding? (optional)",
        type: "textarea",
        full: true,
        placeholder:
          "Football: preferred foot, minutes, contract/trial status, national team pathway. Tennis: ranking, tour, coach, surface. Athletics: events, PBs, coach.",
      },
    ],
  },
  {
    id: "brand_audience",
    title: "Athlete brand & audience",
    description: "Pick what fits — no essays needed. This shapes how BAME positions and presents you.",
    showIf: isAthlete,
    fields: [
      {
        name: "brand_archetypes",
        label: "Which of these feels most like the brand you want to be?",
        type: "cards",
        cardOptions: BRAND_ARCHETYPES,
        max: 2,
        help: "Pick up to 2 — this is style direction, not a box you're locked into.",
        full: true,
      },
      {
        name: "brand_tone_words",
        label: "Three words the BAME brand story should sound like",
        type: "chips",
        max: 3,
        options: [
          "Bold", "Elegant", "Fierce", "Warm", "Disciplined", "Playful", "Authentic",
          "Powerful", "Humble", "Ambitious", "Rebellious", "Classic", "Fun", "Dominant",
        ],
      },
      {
        name: "industry_interests",
        label: "Industries or causes you genuinely connect with",
        type: "chips",
        options: [
          "Fashion", "Technology", "Gaming", "Automotive", "Finance", "Health & wellness",
          "Music", "Food & beverage", "Education", "Sustainability", "Beauty", "Travel",
          "Real estate", "Philanthropy / social causes", "Other",
        ],
        full: true,
      },
      {
        name: "brand_boundaries",
        label: "Categories you do NOT want to be associated with",
        type: "chips",
        options: ["Alcohol", "Gambling", "Tobacco / vaping", "Fast food", "Political affiliation", "Competitor brands", "None — open to anything"],
        full: true,
      },
      {
        name: "brand_boundaries_notes",
        label: "Anything else off-limits? (optional)",
        type: "text",
        full: true,
      },
      {
        name: "content_capability",
        label: "What content do you already have?",
        type: "chips",
        options: ["Professional photos", "Professional video", "A content creator / team", "Just my phone", "Nothing yet"],
        full: true,
      },
      {
        name: "audience_profile",
        label: "Audience size (rough, largest platform)",
        type: "chips",
        options: ["Under 5K", "5K–25K", "25K–100K", "100K–500K", "500K+", "Not sure"],
      },
      { name: "portfolio_links", label: "Relevant portfolio, press or media links (optional)", type: "textarea", full: true },
    ],
  },
  {
    id: "representation",
    title: "Representation & commercial rights",
    showIf: isAthlete,
    fields: [
      { name: "has_agent", label: "Has agent / representative?", type: "chips", options: ["Yes", "No", "Not sure"] },
      { name: "agent_name", label: "Agent / representative name", type: "text" },
      { name: "agent_company", label: "Agent / representative company", type: "text" },
      { name: "agent_contact", label: "Agent / representative contact", type: "text" },
      { name: "management_arrangement", label: "Current management / representation arrangement (optional)", type: "textarea", full: true },
      { name: "contract_commitments", label: "Important existing contractual or commercial commitments (optional)", type: "textarea", full: true },
      { name: "rights_restrictions", label: "Image, likeness, name, media or sponsorship rights restrictions (optional)", type: "textarea", full: true },
    ],
  },
  {
    id: "sponsorship",
    title: "Sponsorships & partnerships",
    showIf: isAthlete,
    fields: [
      { name: "has_sponsors", label: "Current sponsors / partners?", type: "chips", options: ["Yes", "No"] },
      {
        name: "sponsor_readiness",
        label: "Target sponsorship readiness / timing",
        type: "chips",
        options: ["Ready now", "Within 3 months", "Within 6–12 months", "Longer term / building toward it"],
      },
      { name: "sponsor_list", label: "Current sponsor / partner list and category (optional)", type: "textarea", full: true },
      { name: "sponsor_category_conflicts", label: "Categories restricted or conflicting with current sponsors (optional)", type: "textarea", full: true },
      {
        name: "target_sponsors",
        label: "Categories you want to work with",
        type: "chips",
        options: [
          "Fashion", "Technology", "Gaming", "Automotive", "Finance", "Health & wellness",
          "Music", "Food & beverage", "Education", "Sustainability", "Beauty", "Travel", "Other",
        ],
        full: true,
      },
    ],
  },
  {
    id: "production_content",
    title: "Production, content & digital presence",
    description:
      "This covers BAME's Production, Personal branding, Social management, Digital presence and Content planning services.",
    fields: [
      {
        name: "content_formats_needed",
        label: "Which content formats do you need?",
        type: "chips",
        options: ["Lifestyle shoot", "Matchday / event coverage", "Campaign film", "Behind-the-scenes", "Interviews", "Product / sponsor content", "Documentary-style"],
        full: true,
      },
      {
        name: "social_platforms_active",
        label: "Social platforms currently active, with handles",
        type: "textarea",
        full: true,
      },
      {
        name: "social_management_scope",
        label: "What level of social support do you need?",
        type: "chips",
        options: [
          "Planning only (Foundation)",
          "Managed distribution & review (Growth)",
          "Full expanded support (Custom)",
          "Not sure — recommend one",
        ],
        full: true,
      },
      {
        name: "content_cadence",
        label: "How often do you want to be putting out content?",
        type: "chips",
        options: ["Daily", "A few times a week", "Weekly", "Around key moments only", "Not sure — recommend one"],
      },
      {
        name: "digital_presence_needs",
        label: "Digital presence needs",
        type: "chips",
        options: ["Profile hub / personal website", "Photo gallery", "Video reel", "Enquiry pathway", "Not sure yet"],
        full: true,
      },
      {
        name: "tech_access_notes",
        label: "Any existing website, domain, hosting, or account access BAME will need? (optional)",
        type: "textarea",
        full: true,
      },
    ],
  },
  {
    id: "pr_commercial",
    title: "PR & commercial positioning",
    description: "This covers BAME's PR & commercial service — coverage and sponsorship are never guaranteed, but direction and readiness are scoped here.",
    fields: [
      { name: "media_angles", label: "Media angles or story ideas worth pursuing (optional)", type: "textarea", full: true },
      { name: "press_features", label: "Notable existing press / media / appearances (optional)", type: "textarea", full: true },
      { name: "press_contacts", label: "Existing press or media contacts/relationships (optional)", type: "textarea", full: true },
      { name: "upcoming_announcements", label: "Upcoming announcements, transfers, launches or embargoes BAME should plan around (optional)", type: "textarea", full: true },
      {
        name: "target_coverage_type",
        label: "Target coverage type",
        type: "chips",
        options: ["Broadcast", "Print", "Digital / online", "Podcast", "Mixed / not sure"],
        full: true,
      },
    ],
  },
  {
    id: "goals",
    title: "Goals & desired value",
    fields: [
      {
        name: "goal_tags",
        label: "What are you hoping BAME delivers? (pick all that apply)",
        type: "chips",
        options: [
          "Grow my personal brand", "Secure more sponsorships", "Increase media visibility",
          "Build my post-career business", "Expand into new markets/audiences", "Protect and manage my reputation",
          "Get a proper digital presence", "Get organised — one team, one plan",
        ],
        full: true,
      },
      { name: "primary_goal", label: "In your own words — why BAME, why now?", type: "textarea", required: true, full: true },
      {
        name: "urgency",
        label: "Urgency / timing",
        type: "chips",
        options: ["Immediately", "Within 1 month", "Within 3 months", "No fixed timeline"],
      },
      { name: "success_metrics", label: "How will you judge success? (optional)", type: "textarea", full: true },
    ],
  },
  {
    id: "diagnosis",
    title: "Problem diagnosis",
    fields: [
      {
        name: "common_blockers",
        label: "What's getting in the way right now? (pick all that apply)",
        type: "chips",
        options: [
          "No professional photo/video content", "No clear brand story or positioning",
          "Limited sponsorship interest", "Media visibility is low",
          "Don't know who to trust or work with", "Administrative/logistics overload",
          "Previous representation didn't work out", "Just starting out — no infrastructure yet",
        ],
        full: true,
      },
      { name: "key_problem", label: "The single biggest thing blocking progress, in your words", type: "textarea", required: true, full: true },
      { name: "previous_attempts", label: "What's already been tried? What worked, what didn't? (optional)", type: "textarea", full: true },
    ],
  },
  {
    id: "business",
    title: "Business & support infrastructure",
    showIf: isAthlete,
    fields: [
      { name: "athlete_business", label: "Do you operate a business/company/foundation?", type: "chips", options: ["Yes", "No"] },
      { name: "business_name", label: "Business / company name", type: "text" },
      {
        name: "budget_capacity",
        label: "Budget available for agreed programmes/services",
        type: "chips",
        options: ["Under R6.5k/mo", "R6.5k–R10k/mo", "R10k+/mo", "Depends on scope", "Not sure yet"],
      },
      {
        name: "support_team",
        label: "Who's already on your team?",
        type: "chips",
        options: ["Coach", "Physiotherapist", "Media / PR manager", "Agent", "Legal advisor", "Financial advisor", "Social media manager", "Designer", "None of these yet"],
        full: true,
      },
      {
        name: "availability",
        label: "Availability for meetings, content, appearances and activations",
        type: "chips",
        options: ["Very flexible", "Weekends mostly", "Off-season mostly", "Limited — tight schedule", "Depends on the week"],
        full: true,
      },
      { name: "travel_constraints", label: "Travel / location / visa / scheduling constraints (optional)", type: "textarea", full: true },
    ],
  },
  {
    id: "event",
    title: "Event details",
    showIf: isEvent,
    description: "This covers BAME's event-organiser packages: Event foundation, Commercial growth, and Custom event.",
    fields: [
      { name: "event_name", label: "Event name", type: "text", required: true },
      {
        name: "event_package_interest",
        label: "Which event package fits best?",
        type: "chips",
        options: ["Event foundation", "Commercial growth", "Custom event", "Not sure — recommend one"],
        full: true,
      },
      {
        name: "event_category",
        label: "Event category",
        type: "chips",
        options: ["Tournament", "League", "One-off event", "Series"],
      },
      { name: "event_dates", label: "Event date(s) / season", type: "text" },
      { name: "event_location", label: "Location(s)", type: "text" },
      {
        name: "event_audience",
        label: "Expected audience / participant numbers",
        type: "chips",
        options: ["Under 500", "500–2,000", "2,000–10,000", "10,000+", "Not sure yet"],
      },
      { name: "stakeholder_map", label: "Key stakeholders (organisers, federations, host venues, broadcasters) (optional)", type: "textarea", full: true },
      { name: "sponsorship_inventory", label: "Existing or planned sponsorship inventory / assets (optional)", type: "textarea", full: true },
      { name: "participant_experience_notes", label: "Participant experience — what needs to improve or be built? (optional)", type: "textarea", full: true },
      {
        name: "event_budget_capacity",
        label: "Budget available for agreed programmes/services",
        type: "chips",
        options: ["Under R6.5k/mo", "R6.5k–R10k/mo", "R10k+/mo", "Depends on scope", "Not sure yet"],
      },
    ],
  },
  {
    id: "boundaries",
    title: "Operating boundaries & approval",
    fields: [
      {
        name: "communication_preferences",
        label: "Preferred communication method",
        type: "chips",
        options: ["WhatsApp", "Email", "Phone call", "Scheduled video call", "Through my agent/manager"],
        full: true,
      },
      { name: "do_rules", label: "DOs: things BAME should always understand, protect or prioritise (optional)", type: "textarea", full: true },
      { name: "dont_rules", label: "DON'Ts: hard boundaries / actions BAME must never take without approval (optional)", type: "textarea", full: true },
      { name: "approval_contacts", label: "People who must approve important decisions (optional)", type: "textarea", full: true },
      { name: "confidentiality_boundaries", label: "Anything BAME should never disclose, publish or share externally (optional)", type: "textarea", full: true },
    ],
  },
  {
    id: "evidence",
    title: "Evidence & final context",
    fields: [
      { name: "documents_available", label: "Documents available: ID, profile, media kit, stats, contracts, sponsor deck, etc. (optional)", type: "textarea", full: true },
      { name: "additional_links", label: "Relevant links or URLs (optional)", type: "textarea", full: true },
      { name: "anything_else", label: "Anything else BAME must know before assessing the opportunity (optional)", type: "textarea", full: true },
    ],
  },
  {
    id: "consent",
    title: "Consent & submission",
    fields: [
      {
        name: "consent_service",
        label: "I consent to BAME processing the information I provide for assessment and service delivery.",
        type: "checkbox",
        required: true,
      },
      {
        name: "consent_contact",
        label: "I consent to BAME contacting me regarding this diagnostic and related service discussions.",
        type: "checkbox",
        required: true,
      },
      {
        name: "consent_marketing",
        label: "I separately permit agreed use of my athlete/brand information for marketing or publicity where confirmed.",
        type: "checkbox",
      },
    ],
  },
];

export const ALL_INTAKE_FIELDS: IntakeField[] = INTAKE_SECTIONS.flatMap((s) => s.fields);
