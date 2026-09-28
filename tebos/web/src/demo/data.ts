// The demo's fictional business: a marketing agency, "Brightline Creative".
// Every name, figure and quote here is invented for the demo and labelled as
// such in the interface. The records follow the real schema, and each
// finding cites the evidence it rests on, the same way TEBOS stores them.

export type Tables = Record<string, Array<Record<string, unknown>>>;

export const DEMO_USER_ID = "d0000000-0000-4000-8000-000000000001";
const COLLEAGUE = "d0000000-0000-4000-8000-000000000002";
export const DEMO_USER = {
  id: DEMO_USER_ID, email: "you@demo.tebos", aud: "authenticated", role: "authenticated",
  app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString(),
};

const ORG = "d1000000-0000-4000-8000-000000000001";
export const DEMO_BUSINESS = "d2000000-0000-4000-8000-000000000001";
const BIZ = DEMO_BUSINESS;
const SCAN = "d3000000-0000-4000-8000-000000000001";
const INTERVIEW = "d4000000-0000-4000-8000-000000000001";
const CONN = "d5000000-0000-4000-8000-000000000001";
const RUN_ACQ = "d6000000-0000-4000-8000-000000000001";
const RUN_SCAN = "d6000000-0000-4000-8000-000000000002";
const RUN_REVIEW = "d6000000-0000-4000-8000-000000000003";
const SRC_WEB = ["d7000000-0000-4000-8000-000000000001", "d7000000-0000-4000-8000-000000000002", "d7000000-0000-4000-8000-000000000003", "d7000000-0000-4000-8000-000000000004"];
const SRC_INTERVIEW = "d7000000-0000-4000-8000-000000000010";
const SRC_OPS = "d7000000-0000-4000-8000-000000000020";
const TGT = ["d8000000-0000-4000-8000-000000000001", "d8000000-0000-4000-8000-000000000002", "d8000000-0000-4000-8000-000000000003", "d8000000-0000-4000-8000-000000000004"];
const F = (n: number) => `d9000000-0000-4000-8000-00000000000${n}`;
const A = (n: number) => `da000000-0000-4000-8000-00000000000${n}`;
const APPROVAL = "db000000-0000-4000-8000-000000000001";

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const HOUR = 60;
const DAY = 24 * HOUR;
const SITE = "https://brightline.example";

// ---------------------------------------------------------------------------
// The interview (an AI voice call with the owner, two days ago)
// ---------------------------------------------------------------------------

const TRANSCRIPT: Array<[role: "agent" | "user", secs: number, message: string]> = [
  ["agent", 0, "Hi Lerato, this is the TEBOS interviewer. I'm an AI assistant, and this call is recorded so TEBOS can learn how the agency runs. Is now still a good time?"],
  ["user", 9, "Yes, go ahead."],
  ["agent", 13, "How many active clients do you have right now, and how many are on retainers versus one-off projects?"],
  ["user", 21, "We've got fourteen clients, ten on monthly retainers and four project clients."],
  ["agent", 30, "If you think about your biggest client, what share of your monthly revenue do they make up?"],
  ["user", 38, "Honestly, Karoo Foods is about forty-five percent of what we bill every month."],
  ["agent", 71, "How often do clients ask for work that wasn't in the original agreement, and what usually happens when they do?"],
  ["user", 80, "Almost every week. Extra banners, another round of edits. Most of the time we just do it, because we don't want to seem difficult."],
  ["agent", 214, "How does work move through the team, from brief to something the client approves? Where do things tend to get stuck?"],
  ["user", 226, "Design and social have proper checklists. Paid media and web work are in Kea's head, so when she's off, things wait. And we wait a lot for clients to sign off."],
  ["agent", 402, "How quickly do clients usually pay, and how often are invoices late?"],
  ["user", 411, "Most pay in forty-five to sixty days, even though our terms say thirty."],
  ["agent", 560, "If you could fix one thing in how the agency runs in the next three months, what would it be?"],
  ["user", 571, "We're busier than ever but the margin keeps shrinking, and I can't see where it goes."],
  ["agent", 960, "Thank you, Lerato. That's everything. TEBOS will combine this with what it reads from your website and your project platform."],
];

const ANSWERS: Array<[key: string, question: string, turn: number, fact: string, quote: string]> = [
  ["clients.mix", "How many active clients do you have right now, and how many are on retainers versus one-off projects?", 3,
    "The owner says the agency has 14 clients: 10 on monthly retainers and 4 on projects.", "fourteen clients, ten on monthly retainers and four project clients"],
  ["clients.concentration", "If you think about your biggest client, what share of your monthly revenue do they make up?", 5,
    "The owner says the biggest client accounts for about 45% of monthly billing.", "Karoo Foods is about forty-five percent of what we bill every month"],
  ["scoping.creep", "How often do clients ask for work that wasn't in the original agreement, and what usually happens when they do?", 7,
    "The owner says out-of-scope requests come almost weekly and are usually done without charging.", "Most of the time we just do it"],
  ["delivery.workflow", "How does work move through the team, from brief to something the client approves? Where do things tend to get stuck?", 9,
    "The owner says only design and social have checklists; paid media and web depend on one person, and work waits on client sign-off.", "Paid media and web work are in Kea's head, so when she's off, things wait"],
  ["finance.cashflow", "How quickly do clients usually pay, and how often are invoices late?", 11,
    "The owner says most clients pay in 45–60 days against 30-day terms.", "Most pay in forty-five to sixty days, even though our terms say thirty"],
  ["priorities.biggest_problem", "If you could fix one thing in how the agency runs in the next three months, what would it be?", 13,
    "The owner's priority is understanding why margin is shrinking while the agency is busier.", "busier than ever but the margin keeps shrinking"],
];

// ---------------------------------------------------------------------------
// The agency's project platform (read-only figures, read an hour ago)
// ---------------------------------------------------------------------------

const OPERATIONS: Array<[metric: string, fact: string, value: Record<string, unknown>]> = [
  ["changes.scope", "38 change requests were logged in the last 30 days; 5 of them were billed.", { logged_30d: 38, billed_30d: 5 }],
  ["deliverables.catalogue", "Delivery checklists exist for design 24, social 18; none are defined for paid media, strategy, web.",
    { by_department: { design: 24, social: 18 }, departments_without: ["paid media", "strategy", "web"] }],
  ["deliverables.awaiting_client", "14 deliverables are waiting on client approval; the oldest has waited 19 days.", { waiting: 14, oldest_days: 19 }],
  ["invoices.overdue", "7 invoices (R186 400) are more than 30 days overdue; the oldest is 74 days.", { overdue_30d: 7, amount_zar: 186400, oldest_days: 74 }],
  ["time.billable", "61% of logged hours in the last 30 days were billable to a client.", { billable_share: 0.61 }],
  ["clients.revenue_share", "The largest client accounts for 44% of invoiced revenue in the last 90 days.", { largest_share_90d: 0.44 }],
];

export function demoTables(): Tables {
  const interviewEvidence = ANSWERS.map(([key, question, turn, fact, quote], i) => ({
    id: `dc000000-0000-4000-8000-00000000001${i}`, org_id: ORG, business_id: BIZ, source_id: SRC_INTERVIEW, scan_id: null, scan_target_id: null,
    state: "user_supplied", fact, excerpt: quote, missing_description: null,
    structured_value: { interview_id: INTERVIEW, question_key: key, question, channel: "voice", turn, time_in_call_secs: TRANSCRIPT[turn]![1], playbook: "marketing-agency@1" },
    content_location: `call at ${Math.floor(TRANSCRIPT[turn]![1] / 60)}:${String(TRANSCRIPT[turn]![1] % 60).padStart(2, "0")}`,
    retrieved_at: ago(2 * DAY), fresh_until: null, extraction_status: "complete", confidence: null, created_by_actor: "agent", created_at: ago(2 * DAY),
  }));
  const opsEvidence = OPERATIONS.map(([metric, fact, value], i) => ({
    id: `dc000000-0000-4000-8000-00000000002${i}`, org_id: ORG, business_id: BIZ, source_id: SRC_OPS, scan_id: null, scan_target_id: null,
    state: "acquired", fact, excerpt: JSON.stringify(value), missing_description: null, structured_value: { metric, ...value, connector: "bame-ops" },
    content_location: `snapshot ${metric}`, retrieved_at: ago(HOUR), fresh_until: null, extraction_status: "complete", confidence: 0.95, created_by_actor: "agent", created_at: ago(HOUR),
  }));
  const web = (i: number, n: number, target: number, fact: string, excerpt: string, location: string) => ({
    id: `dc000000-0000-4000-8000-00000000000${n}`, org_id: ORG, business_id: BIZ, source_id: SRC_WEB[target], scan_id: SCAN, scan_target_id: TGT[target],
    state: "acquired", fact, excerpt, missing_description: null, structured_value: {}, content_location: location,
    retrieved_at: ago(3 * DAY + i), fresh_until: null, extraction_status: "complete", confidence: 0.9, created_by_actor: "agent", created_at: ago(3 * DAY),
  });
  const webEvidence = [
    web(0, 1, 0, "Page title: Brightline Creative | Brand, social & performance marketing", "<title>Brightline Creative | Brand, social & performance marketing</title>", "head > title"),
    web(1, 2, 1, "Services listed: brand identity, social media, paid media, websites", "Brand identity · Social media management · Paid media · Websites", "main ul.services"),
    web(2, 3, 2, "Case studies describe the work delivered for 6 clients", "We refreshed Karoo Foods' brand and ran their always-on social…", "main article"),
    web(3, 4, 3, "Contact page offers a form: \"Tell us about your project and we'll get back to you.\"", "Tell us about your project and we'll get back to you.", "form#contact"),
  ];
  const iv = (key: string) => interviewEvidence[ANSWERS.findIndex((a) => a[0] === key)]!.id;
  const op = (metric: string) => opsEvidence[OPERATIONS.findIndex((o) => o[0] === metric)]!.id;

  const review = (method = "findings.review.v1") => ({ coverage: 1, recency: 1, contradiction: 0, method, adjustments: [], limitingFactors: [] });
  const finding = (n: number, over: Record<string, unknown>) => ({
    id: F(n), org_id: ORG, business_id: BIZ, scan_id: null, status: "active", superseded_by: null, superseded_by_run: null, analysis_run_id: RUN_REVIEW,
    created_by_actor: "agent", created_at: ago(DAY + 30), updated_at: ago(DAY + 30), missing_information: [], ...over,
  });

  const findings = [
    finding(1, {
      title: "Out-of-scope work is delivered but mostly not billed", kind: "interpretation", category: "revenue_leakage", confidence: 0.81,
      statement: "The project platform logged 38 change requests in 30 days and only 5 were billed. The owner says extra requests come almost weekly and are usually done without charging.",
      impact_hypothesis: "Unbilled changes may explain much of the shrinking margin the owner describes, since the team is busier without billing more.",
      missing_information: ["How many hours the 33 unbilled changes took"],
      confidence_components: { ...review(), sourceReliability: 0.775, corroboration: 0.667, extractionQuality: 0.9 },
    }),
    finding(2, {
      title: "Paid media, strategy and web have no delivery checklists", kind: "interpretation", category: "missing_capability", confidence: 0.74,
      statement: "Delivery checklists exist only for design and social; none are defined for paid media, strategy or web. The owner says paid media and web depend on one person.",
      impact_hypothesis: "Work in these teams may stall or vary in quality whenever that person is away, and is hard to hand over.",
      missing_information: ["Measured in the agency's project platform only; anything kept outside it is not counted"],
      confidence_components: { ...review(), sourceReliability: 0.775, corroboration: 0.667, extractionQuality: 0.9 },
    }),
    finding(3, {
      title: "Invoices are paid about a month late", kind: "interpretation", category: "revenue_leakage", confidence: 0.76,
      statement: "7 invoices worth R186 400 are more than 30 days overdue, the oldest 74 days. The owner says most clients pay in 45–60 days against 30-day terms.",
      impact_hypothesis: "Late payment may be straining cash flow while payroll and freelancers are paid on time.",
      confidence_components: { ...review(), sourceReliability: 0.775, corroboration: 0.667, extractionQuality: 0.9 },
    }),
    finding(4, {
      title: "Work waits on client approval for up to three weeks", kind: "interpretation", category: "bottleneck", confidence: 0.7,
      statement: "14 deliverables are waiting on client approval, the oldest for 19 days, and the owner names client sign-off as where work gets stuck.",
      impact_hypothesis: "Waiting work delays invoicing and crowds the team's schedule when approvals arrive together.",
      confidence_components: { ...review(), sourceReliability: 0.775, corroboration: 0.667, extractionQuality: 0.9 },
    }),
    finding(5, {
      title: "One client is close to half of revenue", kind: "interpretation", category: "risk", confidence: 0.79,
      statement: "The largest client accounts for 44% of invoiced revenue over 90 days, matching the owner's estimate of about 45%.",
      impact_hypothesis: "Losing or renegotiating with this client could cut revenue by almost half at short notice.",
      confidence_components: { ...review(), sourceReliability: 0.775, corroboration: 0.667, extractionQuality: 0.9 },
    }),
    finding(6, {
      title: "Case studies show the work but not the results", kind: "hypothesis", category: "opportunity", confidence: 0.41, scan_id: SCAN, analysis_run_id: RUN_SCAN,
      statement: "The case studies describe what was delivered for six clients but no outcome figures were seen on the pages read.",
      impact_hypothesis: "Prospects comparing agencies may find it harder to judge what Brightline achieves.",
      missing_information: ["Absence not verified: TEBOS read 4 page(s); confirm with the business or a deeper scan"],
      confidence_components: { ...review("findings.v1"), coverage: 0.8, sourceReliability: 0.7, corroboration: 0.333, extractionQuality: 0.9, kind: "hypothesis",
        adjustments: ["Reclassified as hypothesis: it asserts an absence, which reading public pages cannot prove"] },
      created_at: ago(3 * DAY - 20), updated_at: ago(3 * DAY - 20),
    }),
  ];
  const link = (f: number, e: string) => ({ org_id: ORG, business_id: BIZ, finding_id: F(f), evidence_id: e, relation: "supports", note: null, created_at: ago(DAY + 30) });
  const finding_evidence = [
    link(1, op("changes.scope")), link(1, iv("scoping.creep")), link(1, iv("priorities.biggest_problem")),
    link(2, op("deliverables.catalogue")), link(2, iv("delivery.workflow")),
    link(3, op("invoices.overdue")), link(3, iv("finance.cashflow")),
    link(4, op("deliverables.awaiting_client")), link(4, iv("delivery.workflow")),
    link(5, op("clients.revenue_share")), link(5, iv("clients.concentration")),
    link(6, webEvidence[2]!.id),
  ];

  const action = (n: number, over: Record<string, unknown>) => ({
    id: A(n), org_id: ORG, business_id: BIZ, owner_user_id: DEMO_USER_ID, capability_key: null, priority: 2, risk_tier: 2, approval_required: true,
    execution_method: "manual", blocked_reason: null, result: null, verification_status: "not_verified", idempotency_key: null, due_at: null,
    execution_input: null, created_by: COLLEAGUE, created_at: ago(20 * HOUR), updated_at: ago(3 * HOUR), ...over,
  });

  return {
    organisations: [{ id: ORG, name: "Brightline Creative (demo)", slug: "brightline-demo", created_at: ago(30 * DAY) }],
    memberships: [
      { org_id: ORG, user_id: DEMO_USER_ID, role: "org_admin", created_at: ago(30 * DAY) },
      { org_id: ORG, user_id: COLLEAGUE, role: "operator", created_at: ago(29 * DAY) },
    ],
    profiles: [
      { user_id: DEMO_USER_ID, display_name: "You (demo)", email: "you@demo.tebos", created_at: ago(30 * DAY), updated_at: ago(30 * DAY) },
      { user_id: COLLEAGUE, display_name: "Sipho (ops lead)", email: "sipho@brightline.example", created_at: ago(29 * DAY), updated_at: ago(29 * DAY) },
    ],
    invitations: [],
    businesses: [{
      id: BIZ, org_id: ORG, name: "Brightline Creative", website: `${SITE}/`, primary_domain: "brightline.example", industry: "Marketing agency",
      geography: "Johannesburg", business_model: "Monthly retainers and projects", legal_name: null, trading_name: null, size_context: "14 clients, 11 staff",
      created_by: DEMO_USER_ID, created_at: ago(30 * DAY), updated_at: ago(HOUR), archived_at: null,
    }],
    business_contexts: [
      { id: "dd000000-0000-4000-8000-000000000001", org_id: ORG, business_id: BIZ, kind: "problem", statement: "We're busier than ever but margins keep shrinking.", supplied_by: DEMO_USER_ID, created_at: ago(4 * DAY), retired_at: null },
    ],
    sources: [
      ...["/", "/services", "/work", "/contact"].map((p, i) => ({ id: SRC_WEB[i], org_id: ORG, business_id: BIZ, source_type: "public_web", uri: `${SITE}${p}`, label: "Public web page", reliability: 0.7, created_at: ago(3 * DAY) })),
      { id: SRC_INTERVIEW, org_id: ORG, business_id: BIZ, source_type: "user_statement", uri: `interview:${INTERVIEW}`, label: "Diagnostic interview (call)", reliability: 0.6, created_at: ago(2 * DAY) },
      { id: SRC_OPS, org_id: ORG, business_id: BIZ, source_type: "connected_system", uri: `bame-ops:${CONN}`, label: "Project platform (read-only)", reliability: 0.95, created_at: ago(2 * DAY) },
    ],
    scans: [{
      id: SCAN, org_id: ORG, business_id: BIZ, objective: "Understand how clients find and hire the agency", scope: { url: `${SITE}/` }, target_limit: 4, status: "completed",
      confidence: 0.63, failure_class: null, failure_detail: null, requested_by: DEMO_USER_ID,
      confidence_components: { coverage: 1, sourceReliability: 0.7, recency: 1, corroboration: 0.5, extractionQuality: 0.88, contradiction: 0, method: "acquisition.v1",
        limitingFactors: [{ component: "sourceReliability", value: 0.7, explanation: "Only public web pages were read" }] },
      created_at: ago(3 * DAY + 5), started_at: ago(3 * DAY + 4), finished_at: ago(3 * DAY),
    }],
    scan_targets: ["/", "/services", "/work", "/contact"].map((p, i) => ({
      id: TGT[i], org_id: ORG, scan_id: SCAN, source_id: SRC_WEB[i], uri: `${SITE}${p}`, status: "acquired", http_status: 200, failure_class: null, failure_detail: null,
      content_hash: "demo", bytes: 12000 + i * 3000, attempted_at: ago(3 * DAY + 3), created_at: ago(3 * DAY + 3),
    })),
    evidence: [...webEvidence, ...interviewEvidence, ...opsEvidence],
    interview_sessions: [{
      id: INTERVIEW, org_id: ORG, business_id: BIZ, channel: "voice", playbook_key: "marketing-agency", playbook_version: 1, status: "completed",
      phone_number: "+27820000000", scheduled_for: ago(2 * DAY + 20), consent_text: "I agree to receive a call from TEBOS's AI interviewer and for the call to be recorded and transcribed.",
      consent_given_by: DEMO_USER_ID, consent_given_at: ago(3 * DAY), requested_by: DEMO_USER_ID, provider: null, provider_reference: null,
      started_at: ago(2 * DAY + 18), ended_at: ago(2 * DAY + 2), duration_seconds: 972, extraction_status: "done",
      extraction_detail: `${ANSWERS.length} of 16 questions answered`, failure_detail: null,
      transcript: TRANSCRIPT.map(([role, time_in_call_secs, message]) => ({ role, message, time_in_call_secs })),
      last_checked_at: null, created_at: ago(3 * DAY), updated_at: ago(2 * DAY),
    }],
    connection_instances: [{
      id: CONN, org_id: ORG, business_id: BIZ, connector_key: "bame-ops", status: "connected", granted_scopes: ["operations:read"], credential_ref_id: "demo",
      webhook_credential_ref_id: null, last_verified_at: ago(HOUR), last_success_at: ago(HOUR), last_failure_at: null, failure_detail: null,
      verification_requested_at: null, settings: { interval_minutes: 60 }, created_by: DEMO_USER_ID, created_at: ago(2 * DAY), updated_at: ago(HOUR),
    }],
    findings,
    finding_evidence,
    actions: [
      action(1, {
        finding_id: F(1), title: "Quote every change request before work starts", status: "awaiting_approval", owner_user_id: COLLEAGUE,
        objective: "Every out-of-scope request gets a quote the client accepts before the team starts on it.",
        expected_outcome: "Billed share of change requests rises from 5 of 38 to most of them", evidence_requirement: "Next month's platform figures show billed changes",
      }),
      action(2, {
        finding_id: F(2), title: "Write delivery checklists for paid media, strategy and web", status: "in_progress", approval_required: false, risk_tier: 0,
        objective: "Each team has a checklist, so work doesn't depend on one person.",
        expected_outcome: "Checklists defined for all five teams", evidence_requirement: "The platform lists checklists for paid media, strategy and web",
      }),
      action(3, {
        finding_id: F(4), title: "Add a 5-day approval window to client agreements", status: "proposed", owner_user_id: DEMO_USER_ID, approval_required: true,
        objective: "Clients approve or comment within five working days, after which work is treated as approved.",
        expected_outcome: "Oldest deliverable waiting on a client under 7 days", evidence_requirement: "Platform figure for work awaiting client approval",
      }),
    ],
    action_dependencies: [],
    approvals: [{
      id: APPROVAL, org_id: ORG, action_id: A(1), status: "pending", requested_by: COLLEAGUE, requested_by_actor: "user", requested_at: ago(3 * HOUR),
      requested_operation: "Start quoting change requests before work begins", risk_tier: 2, data_scope: null, proposed_action: { title: "Quote every change request before work starts" },
      input_hash: null, single_use: true, expires_at: null, decided_by: null, decided_at: null, decision_note: null, consumed_at: null,
    }],
    action_runs: [],
    outcomes: [],
    agent_runs: [
      { id: RUN_ACQ, org_id: ORG, business_id: BIZ, agent_role: "acquisition", purpose: "Read public website", scan_id: SCAN, action_id: null, input_context: {}, status: "succeeded", model_provider: null, model: null, tokens_in: null, tokens_out: null, output_summary: {}, error_detail: null, started_at: ago(3 * DAY + 4), finished_at: ago(3 * DAY) },
      { id: RUN_SCAN, org_id: ORG, business_id: BIZ, agent_role: "business_intelligence", purpose: "Propose findings from scan evidence", scan_id: SCAN, action_id: null, input_context: {}, status: "succeeded", model_provider: null, model: null, tokens_in: 3120, tokens_out: 540, output_summary: { findings: 1, rejected: [] }, error_detail: null, started_at: ago(3 * DAY - 22), finished_at: ago(3 * DAY - 20) },
      { id: RUN_REVIEW, org_id: ORG, business_id: BIZ, agent_role: "business_intelligence", purpose: "Business review: propose findings from all evidence held", scan_id: null, action_id: null, input_context: { kind: "business_review" }, status: "succeeded", model_provider: null, model: null, tokens_in: 6840, tokens_out: 1920,
        output_summary: { findings: 5, rejected: [{ title: "Clients are unhappy with reporting", reason: "No obtained evidence supports it" }] }, error_detail: null, started_at: ago(DAY + 32), finished_at: ago(DAY + 30) },
    ],
    audit_events: [
      { id: 5, org_id: ORG, occurred_at: ago(3 * HOUR), actor_type: "user", actor_id: COLLEAGUE, action: "approvals.insert", entity_type: "approvals", entity_id: APPROVAL, before: null, after: { status: "pending" }, request_id: null, prev_hash: "d", hash: "e" },
      { id: 4, org_id: ORG, occurred_at: ago(20 * HOUR), actor_type: "user", actor_id: COLLEAGUE, action: "actions.insert", entity_type: "actions", entity_id: A(1), before: null, after: { status: "proposed" }, request_id: null, prev_hash: "c", hash: "d" },
      { id: 3, org_id: ORG, occurred_at: ago(DAY + 30), actor_type: "agent", actor_id: RUN_REVIEW, action: "findings.insert", entity_type: "findings", entity_id: F(1), before: null, after: { status: "active" }, request_id: null, prev_hash: "b", hash: "c" },
      { id: 2, org_id: ORG, occurred_at: ago(2 * DAY), actor_type: "agent", actor_id: "interview-worker", action: "interview_sessions.transition", entity_type: "interview_sessions", entity_id: INTERVIEW, before: { status: "in_progress" }, after: { status: "completed" }, request_id: null, prev_hash: "a", hash: "b" },
      { id: 1, org_id: ORG, occurred_at: ago(3 * DAY), actor_type: "agent", actor_id: RUN_ACQ, action: "scans.transition", entity_type: "scans", entity_id: SCAN, before: { status: "running" }, after: { status: "completed" }, request_id: null, prev_hash: null, hash: "a" },
    ],
    capabilities: [
      { key: "web.read_public", name: "Read public web pages", description: null, default_risk_tier: 0, created_at: ago(90 * DAY) },
      { key: "analysis.generate_findings", name: "Generate findings", description: null, default_risk_tier: 1, created_at: ago(90 * DAY) },
      { key: "operations.read_metrics", name: "Read operational metrics", description: null, default_risk_tier: 0, created_at: ago(90 * DAY) },
      { key: "email.send_transactional", name: "Send transactional email", description: null, default_risk_tier: 2, created_at: ago(90 * DAY) },
    ],
    connectors: [
      { key: "bame-ops", provider: "Project platform", name: "Project platform snapshot (read-only)", auth_method: "service_account", supports_webhooks: false, supports_polling: true, rate_limit: null, data_sensitivity: "controlled", execution_method: "api", created_at: ago(90 * DAY) },
      { key: "resend", provider: "Resend", name: "Resend transactional email", auth_method: "api_key", supports_webhooks: true, supports_polling: true, rate_limit: null, data_sensitivity: "controlled", execution_method: "api", created_at: ago(90 * DAY) },
    ],
    connector_capabilities: [],
    credential_references: [],
  };
}
