// Fictional records for interface tests. Nothing here is real data; the
// names are marked as fictional and none of it is written anywhere.
export const USER_ID = "00000000-0000-4000-8000-000000000001";
export const APPROVER_ID = "00000000-0000-4000-8000-000000000002";
export const ORG = "10000000-0000-4000-8000-000000000001";
export const BIZ = "20000000-0000-4000-8000-000000000001";
const SCAN = "30000000-0000-4000-8000-000000000001";
const SCAN_QUEUED = "30000000-0000-4000-8000-000000000002";
const T1 = "40000000-0000-4000-8000-000000000001";
const T2 = "40000000-0000-4000-8000-000000000002";
const T3 = "40000000-0000-4000-8000-000000000003";
const S1 = "50000000-0000-4000-8000-000000000001";
const S2 = "50000000-0000-4000-8000-000000000002";
const S3 = "50000000-0000-4000-8000-000000000003";
export const FINDING = "60000000-0000-4000-8000-000000000001";
const FINDING_H = "60000000-0000-4000-8000-000000000002";
export const ACTION = "70000000-0000-4000-8000-000000000001";
const E = (n: number) => `80000000-0000-4000-8000-00000000000${n}`;
const RUN_A = "90000000-0000-4000-8000-000000000001";
const RUN_I = "90000000-0000-4000-8000-000000000002";

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

export function fixtureTables(): Record<string, Array<Record<string, unknown>>> {
  return {
    organisations: [{ id: ORG, name: "Demo organisation (fixture)", slug: "demo-fixture", created_at: minutesAgo(900) }],
    memberships: [
      { org_id: ORG, user_id: USER_ID, role: "org_admin", created_at: minutesAgo(900) },
      { org_id: ORG, user_id: APPROVER_ID, role: "approver", created_at: minutesAgo(800) },
    ],
    profiles: [
      { user_id: USER_ID, display_name: "Thandi Mokoena", email: "operator@fixture.test", created_at: minutesAgo(900), updated_at: minutesAgo(900) },
      { user_id: APPROVER_ID, display_name: "Nia Dlamini", email: "approver@fixture.test", created_at: minutesAgo(800), updated_at: minutesAgo(800) },
    ],
    invitations: [],
    businesses: [
      {
        id: BIZ, org_id: ORG, name: "Clayworks Studio (fictional)", website: "https://clayworks.example/", primary_domain: "clayworks.example",
        industry: "Handmade ceramics", geography: "Pretoria", business_model: null, legal_name: null, trading_name: null, size_context: null,
        created_by: USER_ID, created_at: minutesAgo(600), updated_at: minutesAgo(40), archived_at: null,
      },
    ],
    business_contexts: [
      { id: "c1", org_id: ORG, business_id: BIZ, kind: "problem", statement: "Orders get lost between WhatsApp chats and my notebook.", supplied_by: USER_ID, created_at: minutesAgo(60), retired_at: null },
    ],
    sources: [
      { id: S1, org_id: ORG, business_id: BIZ, source_type: "public_web", uri: "https://clayworks.example/", label: "Public web page", reliability: 0.7, created_at: minutesAgo(58) },
      { id: S2, org_id: ORG, business_id: BIZ, source_type: "public_web", uri: "https://clayworks.example/shop", label: "Public web page", reliability: 0.7, created_at: minutesAgo(58) },
      { id: S3, org_id: ORG, business_id: BIZ, source_type: "public_web", uri: "https://clayworks.example/contact", label: "Public web page", reliability: 0.7, created_at: minutesAgo(58) },
    ],
    scans: [
      {
        id: SCAN_QUEUED, org_id: ORG, business_id: BIZ, objective: null, scope: { url: "https://clayworks.example/" }, target_limit: 7, status: "queued",
        confidence: null, confidence_components: null, failure_class: null, failure_detail: null, requested_by: USER_ID, created_at: minutesAgo(1), started_at: null, finished_at: null,
      },
      {
        id: SCAN, org_id: ORG, business_id: BIZ, objective: "Understand how customers enquire and order", scope: { url: "https://clayworks.example/" }, target_limit: 3,
        status: "partial", confidence: 0.46, failure_class: null, failure_detail: "1 target(s) not fully read", requested_by: USER_ID,
        confidence_components: {
          coverage: 0.667, sourceReliability: 0.7, recency: 1, corroboration: 0.2, extractionQuality: 0.78, contradiction: 0, method: "acquisition.v1",
          limitingFactors: [{ component: "corroboration", value: 0.2, explanation: "Few independent sources agree" }],
        },
        created_at: minutesAgo(60), started_at: minutesAgo(59), finished_at: minutesAgo(58),
      },
    ],
    scan_targets: [
      { id: T1, org_id: ORG, scan_id: SCAN, source_id: S1, uri: "https://clayworks.example/", status: "acquired", http_status: 200, failure_class: null, failure_detail: null, content_hash: "h", bytes: 18000, attempted_at: minutesAgo(59), created_at: minutesAgo(59) },
      { id: T2, org_id: ORG, scan_id: SCAN, source_id: S2, uri: "https://clayworks.example/shop", status: "acquired", http_status: 200, failure_class: null, failure_detail: null, content_hash: "h", bytes: 9000, attempted_at: minutesAgo(59), created_at: minutesAgo(59) },
      { id: T3, org_id: ORG, scan_id: SCAN, source_id: S3, uri: "https://clayworks.example/contact", status: "unavailable", http_status: 503, failure_class: "acquisition", failure_detail: "HTTP 503 from the site", content_hash: null, bytes: null, attempted_at: minutesAgo(59), created_at: minutesAgo(59) },
    ],
    evidence: [
      ev(E(1), S1, T1, "Page title: Clayworks Studio | Handmade Ceramics", "<title>Clayworks Studio | Handmade Ceramics</title>", "head > title"),
      ev(E(2), S1, T1, "Page links to WhatsApp", '<a href="https://wa.me/27820000000">Order on WhatsApp</a>', 'a[href*="wa.me"]'),
      ev(E(3), S2, T2, "Page text captured (95 words)", "Mugs R250. Bowls R320. Vases from R450. Prices exclude delivery. Message us on WhatsApp to order.", "body"),
      {
        id: E(4), org_id: ORG, business_id: BIZ, source_id: S3, scan_id: SCAN, scan_target_id: T3, state: "unavailable", fact: null,
        missing_description: "https://clayworks.example/contact could not be read: HTTP 503 from the site", excerpt: null, structured_value: null,
        content_location: null, retrieved_at: minutesAgo(59), fresh_until: null, extraction_status: "failed", confidence: null, created_by_actor: "agent", created_at: minutesAgo(59),
      },
    ],
    findings: [
      {
        id: FINDING, org_id: ORG, business_id: BIZ, scan_id: SCAN, title: "Orders depend on WhatsApp messages", kind: "interpretation", category: "risk",
        statement: "Both the home page and the shop direct customers to order by messaging on WhatsApp.",
        impact_hypothesis: "Orders arriving as chat messages may be hard to track, count and follow up.",
        confidence: 0.62, missing_information: ["How orders are recorded after a WhatsApp message"], status: "active", superseded_by: null, created_by_actor: "agent",
        confidence_components: { coverage: 0.667, sourceReliability: 0.7, recency: 1, corroboration: 0.667, extractionQuality: 0.9, contradiction: 0, method: "findings.v1", kind: "interpretation", adjustments: [], limitingFactors: [] },
        created_at: minutesAgo(55), updated_at: minutesAgo(55),
      },
      {
        id: FINDING_H, org_id: ORG, business_id: BIZ, scan_id: SCAN, title: "No self-service checkout", kind: "hypothesis", category: "missing_capability",
        statement: "Customers cannot pay online; ordering happens through chat.",
        impact_hypothesis: "Buyers who prefer to check out immediately may leave.",
        confidence: 0.38, missing_information: ["Absence not verified: TEBOS read 2 page(s); confirm with the business or a deeper scan"], status: "active", superseded_by: null, created_by_actor: "agent",
        confidence_components: { coverage: 0.667, sourceReliability: 0.7, recency: 1, corroboration: 0.333, extractionQuality: 0.9, contradiction: 0, method: "findings.v1", kind: "hypothesis", adjustments: ["Reclassified as hypothesis: it asserts an absence, which reading public pages cannot prove"], limitingFactors: [{ component: "corroboration", value: 0.333, explanation: "Few independent sources agree" }] },
        created_at: minutesAgo(55), updated_at: minutesAgo(55),
      },
    ],
    finding_evidence: [
      { org_id: ORG, business_id: BIZ, finding_id: FINDING, evidence_id: E(2), relation: "supports", note: null, created_at: minutesAgo(55) },
      { org_id: ORG, business_id: BIZ, finding_id: FINDING, evidence_id: E(3), relation: "supports", note: null, created_at: minutesAgo(55) },
      { org_id: ORG, business_id: BIZ, finding_id: FINDING_H, evidence_id: E(3), relation: "supports", note: null, created_at: minutesAgo(55) },
    ],
    actions: [
      {
        id: ACTION, org_id: ORG, business_id: BIZ, finding_id: FINDING, title: "Add a structured order form", objective: "Capture orders in one place with the details needed to fulfil them.",
        expected_outcome: "Every order recorded with item, quantity and delivery details", owner_user_id: USER_ID, capability_key: "web.update_public_content",
        priority: 2, risk_tier: 2, approval_required: true, execution_method: "manual", evidence_requirement: "A test order appears in the order list",
        status: "ready", blocked_reason: null, result: null, verification_status: "not_verified", idempotency_key: null, due_at: null, created_by: USER_ID,
        created_at: minutesAgo(30), updated_at: minutesAgo(20),
      },
    ],
    action_dependencies: [],
    approvals: [],
    action_runs: [],
    outcomes: [],
    agent_runs: [
      { id: RUN_A, org_id: ORG, business_id: BIZ, agent_role: "acquisition", purpose: "Read public website", scan_id: SCAN, action_id: null, input_context: {}, status: "succeeded", model_provider: null, model: null, tokens_in: null, tokens_out: null, output_summary: {}, error_detail: null, started_at: minutesAgo(59), finished_at: minutesAgo(58) },
      { id: RUN_I, org_id: ORG, business_id: BIZ, agent_role: "business_intelligence", purpose: "Propose findings", scan_id: SCAN, action_id: null, input_context: {}, status: "succeeded", model_provider: "anthropic", model: "claude-opus-5", tokens_in: 2140, tokens_out: 610, output_summary: { findings: 2, rejected: [{ title: "Contact page is broken", reason: "No obtained evidence supports it" }] }, error_detail: null, started_at: minutesAgo(56), finished_at: minutesAgo(55) },
    ],
    audit_events: [
      { id: 3, org_id: ORG, occurred_at: minutesAgo(20), actor_type: "user", actor_id: USER_ID, action: "actions.transition", entity_type: "actions", entity_id: ACTION, before: {}, after: { status: "ready" }, request_id: null, prev_hash: "b", hash: "c" },
      { id: 2, org_id: ORG, occurred_at: minutesAgo(30), actor_type: "user", actor_id: USER_ID, action: "actions.insert", entity_type: "actions", entity_id: ACTION, before: null, after: { status: "proposed" }, request_id: null, prev_hash: "a", hash: "b" },
      { id: 1, org_id: ORG, occurred_at: minutesAgo(55), actor_type: "agent", actor_id: RUN_I, action: "findings.insert", entity_type: "findings", entity_id: FINDING, before: null, after: { status: "active" }, request_id: null, prev_hash: null, hash: "a" },
    ],
    capabilities: [
      { key: "web.read_public", name: "Read public web pages", description: null, default_risk_tier: 0, created_at: minutesAgo(999) },
      { key: "analysis.generate_findings", name: "Generate findings", description: null, default_risk_tier: 1, created_at: minutesAgo(999) },
      { key: "email.send_transactional", name: "Send transactional email", description: null, default_risk_tier: 2, created_at: minutesAgo(999) },
      { key: "web.update_public_content", name: "Update public web content", description: null, default_risk_tier: 2, created_at: minutesAgo(999) },
      { key: "finance.initiate_payment", name: "Initiate payment", description: null, default_risk_tier: 3, created_at: minutesAgo(999) },
    ],
    connectors: [
      { key: "resend", provider: "Resend", name: "Resend transactional email", auth_method: "api_key", supports_webhooks: true, supports_polling: true, rate_limit: null, data_sensitivity: "controlled", execution_method: "api", created_at: minutesAgo(999) },
    ],
    connection_instances: [],
  };

  function ev(id: string, source: string, target: string, fact: string, excerpt: string, location: string) {
    return {
      id, org_id: ORG, business_id: BIZ, source_id: source, scan_id: SCAN, scan_target_id: target, state: "acquired", fact, missing_description: null,
      excerpt, structured_value: {}, content_location: location, retrieved_at: minutesAgo(59), fresh_until: null, extraction_status: "complete",
      confidence: 0.9, created_by_actor: "agent", created_at: minutesAgo(59),
    };
  }
}
