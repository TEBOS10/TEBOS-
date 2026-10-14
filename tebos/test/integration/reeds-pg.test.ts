// REEDS against the real schema: a person asks "what needs my attention
// today?"; the worker plans it, runs each task, verifies each result with an
// independent recount, and only then reports. Another organisation's records
// never appear. An executor that keeps failing ends the request as failed,
// and a result that doesn't survive verification can never be reported.
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CheckResult } from "../../src/domain/work";
import { PgWorkStore } from "../../src/reeds/pg-store";
import type { CheckInput } from "../../src/reeds/checks";
import { WorkWorker } from "../../src/reeds/worker";

const enabled = process.env.TEBOS_TEST_DB === "1";
const ADMIN = "9cc00000-0000-0000-0000-00000000000a";
const OWNER = "9cc00000-0000-0000-0000-00000000000b";

describe.skipIf(!enabled)("REEDS: a request taken to a verified report", () => {
  let pool: pg.Pool;
  let org: string, org2: string;

  async function as<T = pg.QueryResult>(user: string, sql: string, params: unknown[] = []): Promise<T> {
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query("set local role authenticated");
      await c.query("select set_config('request.jwt.claim.sub', $1, true)", [user]);
      const r = await c.query(sql, params);
      await c.query("commit");
      return r as T;
    } catch (e) {
      await c.query("rollback").catch(() => {});
      throw e;
    } finally {
      c.release();
    }
  }

  const ask = async (user: string, orgId: string) =>
    (await as(user, "insert into public.work_requests (org_id, kind, status) values ($1, 'attention_today', 'received') returning id", [orgId])).rows[0].id as string;
  const drain = async (worker: WorkWorker) => {
    for (let i = 0; i < 300 && (await worker.runOnce()); i++) { /* until there is no work left */ }
  };
  const request = async (id: string) => (await pool.query("select status, report, failure_detail from public.work_requests where id = $1", [id])).rows[0];
  const tasks = async (id: string) => (await pool.query("select key, status, attempts, result, verification from public.work_tasks where request_id = $1 order by position", [id])).rows;

  beforeAll(async () => {
    pool = new pg.Pool({ max: 4 });
    await pool.query("insert into auth.users (id, email, email_confirmed_at) values ($1, 'a@reeds.it', now()), ($2, 'o@reeds.it', now())", [ADMIN, OWNER]);
    await pool.query("insert into public.platform_admins (user_id) values ($1)", [ADMIN]);
    org = (await pool.query("insert into public.organisations (name, slug) values ('Reeds IT', 'reeds-it') returning id")).rows[0].id;
    org2 = (await pool.query("insert into public.organisations (name, slug) values ('Reeds Other', 'reeds-other') returning id")).rows[0].id;
    await pool.query("insert into public.memberships (org_id, user_id, role) values ($1, $2, 'org_admin'), ($3, $4, 'org_admin')", [org, ADMIN, org2, OWNER]);
    const biz = (await pool.query("insert into public.businesses (org_id, name) values ($1, 'Reeds IT') returning id", [org])).rows[0].id;
    await pool.query("select set_config('tebos.actor_type', 'agent', false), set_config('tebos.actor_id', 'it', false)");
    // the organisation's own state: two open maintainer items (one closed), one run failed today and one long ago
    await pool.query(
      `insert into public.maintainer_items (org_id, kind, severity, title, detail) values
         ($1, 'connection_broken', 'high', 'Broken', 'x'), ($1, 'findings_waiting', 'medium', 'Waiting', 'x'),
         ($2, 'connection_broken', 'high', 'Theirs', 'x')`, [org, org2]);
    const today = (await pool.query("insert into public.agent_runs (org_id, business_id, agent_role, purpose, status) values ($1, $2, 'business_intelligence', 'it', 'running') returning id", [org, biz])).rows[0].id;
    const old = (await pool.query("insert into public.agent_runs (org_id, business_id, agent_role, purpose, status, started_at) values ($1, $2, 'business_intelligence', 'it', 'running', now() - interval '30 hours') returning id", [org, biz])).rows[0].id;
    await pool.query("update public.agent_runs set status = 'failed', error_detail = 'rejected' where id = any($1::uuid[])", [[today, old]]);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("plans, runs, verifies every figure, and only then reports", async () => {
    const id = await ask(ADMIN, org);
    await drain(new WorkWorker(new PgWorkStore(pool, "reeds-worker:it")));
    const r = await request(id);
    expect({ status: r.status, failure: r.failure_detail }).toEqual({ status: "completed", failure: null });
    const t = await tasks(id);
    // a platform admin's plan covers the organisation and the platform
    expect(t.map((x) => x.key)).toEqual([
      "approvals.pending", "agent_runs.failed", "delivery.overdue", "maintainer.open",
      "pipeline.to_decide", "enquiries.recent", "outbox.failed", "capital.ingestion",
    ]);
    expect(t.every((x) => x.status === "verified" && x.verification.ok === true && x.attempts === 1)).toBe(true);
    const line = (key: string) => r.report.lines.find((l: { key: string }) => l.key === key);
    expect(line("maintainer.open")).toMatchObject({ text: "2 items are open in the maintainer's queue.", attention: true, checked: true });
    expect(line("agent_runs.failed")).toMatchObject({ text: "1 automated run failed in the last 24 hours.", attention: true });
    expect(line("approvals.pending")).toMatchObject({ text: "No approvals are waiting for a decision.", attention: false });
    // Tidy Capital isn't in the test database: said so, never reported as fine
    expect(line("capital.ingestion")).toMatchObject({ checked: false, text: "Couldn't check: Tidy Capital's data isn't in this database." });
    expect(r.report.summary).toMatch(/your attention\. 1 check couldn't be completed\.$/);
    // the figures are the database's, not the executor's word
    const recount = (await pool.query("select count(*)::int as n from public.maintainer_items where org_id = $1 and status = 'open'", [org])).rows[0].n;
    expect(t.find((x) => x.key === "maintainer.open").result.count).toBe(recount);
  });

  it("keeps each organisation to its own records, and the platform to platform admins", async () => {
    const id = await ask(OWNER, org2);
    await drain(new WorkWorker(new PgWorkStore(pool, "reeds-worker:it")));
    const r = await request(id);
    expect(r.status).toBe("completed");
    expect((await tasks(id)).map((x) => x.key)).toEqual(["approvals.pending", "agent_runs.failed", "delivery.overdue", "maintainer.open"]);
    expect(r.report.lines.find((l: { key: string }) => l.key === "maintainer.open").text).toBe("1 item is open in the maintainer's queue.");
    // and they can't read the other organisation's requests at all
    expect((await as(OWNER, "select count(*)::int as n from public.work_requests where org_id = $1", [org])).rows[0].n).toBe(0);
  });

  it("retries a failing executor within its attempts, then fails the request instead of reporting", async () => {
    class Flaky extends PgWorkStore {
      override async run(executor: string, input: CheckInput): Promise<CheckResult> {
        if (executor === "count.maintainer_open") throw new Error("connection reset");
        return super.run(executor, input);
      }
    }
    const id = await ask(OWNER, org2);
    await drain(new WorkWorker(new Flaky(pool, "reeds-worker:it")));
    const r = await request(id);
    expect(r.status).toBe("failed");
    expect(r.report).toBeNull();
    expect(r.failure_detail).toBe(`"Open items in the maintainer's queue" failed: connection reset`);
    expect((await tasks(id)).find((x) => x.key === "maintainer.open")).toMatchObject({ status: "failed", attempts: 3 });
  });

  it("never reports a figure that doesn't survive an independent recount", async () => {
    class Inflating extends PgWorkStore {
      override async run(executor: string, input: CheckInput): Promise<CheckResult> {
        const real = await super.run(executor, input);
        return executor === "count.maintainer_open" && real.available ? { ...real, count: real.count + 5 } : real;
      }
    }
    const id = await ask(OWNER, org2);
    await drain(new WorkWorker(new Inflating(pool, "reeds-worker:it")));
    const r = await request(id);
    expect(r.status).toBe("failed");
    expect(r.report).toBeNull();
    expect(r.failure_detail).toMatch(/^"Open items in the maintainer's queue" didn't pass its check: Result said 6, recount found 1/);
    expect((await tasks(id)).find((x) => x.key === "maintainer.open")).toMatchObject({ status: "rejected" });
  });
});
