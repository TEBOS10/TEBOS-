// The Model Bridge end to end, over real HTTP with the official MCP client:
// a person asks for external work, REEDS plans it, the AI client claims it and
// hands in a result through the bridge (which connects as the tebos_bridge
// role and can call nothing else), a person reviews it, and REEDS completes the
// request. Requests without a valid token never reach MCP, and the token never
// appears in the logs.
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import pg from "pg";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PgBridgeDb } from "../../src/bridge/pg-db";
import { createBridgeServer } from "../../src/bridge/server";
import { PgWorkStore } from "../../src/reeds/pg-store";
import { WorkWorker } from "../../src/reeds/worker";

const enabled = process.env.TEBOS_TEST_DB === "1";
const ADMIN = "9cb00000-0000-0000-0000-00000000000a";
const OPERATOR = "9cb00000-0000-0000-0000-00000000000b";

describe.skipIf(!enabled)("Model Bridge over MCP", () => {
  let admin: pg.Pool;
  let bridgePool: pg.Pool;
  let server: Server;
  let base: string;
  let token: string;
  let org: string;
  let requestId: string;
  const logs: Record<string, unknown>[] = [];

  async function as<T = pg.QueryResult>(user: string, sql: string, params: unknown[] = [], aal = "aal2"): Promise<T> {
    const c = await admin.connect();
    try {
      await c.query("begin");
      await c.query("set local role authenticated");
      await c.query("select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true)", [user, JSON.stringify({ aal })]);
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

  const worker = () => new WorkWorker(new PgWorkStore(admin));
  const drain = async () => {
    for (let i = 0; i < 20 && (await worker().runOnce()); i++);
  };

  beforeAll(async () => {
    admin = new pg.Pool({ max: 4 });
    // the bridge connects with the bridge role only, as in production
    bridgePool = new pg.Pool({ max: 4, options: "-c role=tebos_bridge" });
    await admin.query("insert into auth.users (id, email, email_confirmed_at) values ($1, 'a@bridge.test', now()), ($2, 'o@bridge.test', now())", [ADMIN, OPERATOR]);
    org = (await admin.query("insert into public.organisations (name, slug) values ('MCP Co', 'mcp-co') returning id")).rows[0].id;
    await admin.query("insert into public.memberships (org_id, user_id, role) values ($1, $2, 'org_admin'), ($1, $3, 'operator')", [org, ADMIN, OPERATOR]);
    token = (await as(ADMIN, "select token from public.issue_bridge_client($1, 'Claude Code test', 'coding_agent', array['context.read','tasks.read','tasks.claim','results.submit'])", [org])).rows[0].token;

    server = createBridgeServer({ db: new PgBridgeDb(bridgePool), log: (e) => logs.push(e) });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((r) => server?.close(() => r()));
    await bridgePool?.end();
    await admin?.end();
  });

  const post = (headers: Record<string, string>) =>
    fetch(`${base}/mcp`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });

  it("refuses a request with no token, a malformed token or an unknown token", async () => {
    expect((await post({})).status).toBe(401);
    expect((await post({ authorization: "Bearer nope" })).status).toBe(401);
    const unknown = await post({ authorization: `Bearer tbk_${"9".repeat(64)}` });
    expect(unknown.status).toBe(401);
    expect(unknown.headers.get("www-authenticate")).toContain("invalid_token");
  });

  it("refuses a foreign browser origin, and anything but POST", async () => {
    expect((await post({ authorization: `Bearer ${token}`, origin: "https://evil.example" })).status).toBe(403);
    expect((await fetch(`${base}/mcp`, { method: "GET", headers: { authorization: `Bearer ${token}` } })).status).toBe(405);
    expect((await fetch(`${base}/health`)).status).toBe(200);
  });

  it("takes a person's task from request to verified report", async () => {
    requestId = (await as(OPERATOR,
      `insert into public.work_requests (org_id, kind, status, task_title, task_acceptance, task_executor)
       values ($1, 'external_task', 'received', 'Write the bridge guide', 'A guide explains issuing, revoking and connecting a client.', 'external.coding_agent')
       returning id`, [org])).rows[0].id;
    await drain(); // REEDS plans it, and leaves it for the AI client

    const client = new Client({ name: "test-client", version: "1.0.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { authorization: `Bearer ${token}` } } }));
    const tools = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(tools).toEqual(["claim_task", "get_project_context", "list_tasks", "submit_result"]);

    const text = (r: unknown) => JSON.parse(((r as { content: Array<{ text: string }> }).content[0]!).text);
    const ctx = text(await client.callTool({ name: "get_project_context", arguments: {} }));
    expect(ctx.organisation).toBe("MCP Co");
    const tasks = text(await client.callTool({ name: "list_tasks", arguments: { status: "queued" } }));
    expect(tasks).toHaveLength(1);
    const taskId = tasks[0].id as string;

    const claimed = text(await client.callTool({ name: "claim_task", arguments: { task_id: taskId } }));
    expect(claimed.acceptance).toContain("issuing, revoking");
    const bad = await client.callTool({ name: "submit_result", arguments: { task_id: taskId, idempotency_key: "run-0001", summary: "password: hunter2hunter2" } });
    expect(bad.isError).toBe(true);
    const handed = text(await client.callTool({ name: "submit_result",
      arguments: { task_id: taskId, idempotency_key: "run-0001", summary: "Wrote the guide.", evidence: ["docs/bridge.md"] } }));
    expect(handed.status).toBe("done");
    await client.close();

    await drain(); // REEDS does not verify an AI client's work itself
    expect((await admin.query("select status from public.work_tasks where id = $1", [taskId])).rows[0].status).toBe("done");
    expect((await admin.query("select status from public.work_requests where id = $1", [requestId])).rows[0].status).toBe("running");

    await as(ADMIN, "select public.review_work_task($1, true, 'Read it; it covers all three.')", [taskId]);
    await drain();
    const req = (await admin.query("select status, report from public.work_requests where id = $1", [requestId])).rows[0];
    expect(req.status).toBe("completed");
    expect(req.report.lines[0].text).toContain("Wrote the guide.");
  });

  it("never writes the token to the logs", () => {
    expect(logs.length).toBeGreaterThan(0);
    expect(JSON.stringify(logs)).not.toContain(token);
  });

  it("connects as a role that can read no table", async () => {
    await expect(bridgePool.query("select * from public.work_tasks")).rejects.toThrow(/permission denied/);
  });
});
