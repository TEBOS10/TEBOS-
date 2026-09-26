// Stage 4 against the real TEBOS schema: a connection verified by the
// provider, an approved email sent exactly once, and the action verified
// only when the provider confirms delivery. The provider is a stand-in; the
// database, its guards, Vault (stubbed) and the audit trail are real.
import { createHmac, randomBytes } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PgExecutionStore } from "../../src/execution/pg-store";
import type { DeliveryResult, EmailConnector, EmailSend, SendResult, VerifyResult } from "../../src/execution/provider";
import { handleResendWebhook } from "../../src/execution/webhooks";
import { ExecutionWorker } from "../../src/execution/worker";

const enabled = process.env.TEBOS_TEST_DB === "1";
const ADMIN = "40000000-0000-0000-0000-00000000000a";
const OPERATOR = "40000000-0000-0000-0000-00000000000b";
const APPROVER = "40000000-0000-0000-0000-00000000000c";

class FakeResend implements EmailConnector {
  readonly key = "resend";
  readonly provider = "Resend";
  readonly deliveryReadScope = "emails:read";
  sends: Array<{ apiKey: string; send: EmailSend }> = [];
  sendResults: SendResult[] = [];
  delivery: DeliveryResult = { state: "pending", providerStatus: "sent", detail: null };
  verifyResult: VerifyResult = { ok: true, scopes: ["emails:send", "emails:read", "domains:read"], detail: "Full-access key" };
  async verify(): Promise<VerifyResult> {
    return this.verifyResult;
  }
  async sendEmail(apiKey: string, send: EmailSend): Promise<SendResult> {
    this.sends.push({ apiKey, send });
    return this.sendResults.shift() ?? { outcome: "accepted", providerReference: `msg_${this.sends.length}` };
  }
  async getDelivery(): Promise<DeliveryResult> {
    return this.delivery;
  }
}

describe.skipIf(!enabled)("provider execution against the TEBOS schema", () => {
  let pool: pg.Pool;
  let store: PgExecutionStore;
  const resend = new FakeResend();
  let worker: ExecutionWorker;
  let org: string, biz: string, finding: string, conn: string;
  const webhookKey = randomBytes(24);

  /** Run SQL as a signed-in user (their own session, subject to RLS). */
  async function asUser<T = pg.QueryResult>(user: string, sql: string, params: unknown[] = []): Promise<T> {
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

  async function approvedEmailAction(to: string): Promise<{ action: string; approval: string }> {
    const a = await asUser<pg.QueryResult>(OPERATOR,
      `insert into public.actions (org_id, business_id, finding_id, title, objective, risk_tier, approval_required, capability_key,
                                   execution_method, execution_input)
       values ($1, $2, $3, 'Confirm the order', 'Send a confirmation', 2, true, 'email.send_transactional', 'api', $4) returning id`,
      [org, biz, finding, { to: [to], subject: "Order received", text: "Thank you for your order." }]);
    const action = a.rows[0].id;
    await asUser(OPERATOR, "update public.actions set status = 'ready' where id = $1", [action]);
    const ap = await asUser<pg.QueryResult>(OPERATOR,
      "insert into public.approvals (org_id, action_id, requested_operation, risk_tier) values ($1, $2, 'Confirm the order', 2) returning id", [org, action]);
    await asUser(APPROVER, "update public.approvals set status = 'approved' where id = $1", [ap.rows[0].id]);
    await asUser(OPERATOR, "update public.actions set status = 'queued' where id = $1", [action]);
    return { action, approval: ap.rows[0].id };
  }

  const row = async (sql: string, params: unknown[]) => (await pool.query(sql, params)).rows[0];

  beforeAll(async () => {
    pool = new pg.Pool({ max: 3 });
    store = new PgExecutionStore(pool, "it");
    worker = new ExecutionWorker(store, [resend], { workerId: "it", sleep: async () => {} });
    await pool.query("insert into auth.users (id, email, email_confirmed_at) values ($1, 'a@x.test', now()), ($2, 'o@x.test', now()), ($3, 'p@x.test', now())",
      [ADMIN, OPERATOR, APPROVER]);
    org = (await asUser<pg.QueryResult>(ADMIN, "select public.create_organisation('Execution IT', 'execution-it') as id")).rows[0].id;
    await asUser(ADMIN, "insert into public.memberships (org_id, user_id, role) values ($1, $2, 'operator'), ($1, $3, 'approver')", [org, OPERATOR, APPROVER]);
    biz = (await asUser<pg.QueryResult>(OPERATOR, "insert into public.businesses (org_id, name) values ($1, 'Clay') returning id", [org])).rows[0].id;
    const src = (await pool.query("insert into public.sources (org_id, business_id, source_type) values ($1, $2, 'user_statement') returning id", [org, biz])).rows[0].id;
    const ev = (await pool.query("insert into public.evidence (org_id, business_id, source_id, state, fact) values ($1, $2, $3, 'user_supplied', 'No order confirmations are sent') returning id",
      [org, biz, src])).rows[0].id;
    const c = await pool.connect();
    await c.query("begin");
    await c.query("set constraints all deferred");
    finding = (await c.query("insert into public.findings (org_id, business_id, title, statement, category, confidence, status) values ($1, $2, 'No confirmations', 'x', 'gap', 0.6, 'active') returning id",
      [org, biz])).rows[0].id;
    await c.query("insert into public.finding_evidence (org_id, business_id, finding_id, evidence_id) values ($1, $2, $3, $4)", [org, biz, finding, ev]);
    await c.query("commit");
    c.release();

    conn = (await asUser<pg.QueryResult>(ADMIN, "insert into public.connection_instances (org_id, connector_key, settings) values ($1, 'resend', $2) returning id",
      [org, { from: "Clay Studio <orders@clay.test>" }])).rows[0].id;
    await asUser(ADMIN, "select public.set_connection_secret($1, 'api_key', 're_test_key_123')", [conn]);
    await asUser(ADMIN, "select public.set_connection_secret($1, 'webhook_signing_secret', $2)", [conn, `whsec_${webhookKey.toString("base64")}`]);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("verifies the connection with the provider before anything is sent", async () => {
    expect(await worker.runOnce()).toMatchObject({ kind: "verified_connection", ok: true });
    const c = await row("select * from public.connection_instances where id = $1", [conn]);
    expect(c).toMatchObject({ status: "connected", granted_scopes: ["emails:send", "emails:read", "domains:read"], failure_detail: null });
    expect(c.last_verified_at).not.toBeNull();
    expect(await worker.verifyOnce()).toBeNull(); // not re-verified until asked or due
  });

  let first: { action: string; approval: string };
  it("sends an approved email once, with the vault key and the approval as idempotency key", async () => {
    first = await approvedEmailAction("buyer@clay.test");
    const report = await worker.runOnce();
    expect(report).toMatchObject({ kind: "sent", outcome: "accepted", detail: "msg_1" });
    expect(resend.sends[0]).toMatchObject({
      apiKey: "re_test_key_123",
      send: { from: "Clay Studio <orders@clay.test>", idempotencyKey: `tebos:${first.action}:${first.approval}`, input: { to: ["buyer@clay.test"] } },
    });
    expect(await row("select status, result from public.actions where id = $1", [first.action])).toMatchObject({ status: "completed", result: expect.stringContaining("Waiting for Resend") });
    expect(await row("select status from public.approvals where id = $1", [first.approval])).toEqual({ status: "consumed" });
    const run = await row("select * from public.action_runs where action_id = $1", [first.action]);
    expect(run).toMatchObject({ status: "succeeded", execution_method: "api", provider_reference: "msg_1", verified: false, connection_instance_id: conn });
    expect(run.request_summary).toMatchObject({ to: ["buyer@clay.test"], subject: "Order received" });
    const actors = await pool.query("select distinct actor_type, actor_id from public.audit_events where entity_id = $1", [run.id]);
    expect(actors.rows).toEqual([{ actor_type: "agent", actor_id: "execution-worker:it" }]);
  });

  it("verifies the action only when the provider confirms delivery", async () => {
    expect(await worker.confirmOnce()).toBeNull(); // too soon to ask
    await pool.query("update public.action_runs set provider_status_at = now() - interval '2 minutes', finished_at = now() - interval '2 minutes' where action_id = $1", [first.action]);
    resend.delivery = { state: "pending", providerStatus: "sent", detail: null };
    expect(await worker.confirmOnce()).toMatchObject({ kind: "delivery", state: "pending" });
    expect(await row("select status from public.actions where id = $1", [first.action])).toEqual({ status: "completed" });

    await pool.query("update public.action_runs set provider_status_at = now() - interval '2 minutes' where action_id = $1", [first.action]);
    resend.delivery = { state: "delivered", providerStatus: "delivered", detail: null };
    expect(await worker.confirmOnce()).toMatchObject({ state: "delivered" });
    expect(await row("select status, verification_status from public.actions where id = $1", [first.action])).toEqual({ status: "verified", verification_status: "verified" });
    expect(await row("select verified, verification_method, provider_status from public.action_runs where action_id = $1", [first.action])).toEqual({
      verified: true, verification_method: "provider:resend:delivered", provider_status: "delivered",
    });
  });

  it("retries an ambiguous send with the same key, so the provider can't send twice", async () => {
    const { action, approval } = await approvedEmailAction("second@clay.test");
    resend.sendResults = [{ outcome: "unknown", detail: "timeout" }, { outcome: "unknown", detail: "timeout" }, { outcome: "unknown", detail: "timeout" }];
    const before = resend.sends.length;
    expect(await worker.executeOnce()).toMatchObject({ outcome: "unknown" });
    expect(resend.sends.length - before).toBe(3);
    expect(await row("select status from public.actions where id = $1", [action])).toEqual({ status: "running" });
    expect(await worker.resumeOnce()).toBeNull(); // leased for 5 minutes

    await pool.query("update public.action_runs set response_summary = response_summary || jsonb_build_object('last_attempt_at', now() - interval '10 minutes') where action_id = $1", [action]);
    expect(await worker.resumeOnce()).toMatchObject({ outcome: "accepted" });
    const keys = resend.sends.slice(before).map((s) => s.send.idempotencyKey);
    expect(new Set(keys)).toEqual(new Set([`tebos:${action}:${approval}`]));
    expect(await row("select count(*)::int as n from public.action_runs where action_id = $1", [action])).toEqual({ n: 1 });
    expect(await row("select status from public.actions where id = $1", [action])).toEqual({ status: "completed" });
  });

  it("a signed bounce webhook fails the action; a replay changes nothing", async () => {
    const { action } = await approvedEmailAction("bounce@clay.test");
    resend.sendResults = [{ outcome: "accepted", providerReference: "msg_bounce" }];
    await worker.executeOnce();
    const body = JSON.stringify({ type: "email.bounced", data: { email_id: "msg_bounce", bounce: { message: "Mailbox does not exist" } } });
    const ts = String(Math.floor(Date.now() / 1000));
    const headers = { id: "evt_bounce", timestamp: ts, signature: `v1,${createHmac("sha256", webhookKey).update(`evt_bounce.${ts}.${body}`).digest("base64")}` };

    expect(await handleResendWebhook(store, conn, { ...headers, signature: "v1,forged" }, body)).toMatchObject({ status: 401 });
    expect(await row("select status from public.actions where id = $1", [action])).toEqual({ status: "completed" });

    expect(await handleResendWebhook(store, conn, headers, body)).toEqual({ status: 200, body: "recorded" });
    expect(await row("select status, verification_status, result from public.actions where id = $1", [action])).toEqual({
      status: "failed", verification_status: "verification_failed", result: "Resend reports the email bounced: Mailbox does not exist.",
    });
    expect(await handleResendWebhook(store, conn, headers, body)).toEqual({ status: 200, body: "already recorded" });
    expect(await row("select count(*)::int as n from public.integration_events where provider_event_id = 'evt_bounce'", [])).toEqual({ n: 1 });

    // an event for a send TEBOS hasn't recorded yet is retried later rather than lost
    const early = JSON.stringify({ type: "email.delivered", data: { email_id: "msg_not_yet" } });
    const sig = `v1,${createHmac("sha256", webhookKey).update(`evt_early.${ts}.${early}`).digest("base64")}`;
    expect(await handleResendWebhook(store, conn, { id: "evt_early", timestamp: ts, signature: sig }, early)).toMatchObject({ status: 503 });
  });

  it("a refused key fails the run and marks the connection as needing authentication", async () => {
    const { action } = await approvedEmailAction("third@clay.test");
    resend.sendResults = [{ outcome: "rejected", errorClass: "permission", detail: "Resend refused the API key", credentialProblem: true }];
    expect(await worker.executeOnce()).toMatchObject({ outcome: "rejected" });
    expect(await row("select status, result from public.actions where id = $1", [action])).toEqual({ status: "failed", result: "Resend refused the API key" });
    expect(await row("select status, error_class from public.action_runs where action_id = $1", [action])).toEqual({ status: "failed", error_class: "permission" });
    expect(await row("select status, failure_detail from public.connection_instances where id = $1", [conn])).toEqual({
      status: "authentication_required", failure_detail: "Resend refused the API key",
    });
  });

  it("blocks, with the reason, when no provider can run the action", async () => {
    const { action } = await approvedEmailAction("fourth@clay.test");
    expect(await worker.executeOnce()).toMatchObject({ kind: "blocked", reason: expect.stringContaining("Resend connection is authentication_required") });
    expect(await row("select status, blocked_reason from public.actions where id = $1", [action])).toMatchObject({ status: "blocked" });
    expect(await row("select count(*)::int as n from public.action_runs where action_id = $1", [action])).toEqual({ n: 0 });
  });

  it("a failed verification is recorded honestly and not retried until asked", async () => {
    await asUser(ADMIN, "update public.connection_instances set verification_requested_at = now() where id = $1", [conn]);
    resend.verifyResult = { ok: false, status: "authentication_required", detail: "Resend refused the API key: API key is invalid" };
    expect(await worker.verifyOnce()).toMatchObject({ ok: false });
    expect(await row("select status, failure_detail from public.connection_instances where id = $1", [conn])).toEqual({
      status: "authentication_required", failure_detail: "Resend refused the API key: API key is invalid",
    });
    expect(await worker.verifyOnce()).toBeNull();
  });
});
