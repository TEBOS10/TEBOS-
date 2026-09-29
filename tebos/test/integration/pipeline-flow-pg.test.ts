// The client pipeline against the real TEBOS schema: one enquiry becomes a
// screened opportunity, is approved by sales, pays through a (stand-in)
// Paystack page confirmed by a signed webhook, receives and accepts its
// contract, and is onboarded with an organisation and an invitation. The
// payment provider and email are stand-ins; the database and its guards are real.
import { createHmac } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { EmailConnector, EmailSend, SendResult } from "../../src/execution/provider";
import { PgPipelineStore } from "../../src/pipeline/pg-store";
import type { PaymentGateway, PaymentPageRequest } from "../../src/pipeline/paystack";
import { handlePaystackWebhook } from "../../src/pipeline/paystack-webhook";
import { PipelineWorker } from "../../src/pipeline/worker";
import { sha256 } from "../../src/pipeline/contract";

const enabled = process.env.TEBOS_TEST_DB === "1";
const ADMIN = "90000000-0000-0000-0000-00000000000a";
const SALES = "90000000-0000-0000-0000-00000000000b";
const MAINT = "90000000-0000-0000-0000-00000000000c";
const SECRET = "sk_test_pipeline";

class FakeGateway implements PaymentGateway {
  requests: PaymentPageRequest[] = [];
  async createPaymentPage(req: PaymentPageRequest) {
    this.requests.push(req);
    return { ok: true as const, url: `https://checkout.paystack.test/${req.reference}`, reference: req.reference };
  }
}

class FakeEmail implements EmailConnector {
  readonly key = "resend";
  readonly provider = "Resend";
  readonly deliveryReadScope = "emails:read";
  sends: EmailSend[] = [];
  next: SendResult[] = [];
  async verify() { return { ok: true as const, scopes: [], detail: "" }; }
  async sendEmail(_k: string, send: EmailSend): Promise<SendResult> {
    this.sends.push(send);
    return this.next.shift() ?? { outcome: "accepted", providerReference: `msg_${this.sends.length}` };
  }
  async getDelivery() { return { state: "pending" as const, providerStatus: "sent", detail: null }; }
}

describe.skipIf(!enabled)("client pipeline against the TEBOS schema", () => {
  let pool: pg.Pool;
  let store: PgPipelineStore;
  const gateway = new FakeGateway();
  const email = new FakeEmail();
  let worker: PipelineWorker;

  async function as<T = pg.QueryResult>(user: string | null, sql: string, params: unknown[] = []): Promise<T> {
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query(user ? "set local role authenticated" : "set local role anon");
      if (user) await c.query("select set_config('request.jwt.claim.sub', $1, true)", [user]);
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

  const status = async (id: string) => (await pool.query("select status from public.opportunities where id = $1", [id])).rows[0].status;
  const linkIn = (subject: string) => {
    const m = email.sends.find((s) => s.input.subject.includes(subject))!;
    return /https?:\/\/\S+/.exec(m.input.text)![0];
  };

  beforeAll(async () => {
    pool = new pg.Pool();
    store = new PgPipelineStore(pool, "pipeline-worker:it");
    worker = new PipelineWorker(store, gateway, { siteUrl: "https://tebos.test", email: { connector: email, apiKey: "re_test", from: "TEBOS <hello@tebos.test>", replyTo: "team@tebos.test" } });
    await pool.query("insert into auth.users (id, email, email_confirmed_at) values ($1, 'admin@tebos.it', now()), ($2, 'sales@tebos.it', now()), ($3, 'maint@tebos.it', now())", [ADMIN, SALES, MAINT]);
    await pool.query("insert into public.platform_admins (user_id) values ($1)", [ADMIN]);
    await pool.query("insert into public.platform_staff (user_id, role) values ($1, 'sales'), ($2, 'maintainer')", [SALES, MAINT]);
    // drain enquiries other test files left behind, so this test's enquiry is the next one
    while (await store.nextNewEnquiry()) await worker.runOnce();
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("takes one client from enquiry to onboarded, never skipping a step", async () => {
    await as(null, "insert into public.enquiries (plan, name, business, email, website, message) values ('starter', 'Thandi Mokoena', 'Northwind Studio', 'Thandi@Northwind.co.za', 'northwind.co.za', 'We need structure')");

    // screened on arrival
    const opened = await worker.runOnce();
    expect(opened).toMatchObject({ step: "open", flags: 0 });
    const id = (opened as { id: string }).id;
    expect(await status(id)).toBe("screened");
    expect(await worker.runOnce()).toBeNull(); // nothing more happens until a person decides

    // sales approves and assigns a maintainer
    await as(SALES, "update public.opportunities set status = 'approved', maintainer_id = $2 where id = $1", [id, MAINT]);

    // payment page, emailed from the outbox
    expect(await worker.runOnce()).toMatchObject({ step: "payment", outcome: "linked" });
    expect(gateway.requests[0]).toMatchObject({ email: "thandi@northwind.co.za", amountCents: 250000, reference: `tebos-${id}`, callbackUrl: "https://tebos.test/paid" });
    expect(await status(id)).toBe("awaiting_payment");
    expect(await worker.runOnce()).toMatchObject({ step: "email", outcome: "sent" });
    expect(email.sends[0]!.input.text).toContain(`https://checkout.paystack.test/tebos-${id}`);

    // nothing moves on a forged confirmation; a signed one records the payment and marks it paid
    const body = JSON.stringify({ event: "charge.success", data: { id: 1, reference: `tebos-${id}`, status: "success", amount: 250000, currency: "ZAR", paid_at: new Date().toISOString() } });
    expect((await handlePaystackWebhook(store, SECRET, "a".repeat(128), body)).status).toBe(401);
    expect(await status(id)).toBe("awaiting_payment");
    const sig = createHmac("sha512", SECRET).update(body).digest("hex");
    expect(await handlePaystackWebhook(store, SECRET, sig, body)).toEqual({ status: 200, body: "paid" });
    expect(await handlePaystackWebhook(store, SECRET, sig, body)).toEqual({ status: 200, body: "already recorded" });
    expect(await status(id)).toBe("paid");

    // no contract until a lawyer-approved template exists
    expect(await worker.runOnce()).toBeNull();
    await as(ADMIN, "insert into public.contract_templates (key, version, plan, title, body) values ('diagnostic', 1, 'starter', 'TEBOS Diagnostic agreement', $1)",
      ["Agreement {{reference}} between TEBOS and {{business}}, for {{contact_name}}.\n{{plan_name}}: {{monthly_fee}}\n{{deliverables}}"]);
    expect(await worker.runOnce()).toBeNull();
    await as(ADMIN, "update public.contract_templates set status = 'approved', approval_note = 'Approved by our attorney' where key = 'diagnostic'");
    expect(await worker.runOnce()).toMatchObject({ step: "contract", outcome: "sent" });
    expect(await status(id)).toBe("contract_sent");
    expect(await worker.runOnce()).toMatchObject({ step: "email", outcome: "sent" });

    // the client reads and accepts it with the link, without an account
    const token = linkIn("agreement").split("/contract/")[1]!;
    const shown = (await as(null, "select * from public.contract_for_token($1)", [token])).rows[0];
    expect(shown.body).toContain("between TEBOS and Northwind Studio, for Thandi Mokoena");
    expect(shown.body).toContain("R2,500 per month, excluding VAT");
    await as(null, "select public.accept_contract($1, 'Thandi Mokoena', $2)", [token, sha256(shown.body)]);
    expect(await status(id)).toBe("contracted");

    // onboarded: an organisation, an invitation for the client's admin, and their maintainer on board
    const onboarded = await worker.runOnce();
    expect(onboarded).toMatchObject({ step: "onboard" });
    const orgId = (onboarded as { orgId: string }).orgId;
    expect(await status(id)).toBe("onboarded");
    const inv = (await pool.query("select email, role, status from public.invitations where org_id = $1", [orgId])).rows;
    expect(inv).toEqual([{ email: "thandi@northwind.co.za", role: "org_admin", status: "pending" }]);
    expect((await pool.query("select role from public.memberships where org_id = $1 and user_id = $2", [orgId, MAINT])).rows).toEqual([{ role: "operator" }]);
    expect(await worker.runOnce()).toMatchObject({ step: "email", outcome: "sent" });
    expect(linkIn("account is ready")).toMatch(/^https:\/\/tebos\.test\/invite\/[A-Za-z0-9_-]+$/);

    // the invitation link works: the token's fingerprint is what's stored
    const invToken = linkIn("account is ready").split("/invite/")[1]!;
    expect((await pool.query("select count(*)::int as n from public.invitations where token_hash = $1", [sha256(invToken)])).rows[0].n).toBe(1);

    // staff see the emails went out, but never the links in them
    await expect(as(SALES, "select body from public.outbox_emails where opportunity_id = $1", [id])).rejects.toThrow(/permission denied/);
    const sent = (await as<pg.QueryResult>(SALES, "select kind, sent_at is not null as sent from public.outbox_emails where opportunity_id = $1 order by created_at", [id])).rows;
    expect(sent).toEqual([{ kind: "payment_link", sent: true }, { kind: "contract", sent: true }, { kind: "invitation", sent: true }]);
  });

  it("retries a failed email and gives up after five attempts, keeping the error", async () => {
    await as(null, "insert into public.enquiries (plan, name, business, email, website) values ('growth', 'Ayo', 'Retry Co', 'ayo@retry.co.za', 'retry.co.za')");
    const id = ((await worker.runOnce()) as { id: string }).id;
    await as(SALES, "update public.opportunities set status = 'approved' where id = $1", [id]);
    await worker.runOnce(); // payment link
    email.next.push({ outcome: "rejected", errorClass: "integration", detail: "domain not verified", credentialProblem: false });
    expect(await worker.runOnce()).toMatchObject({ step: "email", outcome: "retry", detail: "domain not verified" });
    expect(await worker.runOnce()).toBeNull(); // not due again for five minutes
    await pool.query("update public.outbox_emails set last_try = now() - interval '6 minutes', attempts = 4 where opportunity_id = $1", [id]);
    email.next.push({ outcome: "unknown", detail: "timeout" });
    expect(await worker.runOnce()).toMatchObject({ step: "email", outcome: "failed", detail: "timeout" });
    const row = (await pool.query("select attempts, sent_at, error from public.outbox_emails where opportunity_id = $1", [id])).rows[0];
    expect(row).toEqual({ attempts: 5, sent_at: null, error: "timeout" });
  });
});
