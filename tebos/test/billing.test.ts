import { describe, expect, it } from "vitest";
import { addMonth, daysLate, dueDate, mayPause, periodOf, remindersDue } from "../src/domain/billing";
import { BillingWorker, invoiceEmail, reminderEmail, type BillingStore, type DueAccount, type InvoiceToSend } from "../src/billing/worker";
import type { PaymentGateway, PaymentPageRequest } from "../src/pipeline/paystack";
import type { OutboxEmail } from "../src/pipeline/worker";

describe("billing dates", () => {
  it("bills on the same day each month, falling back to the month's last day and returning to the anchor", () => {
    expect(addMonth("2026-01-15")).toBe("2026-02-15");
    expect(addMonth("2026-01-31")).toBe("2026-02-28");
    expect(addMonth("2026-02-28", 31)).toBe("2026-03-31");
    expect(addMonth("2028-01-31")).toBe("2028-02-29");
    expect(addMonth("2026-12-10")).toBe("2027-01-10");
  });

  it("covers a month per invoice, due a week after it's issued", () => {
    expect(periodOf("2026-10-15")).toEqual({ start: "2026-10-15", end: "2026-11-14" });
    expect(periodOf("2026-01-31", 31)).toEqual({ start: "2026-01-31", end: "2026-02-27" });
    expect(dueDate("2026-10-15")).toBe("2026-10-22");
  });

  it("reminds at 3 and 10 days late, once each, and allows a pause only after 14", () => {
    const today = new Date("2026-10-30T09:00:00Z");
    expect(daysLate("2026-10-22", today)).toBe(8);
    expect(remindersDue("2026-10-22", [], today).map((r) => r.kind)).toEqual(["invoice_reminder_1"]);
    expect(remindersDue("2026-10-22", ["invoice_reminder_1"], today)).toEqual([]);
    expect(remindersDue("2026-10-15", ["invoice_reminder_1"], today).map((r) => r.kind)).toEqual(["invoice_reminder_2"]);
    expect(mayPause("2026-10-22", today)).toBe(false);
    expect(mayPause("2026-10-15", today)).toBe(true);
    expect(daysLate("2026-11-05", today)).toBe(0);
  });
});

describe("the billing worker", () => {
  const inv: InvoiceToSend = { id: "i1", number: "TEBOS-2026-0001", amountCents: 250000, periodStart: "2026-10-15", periodEnd: "2026-11-14", dueOn: "2026-10-22",
    paymentUrl: null, contactName: "Thandi", business: "Northwind Studio", email: "thandi@northwind.co.za" };

  function fake(account: DueAccount | null, unlinked: InvoiceToSend | null = null) {
    const s = { issued: [] as unknown[], links: [] as unknown[], reminders: [] as OutboxEmail[], account, unlinked };
    const store: BillingStore = {
      nextDueAccount: async () => s.account,
      issueInvoice: async (a, invoice, next) => { s.issued.push({ a: a.id, invoice, next }); s.account = null; return "i1"; },
      nextUnlinkedInvoice: async () => s.unlinked,
      recordInvoiceLink: async (id, url, ref, email) => { s.links.push({ id, url, ref, email }); s.unlinked = null; },
      nextReminder: async () => null,
      queueReminder: async (_id, email) => { s.reminders.push(email); },
    };
    return { s, store };
  }
  const gateway: PaymentGateway & { requests: PaymentPageRequest[] } = {
    requests: [],
    async createPaymentPage(req) { this.requests.push(req); return { ok: true as const, url: `https://checkout.paystack.test/${req.reference}`, reference: req.reference }; },
  };

  it("issues the month's invoice on its date and moves the next date on", async () => {
    const { s, store } = fake({ id: "b1", opportunityId: "o1", monthlyCents: 250000, nextInvoiceOn: "2026-10-15", anchorDay: 15 });
    const w = new BillingWorker(store, null, { siteUrl: "https://tebos.test" }, () => {}, () => new Date("2026-10-15T06:00:00Z"));
    expect(await w.runOnce()).toEqual({ step: "issue", invoiceId: "i1", accountId: "b1" });
    expect(s.issued[0]).toEqual({ a: "b1", invoice: { periodStart: "2026-10-15", periodEnd: "2026-11-14", issuedOn: "2026-10-15", dueOn: "2026-10-22" }, next: "2026-11-15" });
    expect(await w.runOnce()).toBeNull(); // no Paystack key: the invoice waits for its link, visibly
  });

  it("links an invoice through Paystack and emails it; it never charges a card itself", async () => {
    const { s, store } = fake(null, inv);
    const w = new BillingWorker(store, gateway, { siteUrl: "https://tebos.test" });
    expect(await w.runOnce()).toEqual({ step: "link", invoiceId: "i1", outcome: "linked" });
    expect(gateway.requests.at(-1)).toMatchObject({ email: "thandi@northwind.co.za", amountCents: 250000, reference: "tebos-inv-i1", callbackUrl: "https://tebos.test/paid" });
    const email = (s.links[0] as { email: OutboxEmail }).email;
    expect(email.subject).toBe("TEBOS invoice TEBOS-2026-0001: R2,500 due 22 October 2026");
    expect(email.body).toContain("https://checkout.paystack.test/tebos-inv-i1");
    expect(email.body).toContain("excluding VAT");
  });

  it("writes reminders that get firmer, and mentions a pause only in the second", () => {
    const first = reminderEmail({ ...inv, paymentUrl: "https://pay" }, "invoice_reminder_1");
    const second = reminderEmail({ ...inv, paymentUrl: "https://pay" }, "invoice_reminder_2");
    expect(first.subject).toBe("Reminder: TEBOS invoice TEBOS-2026-0001 was due 22 October 2026");
    expect(first.body).not.toContain("pause");
    expect(second.subject).toMatch(/^Second reminder/);
    expect(second.body).toContain("may pause the service");
    expect(invoiceEmail(inv, "https://pay").kind).toBe("invoice");
  });
});
