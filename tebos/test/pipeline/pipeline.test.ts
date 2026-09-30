import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { feeTerms, formatRand, PLAN_TERMS } from "../../src/domain/plans";
import { renderContract, sha256 } from "../../src/pipeline/contract";
import { parsePaystackEvent, PaystackGateway, verifyPaystackSignature } from "../../src/pipeline/paystack";
import { handlePaystackWebhook, type PaystackWebhookStore } from "../../src/pipeline/paystack-webhook";
import { screenEnquiry } from "../../src/pipeline/screening";

describe("screening an enquiry", () => {
  const codes = (e: Parameters<typeof screenEnquiry>[0], h?: Parameters<typeof screenEnquiry>[1]) => screenEnquiry(e, h).flags.map((f) => f.code);

  it("passes a business with its own domain and website", () => {
    expect(codes({ email: "lerato@brightline.co.za", business: "Brightline Creative", website: "https://www.brightline.co.za", message: "We need structure" })).toEqual([]);
    expect(codes({ email: "a@shop.brightline.co.za", business: "Brightline", website: "brightline.co.za", message: null })).toEqual([]);
  });

  it("flags personal and throwaway addresses, missing or mismatched websites", () => {
    expect(codes({ email: "x@gmail.com", business: "Shop", website: null, message: null })).toEqual(["free_email", "no_website"]);
    expect(codes({ email: "x@mailinator.com", business: "Shop", website: "shop.co.za", message: null })).toEqual(["disposable_email"]);
    expect(codes({ email: "x@alpha.co.za", business: "Shop", website: "https://beta.co.za", message: null })).toEqual(["domain_mismatch"]);
    expect(codes({ email: "x@alpha.co.za", business: "Shop", website: "not a url", message: null })).toEqual(["no_website"]);
  });

  it("flags words that overlap TEBOS's services, as a reason to look closer", () => {
    const s = screenEnquiry({ email: "x@nw.co.za", business: "Northwind Consulting", website: "nw.co.za", message: "We sell process automation" });
    expect(s.flags).toEqual([{ code: "competitor_terms", detail: 'Describes itself with words that overlap TEBOS\'s services: "process automation", "consulting"' }]);
  });

  it("flags repeats from the same address, or the same business domain (not a shared mail provider)", () => {
    expect(codes({ email: "x@nw.co.za", business: "NW", website: "nw.co.za", message: null }, { sameEmail: 0, sameDomain: 2 })).toEqual(["repeat_enquiry"]);
    expect(codes({ email: "x@gmail.com", business: "NW", website: "nw.co.za", message: null }, { sameEmail: 0, sameDomain: 40 })).toEqual(["free_email"]);
    expect(codes({ email: "x@gmail.com", business: "NW", website: "nw.co.za", message: null }, { sameEmail: 1, sameDomain: 40 })).toEqual(["free_email", "repeat_enquiry"]);
  });
});

describe("plans", () => {
  it("prices in Rand from one source", () => {
    expect(formatRand(PLAN_TERMS.starter.monthlyCents!)).toBe("R2,500");
    expect(formatRand(PLAN_TERMS.growth.monthlyCents!)).toBe("R7,500");
    expect(PLAN_TERMS.equity.monthlyCents).toBeNull();
  });

  it("takes the first month from small businesses, and a one-off Company Diagnostic from companies", () => {
    expect(PLAN_TERMS.starter.firstPaymentCents).toBe(PLAN_TERMS.starter.monthlyCents);
    expect(PLAN_TERMS.growth.firstPaymentCents).toBe(PLAN_TERMS.growth.monthlyCents);
    expect(formatRand(PLAN_TERMS.company.firstPaymentCents!)).toBe("R15,000");
    expect(PLAN_TERMS.company.monthlyCents).toBeNull(); // scoped in a proposal
    expect(PLAN_TERMS.equity.firstPaymentCents).toBeNull();
    expect(feeTerms("starter")).toBe("R2,500 per month, excluding VAT");
    expect(feeTerms("company")).toBe("R15,000 once, excluding VAT, for the Company Diagnostic; the monthly fee after it (from R25,000 per month) is agreed in a written proposal");
    expect(feeTerms("equity")).toBe("no fees");
  });
});

describe("contracts", () => {
  const facts = { business: "Northwind", contactName: "Thandi", email: "t@nw.co.za", plan: "growth" as const, reference: "opp-1", date: new Date("2026-09-29T10:00:00Z") };

  it("fills every placeholder from the plan and the client", () => {
    const r = renderContract("Agreement {{reference}} between TEBOS and {{business}} ({{contact_name}}, {{email}}), {{date}}.\n{{plan_name}}: {{monthly_fee}}\n{{deliverables}}", facts);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.body).toContain("Agreement opp-1 between TEBOS and Northwind (Thandi, t@nw.co.za), 2026-09-29.");
    expect(r.body).toContain("Architecture & Operations: R7,500 per month, excluding VAT");
    expect(r.body).toContain("- Integrate: read-only connections");
    expect(r.hash).toBe(sha256(r.body));
  });

  it("refuses a template with placeholders it doesn't know", () => {
    expect(renderContract("Dear {{client_name}}, {{business}} {{discount}}", facts)).toEqual({ ok: false, unknown: ["client_name", "discount"] });
  });
});

describe("Paystack", () => {
  const secret = "sk_test_secret";
  const sign = (body: string) => createHmac("sha512", secret).update(body).digest("hex");
  const charge = (over: Record<string, unknown> = {}) =>
    JSON.stringify({ event: "charge.success", data: { id: 99, reference: "tebos-o1", status: "success", amount: 250000, currency: "ZAR", paid_at: "2026-09-29T10:00:00Z", ...over } });

  it("accepts only a correct signature", () => {
    const body = charge();
    expect(verifyPaystackSignature(secret, body, sign(body))).toBe(true);
    expect(verifyPaystackSignature(secret, body + " ", sign(body))).toBe(false);
    expect(verifyPaystackSignature("other", body, sign(body))).toBe(false);
    expect(verifyPaystackSignature(secret, body, null)).toBe(false);
    expect(verifyPaystackSignature(secret, body, "zz")).toBe(false);
  });

  it("reads the charge", () => {
    expect(parsePaystackEvent(charge())).toMatchObject({ event: "charge.success", reference: "tebos-o1", amountCents: 250000, currency: "ZAR", providerId: "99" });
    expect(parsePaystackEvent("nope")).toBeNull();
    expect(parsePaystackEvent(JSON.stringify({ event: "x", data: {} }))).toBeNull();
  });

  it("creates a payment page in ZAR and tells transient failures from refusals", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const ok = new PaystackGateway(secret, (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ status: true, data: { authorization_url: "https://checkout.paystack.com/abc", reference: "tebos-o1" } }), { status: 200 });
    }) as unknown as typeof fetch);
    expect(await ok.createPaymentPage({ email: "t@nw.co.za", amountCents: 250000, reference: "tebos-o1", callbackUrl: "https://site/paid", metadata: {} }))
      .toEqual({ ok: true, url: "https://checkout.paystack.com/abc", reference: "tebos-o1" });
    expect(calls[0]!.url).toBe("https://api.paystack.co/transaction/initialize");
    expect(JSON.parse(String(calls[0]!.init.body))).toMatchObject({ amount: 250000, currency: "ZAR", email: "t@nw.co.za" });
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe(`Bearer ${secret}`);

    const refused = new PaystackGateway(secret, (async () => new Response(JSON.stringify({ status: false, message: "Invalid key" }), { status: 401 })) as unknown as typeof fetch);
    expect(await refused.createPaymentPage({ email: "t@nw.co.za", amountCents: 1, reference: "r", callbackUrl: "c", metadata: {} })).toMatchObject({ ok: false, retry: false });
    const down = new PaystackGateway(secret, (async () => { throw new Error("ECONNRESET"); }) as unknown as typeof fetch);
    expect(await down.createPaymentPage({ email: "t@nw.co.za", amountCents: 1, reference: "r", callbackUrl: "c", metadata: {} })).toMatchObject({ ok: false, retry: true });
  });

  describe("webhook", () => {
    const store = (o: { amountCents: number | null; status: string } | null) => {
      const s = { payments: [] as unknown[], paid: [] as string[] };
      const impl: PaystackWebhookStore = {
        opportunityForReference: async () => (o ? { id: "o1", ...o } : null),
        recordProviderPayment: async (_id, p) => { const fresh = !s.payments.some((x) => (x as { reference: string }).reference === p.reference); if (fresh) s.payments.push(p); return fresh; },
        markPaid: async (id) => { s.paid.push(id); return true; },
        invoiceForReference: async (ref) => (ref === "tebos-inv-i1" ? { id: "i1", opportunityId: "o1", amountCents: 250000, status: "open" } : null),
        recordInvoicePayment: async (inv, p) => { const fresh = !s.payments.some((x) => (x as { reference: string }).reference === p.reference); if (fresh) s.payments.push({ ...p, invoiceId: inv.id }); return fresh; },
      };
      return { impl, s };
    };

    it("records a monthly invoice payment against the invoice, once, and never touches the opportunity", async () => {
      const { impl, s } = store({ amountCents: 250000, status: "onboarded" });
      const body = charge({ reference: "tebos-inv-i1" });
      expect(await handlePaystackWebhook(impl, secret, sign(body), body)).toEqual({ status: 200, body: "invoice paid" });
      expect(await handlePaystackWebhook(impl, secret, sign(body), body)).toEqual({ status: 200, body: "already recorded" });
      expect(s.payments).toHaveLength(1);
      expect(s.payments[0]).toMatchObject({ invoiceId: "i1", amountCents: 250000 });
      expect(s.paid).toEqual([]);
      const short = charge({ reference: "tebos-inv-i1", id: 100, amount: 100000 });
      const { impl: impl2 } = store(null);
      expect((await handlePaystackWebhook(impl2, secret, sign(short), short)).body).toBe("recorded: less than the invoice");
      const unknown = charge({ reference: "tebos-inv-nope" });
      expect((await handlePaystackWebhook(impl, secret, sign(unknown), unknown)).body).toBe("unknown reference");
    });

    it("refuses an unsigned or forged event", async () => {
      const { impl, s } = store({ amountCents: 250000, status: "awaiting_payment" });
      expect((await handlePaystackWebhook(impl, secret, "0".repeat(128), charge())).status).toBe(401);
      expect(s.payments).toEqual([]);
    });

    it("records a full payment once and marks the opportunity paid", async () => {
      const { impl, s } = store({ amountCents: 250000, status: "awaiting_payment" });
      const body = charge();
      expect(await handlePaystackWebhook(impl, secret, sign(body), body)).toEqual({ status: 200, body: "paid" });
      expect(await handlePaystackWebhook(impl, secret, sign(body), body)).toEqual({ status: 200, body: "already recorded" });
      expect(s.payments).toHaveLength(1);
      expect(s.paid[0]).toBe("o1");
    });

    it("records a short payment without marking it paid, and ignores other currencies and events", async () => {
      const short = store({ amountCents: 250000, status: "awaiting_payment" });
      const body = charge({ amount: 100000, reference: "tebos-short" });
      expect(await handlePaystackWebhook(short.impl, secret, sign(body), body)).toEqual({ status: 200, body: "recorded: less than the amount due" });
      expect(short.s.paid).toEqual([]);
      const usd = store({ amountCents: 250000, status: "awaiting_payment" });
      const b2 = charge({ currency: "USD" });
      expect(await handlePaystackWebhook(usd.impl, secret, sign(b2), b2)).toEqual({ status: 200, body: "not recorded: not in ZAR" });
      expect(usd.s.payments).toEqual([]);
      const other = JSON.stringify({ event: "transfer.success", data: { reference: "x", amount: 1, currency: "ZAR" } });
      expect(await handlePaystackWebhook(usd.impl, secret, sign(other), other)).toEqual({ status: 200, body: "ignored" });
      const unknown = store(null);
      const b3 = charge();
      expect(await handlePaystackWebhook(unknown.impl, secret, sign(b3), b3)).toEqual({ status: 200, body: "unknown reference" });
    });
  });
});
