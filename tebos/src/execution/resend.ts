// Resend (https://resend.com) transactional email connector.
//
//   verify       GET  /domains       200 → full access; 401 restricted_api_key → a valid send-only key
//   sendEmail    POST /emails        with an Idempotency-Key, so a retry can never send twice
//   getDelivery  GET  /emails/{id}   last_event → delivered / failed / pending
//   webhooks     Svix-signed events (email.delivered, email.bounced, ...)
//
// Only this file knows Resend's wire format. Network and timeouts are
// "unknown" outcomes, never success.

import { createHmac, timingSafeEqual } from "node:crypto";
import type { DeliveryResult, DeliveryState, EmailConnector, EmailSend, SendResult, VerifyResult, WebhookDelivery } from "./provider";

export const RESEND_API = "https://api.resend.com";
const TIMEOUT_MS = 15_000;
const USER_AGENT = "TEBOS/0.1 (+execution-worker)";

type Fetch = typeof fetch;

interface ResendError {
  statusCode?: number;
  name?: string;
  message?: string;
}

export const RESEND_SCOPES = {
  full: ["emails:send", "emails:read", "domains:read"],
  sendOnly: ["emails:send"],
} as const;

/** Resend's last_event (and webhook event) vocabulary, mapped to a delivery state. */
export function deliveryStateOf(event: string): DeliveryState {
  if (["delivered", "opened", "clicked"].includes(event)) return "delivered";
  if (["bounced", "complained", "failed", "canceled", "cancelled"].includes(event)) return "failed";
  return "pending";
}

export class ResendConnector implements EmailConnector {
  readonly key = "resend";
  readonly provider = "Resend";
  readonly deliveryReadScope = "emails:read";

  constructor(private readonly options: { fetch?: Fetch; baseUrl?: string } = {}) {}

  private async call(apiKey: string, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const f = this.options.fetch ?? fetch;
    try {
      const res = await f(`${this.options.baseUrl ?? RESEND_API}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${apiKey}`,
          "user-agent": USER_AGENT,
          ...(body ? { "content-type": "application/json" } : {}),
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: "error",
      });
      const text = await res.text();
      let json: unknown = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      return { kind: "response" as const, status: res.status, json };
    } catch (err) {
      return { kind: "network" as const, detail: (err as Error).name === "TimeoutError" ? "Resend did not answer in time" : `Could not reach Resend: ${(err as Error).message}` };
    }
  }

  async verify(apiKey: string): Promise<VerifyResult> {
    const r = await this.call(apiKey, "GET", "/domains");
    if (r.kind === "network") return { ok: false, status: "unavailable", detail: r.detail };
    const err = (r.json ?? {}) as ResendError;
    if (r.status === 200) return { ok: true, scopes: [...RESEND_SCOPES.full], detail: "Full-access key: sending and delivery checks" };
    if (r.status === 401 && err.name === "restricted_api_key") {
      return { ok: true, scopes: [...RESEND_SCOPES.sendOnly], detail: "Send-only key: delivery is confirmed by webhook only" };
    }
    if (r.status === 401 || r.status === 403) return { ok: false, status: "authentication_required", detail: `Resend refused the API key${err.message ? `: ${err.message}` : ""}` };
    return { ok: false, status: "unavailable", detail: `Resend answered HTTP ${r.status}${err.message ? `: ${err.message}` : ""}` };
  }

  async sendEmail(apiKey: string, send: EmailSend): Promise<SendResult> {
    const body = {
      from: send.from,
      to: send.input.to,
      subject: send.input.subject,
      text: send.input.text,
      ...(send.input.replyTo ? { reply_to: send.input.replyTo } : {}),
    };
    const r = await this.call(apiKey, "POST", "/emails", body, { "idempotency-key": send.idempotencyKey });
    if (r.kind === "network") return { outcome: "unknown", detail: r.detail };
    const json = (r.json ?? {}) as ResendError & { id?: string };
    if (r.status >= 200 && r.status < 300) {
      if (typeof json.id === "string" && json.id) return { outcome: "accepted", providerReference: json.id };
      return { outcome: "unknown", detail: "Resend answered without a message id" };
    }
    const why = json.message ? `: ${json.message}` : "";
    if (r.status === 429 || r.status >= 500 || json.name === "concurrent_idempotent_requests") {
      return { outcome: "unknown", detail: `Resend is busy or failing (HTTP ${r.status})${why}` };
    }
    if (r.status === 401 || (r.status === 403 && json.name === "invalid_api_key")) {
      return { outcome: "rejected", errorClass: "permission", detail: `Resend refused the API key${why}`, credentialProblem: true };
    }
    if (r.status === 403) return { outcome: "rejected", errorClass: "permission", detail: `Resend refused to send${why}`, credentialProblem: false };
    if (r.status === 409) return { outcome: "rejected", errorClass: "integration", detail: `Resend rejected the retry${why}`, credentialProblem: false };
    if (r.status === 400 || r.status === 422) return { outcome: "rejected", errorClass: "validation", detail: `Resend rejected the email${why}`, credentialProblem: false };
    return { outcome: "rejected", errorClass: "integration", detail: `Resend answered HTTP ${r.status}${why}`, credentialProblem: false };
  }

  async getDelivery(apiKey: string, providerReference: string): Promise<DeliveryResult> {
    const r = await this.call(apiKey, "GET", `/emails/${encodeURIComponent(providerReference)}`);
    if (r.kind === "network") return { state: "unknown", detail: r.detail };
    const json = (r.json ?? {}) as ResendError & { last_event?: string };
    if (r.status !== 200 || typeof json.last_event !== "string") {
      return { state: "unknown", detail: `Resend did not report a status (HTTP ${r.status}${json.message ? `: ${json.message}` : ""})` };
    }
    return { state: deliveryStateOf(json.last_event), providerStatus: json.last_event, detail: null };
  }
}

// ---------------------------------------------------------------------------
// Webhooks (Svix signing scheme, which Resend uses)
// ---------------------------------------------------------------------------

export const WEBHOOK_TOLERANCE_S = 5 * 60;

/**
 * True only for a correctly signed, fresh delivery. The signed content is
 * `${svix-id}.${svix-timestamp}.${raw body}`, HMAC-SHA256 with the base64
 * secret after its "whsec_" prefix; the header may carry several "v1,<sig>".
 */
export function verifyResendSignature(
  secret: string,
  headers: { id?: string | null; timestamp?: string | null; signature?: string | null },
  rawBody: string,
  now: Date = new Date(),
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature || !/^\d{1,12}$/.test(timestamp)) return false;
  if (Math.abs(now.getTime() / 1000 - Number(timestamp)) > WEBHOOK_TOLERANCE_S) return false;
  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  if (key.length === 0) return false;
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`).digest();
  return signature.split(" ").some((part) => {
    const [version, value] = part.split(",", 2);
    if (version !== "v1" || !value) return false;
    const given = Buffer.from(value, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

/** A verified webhook body, reduced to what TEBOS records. Unknown events are kept but change nothing. */
export function parseResendWebhook(eventId: string, rawBody: string): WebhookDelivery | null {
  let body: { type?: unknown; data?: { email_id?: unknown; bounce?: { message?: unknown } } };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return null;
  }
  if (typeof body?.type !== "string") return null;
  const providerReference = typeof body.data?.email_id === "string" ? body.data.email_id : null;
  const event = body.type.startsWith("email.") ? body.type.slice(6) : null;
  const tracked = event && ["sent", "delivered", "delivery_delayed", "bounced", "complained", "failed", "opened", "clicked"].includes(event);
  const bounce = typeof body.data?.bounce?.message === "string" ? body.data.bounce.message : null;
  return {
    eventId,
    eventType: body.type,
    providerReference,
    delivery: tracked && providerReference ? { state: deliveryStateOf(event), providerStatus: event, detail: bounce } : null,
  };
}
