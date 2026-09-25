// Runs the evidence pipeline — acquisition, then intelligence — against the
// real TEBOS schema (all migrations, guards, RLS and audit triggers). Enabled
// by scripts/test-db.sh, which sets TEBOS_TEST_DB=1 and the libpq PG*
// variables for a fresh test database. Tests run in order and share state.
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Fetcher, FetchOutcome } from "../../src/acquisition/fetcher";
import { PgAcquisitionStore } from "../../src/acquisition/pg-store";
import { AcquisitionWorker } from "../../src/acquisition/worker";
import { PgIntelligenceStore } from "../../src/intelligence/pg-store";
import { ReasoningError, type ReasoningProvider } from "../../src/intelligence/provider";
import { IntelligenceWorker } from "../../src/intelligence/worker";

const enabled = process.env.TEBOS_TEST_DB === "1";
const SITE = "https://mmupi.example";

const ok = (url: string, body: string, contentType = "text/html"): FetchOutcome => ({
  kind: "ok", requestedUrl: url, finalUrl: url, status: 200, contentType, body, bytes: body.length, truncated: false, contentHash: "abc", redirects: [],
});
const routes: Record<string, FetchOutcome> = {
  [`${SITE}/robots.txt`]: ok(`${SITE}/robots.txt`, "User-agent: *\nDisallow: /admin", "text/plain"),
  [`${SITE}/`]: ok(`${SITE}/`, `<title>Mmupi &amp; Clay</title><body><h1>Handmade ceramics</h1>
    <a href="https://wa.me/27820000000">WhatsApp</a><a href="/contact">Contact</a><a href="/admin">Admin</a></body>`),
};
// These tests cover scan analyses; businesses left by other test files may be due a review (review-pg.test.ts).
const scanOnly = (pool: pg.Pool) => Object.assign(new PgIntelligenceStore(pool), { claimNextReview: undefined });

const fetcher: Fetcher = async (url) =>
  routes[url] ?? { kind: "http_error", requestedUrl: url, finalUrl: url, status: 503, detail: "HTTP 503" };

describe.skipIf(!enabled)("evidence pipeline against the TEBOS schema", () => {
  let pool: pg.Pool;
  let store: PgAcquisitionStore;
  let scanId: string;

  beforeAll(async () => {
    pool = new pg.Pool({ max: 2 });
    store = new PgAcquisitionStore(pool);
    const org = await pool.query("insert into public.organisations (name, slug) values ('Worker test', 'worker-test') returning id");
    const biz = await pool.query(
      "insert into public.businesses (org_id, name, website, primary_domain) values ($1, 'Mmupi', $2, 'mmupi.example') returning id",
      [org.rows[0].id, `${SITE}/`],
    );
    const scan = await pool.query(
      "insert into public.scans (org_id, business_id, objective, target_limit) values ($1, $2, 'Understand the enquiry journey', 3) returning id",
      [org.rows[0].id, biz.rows[0].id],
    );
    scanId = scan.rows[0].id;
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("claims the scan, records targets and evidence, and finishes it honestly", async () => {
    const worker = new AcquisitionWorker(store, { workerId: "it", fetcher, politenessDelayMs: 0 });
    const report = await worker.runOnce();
    expect(report).toMatchObject({ scanId, status: "partial" });

    const scan = (await pool.query("select * from public.scans where id = $1", [scanId])).rows[0];
    expect(scan).toMatchObject({ status: "partial", failure_class: null });
    expect(Number(scan.confidence)).toBeGreaterThan(0);
    expect(scan.finished_at).not.toBeNull();

    const targets = (await pool.query("select uri, status, failure_class, http_status from public.scan_targets where scan_id = $1 order by created_at", [scanId])).rows;
    expect(targets).toEqual([
      { uri: `${SITE}/`, status: "acquired", failure_class: null, http_status: 200 },
      { uri: `${SITE}/contact`, status: "unavailable", failure_class: "acquisition", http_status: 503 },
      { uri: `${SITE}/admin`, status: "blocked", failure_class: "permission", http_status: null },
    ]);

    const evidence = (await pool.query("select state, fact, missing_description from public.evidence where scan_id = $1", [scanId])).rows;
    expect(evidence.filter((e) => e.state === "acquired").map((e) => e.fact)).toEqual(
      expect.arrayContaining(["Page title: Mmupi & Clay", "H1 heading: Handmade ceramics", "Page links to WhatsApp"]),
    );
    expect(evidence.filter((e) => e.state === "unavailable")).toHaveLength(2);
  });

  it("records the run, its tool calls, and attributes every write to the run", async () => {
    const run = (await pool.query("select * from public.agent_runs where scan_id = $1", [scanId])).rows[0];
    expect(run).toMatchObject({ agent_role: "acquisition", status: "succeeded" });
    expect(run.finished_at).not.toBeNull();

    const calls = (await pool.query("select tool, status from public.tool_calls where agent_run_id = $1 order by created_at", [run.id])).rows;
    expect(calls.map((c) => `${c.tool}:${c.status}`)).toEqual([
      "safe_fetch.robots:succeeded",
      "safe_fetch:succeeded",
      "safe_fetch:failed",
      "safe_fetch:denied",
    ]);

    const actors = (
      await pool.query(
        `select distinct actor_type, actor_id from public.audit_events
          where entity_type in ('scan_targets', 'evidence', 'sources', 'tool_calls') and after ->> 'org_id' = $1`,
        [run.org_id],
      )
    ).rows;
    expect(actors).toEqual([{ actor_type: "agent", actor_id: run.id }]);

    const scanTransitions = (
      await pool.query("select actor_id, after ->> 'status' as status from public.audit_events where entity_id = $1 and action = 'scans.transition' order by id", [scanId])
    ).rows;
    expect(scanTransitions).toEqual([
      { actor_id: "acquisition-worker:it", status: "running" },
      { actor_id: run.id, status: "partial" },
    ]);
  });

  it("does not claim a scan that is no longer queued", async () => {
    const worker = new AcquisitionWorker(store, { workerId: "it2", fetcher, politenessDelayMs: 0 });
    expect(await worker.runOnce()).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Intelligence
  // ---------------------------------------------------------------------------

  const answering = (findings: unknown[]): ReasoningProvider => ({
    name: "fake",
    async structured(req) {
      // cite whichever reference the prompt gave the WhatsApp fact
      const ref = /(E\d+) \[acquired\][^\n]*Page links to WhatsApp/.exec(req.prompt)?.[1] ?? "E1";
      const missingRef = /(E\d+) \[NOT OBTAINED\]/.exec(req.prompt)?.[1] ?? "E99";
      return {
        value: { findings: findings.map((f) => JSON.parse(JSON.stringify(f).replaceAll("$REF", ref).replaceAll("$MISSING", missingRef))) },
        provider: "fake",
        model: "fake-model",
        usage: { inputTokens: 1200, outputTokens: 300 },
      };
    },
  });

  it("turns the scan's evidence into stored, evidence-linked findings", async () => {
    const worker = new IntelligenceWorker(scanOnly(pool), answering([
      {
        title: "Enquiries are routed to WhatsApp",
        statement: "The home page sends visitors to WhatsApp to enquire.",
        kind: "interpretation", category: "risk", impact_hypothesis: "Enquiries may be hard to track.",
        supporting_evidence: ["$REF"], contradicting_evidence: [], missing_information: ["How enquiries are logged today"],
      },
      {
        title: "Contact page is broken",
        statement: "The contact page does not work.",
        kind: "interpretation", category: "weakness", impact_hypothesis: "Lost enquiries.",
        supporting_evidence: ["$MISSING"], contradicting_evidence: [], missing_information: [],
      },
    ]), { workerId: "it" });

    const report = await worker.runOnce();
    expect(report).toMatchObject({ scanId, status: "succeeded", findings: 1 });
    expect(report!.rejected.map((r) => r.title)).toEqual(["Contact page is broken"]);

    const findings = (await pool.query("select * from public.findings where scan_id = $1", [scanId])).rows;
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ status: "active", kind: "interpretation", category: "risk", created_by_actor: "agent" });
    expect(Number(findings[0].confidence)).toBeGreaterThan(0);
    expect(findings[0].confidence_components.method).toBe("findings.v1");

    const links = (
      await pool.query(
        "select fe.relation, e.fact from public.finding_evidence fe join public.evidence e on e.id = fe.evidence_id where fe.finding_id = $1",
        [findings[0].id],
      )
    ).rows;
    expect(links).toEqual([{ relation: "supports", fact: "Page links to WhatsApp" }]);

    const run = (await pool.query("select * from public.agent_runs where scan_id = $1 and agent_role = 'business_intelligence'", [scanId])).rows[0];
    expect(run).toMatchObject({ status: "succeeded", model_provider: "fake", model: "fake-model", tokens_in: 1200, tokens_out: 300 });
    const actors = (await pool.query("select distinct actor_type, actor_id from public.audit_events where entity_type = 'findings' and entity_id = $1", [findings[0].id])).rows;
    expect(actors).toEqual([{ actor_type: "agent", actor_id: run.id }]);
  });

  it("analyses each scan once", async () => {
    const worker = new IntelligenceWorker(scanOnly(pool), answering([]), { workerId: "it2" });
    expect(await worker.runOnce()).toBeNull();
  });

  it("retries a failed analysis at most three times, recording each failure", async () => {
    const biz = (await pool.query("select business_id, org_id from public.scans where id = $1", [scanId])).rows[0];
    await pool.query("insert into public.scans (org_id, business_id, target_limit) values ($1, $2, 1)", [biz.org_id, biz.business_id]);
    const acquired = await new AcquisitionWorker(store, { workerId: "it3", fetcher, politenessDelayMs: 0 }).runOnce();
    expect(acquired?.status).toBe("completed");

    const failing: ReasoningProvider = { name: "fake", structured: async () => { throw new ReasoningError("provider_unavailable", "down"); } };
    const worker = new IntelligenceWorker(scanOnly(pool), failing, { workerId: "it3" });
    for (let i = 0; i < 3; i++) expect(await worker.runOnce()).toMatchObject({ scanId: acquired!.scanId, status: "failed" });
    expect(await worker.runOnce()).toBeNull();

    const runs = (await pool.query("select status, error_detail from public.agent_runs where scan_id = $1 and agent_role = 'business_intelligence'", [acquired!.scanId])).rows;
    expect(runs).toHaveLength(3);
    expect(runs.every((r) => r.status === "failed" && r.error_detail === "provider_unavailable: down")).toBe(true);
    expect((await pool.query("select count(*)::int as n from public.findings where scan_id = $1", [acquired!.scanId])).rows[0].n).toBe(0);
  });
});
