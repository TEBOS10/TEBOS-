// Enquiry alerts: when a business asks for a plan or applies for an equity
// partnership on the pricing page, email the TEBOS team once.
//
//   claim the oldest un-notified enquiry (at most 5 attempts, 5 minutes apart)
//   -> send it through Resend with an idempotency key per enquiry, so a retry
//      after an unclear outcome can never send a second email
//   -> record the provider's message id as proof it was sent, or the reason not
//
// An enquiry is marked notified only when Resend accepted the email.

import type { EmailConnector } from "../execution/provider";

export interface Enquiry {
  id: string;
  plan: "starter" | "growth" | "equity";
  name: string;
  business: string;
  email: string;
  phone: string | null;
  website: string | null;
  message: string | null;
  createdAt: string;
  attempts: number;
}

export interface EnquiryStore {
  /** Atomically claim the next enquiry due an alert, counting the attempt. */
  claimNext(): Promise<Enquiry | null>;
  markSent(id: string, reference: string): Promise<void>;
  markFailed(id: string, detail: string): Promise<void>;
}

export interface AlertConfig {
  apiKey: string;
  /** Sender, e.g. "TEBOS <alerts@yourdomain.com>" or Resend's test sender. */
  from: string;
  /** Who receives the alerts. */
  to: string[];
}

export const MAX_ALERT_ATTEMPTS = 5;

const PLAN_NAMES: Record<Enquiry["plan"], string> = {
  starter: "Diagnostic",
  growth: "Architecture & Operations",
  equity: "Equity partnership application",
};

/** One line, no control characters: safe in a subject. */
const oneLine = (s: string, max: number) => s.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

export function alertEmail(e: Enquiry, to: string[]) {
  const plan = PLAN_NAMES[e.plan];
  const lines = [
    `New enquiry from the TEBOS pricing page.`,
    ``,
    `Plan:      ${plan}`,
    `Name:      ${oneLine(e.name, 120)}`,
    `Business:  ${oneLine(e.business, 160)}`,
    `Email:     ${e.email}`,
    `Phone:     ${e.phone ? oneLine(e.phone, 40) : "not given"}`,
    `Website:   ${e.website ? oneLine(e.website, 300) : "not given"}`,
    `Received:  ${new Date(e.createdAt).toUTCString()}`,
    ``,
    e.message ? `Message:\n${e.message.slice(0, 2000)}` : `No message.`,
    ``,
    `Reply to this email to answer ${oneLine(e.name, 60)} directly.`,
  ];
  return {
    to,
    subject: oneLine(`New TEBOS enquiry: ${plan} · ${e.business}`, 200),
    text: lines.join("\n"),
    replyTo: e.email,
  };
}

export interface AlertReport {
  enquiryId: string;
  outcome: "sent" | "failed" | "retry";
  detail: string | null;
}

export class EnquiryAlertWorker {
  constructor(
    private readonly store: EnquiryStore,
    private readonly email: EmailConnector,
    private readonly config: AlertConfig,
    private readonly log: (e: Record<string, unknown>) => void = () => {},
  ) {}

  async runOnce(): Promise<AlertReport | null> {
    const e = await this.store.claimNext();
    if (!e) return null;
    const result = await this.email.sendEmail(this.config.apiKey, {
      from: this.config.from,
      input: alertEmail(e, this.config.to),
      idempotencyKey: `tebos:enquiry:${e.id}`,
    });
    if (result.outcome === "accepted") {
      await this.store.markSent(e.id, result.providerReference);
      this.log({ event: "enquiry.alert_sent", enquiryId: e.id, plan: e.plan });
      return { enquiryId: e.id, outcome: "sent", detail: null };
    }
    const detail = result.detail;
    await this.store.markFailed(e.id, detail);
    // After the last attempt the store stops offering it; the error stays recorded.
    const gaveUp = e.attempts >= MAX_ALERT_ATTEMPTS;
    this.log({ event: "enquiry.alert_failed", enquiryId: e.id, attempt: e.attempts, gaveUp, detail });
    return { enquiryId: e.id, outcome: gaveUp ? "failed" : "retry", detail };
  }
}
