// Business reviews against the real TEBOS schema: a business with interview
// answers and connected-system figures gets findings that cite both; an
// unchanged re-recorded snapshot costs no model call; a changed figure gets a
// new review that supersedes the old findings, except one an action rests on.
// Shares a database with the other integration files (see scripts/test-db.sh),
// so any reviews they left due are drained first.
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PgIntelligenceStore } from "../../src/intelligence/pg-store";
import type { ReasoningProvider, StructuredRequest } from "../../src/intelligence/provider";
import { IntelligenceWorker } from "../../src/intelligence/worker";

const enabled = process.env.TEBOS_TEST_DB === "1";

describe.skipIf(!enabled)("business reviews against the TEBOS schema", () => {
  let pool: pg.Pool;
  let org: string, biz: string, bameSrc: string, interviewSrc: string;
  const requests: StructuredRequest[] = [];
  let answer: (prompt: string) => unknown[] = () => [];
  const provider: ReasoningProvider = {
    name: "fake",
    async structured(req) {
      requests.push(req);
      return { value: { findings: answer(req.prompt) }, provider: "fake", model: "fake-model", usage: { inputTokens: 900, outputTokens: 200 } };
    },
  };
  const worker = () => new IntelligenceWorker(new PgIntelligenceStore(pool), provider, { workerId: "review-it" });
  const ref = (prompt: string, text: string) => new RegExp(`(E\\d+) \\[[^\\]]*\\][^\\n]*${text}`).exec(prompt)?.[1] ?? "E99";
  const snapshot = async (facts: string[], at: string) => {
    for (const fact of facts) {
      await pool.query(
        `insert into public.evidence (org_id, business_id, source_id, state, fact, excerpt, content_location, retrieved_at, extraction_status, confidence)
         values ($1, $2, $3, 'acquired', $4, $4, 'snapshot', $5, 'complete', 0.95)`,
        [org, biz, bameSrc, fact, at],
      );
    }
  };
  const reviewRuns = async () =>
    (await pool.query("select * from public.agent_runs where business_id = $1 and agent_role = 'business_intelligence' and scan_id is null order by started_at", [biz])).rows;
  // Pretend the last review ran long enough ago that another is allowed.
  const ageReviews = () =>
    pool.query("update public.agent_runs set started_at = started_at - interval '7 hours' where business_id = $1 and scan_id is null", [biz]);

  beforeAll(async () => {
    pool = new pg.Pool({ max: 3 });
    // Drain reviews the earlier integration files left due.
    for (let i = 0; i < 20 && (await worker().runOnce()); i++);
    requests.length = 0;

    org = (await pool.query("insert into public.organisations (name, slug) values ('Review IT', 'review-it') returning id")).rows[0].id;
    biz = (await pool.query("insert into public.businesses (org_id, name, industry) values ($1, 'BAME', 'Marketing') returning id", [org])).rows[0].id;
    bameSrc = (await pool.query(
      "insert into public.sources (org_id, business_id, source_type, uri, label, reliability) values ($1, $2, 'connected_system', 'bame-ops:c1', 'Operations snapshot', 0.95) returning id",
      [org, biz])).rows[0].id;
    interviewSrc = (await pool.query(
      "insert into public.sources (org_id, business_id, source_type, uri, label, reliability) values ($1, $2, 'user_statement', 'interview:i1', 'Diagnostic interview', 0.6) returning id",
      [org, biz])).rows[0].id;
    await pool.query(
      `insert into public.evidence (org_id, business_id, source_id, state, fact, excerpt, structured_value, content_location, retrieved_at, extraction_status)
       values ($1, $2, $3, 'user_supplied', 'Finance and sales work from memory.', 'honestly finance and sales just work from memory',
               '{"question": "How do teams know what done looks like?"}', 'call at 04:12', now(), 'complete')`,
      [org, biz, interviewSrc],
    );
    await snapshot(["Deliverable checklists exist for pr 21, tech 33; none are defined for finance, sales.", "2 leads are not assigned to any department."], "2026-09-25T12:00:00Z");
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("reviews the business from interview answers and connected-system figures together", async () => {
    answer = (p) => [{
      title: "Finance and sales have no deliverable checklists",
      statement: "BAME defines no deliverable checklists for finance or sales, and the interviewee says those teams work from memory.",
      kind: "interpretation", category: "missing_capability", impact_hypothesis: "Work may be finished inconsistently.",
      supporting_evidence: [ref(p, "none are defined for finance"), ref(p, "work from memory")], contradicting_evidence: [], missing_information: [],
    }];
    const report = await worker().runOnce();
    expect(report).toMatchObject({ kind: "review", businessId: biz, scanId: null, status: "succeeded", findings: 1 });
    expect(requests[0]!.prompt).toContain("[CONNECTED SYSTEM, measured 2026-09-25]");
    expect(requests[0]!.prompt).toContain('[INTERVIEW, asked "How do teams know what done looks like?"]');

    const [run] = await reviewRuns();
    const f = (await pool.query("select * from public.findings where analysis_run_id = $1", [run.id])).rows;
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ status: "active", kind: "interpretation", scan_id: null, created_by_actor: "agent" });
    expect(f[0].missing_information).toContain("Measured in bame-ops:c1 only; anything kept outside it is not counted");
    expect(f[0].confidence_components.method).toBe("findings.review.v1");
    const cited = (await pool.query(
      "select s.source_type from public.finding_evidence fe join public.evidence e on e.id = fe.evidence_id join public.sources s on s.id = e.source_id where fe.finding_id = $1 order by 1",
      [f[0].id])).rows.map((r) => r.source_type);
    expect(cited).toEqual(["connected_system", "user_statement"]);
    expect(run).toMatchObject({ status: "succeeded", model: "fake-model", tokens_in: 900 });
    expect(run.output_summary.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect((await pool.query("select distinct actor_id from public.audit_events where entity_type = 'findings' and entity_id = $1", [f[0].id])).rows)
      .toEqual([{ actor_id: run.id }]);
  });

  it("is not due again until something changes", async () => {
    expect(await worker().runOnce()).toBeNull();
  });

  it("makes no model call when a snapshot is re-recorded unchanged", async () => {
    await ageReviews();
    await snapshot(["Deliverable checklists exist for pr 21, tech 33; none are defined for finance, sales.", "2 leads are not assigned to any department."], "2026-09-26T12:00:00Z");
    const before = requests.length;
    expect(await worker().runOnce()).toMatchObject({ kind: "review", status: "succeeded", findings: 0 });
    expect(requests.length).toBe(before);
    expect((await reviewRuns()).at(-1).output_summary).toMatchObject({ unchanged: true });
    expect((await pool.query("select count(*)::int n from public.findings where business_id = $1 and status = 'active'", [biz])).rows[0].n).toBe(1);
  });

  it("waits out the minimum interval before reviewing a change", async () => {
    await snapshot(["Deliverable checklists exist for pr 21, tech 33; none are defined for finance, sales.", "Every lead is assigned to a department."], "2026-09-26T13:00:00Z");
    const [real, unchanged] = await reviewRuns();
    const setStarted = (id: string, ago: string) => pool.query(`update public.agent_runs set started_at = now() - interval '${ago}' where id = $1`, [id]);
    await setStarted(real.id, "1 hour"); // a real review an hour ago blocks
    expect(await worker().runOnce()).toBeNull();
    // A recent no-op review doesn't count toward the interval (the next test reviews despite it).
    await setStarted(real.id, "7 hours");
    await setStarted(unchanged.id, "1 minute");
  });

  it("supersedes the previous review's findings, except one an action rests on", async () => {
    const old = (await pool.query("select id from public.findings where business_id = $1 and status = 'active'", [biz])).rows[0].id;
    // A second earlier finding, with an action proposed from it.
    const [first] = await reviewRuns();
    const client = await pool.connect();
    let kept: string;
    try {
      await client.query("begin");
      await client.query("set constraints all deferred");
      await client.query("select set_config('tebos.actor_type', 'agent', true), set_config('tebos.actor_id', $1, true)", [first.id]);
      kept = (await client.query(
        `insert into public.findings (org_id, business_id, title, statement, category, confidence, status, analysis_run_id)
         values ($1, $2, 'Leads wait for a department', 'Two leads are unassigned.', 'bottleneck', 0.6, 'active', $3) returning id`,
        [org, biz, first.id])).rows[0].id;
      const ev = (await client.query("select id from public.evidence where source_id = $1 and fact like '2 leads%' limit 1", [bameSrc])).rows[0].id;
      await client.query("insert into public.finding_evidence (org_id, business_id, finding_id, evidence_id) values ($1, $2, $3, $4)", [org, biz, kept, ev]);
      await client.query(
        "insert into public.actions (org_id, business_id, finding_id, title, objective, risk_tier, approval_required) values ($1, $2, $3, 'Assign the leads', 'Every lead has a department', 0, false)",
        [org, biz, kept]);
      await client.query("commit");
    } finally {
      client.release();
    }

    answer = (p) => [{
      title: "Checklists cover only PR and tech",
      statement: "Only PR and tech have deliverable checklists; none are defined for finance or sales.",
      kind: "interpretation", category: "gap", impact_hypothesis: "Quality may vary by department.",
      supporting_evidence: [ref(p, "none are defined for finance")], contradicting_evidence: [], missing_information: [],
    }];
    const report = await worker().runOnce();
    expect(report).toMatchObject({ kind: "review", status: "succeeded", findings: 1 });
    expect(requests.at(-1)!.prompt).toContain("Every lead is assigned to a department.");
    expect(requests.at(-1)!.prompt).not.toContain("2 leads are not assigned"); // only the latest snapshot is read

    const latest = (await reviewRuns()).at(-1);
    const rows = (await pool.query("select id, status, superseded_by_run from public.findings where business_id = $1", [biz])).rows;
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId[old]).toMatchObject({ status: "superseded", superseded_by_run: latest.id });
    expect(byId[kept!]).toMatchObject({ status: "active", superseded_by_run: null });
    expect(rows.filter((r) => r.status === "active")).toHaveLength(2);
  });
});
