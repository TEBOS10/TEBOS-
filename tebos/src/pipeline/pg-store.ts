// Postgres side of the client pipeline. Each step and the email that goes
// with it are written in one transaction, as TEBOS's pipeline agent; the
// database's guards (migration client_pipeline) decide whether the step is
// allowed.

import pg from "pg";
import { DELIVERY_PLANS } from "../domain/delivery";
import type { PlanKey } from "../domain/plans";
import type { PaystackWebhookStore } from "./paystack-webhook";
import type { Screening, ScreeningHistory } from "./screening";
import { MAX_EMAIL_ATTEMPTS, type NewEnquiry, type Opportunity, type OutboxEmail, type PendingEmail, type PipelineStore, type Template } from "./worker";

const RETRY_AFTER = "5 minutes";

const toOpportunity = (r: { id: string; plan: PlanKey; contact_name: string; business: string; email: string }): Opportunity => ({
  id: r.id, plan: r.plan, contactName: r.contact_name, business: r.business, email: r.email,
});

export class PgPipelineStore implements PipelineStore, PaystackWebhookStore {
  constructor(private readonly pool: pg.Pool, private readonly actorId = "pipeline-worker") {}

  private async tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
    const c = await this.pool.connect();
    try {
      await c.query("begin");
      await c.query("select set_config('tebos.actor_type', 'agent', true), set_config('tebos.actor_id', $1, true)", [this.actorId]);
      const out = await fn(c);
      await c.query("commit");
      return out;
    } catch (err) {
      await c.query("rollback").catch(() => {});
      throw err;
    } finally {
      c.release();
    }
  }

  private async outbox(c: pg.PoolClient, opportunityId: string, m: OutboxEmail) {
    await c.query(
      `insert into public.outbox_emails (opportunity_id, kind, to_email, subject, body) values ($1, $2, $3, $4, $5)
       on conflict (opportunity_id, kind) do nothing`,
      [opportunityId, m.kind, m.to, m.subject, m.body],
    );
  }

  async nextNewEnquiry(): Promise<{ enquiry: NewEnquiry; history: ScreeningHistory } | null> {
    const { rows } = await this.pool.query(
      `select e.id, e.plan, e.name, e.business, e.email, e.phone, e.website, e.message, e.source, e.added_by,
              (select count(*)::int from public.enquiries p where p.created_at < e.created_at and lower(p.email) = lower(e.email)) as same_email,
              (select count(*)::int from public.enquiries p where p.created_at < e.created_at
                  and split_part(lower(p.email), '@', 2) = split_part(lower(e.email), '@', 2)) as same_domain
         from public.enquiries e
        where not exists (select 1 from public.opportunities o where o.enquiry_id = e.id)
        order by e.created_at limit 1`,
    );
    const r = rows[0];
    if (!r) return null;
    return {
      enquiry: { id: r.id, plan: r.plan, name: r.name, business: r.business, email: r.email, phone: r.phone, website: r.website, message: r.message,
                 source: r.source, addedBy: r.added_by },
      history: { sameEmail: r.same_email, sameDomain: r.same_domain },
    };
  }

  async openOpportunity(e: NewEnquiry, s: Screening): Promise<string> {
    return this.tx(async (c) => {
      const ins = await c.query(
        // a lead from sales stays with the salesperson who added it
        `insert into public.opportunities (enquiry_id, plan, contact_name, business, email, phone, website, message, source, owner_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) on conflict (enquiry_id) do nothing returning id`,
        [e.id, e.plan, e.name, e.business, e.email.trim().toLowerCase(), e.phone, e.website, e.message, e.source ?? "website", e.addedBy ?? null],
      );
      const id: string = ins.rows[0]?.id ?? (await c.query("select id from public.opportunities where enquiry_id = $1", [e.id])).rows[0].id;
      await c.query(
        `update public.opportunities set status = 'screened', screened_at = now(),
                screening = jsonb_build_object('flags', $2::jsonb, 'email_domain', $3::text, 'website_domain', $4::text)
          where id = $1 and status = 'new'`,
        [id, JSON.stringify(s.flags), s.emailDomain, s.websiteDomain],
      );
      return id;
    });
  }

  async nextAwaitingLink(): Promise<Opportunity | null> {
    const { rows } = await this.pool.query(
      `select id, plan, contact_name, business, email from public.opportunities
        where status = 'approved' and plan <> 'equity' and payment_url is null order by decided_at limit 1`,
    );
    return rows[0] ? toOpportunity(rows[0]) : null;
  }

  async recordPaymentLink(id: string, amountCents: number, url: string, reference: string, email: OutboxEmail): Promise<void> {
    await this.tx(async (c) => {
      await c.query(
        `update public.opportunities set amount_cents = $2, payment_url = $3, payment_reference = $4, status = 'awaiting_payment'
          where id = $1 and status = 'approved'`,
        [id, amountCents, url, reference],
      );
      await this.outbox(c, id, email);
    });
  }

  async nextPaid(): Promise<Opportunity | null> {
    const { rows } = await this.pool.query(
      `select o.id, o.plan, o.contact_name, o.business, o.email from public.opportunities o
        where o.status = 'paid' and not exists (select 1 from public.contracts c where c.opportunity_id = o.id)
        order by o.updated_at limit 1`,
    );
    return rows[0] ? toOpportunity(rows[0]) : null;
  }

  async approvedTemplate(plan: PlanKey): Promise<Template | null> {
    const { rows } = await this.pool.query(
      "select key, version, title, body from public.contract_templates where plan = $1 and status = 'approved' limit 1",
      [plan],
    );
    return rows[0] ?? null;
  }

  async recordContract(id: string, t: Template, body: string, bodyHash: string, tokenHash: string, email: OutboxEmail): Promise<void> {
    await this.tx(async (c) => {
      await c.query(
        `insert into public.contracts (opportunity_id, template_key, template_version, title, body, body_hash, token_hash)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [id, t.key, t.version, t.title, body, bodyHash, tokenHash],
      );
      await c.query("update public.opportunities set status = 'contract_sent' where id = $1 and status = 'paid'", [id]);
      await this.outbox(c, id, email);
    });
  }

  async nextContracted(): Promise<Opportunity | null> {
    const { rows } = await this.pool.query(
      "select id, plan, contact_name, business, email from public.opportunities where status = 'contracted' order by updated_at limit 1",
    );
    return rows[0] ? toOpportunity(rows[0]) : null;
  }

  async onboard(id: string, orgName: string, slug: string, inviteTokenHash: string, email: OutboxEmail): Promise<string> {
    return this.tx(async (c) => {
      const o = (await c.query("select email, plan, maintainer_id from public.opportunities where id = $1 and status = 'contracted' for update", [id])).rows[0];
      if (!o) throw new Error(`opportunity ${id} is not waiting for onboarding`);
      const orgId: string = (await c.query("insert into public.organisations (name, slug) values ($1, $2) returning id", [orgName, slug])).rows[0].id;
      // the client's own admin joins through the invitation, bound to the contracted email address
      await c.query(
        `insert into public.invitations (org_id, email, role, token_hash, expires_at) values ($1, lower($2), 'org_admin', $3, now() + interval '30 days')`,
        [orgId, o.email, inviteTokenHash],
      );
      // their TEBOS maintainer looks after the organisation from the start
      if (o.maintainer_id) {
        await c.query("insert into public.memberships (org_id, user_id, role) values ($1, $2, 'operator') on conflict do nothing", [orgId, o.maintainer_id]);
      }
      await c.query("update public.opportunities set org_id = $2, status = 'onboarded' where id = $1", [id, orgId]);
      // the delivery plan TEBOS now owes the client, dated from today
      const steps = DELIVERY_PLANS[o.plan as PlanKey] ?? DELIVERY_PLANS.starter;
      for (const [i, step] of steps.entries()) {
        await c.query(
          `insert into public.delivery_tasks (opportunity_id, org_id, key, position, title, done_means, due_at)
           values ($1, $2, $3, $4, $5, $6, now() + make_interval(days => $7)) on conflict (opportunity_id, key) do nothing`,
          [id, orgId, step.key, i + 1, step.title, step.done, step.dueDays],
        );
      }
      await this.outbox(c, id, email);
      return orgId;
    });
  }

  async claimEmail(): Promise<PendingEmail | null> {
    const { rows } = await this.pool.query(
      `with next as (
         select id from public.outbox_emails
          where sent_at is null and attempts < $1 and coalesce(last_try, '-infinity') < now() - interval '${RETRY_AFTER}'
          order by created_at for update skip locked limit 1
       )
       update public.outbox_emails m set attempts = m.attempts + 1, last_try = now()
         from next where m.id = next.id
       returning m.id, m.opportunity_id, m.kind, m.to_email, m.subject, m.body, m.attempts`,
      [MAX_EMAIL_ATTEMPTS],
    );
    const r = rows[0];
    return r ? { id: r.id, opportunityId: r.opportunity_id, kind: r.kind, to: r.to_email, subject: r.subject, body: r.body, attempts: r.attempts } : null;
  }

  async markEmailSent(id: string, providerReference: string): Promise<void> {
    await this.pool.query("update public.outbox_emails set sent_at = now(), provider_reference = $2, error = null where id = $1 and sent_at is null", [id, providerReference]);
  }

  async markEmailFailed(id: string, detail: string): Promise<void> {
    await this.pool.query("update public.outbox_emails set error = $2 where id = $1", [id, detail.slice(0, 1000)]);
  }

  // --- Paystack webhook -----------------------------------------------------

  async opportunityForReference(reference: string) {
    const r = (await this.pool.query("select id, amount_cents, status from public.opportunities where payment_reference = $1", [reference])).rows[0];
    return r ? { id: r.id as string, amountCents: r.amount_cents as number | null, status: r.status as string } : null;
  }

  async recordProviderPayment(opportunityId: string, p: { reference: string; amountCents: number; paidAt: string; raw: unknown }): Promise<boolean> {
    return this.tx(async (c) => {
      const { rowCount } = await c.query(
        `insert into public.payments (opportunity_id, provider, reference, amount_cents, status, paid_at, raw)
         values ($1, 'paystack', $2, $3, 'success', $4, $5) on conflict (provider, reference) do nothing`,
        [opportunityId, p.reference, p.amountCents, p.paidAt, JSON.stringify(p.raw)],
      );
      return (rowCount ?? 0) > 0;
    });
  }

  async markPaid(opportunityId: string): Promise<boolean> {
    return this.tx(async (c) => {
      const { rowCount } = await c.query("update public.opportunities set status = 'paid' where id = $1 and status = 'awaiting_payment'", [opportunityId]);
      return (rowCount ?? 0) > 0;
    });
  }
}
