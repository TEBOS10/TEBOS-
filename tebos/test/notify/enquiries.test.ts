import { describe, expect, it } from "vitest";
import type { EmailConnector, EmailSend, SendResult } from "../../src/execution/provider";
import { alertEmail, EnquiryAlertWorker, MAX_ALERT_ATTEMPTS, type Enquiry, type EnquiryStore } from "../../src/notify/enquiries";

const enquiry = (over: Partial<Enquiry> = {}): Enquiry => ({
  id: "enq-1", plan: "equity", name: "Lerato", business: "Brightline Creative", email: "lerato@brightline.example",
  phone: null, website: "brightline.example", message: "Growing fast, cash is tight.", createdAt: "2026-09-28T08:00:00.000Z", attempts: 1, ...over,
});

class Store implements EnquiryStore {
  queue: Enquiry[];
  sent: Array<[string, string]> = [];
  failed: Array<[string, string]> = [];
  constructor(...q: Enquiry[]) { this.queue = q; }
  async claimNext() { return this.queue.shift() ?? null; }
  async markSent(id: string, ref: string) { this.sent.push([id, ref]); }
  async markFailed(id: string, d: string) { this.failed.push([id, d]); }
}

const connector = (result: SendResult): EmailConnector & { sends: EmailSend[] } => {
  const sends: EmailSend[] = [];
  return {
    key: "resend", provider: "Resend", deliveryReadScope: "emails:read", sends,
    verify: async () => ({ ok: true, scopes: [], detail: "" }),
    sendEmail: async (_k, s) => { sends.push(s); return result; },
    getDelivery: async () => ({ state: "unknown", detail: "" }),
  };
};
const config = { apiKey: "re_test", from: "TEBOS <onboarding@resend.dev>", to: ["team@tebos.example"] };

describe("enquiry alerts", () => {
  it("emails the team once per enquiry, with an idempotency key, and records the provider's id", async () => {
    const store = new Store(enquiry());
    const c = connector({ outcome: "accepted", providerReference: "re_msg_1" });
    expect(await new EnquiryAlertWorker(store, c, config).runOnce()).toMatchObject({ outcome: "sent" });
    expect(c.sends[0]).toMatchObject({ from: config.from, idempotencyKey: "tebos:enquiry:enq-1", input: { to: config.to, replyTo: "lerato@brightline.example" } });
    expect(c.sends[0]!.input.subject).toBe("New TEBOS enquiry: Equity partnership application · Brightline Creative");
    expect(c.sends[0]!.input.text).toContain("Growing fast, cash is tight.");
    expect(store.sent).toEqual([["enq-1", "re_msg_1"]]);
  });

  it("never marks an enquiry notified unless the provider accepted it", async () => {
    for (const result of [{ outcome: "unknown", detail: "timeout" }, { outcome: "rejected", errorClass: "permission", detail: "bad key", credentialProblem: true }] as SendResult[]) {
      const store = new Store(enquiry());
      expect(await new EnquiryAlertWorker(store, connector(result), config).runOnce()).toMatchObject({ outcome: "retry" });
      expect(store.sent).toEqual([]);
      expect(store.failed[0]![0]).toBe("enq-1");
    }
    const store = new Store(enquiry({ attempts: MAX_ALERT_ATTEMPTS }));
    expect(await new EnquiryAlertWorker(store, connector({ outcome: "unknown", detail: "timeout" }), config).runOnce()).toMatchObject({ outcome: "failed" });
  });

  it("keeps what visitors typed out of the subject's structure", () => {
    const m = alertEmail(enquiry({ business: "Evil\r\nBcc: someone@else.example", plan: "starter" }), config.to);
    expect(m.subject).toBe("New TEBOS enquiry: Starter · Evil Bcc: someone@else.example");
    expect(m.subject).not.toMatch(/[\r\n]/);
  });

  it("does nothing when no enquiry is waiting", async () => {
    expect(await new EnquiryAlertWorker(new Store(), connector({ outcome: "accepted", providerReference: "x" }), config).runOnce()).toBeNull();
  });
});
