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
  | "radio";

export interface IntakeField {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: string[];
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
        type: "select",
        required: true,
        options: ["Foundation", "Growth", "Custom", "Not sure yet — recommend one"],
        help: "Foundation R6,500/mo · Growth R10,000/mo · Custom is a tailored retainer.",
      },
      {
        name: "lead_source",
        label: "How did you hear about BAME?",
        type: "select",
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
      { name: "case_reference", label: "Case reference (BAME internal)", type: "text" },
      { name: "assigned_admin", label: "Assigned administrator (BAME internal)", type: "text" },
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
        type: "select",
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
      { name: "competition_level", label: "Competition level", type: "text" },
      {
        name: "current_status",
        label: "Current status",
        type: "select",
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
        label: "Sport-specific performance information",
        type: "textarea",
        full: true,
        placeholder:
          "Football: preferred foot, minutes, contract/trial status, national team pathway. Tennis: ranking, tour, coach, surface. Athletics: events, PBs, coach. Other sports: equivalent detail.",
      },
    ],
  },
  {
    id: "brand_audience",
    title: "Athlete brand & audience",
    showIf: isAthlete,
    fields: [
      { name: "athlete_identity_brand", label: "How do you want to be known publicly?", type: "textarea", full: true },
      { name: "unique_value", label: "What makes you commercially distinctive?", type: "textarea", full: true },
      { name: "brand_tone_words", label: "Three words the BAME brand story should sound like", type: "text" },
      { name: "industry_interests", label: "Industries, causes or communities you genuinely connect with", type: "textarea", full: true },
      { name: "public_image", label: "Desired public image / reputation", type: "textarea", full: true },
      { name: "brand_boundaries", label: "Things you do NOT want to be associated with", type: "textarea", full: true },
      { name: "audience_profile", label: "Audience size, geography, demographics, if known", type: "textarea", full: true },
      { name: "portfolio_links", label: "Relevant portfolio, press or media links", type: "textarea", full: true },
    ],
  },
  {
    id: "representation",
    title: "Representation & commercial rights",
    showIf: isAthlete,
    fields: [
      { name: "has_agent", label: "Has agent / representative?", type: "select", options: ["Yes", "No", "Not sure"] },
      { name: "agent_name", label: "Agent / representative name", type: "text" },
      { name: "agent_company", label: "Agent / representative company", type: "text" },
      { name: "agent_contact", label: "Agent / representative contact", type: "text" },
      { name: "management_arrangement", label: "Current management / representation arrangement", type: "textarea", full: true },
      { name: "contract_commitments", label: "Important existing contractual or commercial commitments", type: "textarea", full: true },
      { name: "rights_restrictions", label: "Image, likeness, name, media or sponsorship rights restrictions", type: "textarea", full: true },
    ],
  },
  {
    id: "sponsorship",
    title: "Sponsorships & partnerships",
    showIf: isAthlete,
    fields: [
      { name: "has_sponsors", label: "Current sponsors / partners?", type: "select", options: ["Yes", "No"] },
      { name: "sponsor_readiness", label: "Target sponsorship readiness / timing", type: "text" },
      { name: "sponsor_list", label: "Current sponsor / partner list and category", type: "textarea", full: true },
      { name: "sponsor_category_conflicts", label: "Categories restricted or conflicting with current sponsors", type: "textarea", full: true },
      { name: "target_sponsors", label: "Brands / categories you want to work with", type: "textarea", full: true },
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
        label: "Which content formats do you need? (list all that apply)",
        type: "textarea",
        full: true,
        placeholder: "e.g. lifestyle shoot, matchday coverage, campaign film, behind-the-scenes, interviews",
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
        type: "select",
        options: [
          "Planning only (Foundation)",
          "Managed distribution & review (Growth)",
          "Full expanded support (Custom)",
          "Not sure — recommend one",
        ],
      },
      {
        name: "content_cadence",
        label: "Expected content cadence / key dates to plan around",
        type: "textarea",
        full: true,
      },
      {
        name: "content_capability",
        label: "Existing photo/video asset library — what already exists?",
        type: "textarea",
        full: true,
      },
      {
        name: "digital_presence_needs",
        label: "Digital presence needs (select all that apply, describe)",
        type: "textarea",
        full: true,
        placeholder: "Profile hub / personal website, photo gallery, video reel, enquiry pathway, other",
      },
      {
        name: "tech_access_notes",
        label: "Any existing website, domain, hosting, or account access BAME will need?",
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
      { name: "media_angles", label: "Media angles or story ideas worth pursuing", type: "textarea", full: true },
      { name: "press_features", label: "Notable existing press / media / appearances", type: "textarea", full: true },
      { name: "press_contacts", label: "Existing press or media contacts/relationships", type: "textarea", full: true },
      { name: "upcoming_announcements", label: "Upcoming announcements, transfers, launches or embargoes BAME should plan around", type: "textarea", full: true },
      {
        name: "target_coverage_type",
        label: "Target coverage type",
        type: "select",
        options: ["Broadcast", "Print", "Digital / online", "Podcast", "Mixed / not sure"],
      },
    ],
  },
  {
    id: "goals",
    title: "Goals & desired value",
    fields: [
      { name: "primary_goal", label: "Primary reason for engaging BAME", type: "textarea", required: true, full: true },
      { name: "desired_value", label: "What value must BAME deliver for this relationship to be worthwhile?", type: "textarea", full: true },
      { name: "12_month_outcome", label: "What should be materially different in 12 months?", type: "textarea", full: true },
      { name: "success_metrics", label: "How will you judge success?", type: "textarea", full: true },
      { name: "urgency", label: "Urgency / timing", type: "textarea", full: true },
    ],
  },
  {
    id: "diagnosis",
    title: "Problem diagnosis",
    fields: [
      { name: "key_problem", label: "Single biggest problem blocking progress today", type: "textarea", required: true, full: true },
      { name: "previous_attempts", label: "What has already been tried? What worked, what failed, and why?", type: "textarea", full: true },
      { name: "requested_support", label: "Which areas do you believe you need help with?", type: "textarea", full: true },
    ],
  },
  {
    id: "business",
    title: "Business & support infrastructure",
    showIf: isAthlete,
    fields: [
      { name: "athlete_business", label: "Do you operate a business/company/foundation?", type: "select", options: ["Yes", "No"] },
      { name: "business_name", label: "Business / company name", type: "text" },
      { name: "commercial_revenue", label: "Current commercial income sources (high-level)", type: "textarea", full: true },
      { name: "budget_capacity", label: "Budget available for agreed programmes/services, if any", type: "text" },
      { name: "support_team", label: "Existing support team: coach, physio, media, legal, finance, PR, designer, etc.", type: "textarea", full: true },
      { name: "missing_capabilities", label: "Capabilities / specialists currently missing", type: "textarea", full: true },
      { name: "availability", label: "Availability for meetings, content, appearances and activations", type: "textarea", full: true },
      { name: "travel_constraints", label: "Travel / location / visa / scheduling constraints", type: "textarea", full: true },
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
        type: "select",
        options: ["Event foundation", "Commercial growth", "Custom event", "Not sure — recommend one"],
      },
      { name: "event_category", label: "Event category (tournament, league, one-off, series)", type: "text" },
      { name: "event_dates", label: "Event date(s) / season", type: "text" },
      { name: "event_location", label: "Location(s)", type: "text" },
      { name: "event_audience", label: "Expected audience size / participant numbers", type: "text" },
      { name: "stakeholder_map", label: "Key stakeholders (organisers, federations, host venues, broadcasters)", type: "textarea", full: true },
      { name: "sponsorship_inventory", label: "Existing or planned sponsorship inventory / assets", type: "textarea", full: true },
      { name: "participant_experience_notes", label: "Participant experience — what needs to improve or be built?", type: "textarea", full: true },
      { name: "event_budget_capacity", label: "Budget available for agreed programmes/services", type: "text" },
    ],
  },
  {
    id: "boundaries",
    title: "Operating boundaries & approval",
    fields: [
      { name: "communication_preferences", label: "Preferred communication method and response expectations", type: "textarea", full: true },
      { name: "do_rules", label: "DOs: things BAME should always understand, protect or prioritise", type: "textarea", full: true },
      { name: "dont_rules", label: "DON'Ts: hard boundaries / actions BAME must never take without approval", type: "textarea", full: true },
      { name: "approval_contacts", label: "People who must approve important decisions", type: "textarea", full: true },
      { name: "confidentiality_boundaries", label: "Anything BAME should never disclose, publish or share externally", type: "textarea", full: true },
    ],
  },
  {
    id: "evidence",
    title: "Evidence & final context",
    fields: [
      { name: "documents_available", label: "Documents available: ID, profile, media kit, stats, contracts, sponsor deck, etc.", type: "textarea", full: true },
      { name: "additional_links", label: "Relevant links or URLs", type: "textarea", full: true },
      { name: "anything_else", label: "Anything else BAME must know before assessing the opportunity", type: "textarea", full: true },
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
