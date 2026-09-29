// Paystack: a payment page for each approved client, and Paystack's signed
// word that a payment went through. TEBOS never takes card details itself;
// the client pays on Paystack's own page.
//
//   POST https://api.paystack.co/transaction/initialize   (secret key)
//   webhook: x-paystack-signature = HMAC-SHA512(secret key, raw body), hex
//
// Amounts are in the currency's subunit (cents for ZAR).

import { createHmac, timingSafeEqual } from "node:crypto";

export interface PaymentLink {
  ok: true;
  url: string;
  reference: string;
}
export type LinkResult = PaymentLink | { ok: false; retry: boolean; detail: string };

export interface PaymentPageRequest {
  email: string;
  amountCents: number;
  reference: string;
  callbackUrl: string;
  metadata: Record<string, string>;
}

export interface PaymentGateway {
  createPaymentPage(req: PaymentPageRequest): Promise<LinkResult>;
}

export class PaystackGateway implements PaymentGateway {
  constructor(
    private readonly secretKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly base = "https://api.paystack.co",
  ) {}

  async createPaymentPage(req: PaymentPageRequest): Promise<LinkResult> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.base}/transaction/initialize`, {
        method: "POST",
        headers: { authorization: `Bearer ${this.secretKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          email: req.email,
          amount: req.amountCents,
          currency: "ZAR",
          reference: req.reference,
          callback_url: req.callbackUrl,
          metadata: req.metadata,
        }),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (err) {
      return { ok: false, retry: true, detail: `Paystack could not be reached: ${(err as Error).message}` };
    }
    const body = (await res.json().catch(() => null)) as { status?: boolean; message?: string; data?: { authorization_url?: string; reference?: string } } | null;
    if (res.ok && body?.status && body.data?.authorization_url) {
      return { ok: true, url: body.data.authorization_url, reference: body.data.reference ?? req.reference };
    }
    const detail = `Paystack ${res.status}: ${body?.message ?? "no message"}`;
    return { ok: false, retry: res.status >= 500 || res.status === 429, detail };
  }
}

export function verifyPaystackSignature(secretKey: string, rawBody: string, signature: string | null | undefined): boolean {
  if (!signature || !/^[0-9a-f]{128}$/i.test(signature)) return false;
  const expected = createHmac("sha512", secretKey).update(rawBody, "utf8").digest();
  const given = Buffer.from(signature, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export interface PaystackCharge {
  event: string;
  reference: string;
  status: string;
  amountCents: number;
  currency: string;
  paidAt: string | null;
  providerId: string | null;
}

/** The parts of a charge event TEBOS acts on; null for anything unreadable. */
export function parsePaystackEvent(rawBody: string): PaystackCharge | null {
  let e: { event?: unknown; data?: Record<string, unknown> };
  try {
    e = JSON.parse(rawBody);
  } catch {
    return null;
  }
  const d = e.data ?? {};
  if (typeof e.event !== "string" || typeof d.reference !== "string" || typeof d.amount !== "number" || typeof d.currency !== "string") return null;
  return {
    event: e.event,
    reference: d.reference,
    status: String(d.status ?? ""),
    amountCents: d.amount,
    currency: d.currency,
    paidAt: typeof d.paid_at === "string" ? d.paid_at : typeof d.paidAt === "string" ? d.paidAt : null,
    providerId: d.id != null ? String(d.id) : null,
  };
}
