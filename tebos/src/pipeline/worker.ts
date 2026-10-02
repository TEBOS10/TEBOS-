// The client pipeline worker. One step of work per call, in this order:
//
//   open      — each new enquiry becomes an opportunity, screened on arrival
//   payment   — an approved opportunity gets a Paystack payment page
//   contract  — a paid opportunity gets its contract, rendered from the plan's
//               lawyer-approved template, with a one-time link
//   onboard   — a contracted client gets their organisation and an invitation
//               for their admin
//   outbox    — each step's email to the client is recorded with the step, in
//               one transaction, and sent from here with retries (5 attempts,
//               5 minutes apart), so a one-time link is never lost
//
// The payment itself is recorded by the Paystack webhook (paystack-webhook.ts),
// and acceptance by the client on the contract page. Every step is guarded by
// the database (migration client_pipeline): this worker can't skip one.

import type { EmailConnector } from "../execution/provider";
import { PLAN_TERMS, type PlanKey } from "../domain/plans";
import { newToken, renderContract } from "./contract";
import type { PaymentGateway } from "./paystack";
import { screenEnquiry, type Screening, type ScreeningHistory } from "./screening";

export interface NewEnquiry {
  id: string;
  plan: PlanKey;
  name: string;
  business: string;
  email: string;
  phone: string | null;
  website: string | null;
  message: string | null;
  /** Where it came from: the public website, or a salesperson who added it (and owns it). */
  source?: "website" | "sales";
  addedBy?: string | null;
  /** Joined from the waiting list rather than enquiring about a plan. */
  waitlist?: boolean;
  /** Their kind of business, as an operating-system blueprint key, when they gave one. */
  industry?: string | null;
}

export interface Opportunity {
  id: string;
  plan: PlanKey;
  contactName: string;
  business: string;
  email: string;
}

export interface Template {
  key: string;
  version: number;
  title: string;
  body: string;
}

export interface OutboxEmail {
  kind: "payment_link" | "contract" | "invitation" | "invoice" | "invoice_reminder_1" | "invoice_reminder_2" | "intake_follow_up";
  to: string;
  subject: string;
  body: string;
}

export interface PendingEmail extends OutboxEmail {
  id: string;
  opportunityId: string;
  attempts: number;
}

export const MAX_EMAIL_ATTEMPTS = 5;

export interface PipelineStore {
  nextNewEnquiry(): Promise<{ enquiry: NewEnquiry; history: ScreeningHistory } | null>;
  openOpportunity(e: NewEnquiry, screening: Screening): Promise<string>;

  nextAwaitingLink(): Promise<Opportunity | null>;
  recordPaymentLink(id: string, amountCents: number, url: string, reference: string, email: OutboxEmail): Promise<void>;

  nextPaid(): Promise<Opportunity | null>;
  approvedTemplate(plan: PlanKey): Promise<Template | null>;
  recordContract(id: string, t: Template, body: string, bodyHash: string, tokenHash: string, email: OutboxEmail): Promise<void>;

  nextContracted(): Promise<Opportunity | null>;
  onboard(id: string, orgName: string, slug: string, inviteTokenHash: string, email: OutboxEmail): Promise<string>;

  /** Claims the next unsent email that is due, counting the attempt. */
  claimEmail(): Promise<PendingEmail | null>;
  markEmailSent(id: string, providerReference: string): Promise<void>;
  markEmailFailed(id: string, detail: string): Promise<void>;
}

export interface PipelineConfig {
  siteUrl: string;
  /** Sends the client's emails; without it, they wait in the outbox (shown on the pipeline page). */
  email: { connector: EmailConnector; apiKey: string; from: string; replyTo: string | null } | null;
}

export type PipelineReport =
  | { step: "open"; id: string; flags: number }
  | { step: "payment"; id: string; outcome: "linked" | "failed"; detail?: string }
  | { step: "contract"; id: string; outcome: "sent" | "blocked"; detail?: string }
  | { step: "onboard"; id: string; orgId: string }
  | { step: "email"; id: string; outcome: "sent" | "retry" | "failed"; detail?: string };

export const slugFor = (business: string, id: string) =>
  `${business.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "client"}-${id.slice(0, 6)}`;

export class PipelineWorker {
  /** Templates found missing are reported once per plan, not on every loop. */
  private readonly blockedPlans = new Set<PlanKey>();

  constructor(
    private readonly store: PipelineStore,
    private readonly gateway: PaymentGateway | null,
    private readonly config: PipelineConfig,
    private readonly log: (e: Record<string, unknown>) => void = () => {},
  ) {}

  async runOnce(): Promise<PipelineReport | null> {
    return (await this.open()) ?? (await this.payment()) ?? (await this.contract()) ?? (await this.onboard()) ?? (await this.outbox());
  }

  private async open(): Promise<PipelineReport | null> {
    const next = await this.store.nextNewEnquiry();
    if (!next) return null;
    const screening = screenEnquiry(next.enquiry, next.history);
    const id = await this.store.openOpportunity(next.enquiry, screening);
    this.log({ event: "pipeline.opened", opportunityId: id, flags: screening.flags.map((f) => f.code) });
    return { step: "open", id, flags: screening.flags.length };
  }

  private async payment(): Promise<PipelineReport | null> {
    if (!this.gateway) return null;
    const o = await this.store.nextAwaitingLink();
    if (!o) return null;
    const cents = PLAN_TERMS[o.plan].firstPaymentCents;
    if (cents === null) return null; // equity applications stop at approved
    const reference = `tebos-${o.id}`;
    const link = await this.gateway.createPaymentPage({
      email: o.email,
      amountCents: cents,
      reference,
      callbackUrl: `${this.config.siteUrl}/paid`,
      metadata: { opportunity_id: o.id, plan: o.plan },
    });
    if (!link.ok) {
      this.log({ event: "pipeline.payment_link_failed", opportunityId: o.id, retry: link.retry, detail: link.detail });
      return { step: "payment", id: o.id, outcome: "failed", detail: link.detail };
    }
    await this.store.recordPaymentLink(o.id, cents, link.url, link.reference, message(o, "payment_link", `Your TEBOS ${PLAN_TERMS[o.plan].name}: payment link`, [
      `Hi ${o.contactName},`,
      ``,
      `Thank you for choosing TEBOS. To start your ${PLAN_TERMS[o.plan].name} for ${o.business}, please pay ${PLAN_TERMS[o.plan].firstPaymentFor} here:`,
      link.url,
      ``,
      `The payment is taken by Paystack; TEBOS never sees your card details. As soon as it goes through we'll email your agreement to read and accept.`,
    ]));
    this.log({ event: "pipeline.payment_link", opportunityId: o.id });
    return { step: "payment", id: o.id, outcome: "linked" };
  }

  private async contract(): Promise<PipelineReport | null> {
    const o = await this.store.nextPaid();
    if (!o) return null;
    const t = await this.store.approvedTemplate(o.plan);
    if (!t) {
      if (!this.blockedPlans.has(o.plan)) this.log({ event: "pipeline.contract_blocked", opportunityId: o.id, plan: o.plan, detail: "No lawyer-approved contract template for this plan" });
      this.blockedPlans.add(o.plan);
      return null; // waits, visibly, on the pipeline page until a template is approved
    }
    this.blockedPlans.delete(o.plan);
    const rendered = renderContract(t.body, { business: o.business, contactName: o.contactName, email: o.email, plan: o.plan, reference: o.id, date: new Date() });
    if (!rendered.ok) {
      this.log({ event: "pipeline.contract_blocked", opportunityId: o.id, detail: `Template uses unknown placeholders: ${rendered.unknown.join(", ")}` });
      return { step: "contract", id: o.id, outcome: "blocked", detail: `unknown placeholders ${rendered.unknown.join(", ")}` };
    }
    const { token, hash } = newToken();
    await this.store.recordContract(o.id, t, rendered.body, rendered.hash, hash, message(o, "contract", `Your TEBOS agreement to accept`, [
      `Hi ${o.contactName},`,
      ``,
      `Your payment went through, thank you. Here is the agreement for ${o.business}'s ${PLAN_TERMS[o.plan].name}. Please read it and accept it here:`,
      `${this.config.siteUrl}/contract/${token}`,
      ``,
      `The link is personal to you and works for 30 days. Once you've accepted, we'll set up your TEBOS account.`,
    ]));
    this.log({ event: "pipeline.contract_sent", opportunityId: o.id, template: `${t.key}@${t.version}` });
    return { step: "contract", id: o.id, outcome: "sent" };
  }

  private async onboard(): Promise<PipelineReport | null> {
    const o = await this.store.nextContracted();
    if (!o) return null;
    const { token, hash } = newToken();
    const orgId = await this.store.onboard(o.id, o.business, slugFor(o.business, o.id), hash, message(o, "invitation", `Your TEBOS account is ready`, [
      `Hi ${o.contactName},`,
      ``,
      `${o.business} is set up on TEBOS. Create your account with this email address (${o.email}) here:`,
      `${this.config.siteUrl}/invite/${token}`,
      ``,
      `You'll be your organisation's admin, and can invite your team from there. Your draft operating system is already on your board, and your TEBOS maintainer will be in touch to confirm it with you.`,
    ]));
    this.log({ event: "pipeline.onboarded", opportunityId: o.id, orgId });
    return { step: "onboard", id: o.id, orgId };
  }

  private async outbox(): Promise<PipelineReport | null> {
    const e = this.config.email;
    if (!e) return null; // emails wait in the outbox until Resend is configured
    const m = await this.store.claimEmail();
    if (!m) return null;
    const result = await e.connector.sendEmail(e.apiKey, {
      from: e.from,
      idempotencyKey: `tebos:outbox:${m.id}`,
      input: { to: [m.to], subject: m.subject, text: m.body, replyTo: e.replyTo },
    });
    if (result.outcome === "accepted") {
      await this.store.markEmailSent(m.id, result.providerReference);
      this.log({ event: "pipeline.email_sent", opportunityId: m.opportunityId, kind: m.kind });
      return { step: "email", id: m.id, outcome: "sent" };
    }
    await this.store.markEmailFailed(m.id, result.detail);
    const gaveUp = m.attempts >= MAX_EMAIL_ATTEMPTS;
    this.log({ event: "pipeline.email_failed", opportunityId: m.opportunityId, kind: m.kind, attempt: m.attempts, gaveUp, detail: result.detail });
    return { step: "email", id: m.id, outcome: gaveUp ? "failed" : "retry", detail: result.detail };
  }
}

function message(o: Opportunity, kind: OutboxEmail["kind"], subject: string, lines: string[]): OutboxEmail {
  return { kind, to: o.email, subject, body: lines.join("\n") };
}
