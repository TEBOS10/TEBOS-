import { createHmac, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { deliveryStateOf, parseResendWebhook, ResendConnector, verifyResendSignature } from "../../src/execution/resend";

type Call = { url: string; init: RequestInit };
function fakeFetch(responses: Array<{ status: number; body?: unknown } | Error>) {
  const calls: Call[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (!next) throw new Error("no more responses");
    if (next instanceof Error) throw next;
    return new Response(next.body === undefined ? "" : JSON.stringify(next.body), { status: next.status });
  }) as unknown as typeof fetch;
  return { f, calls };
}

const input = { to: ["buyer@clay.test"], subject: "Order received", text: "Thanks", replyTo: null };

describe("Resend connector", () => {
  it("verifies a full-access key and a send-only key, and refuses a bad one", async () => {
    const { f, calls } = fakeFetch([
      { status: 200, body: { data: [] } },
      { status: 401, body: { name: "restricted_api_key", message: "This API key is restricted to only send emails" } },
      { status: 403, body: { name: "invalid_api_key", message: "API key is invalid" } },
      new Error("getaddrinfo ENOTFOUND"),
    ]);
    const c = new ResendConnector({ fetch: f });
    expect(await c.verify("re_full")).toMatchObject({ ok: true, scopes: ["emails:send", "emails:read", "domains:read"] });
    expect(await c.verify("re_send")).toMatchObject({ ok: true, scopes: ["emails:send"] });
    expect(await c.verify("re_bad")).toMatchObject({ ok: false, status: "authentication_required" });
    expect(await c.verify("re_x")).toMatchObject({ ok: false, status: "unavailable" });
    expect(calls[0]!.url).toBe("https://api.resend.com/domains");
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe("Bearer re_full");
  });

  it("sends with the idempotency key and reads the message id", async () => {
    const { f, calls } = fakeFetch([{ status: 200, body: { id: "msg_1" } }]);
    const r = await new ResendConnector({ fetch: f }).sendEmail("re_k", { from: "Clay <o@clay.test>", input, idempotencyKey: "tebos:a:b" });
    expect(r).toEqual({ outcome: "accepted", providerReference: "msg_1" });
    expect((calls[0]!.init.headers as Record<string, string>)["idempotency-key"]).toBe("tebos:a:b");
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ from: "Clay <o@clay.test>", to: ["buyer@clay.test"], subject: "Order received", text: "Thanks" });
  });

  it("never calls an ambiguous answer success or failure", async () => {
    const { f } = fakeFetch([
      new Error("socket hang up"),
      { status: 500, body: { message: "Internal" } },
      { status: 429, body: { name: "rate_limit_exceeded" } },
      { status: 409, body: { name: "concurrent_idempotent_requests" } },
      { status: 200, body: {} },
    ]);
    const c = new ResendConnector({ fetch: f });
    for (let i = 0; i < 5; i++) expect((await c.sendEmail("k", { from: "o@clay.test", input, idempotencyKey: "k" })).outcome).toBe("unknown");
  });

  it("classifies refusals, flagging the ones that mean the key is wrong", async () => {
    const { f } = fakeFetch([
      { status: 422, body: { name: "validation_error", message: "Invalid `to` field" } },
      { status: 403, body: { name: "validation_error", message: "The clay.test domain is not verified" } },
      { status: 401, body: { name: "missing_api_key" } },
      { status: 409, body: { name: "invalid_idempotent_request" } },
    ]);
    const c = new ResendConnector({ fetch: f });
    const send = () => c.sendEmail("k", { from: "o@clay.test", input, idempotencyKey: "k" });
    expect(await send()).toMatchObject({ outcome: "rejected", errorClass: "validation", credentialProblem: false });
    expect(await send()).toMatchObject({ outcome: "rejected", errorClass: "permission", credentialProblem: false, detail: expect.stringContaining("not verified") });
    expect(await send()).toMatchObject({ outcome: "rejected", errorClass: "permission", credentialProblem: true });
    expect(await send()).toMatchObject({ outcome: "rejected", errorClass: "integration" });
  });

  it("maps delivery status", async () => {
    const { f } = fakeFetch([{ status: 200, body: { last_event: "delivered" } }, { status: 200, body: { last_event: "bounced" } }, { status: 401, body: { name: "restricted_api_key" } }]);
    const c = new ResendConnector({ fetch: f });
    expect(await c.getDelivery("k", "msg_1")).toEqual({ state: "delivered", providerStatus: "delivered", detail: null });
    expect(await c.getDelivery("k", "msg_1")).toMatchObject({ state: "failed", providerStatus: "bounced" });
    expect(await c.getDelivery("k", "msg_1")).toMatchObject({ state: "unknown" });
    expect(deliveryStateOf("opened")).toBe("delivered");
    expect(deliveryStateOf("delivery_delayed")).toBe("pending");
  });
});

describe("Resend webhooks", () => {
  const key = randomBytes(24);
  const secret = `whsec_${key.toString("base64")}`;
  const body = JSON.stringify({ type: "email.delivered", created_at: "2026-09-24T20:00:00Z", data: { email_id: "msg_1" } });
  const now = new Date("2026-09-24T20:00:30Z");
  const ts = String(Math.floor(now.getTime() / 1000));
  const sign = (id: string, t: string, b: string) => `v1,${createHmac("sha256", key).update(`${id}.${t}.${b}`).digest("base64")}`;

  it("accepts a correctly signed, fresh event", () => {
    expect(verifyResendSignature(secret, { id: "evt_1", timestamp: ts, signature: `v1,bogus ${sign("evt_1", ts, body)}` }, body, now)).toBe(true);
  });

  it("rejects tampering, replays from long ago, and missing headers", () => {
    expect(verifyResendSignature(secret, { id: "evt_1", timestamp: ts, signature: sign("evt_1", ts, body) }, body.replace("msg_1", "msg_2"), now)).toBe(false);
    expect(verifyResendSignature(secret, { id: "evt_2", timestamp: ts, signature: sign("evt_1", ts, body) }, body, now)).toBe(false);
    const old = String(Number(ts) - 3600);
    expect(verifyResendSignature(secret, { id: "evt_1", timestamp: old, signature: sign("evt_1", old, body) }, body, now)).toBe(false);
    expect(verifyResendSignature(secret, { id: "evt_1", timestamp: ts, signature: null }, body, now)).toBe(false);
    expect(verifyResendSignature(`whsec_${randomBytes(24).toString("base64")}`, { id: "evt_1", timestamp: ts, signature: sign("evt_1", ts, body) }, body, now)).toBe(false);
  });

  it("reduces an event to what TEBOS records", () => {
    expect(parseResendWebhook("evt_1", body)).toEqual({ eventId: "evt_1", eventType: "email.delivered", providerReference: "msg_1", delivery: { state: "delivered", providerStatus: "delivered", detail: null } });
    const bounced = JSON.stringify({ type: "email.bounced", data: { email_id: "msg_1", bounce: { message: "Mailbox does not exist" } } });
    expect(parseResendWebhook("evt_2", bounced)?.delivery).toEqual({ state: "failed", providerStatus: "bounced", detail: "Mailbox does not exist" });
    expect(parseResendWebhook("evt_3", JSON.stringify({ type: "contact.created", data: {} }))?.delivery).toBeNull();
    expect(parseResendWebhook("evt_4", "not json")).toBeNull();
  });
});
