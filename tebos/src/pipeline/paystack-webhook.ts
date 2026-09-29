// Paystack telling TEBOS a payment went through. Only a correctly signed
// event counts; the payment is recorded once (a replay changes nothing) and
// moves the opportunity to "paid" only if the full amount arrived in Rand.
//
//   POST /webhooks/paystack        header: x-paystack-signature
//
// 2xx = done (Paystack stops retrying), 401/400 = refused, 5xx = retry later.

import { parsePaystackEvent, verifyPaystackSignature } from "./paystack";
import type { WebhookResponse } from "../execution/webhooks";

export interface PaystackWebhookStore {
  opportunityForReference(reference: string): Promise<{ id: string; amountCents: number | null; status: string } | null>;
  /** Records a confirmed payment; false when this reference was already recorded. */
  recordProviderPayment(opportunityId: string, p: { reference: string; amountCents: number; paidAt: string; raw: unknown }): Promise<boolean>;
  /** Moves an opportunity awaiting payment to paid (the database checks the payment covers it). */
  markPaid(opportunityId: string): Promise<boolean>;
}

export async function handlePaystackWebhook(
  store: PaystackWebhookStore,
  secretKey: string,
  signature: string | null,
  rawBody: string,
  log: (e: Record<string, unknown>) => void = () => {},
): Promise<WebhookResponse> {
  if (!verifyPaystackSignature(secretKey, rawBody, signature)) return { status: 401, body: "invalid signature" };
  const charge = parsePaystackEvent(rawBody);
  if (!charge) return { status: 400, body: "unreadable event" };
  if (charge.event !== "charge.success" || charge.status !== "success") return { status: 200, body: "ignored" };

  const o = await store.opportunityForReference(charge.reference);
  if (!o) {
    log({ event: "paystack.unknown_reference", reference: charge.reference });
    return { status: 200, body: "unknown reference" };
  }
  if (charge.currency !== "ZAR") {
    log({ event: "paystack.wrong_currency", opportunityId: o.id, currency: charge.currency });
    return { status: 200, body: "not recorded: not in ZAR" };
  }
  const fresh = await store.recordProviderPayment(o.id, {
    reference: charge.reference,
    amountCents: charge.amountCents,
    paidAt: charge.paidAt ?? new Date().toISOString(),
    raw: JSON.parse(rawBody),
  });
  const full = o.amountCents !== null && charge.amountCents >= o.amountCents;
  const moved = full && o.status === "awaiting_payment" ? await store.markPaid(o.id) : false;
  log({ event: "paystack.payment", opportunityId: o.id, fresh, full, moved });
  return { status: 200, body: fresh ? (moved ? "paid" : full ? "recorded" : "recorded: less than the amount due") : "already recorded" };
}
