// Postgres implementation of the intake store. Connects as TEBOS's server
// role; each write declares the actor (agent, intake-worker:<id>) so the audit
// trail attributes it. The schema's guards still apply: forward-only states, a
// transcript written once, an answer never overwritten, missed calls that say why.

import pg from "pg";
import type { ConversationSnapshot } from "../interviews/voice";
import type { DueFollowUp, IntakeStore, LiveCall, RequestedCall } from "./worker";

export class PgIntakeStore implements IntakeStore {
  private readonly actor: string;
  constructor(
    private readonly pool: pg.Pool,
    workerId: string,
  ) {
    this.actor = `intake-worker:${workerId}`;
  }

  private async tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
    const c = await this.pool.connect();
    try {
      await c.query("begin");
      await c.query("select set_config('tebos.actor_type', 'agent', true), set_config('tebos.actor_id', $1, true)", [this.actor]);
      const r = await fn(c);
      await c.query("commit");
      return r;
    } catch (err) {
      await c.query("rollback").catch(() => {});
      throw err;
    } finally {
      c.release();
    }
  }

  async claimRequested(provider: string): Promise<RequestedCall | null> {
    return this.tx(async (c) => {
      const { rows } = await c.query(
        `with next as (
           select id from public.intake_calls where status = 'requested'
            order by created_at for update skip locked limit 1
         )
         update public.intake_calls i set status = 'dialling', provider = $1, started_at = now(), checked_at = now()
           from next, public.enquiries e
          where i.id = next.id and e.id = i.enquiry_id
         returning i.id, i.phone_number, e.name, e.business, e.industry`,
        [provider],
      );
      const r = rows[0];
      return r ? { id: r.id, phoneNumber: r.phone_number, name: r.name, business: r.business, industry: r.industry } : null;
    });
  }

  async recordPlaced(id: string, providerReference: string): Promise<void> {
    await this.tx((c) => c.query("update public.intake_calls set provider_reference = $2 where id = $1 and status = 'dialling'", [id, providerReference]));
  }

  async recordFailed(id: string, status: "no_answer" | "failed", detail: string): Promise<void> {
    await this.tx((c) =>
      c.query(
        "update public.intake_calls set status = $2, failure_detail = left($3, 1000), ended_at = now() where id = $1 and status in ('requested', 'dialling', 'in_progress')",
        [id, status, detail],
      ),
    );
  }

  async nextLiveCall(): Promise<LiveCall | null> {
    return this.tx(async (c) => {
      const { rows } = await c.query(
        `select id, provider_reference, started_at from public.intake_calls
          where status in ('dialling', 'in_progress')
          order by checked_at nulls first for update skip locked limit 1`,
      );
      const r = rows[0];
      return r ? { id: r.id, providerReference: r.provider_reference, startedAt: r.started_at ? new Date(r.started_at).toISOString() : null } : null;
    });
  }

  async recordProgress(id: string): Promise<void> {
    await this.tx((c) =>
      c.query(
        `update public.intake_calls
            set checked_at = now(), status = case when status = 'dialling' and provider_reference is not null then 'in_progress' else status end
          where id = $1 and status in ('dialling', 'in_progress')`,
        [id],
      ),
    );
  }

  async recordCompleted(id: string, snap: ConversationSnapshot, wantsToProceed: boolean | null, followUpDueAt: Date): Promise<void> {
    await this.tx(async (c) => {
      const cur = (await c.query("select status from public.intake_calls where id = $1 for update", [id])).rows[0];
      if (!cur || !["dialling", "in_progress"].includes(cur.status)) return;
      const transcript = snap.transcript.map((t) => ({ role: t.role, message: t.message, time_in_call_secs: t.timeInCallSecs }));
      await c.query(
        `update public.intake_calls
            set status = 'completed', ended_at = now(), checked_at = now(), duration_secs = $2, transcript = $3,
                wants_to_proceed = $4, outcome_source = case when $4::boolean is null then null else 'call' end, follow_up_due_at = $5
          where id = $1`,
        [id, snap.durationSecs === null ? null : Math.round(snap.durationSecs), JSON.stringify(transcript), wantsToProceed, followUpDueAt],
      );
    });
  }

  async nextDueFollowUp(): Promise<DueFollowUp | null> {
    const { rows } = await this.pool.query(
      `select i.id, o.id as opportunity_id, e.name, e.business, e.email, e.industry, i.wants_to_proceed
         from public.intake_calls i
         join public.enquiries e on e.id = i.enquiry_id
         join public.opportunities o on o.enquiry_id = e.id
        where i.status = 'completed' and i.follow_up_queued_at is null and i.follow_up_due_at <= now()
        order by i.follow_up_due_at limit 1`,
    );
    const r = rows[0];
    return r
      ? { id: r.id, opportunityId: r.opportunity_id, name: r.name, business: r.business, email: r.email, industry: r.industry, wantsToProceed: r.wants_to_proceed }
      : null;
  }

  async queueFollowUp(f: DueFollowUp, email: { subject: string; text: string }): Promise<void> {
    await this.tx(async (c) => {
      const claimed = await c.query(
        "update public.intake_calls set follow_up_queued_at = now() where id = $1 and follow_up_queued_at is null returning id",
        [f.id],
      );
      if (!claimed.rowCount) return;
      await c.query(
        `insert into public.outbox_emails (opportunity_id, kind, to_email, subject, body) values ($1, 'intake_follow_up', $2, $3, $4)
         on conflict (opportunity_id, kind) where invoice_id is null do nothing`,
        [f.opportunityId, f.email, email.subject, email.text],
      );
    });
  }
}
