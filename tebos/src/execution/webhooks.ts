// Inbound provider webhooks: the provider telling TEBOS what happened to an
// email. Only a correctly signed, fresh event for a known run changes
// anything, and a replayed event is recorded once.
//
//   POST /webhooks/resend/<connection id>
//
// The connection id in the path selects the signing secret; the signature
// is the authentication. Responses follow the sender's retry semantics:
// 2xx = done, 4xx = don't retry, 5xx = retry later.

import { createServer, type IncomingMessage, type Server } from "node:http";
import { parseResendWebhook, verifyResendSignature } from "./resend";
import type { DeliveryResult } from "./provider";

export interface WebhookStore {
  webhookTarget(connectionId: string): Promise<{ orgId: string; connectorKey: string; secret: string | null } | null>;
  runForProviderReference(connectionId: string, providerReference: string): Promise<string | null>;
  recordDelivery(runId: string, connectorKey: string, provider: string, delivery: Exclude<DeliveryResult, { state: "unknown" }>): Promise<void>;
  recordIntegrationEvent(orgId: string, connectionId: string, eventId: string, eventType: string, summary: Record<string, unknown>): Promise<boolean>;
}

export interface WebhookResponse {
  status: number;
  body: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** An event for a send TEBOS hasn't finished recording yet is retried for this long. */
const UNMATCHED_RETRY_S = 10 * 60;

export async function handleResendWebhook(
  store: WebhookStore,
  connectionId: string,
  headers: { id?: string | null; timestamp?: string | null; signature?: string | null },
  rawBody: string,
  now: Date = new Date(),
): Promise<WebhookResponse> {
  if (!UUID.test(connectionId)) return { status: 404, body: "unknown connection" };
  const target = await store.webhookTarget(connectionId);
  if (!target || target.connectorKey !== "resend") return { status: 404, body: "unknown connection" };
  if (!target.secret) return { status: 409, body: "no signing secret is set for this connection" };
  if (!verifyResendSignature(target.secret, headers, rawBody, now)) return { status: 401, body: "invalid signature" };

  const event = parseResendWebhook(headers.id!, rawBody);
  if (!event) return { status: 400, body: "unreadable event" };

  let matched = false;
  if (event.delivery && event.providerReference) {
    const runId = await store.runForProviderReference(connectionId, event.providerReference);
    if (!runId && now.getTime() / 1000 - Number(headers.timestamp) < UNMATCHED_RETRY_S) {
      return { status: 503, body: "send not recorded yet; retry" };
    }
    if (runId) {
      await store.recordDelivery(runId, "resend", "Resend", event.delivery);
      matched = true;
    }
  }
  const fresh = await store.recordIntegrationEvent(target.orgId, connectionId, event.eventId, event.eventType, {
    email_id: event.providerReference,
    provider_status: event.delivery?.providerStatus ?? null,
    matched,
  });
  return { status: 200, body: fresh ? "recorded" : "already recorded" };
}

const MAX_BODY = 256 * 1024;

function readBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        resolve(null);
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/** A minimal HTTP server: provider webhooks and a health check. Nothing else is exposed. */
export function createWebhookServer(store: WebhookStore, log: (e: Record<string, unknown>) => void = () => {}): Server {
  return createServer(async (req, res) => {
    const send = (status: number, body: string) => {
      res.writeHead(status, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
      res.end(body);
    };
    try {
      const url = new URL(req.url ?? "/", "http://worker.local");
      if (req.method === "GET" && url.pathname === "/health") return send(200, "ok");
      const m = /^\/webhooks\/resend\/([^/]+)$/.exec(url.pathname);
      if (!m) return send(404, "not found");
      if (req.method !== "POST") return send(405, "method not allowed");
      const body = await readBody(req);
      if (body === null) return send(413, "too large");
      const h = (name: string) => (req.headers[name] as string | undefined) ?? null;
      const out = await handleResendWebhook(store, m[1]!, { id: h("svix-id"), timestamp: h("svix-timestamp"), signature: h("svix-signature") }, body);
      log({ event: "webhook.resend", connectionId: m[1], status: out.status, detail: out.body });
      send(out.status, out.body);
    } catch (err) {
      log({ event: "webhook.error", detail: (err as Error).message });
      send(500, "error");
    }
  });
}
