// Postgres side of monthly billing. Each step and the email that goes with
// it are written in one transaction, as TEBOS's billing agent; the database
// decides whether the step is allowed (migration monthly_billing).

import pg from "pg";
import { REMINDERS } from "../domain/billing";
import type { OutboxEmail } from "../pipeline/worker";
import type { BillingStore, DueAccount, InvoiceToSend } from "./worker";

const INVOICE_COLUMNS = `i.id, i.number, i.amount_cents, i.period_start::text, i.period_end::text, i.due_on::text, i.payment_url,
                         o.contact_name, o.business, o.email`;

const toInvoice = (r: Record<string, unknown>): InvoiceToSend => ({
  id: r.id as string, number: r.number as string, amountCents: r.amount_cents as number,
  periodStart: r.period_start as string, periodEnd: r.period_end as string, dueOn: r.due_on as string,
  paymentUrl: (r.payment_url as string | null) ?? null, contactName: r.contact_name as string, business: r.business as string, email: r.email as string,
});

export class PgBillingStore implements BillingStore {
  constructor(private readonly pool: pg.Pool, private readonly actorId = "billing-worker") {}

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

  private async outbox(c: pg.PoolClient, invoiceId: string, m: OutboxEmail) {
    await c.query(
      `insert into public.outbox_emails (opportunity_id, invoice_id, kind, to_email, subject, body)
       select opportunity_id, id, $2, $3, $4, $5 from public.invoices where id = $1
       on conflict (invoice_id, kind) where invoice_id is not null do nothing`,
      [invoiceId, m.kind, m.to, m.subject, m.body],
    );
  }

  async nextDueAccount(today: string): Promise<DueAccount | null> {
    const { rows } = await this.pool.query(
      `select id, opportunity_id, monthly_cents, next_invoice_on::text, anchor_day from public.billing_accounts
        where status = 'active' and next_invoice_on <= $1::date order by next_invoice_on limit 1`,
      [today],
    );
    const r = rows[0];
    return r ? { id: r.id, opportunityId: r.opportunity_id, monthlyCents: r.monthly_cents, nextInvoiceOn: r.next_invoice_on, anchorDay: r.anchor_day } : null;
  }

  async issueInvoice(a: DueAccount, inv: { periodStart: string; periodEnd: string; dueOn: string; issuedOn: string }, nextInvoiceOn: string): Promise<string | null> {
    return this.tx(async (c) => {
      // still due, at the same fee, since it was read
      const cur = (await c.query(
        `select b.org_id from public.billing_accounts b
          where b.id = $1 and b.status = 'active' and b.next_invoice_on = $2::date and b.monthly_cents = $3 for update`,
        [a.id, a.nextInvoiceOn, a.monthlyCents],
      )).rows[0];
      if (!cur) return null;
      const id: string = (await c.query(
        `insert into public.invoices (billing_account_id, opportunity_id, org_id, period_start, period_end, amount_cents, issued_on, due_on)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         on conflict (billing_account_id, period_start) do nothing returning id`,
        [a.id, a.opportunityId, cur.org_id, inv.periodStart, inv.periodEnd, a.monthlyCents, inv.issuedOn, inv.dueOn],
      )).rows[0]?.id;
      await c.query("update public.billing_accounts set next_invoice_on = $2 where id = $1", [a.id, nextInvoiceOn]);
      return id ?? null;
    });
  }

  async nextUnlinkedInvoice(): Promise<InvoiceToSend | null> {
    const { rows } = await this.pool.query(
      `select ${INVOICE_COLUMNS} from public.invoices i join public.opportunities o on o.id = i.opportunity_id
        where i.status = 'open' and i.payment_url is null order by i.created_at limit 1`,
    );
    return rows[0] ? toInvoice(rows[0]) : null;
  }

  async recordInvoiceLink(invoiceId: string, url: string, reference: string, email: OutboxEmail): Promise<void> {
    await this.tx(async (c) => {
      await c.query("update public.invoices set payment_url = $2, payment_reference = $3 where id = $1 and payment_url is null", [invoiceId, url, reference]);
      await this.outbox(c, invoiceId, email);
    });
  }

  async nextReminder(today: string): Promise<{ invoice: InvoiceToSend; kind: OutboxEmail["kind"] } | null> {
    // only the latest reminder the invoice is late enough for, and only if neither it nor a later one
    // went out: a very late invoice gets the second reminder, never the first after it
    const cases = REMINDERS.map((r, i) => {
      const laterOrSame = REMINDERS.slice(i).map((x) => `'${x.kind}'`).join(", ");
      return `when $1::date - i.due_on >= ${r.daysLate} and not exists (select 1 from public.outbox_emails m where m.invoice_id = i.id and m.kind in (${laterOrSame})) then ${i}`;
    });
    const { rows } = await this.pool.query(
      `select * from (
         select ${INVOICE_COLUMNS},
                case ${[...cases].reverse().join(" ")} else null end as reminder
           from public.invoices i join public.opportunities o on o.id = i.opportunity_id
          where i.status = 'open' and i.payment_url is not null and i.due_on < $1::date
       ) x where reminder is not null order by due_on limit 1`,
      [today],
    );
    const r = rows[0];
    return r ? { invoice: toInvoice(r), kind: REMINDERS[r.reminder as number]!.kind } : null;
  }

  async queueReminder(invoiceId: string, email: OutboxEmail): Promise<void> {
    await this.tx(async (c) => {
      await this.outbox(c, invoiceId, email);
    });
  }
}
