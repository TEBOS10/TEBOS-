// Postgres implementation of the interview store. Connects as TEBOS's server
// role; each write declares the actor (agent, interview-worker:<id>) so the
// audit trail attributes it. The schema's guards still apply: legal status
// transitions, a transcript written once, missed calls that say why.

import pg from "pg";
import type { ConversationSnapshot, TranscriptTurn } from "./voice";
import type { AcceptedAnswer } from "./extract";
import type { ActiveCall, CallBrief, CompletedCall, DueCall, InterviewStore } from "./worker";

const mmss = (secs: number | null) => (secs === null ? "unknown time" : `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, "0")}`);

export class PgInterviewStore implements InterviewStore {
  private readonly actor: string;
  constructor(
    private readonly pool: pg.Pool,
    workerId: string,
  ) {
    this.actor = `interview-worker:${workerId}`;
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

  async claimDueCall(provider: string): Promise<DueCall | null> {
    return this.tx(async (c) => {
      const { rows } = await c.query(
        `with next as (
           select id from public.interview_sessions
            where channel = 'voice' and status = 'scheduled' and scheduled_for <= now()
            order by scheduled_for for update skip locked limit 1
         )
         update public.interview_sessions s set status = 'dialling', provider = $1, started_at = now()
           from next where s.id = next.id
         returning s.id, s.org_id, s.business_id, s.phone_number, s.playbook_key, s.playbook_version`,
        [provider],
      );
      const r = rows[0];
      return r ? { id: r.id, orgId: r.org_id, businessId: r.business_id, phoneNumber: r.phone_number, playbookKey: r.playbook_key, playbookVersion: r.playbook_version } : null;
    });
  }

  async loadBrief(call: DueCall): Promise<CallBrief> {
    const [biz, findings, contexts] = await Promise.all([
      this.pool.query("select name, website from public.businesses where id = $1", [call.businessId]),
      this.pool.query(
        "select title, statement from public.findings where business_id = $1 and status = 'active' order by confidence desc, created_at desc limit 8",
        [call.businessId],
      ),
      this.pool.query(
        "select kind, statement from public.business_contexts where business_id = $1 and retired_at is null order by created_at desc limit 8",
        [call.businessId],
      ),
    ]);
    return {
      businessName: biz.rows[0]?.name ?? "the business",
      website: biz.rows[0]?.website ?? null,
      knownFromScan: findings.rows.map((f) => `${f.title}: ${f.statement}`),
      ownerContext: contexts.rows.map((x) => `${x.kind}: ${x.statement}`),
    };
  }

  async recordPlaced(id: string, providerReference: string): Promise<void> {
    await this.tx((c) => c.query("update public.interview_sessions set provider_reference = $2 where id = $1", [id, providerReference]));
  }

  async recordFailed(id: string, status: "no_answer" | "failed", detail: string): Promise<void> {
    await this.tx(async (c) => {
      const cur = (await c.query("select status from public.interview_sessions where id = $1 for update", [id])).rows[0];
      if (!cur || !["dialling", "in_progress"].includes(cur.status)) return;
      // once someone answered, a call that goes wrong has failed; it was not unanswered
      const final = cur.status === "in_progress" ? "failed" : status;
      await c.query("update public.interview_sessions set status = $2, failure_detail = $3, ended_at = now() where id = $1", [id, final, detail.slice(0, 1000)]);
    });
  }

  async nextActiveCall(): Promise<ActiveCall | null> {
    return this.tx(async (c) => {
      const { rows } = await c.query(
        `select id, status, provider_reference, started_at from public.interview_sessions
          where channel = 'voice' and status in ('dialling', 'in_progress')
            and coalesce(last_checked_at, started_at, created_at) < now() - interval '20 seconds'
          order by coalesce(last_checked_at, started_at, created_at) for update skip locked limit 1`,
      );
      const r = rows[0];
      if (!r) return null;
      await c.query("update public.interview_sessions set last_checked_at = now() where id = $1", [r.id]); // lease
      return { id: r.id, status: r.status, providerReference: r.provider_reference, startedAt: r.started_at ? new Date(r.started_at).toISOString() : null };
    });
  }

  async recordProgress(id: string): Promise<void> {
    await this.tx((c) => c.query("update public.interview_sessions set last_checked_at = now() where id = $1", [id]));
  }

  async recordCompleted(id: string, snap: ConversationSnapshot): Promise<void> {
    await this.tx(async (c) => {
      const cur = (await c.query("select status from public.interview_sessions where id = $1 for update", [id])).rows[0];
      if (!cur || !["dialling", "in_progress"].includes(cur.status)) return;
      if (cur.status === "dialling") await c.query("update public.interview_sessions set status = 'in_progress' where id = $1", [id]);
      const transcript = snap.transcript.map((t) => ({ role: t.role, message: t.message, time_in_call_secs: t.timeInCallSecs }));
      await c.query(
        "update public.interview_sessions set status = 'completed', ended_at = now(), duration_seconds = $2, transcript = $3 where id = $1",
        [id, snap.durationSecs === null ? null : Math.round(snap.durationSecs), JSON.stringify(transcript)],
      );
    });
  }

  async nextExtraction(): Promise<CompletedCall | null> {
    return this.tx(async (c) => {
      const { rows } = await c.query(
        `select id, org_id, business_id, playbook_key, playbook_version, transcript from public.interview_sessions
          where channel = 'voice' and status = 'completed' and extraction_status = 'pending'
          order by ended_at for update skip locked limit 1`,
      );
      const r = rows[0];
      if (!r) return null;
      const transcript: TranscriptTurn[] = (r.transcript ?? []).map((t: { role: "agent" | "user"; message: string; time_in_call_secs: number | null }) => ({
        role: t.role,
        message: t.message,
        timeInCallSecs: t.time_in_call_secs,
      }));
      return { id: r.id, orgId: r.org_id, businessId: r.business_id, playbookKey: r.playbook_key, playbookVersion: r.playbook_version, transcript };
    });
  }

  async recordExtraction(call: CompletedCall, result: { status: "done" | "failed" | "not_available"; detail: string; answers: AcceptedAnswer[] }): Promise<void> {
    await this.tx(async (c) => {
      if (result.answers.length) {
        const uri = `interview:${call.id}`;
        await c.query(
          `insert into public.sources (org_id, business_id, source_type, uri, label, reliability)
           values ($1, $2, 'user_statement', $3, 'Diagnostic interview (call)', 0.6)
           on conflict (business_id, source_type, (coalesce(uri, ''))) do nothing`,
          [call.orgId, call.businessId, uri],
        );
        const source = (await c.query("select id from public.sources where business_id = $1 and source_type = 'user_statement' and uri = $2", [call.businessId, uri])).rows[0].id;
        for (const a of result.answers) {
          await c.query(
            `insert into public.evidence (org_id, business_id, source_id, state, fact, excerpt, structured_value, content_location, retrieved_at, extraction_status)
             values ($1, $2, $3, 'user_supplied', $4, $5, $6, $7, now(), 'complete')`,
            [
              call.orgId, call.businessId, source, a.summary, a.quote,
              { interview_id: call.id, question_key: a.questionKey, question: a.question, channel: "voice", turn: a.turn,
                time_in_call_secs: a.timeInCallSecs, playbook: `${call.playbookKey}@${call.playbookVersion}` },
              `call at ${mmss(a.timeInCallSecs)}`,
            ],
          );
        }
      }
      await c.query("update public.interview_sessions set extraction_status = $2, extraction_detail = $3 where id = $1", [
        call.id, result.status, result.detail.slice(0, 2000),
      ]);
    });
  }
}
