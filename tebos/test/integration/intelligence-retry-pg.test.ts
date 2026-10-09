// Retrying analyses against the real TEBOS schema: a failed analysis waits
// before it is tried again, and failures that were the provider's (a refused
// key, an outage) don't use up the business's attempts. Shares a database with
// the other integration files, so reviews they left due are drained first.
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MAX_ANALYSIS_ATTEMPTS, PgIntelligenceStore } from "../../src/intelligence/pg-store";
import { ReasoningError, type ReasoningProvider } from "../../src/intelligence/provider";
import { IntelligenceWorker } from "../../src/intelligence/worker";

const enabled = process.env.TEBOS_TEST_DB === "1";

describe.skipIf(!enabled)("retrying analyses against the TEBOS schema", () => {
  let pool: pg.Pool;
  let biz: string;
  let fail: ReasoningError | null = null;
  const provider: ReasoningProvider = {
    name: "fake",
    async structured() {
      if (fail) throw fail;
      return { value: { findings: [] }, provider: "fake", model: "fake-model", usage: { inputTokens: 1, outputTokens: 1 } };
    },
  };
  // The interview answer is dated two hours back, so runs aged 11 minutes at a time stay after it.
  // a fresh worker each time, so the in-memory pause doesn't hide what the database decides
  const worker = () => new IntelligenceWorker(new PgIntelligenceStore(pool), provider, { workerId: "retry-it" });
  const runs = async () =>
    (await pool.query("select * from public.agent_runs where business_id = $1 and agent_role = 'business_intelligence' order by started_at", [biz])).rows;
  const ageRuns = () => pool.query("update public.agent_runs set started_at = started_at - interval '11 minutes' where business_id = $1", [biz]);

  beforeAll(async () => {
    pool = new pg.Pool({ max: 3 });
    for (let i = 0; i < 20 && (await worker().runOnce()); i++);
    const org = (await pool.query("insert into public.organisations (name, slug) values ('Retry IT', 'retry-it') returning id")).rows[0].id;
    biz = (await pool.query("insert into public.businesses (org_id, name) values ($1, 'Retry Co') returning id", [org])).rows[0].id;
    const src = (await pool.query(
      "insert into public.sources (org_id, business_id, source_type, uri, label, reliability) values ($1, $2, 'user_statement', 'interview:r1', 'Interview', 0.6) returning id",
      [org, biz])).rows[0].id;
    await pool.query(
      `insert into public.evidence (org_id, business_id, source_id, state, fact, excerpt, content_location, retrieved_at, extraction_status, created_at)
       values ($1, $2, $3, 'user_supplied', 'Quotes are approved by the owner.', 'I approve every quote', 'call at 01:00', now(), 'complete', now() - interval '2 hours')`,
      [org, biz, src],
    );
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("marks a provider fault on the run, and waits before trying the business again", async () => {
    fail = new ReasoningError("misconfigured", "This API key is not scoped to a workspace");
    expect(await worker().runOnce()).toMatchObject({ businessId: biz, status: "failed" });
    expect((await runs())[0]).toMatchObject({ status: "failed", output_summary: { findings: 0, providerFault: true } });
    expect(await worker().runOnce()).toBeNull(); // within the retry interval
  });

  it("does not count provider faults as the business's attempts", async () => {
    for (let i = 0; i < MAX_ANALYSIS_ATTEMPTS; i++) {
      await ageRuns();
      expect(await worker().runOnce()).toMatchObject({ businessId: biz, status: "failed" });
    }
    await ageRuns();
    // four provider faults so far, and the business is still due
    expect(await worker().runOnce()).toMatchObject({ businessId: biz });
  });

  it("stops after the business's own failures reach the limit", async () => {
    await pool.query("delete from public.agent_runs where business_id = $1", [biz]);
    fail = new ReasoningError("refusal", "declined");
    for (let i = 0; i < MAX_ANALYSIS_ATTEMPTS; i++) {
      await ageRuns();
      expect(await worker().runOnce()).toMatchObject({ businessId: biz, status: "failed" });
    }
    await ageRuns();
    expect(await worker().runOnce()).toBeNull();
    expect((await runs()).every((r) => r.output_summary.providerFault === undefined)).toBe(true);
  });
});
