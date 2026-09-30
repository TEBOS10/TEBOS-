// The billing worker: each month, for every active billing account, issue
// the invoice on its date, email the client a payment link, and remind them
// if it's late. Invoice emails go through the pipeline's outbox, so they're
// sent with the same retries. It never charges a card and never pauses a
// client: those are the client's and a person's decisions.

import { addMonth, dueDate, periodOf, REMINDERS } from "../domain/billing";
import { formatRand } from "../domain/plans";
import type { PaymentGateway } from "../pipeline/paystack";
import type { OutboxEmail } from "../pipeline/worker";

export interface DueAccount {
  id: string;
  opportunityId: string;
  monthlyCents: number;
  nextInvoiceOn: string;
  anchorDay: number;
}

export interface InvoiceToSend {
  id: string;
  number: string;
  amountCents: number;
  periodStart: string;
  periodEnd: string;
  dueOn: string;
  paymentUrl: string | null;
  contactName: string;
  business: string;
  email: string;
}

export interface BillingStore {
  /** An active account whose next invoice date has come (today or earlier). */
  nextDueAccount(today: string): Promise<DueAccount | null>;
  /** Issues the invoice and moves the account's next date on, if the account is still due on `expectedOn`. */
  issueInvoice(a: DueAccount, invoice: { periodStart: string; periodEnd: string; dueOn: string; issuedOn: string }, nextInvoiceOn: string): Promise<string | null>;
  /** An open invoice that has no payment link yet. */
  nextUnlinkedInvoice(): Promise<InvoiceToSend | null>;
  recordInvoiceLink(invoiceId: string, url: string, reference: string, email: OutboxEmail): Promise<void>;
  /** An open, linked invoice owed a reminder: the reminder kind is the first one not yet queued for its lateness. */
  nextReminder(today: string): Promise<{ invoice: InvoiceToSend; kind: OutboxEmail["kind"] } | null>;
  queueReminder(invoiceId: string, email: OutboxEmail): Promise<void>;
}

export type BillingReport =
  | { step: "issue"; invoiceId: string; accountId: string }
  | { step: "link"; invoiceId: string; outcome: "linked" | "failed"; detail?: string }
  | { step: "remind"; invoiceId: string; kind: string };

const longDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export class BillingWorker {
  constructor(
    private readonly store: BillingStore,
    private readonly gateway: PaymentGateway | null,
    private readonly config: { siteUrl: string },
    private readonly log: (e: Record<string, unknown>) => void = () => {},
    private readonly now: () => Date = () => new Date(),
  ) {}

  async runOnce(): Promise<BillingReport | null> {
    return (await this.issue()) ?? (await this.link()) ?? (await this.remind());
  }

  private today() {
    return this.now().toISOString().slice(0, 10);
  }

  private async issue(): Promise<BillingReport | null> {
    const today = this.today();
    const a = await this.store.nextDueAccount(today);
    if (!a) return null;
    const period = periodOf(a.nextInvoiceOn, a.anchorDay);
    const invoiceId = await this.store.issueInvoice(
      a,
      { periodStart: period.start, periodEnd: period.end, issuedOn: today, dueOn: dueDate(today) },
      addMonth(a.nextInvoiceOn, a.anchorDay),
    );
    if (!invoiceId) return null; // someone changed the account meanwhile; it's picked up again next loop
    this.log({ event: "billing.invoice_issued", invoiceId, accountId: a.id, period });
    return { step: "issue", invoiceId, accountId: a.id };
  }

  private async link(): Promise<BillingReport | null> {
    if (!this.gateway) return null; // invoices wait, visibly, until Paystack is configured
    const inv = await this.store.nextUnlinkedInvoice();
    if (!inv) return null;
    const reference = `tebos-inv-${inv.id}`;
    const link = await this.gateway.createPaymentPage({
      email: inv.email,
      amountCents: inv.amountCents,
      reference,
      callbackUrl: `${this.config.siteUrl}/paid`,
      metadata: { invoice_id: inv.id, invoice_number: inv.number },
    });
    if (!link.ok) {
      this.log({ event: "billing.link_failed", invoiceId: inv.id, retry: link.retry, detail: link.detail });
      return { step: "link", invoiceId: inv.id, outcome: "failed", detail: link.detail };
    }
    await this.store.recordInvoiceLink(inv.id, link.url, link.reference, invoiceEmail(inv, link.url));
    this.log({ event: "billing.invoice_sent", invoiceId: inv.id });
    return { step: "link", invoiceId: inv.id, outcome: "linked" };
  }

  private async remind(): Promise<BillingReport | null> {
    const due = await this.store.nextReminder(this.today());
    if (!due) return null;
    await this.store.queueReminder(due.invoice.id, reminderEmail(due.invoice, due.kind));
    this.log({ event: "billing.reminder", invoiceId: due.invoice.id, kind: due.kind });
    return { step: "remind", invoiceId: due.invoice.id, kind: due.kind };
  }
}

export function invoiceEmail(inv: InvoiceToSend, url: string): OutboxEmail {
  return {
    kind: "invoice",
    to: inv.email,
    subject: `TEBOS invoice ${inv.number}: ${formatRand(inv.amountCents)} due ${longDate(inv.dueOn)}`,
    body: [
      `Hi ${inv.contactName},`,
      ``,
      `Here is ${inv.business}'s TEBOS invoice ${inv.number} for ${longDate(inv.periodStart)} to ${longDate(inv.periodEnd)}:`,
      `${formatRand(inv.amountCents)}, excluding VAT, due by ${longDate(inv.dueOn)}.`,
      ``,
      `Pay securely here (Paystack; TEBOS never sees your card details):`,
      url,
      ``,
      `You can see all your invoices on TEBOS's home page. If you pay by EFT instead, use ${inv.number} as the reference.`,
    ].join("\n"),
  };
}

export function reminderEmail(inv: InvoiceToSend, kind: OutboxEmail["kind"]): OutboxEmail {
  const second = kind === REMINDERS[1]!.kind;
  return {
    kind,
    to: inv.email,
    subject: `${second ? "Second reminder" : "Reminder"}: TEBOS invoice ${inv.number} was due ${longDate(inv.dueOn)}`,
    body: [
      `Hi ${inv.contactName},`,
      ``,
      `${second ? "We haven't yet received" : "A friendly reminder that we haven't received"} payment for invoice ${inv.number} (${formatRand(inv.amountCents)}, due ${longDate(inv.dueOn)}).`,
      ``,
      `Pay securely here:`,
      inv.paymentUrl ?? "(the link in the original invoice email)",
      ``,
      second
        ? `Under our agreement, TEBOS may pause the service when a payment is more than 14 days late. If something's wrong, reply to this email and we'll sort it out.`
        : `If you've already paid, thank you, and please ignore this.`,
    ].join("\n"),
  };
}
