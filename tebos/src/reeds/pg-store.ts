// Postgres side of the REEDS worker. Writes as the REEDS agent; every change
// passes the ledger's guards (src/../supabase/migrations/*_work_requests.sql).

import pg from "pg";
import type { CheckResult, TaskSpec, WorkReport } from "../domain/work";
import { runCheck, verifyCheck, type CheckInput, type Verification } from "./checks";
import type { ClaimedTask, ClosableRequest, ReceivedRequest, WorkStore } from "./worker";

const toTask = (r: Record<string, unknown>): ClaimedTask => ({
  id: r.id as string,
  requestId: r.request_id as string,
  key: r.key as string,
  executor: r.executor as string,
  input: { orgId: r.org_id as string, asOf: (r.input as { as_of: string }).as_of },
  attempts: r.attempts as number,
  maxAttempts: r.max_attempts as number,
  result: (r.result as CheckResult | null) ?? undefined,
});

export class PgWorkStore implements WorkStore {
  constructor(private readonly pool: pg.Pool, private readonly actorId = "reeds-worker") {}

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

  async nextReceived(): Promise<ReceivedRequest | null> {
    const { rows } = await this.pool.query(
      `select id, org_id, kind, requested_by, task_title, task_acceptance, task_executor
         from public.work_requests where status = 'received' order by created_at limit 1`);
    const r = rows[0];
    if (!r) return null;
    const ask = r.task_title && r.task_acceptance && r.task_executor
      ? { title: r.task_title, acceptance: r.task_acceptance, executor: r.task_executor }
      : undefined;
    return { id: r.id, orgId: r.org_id, kind: r.kind, requestedBy: r.requested_by, ask };
  }

  async isPlatformAdmin(userId: string) {
    return (await this.pool.query("select exists (select 1 from public.platform_admins where user_id = $1) as ok", [userId])).rows[0].ok as boolean;
  }

  async plan(requestId: string, orgId: string, tasks: TaskSpec[], asOf: string) {
    await this.tx(async (c) => {
      for (const [i, t] of tasks.entries()) {
        await c.query(
          `insert into public.work_tasks (request_id, org_id, position, key, title, executor, acceptance, input, status)
           values ($1, $2, $3, $4, $5, $6, $7, $8, 'queued')`,
          [requestId, orgId, i + 1, t.key, t.title, t.executor, t.acceptance, JSON.stringify({ as_of: asOf })],
        );
      }
      await c.query("update public.work_requests set status = 'planned' where id = $1 and status = 'received'", [requestId]);
      await c.query("update public.work_requests set status = 'running' where id = $1 and status = 'planned'", [requestId]);
    });
  }

  async failRequest(requestId: string, detail: string) {
    await this.tx(async (c) => {
      // tasks that never ran are cancelled with it, so nothing is left waiting
      await c.query("update public.work_tasks set status = 'cancelled' where request_id = $1 and status = 'queued'", [requestId]);
      await c.query("update public.work_requests set status = 'failed', failure_detail = $2 where id = $1 and status in ('received', 'running')",
        [requestId, detail.slice(0, 2000)]);
    });
  }

  async nextDone(): Promise<ClaimedTask | null> {
    const { rows } = await this.pool.query(
      // an AI client's work is reviewed by a person, never by this worker
      "select * from public.work_tasks where status = 'done' and executor not like 'external.%' order by finished_at, position limit 1");
    return rows[0] ? toTask(rows[0]) : null;
  }

  async claimQueued(): Promise<ClaimedTask | null> {
    return this.tx(async (c) => {
      const { rows } = await c.query(
        `update public.work_tasks set status = 'running'
          where id = (select t.id from public.work_tasks t join public.work_requests r on r.id = t.request_id
                       where t.status = 'queued' and r.status = 'running' and t.executor not like 'external.%'
                       order by r.created_at, t.position limit 1 for update of t skip locked)
          returning *`);
      return rows[0] ? toTask(rows[0]) : null;
    });
  }

  async finishTask(taskId: string, result: CheckResult) {
    await this.tx((c) => c.query("update public.work_tasks set status = 'done', result = $2, error = null where id = $1 and status = 'running'",
      [taskId, JSON.stringify(result)]));
  }

  async taskError(task: ClaimedTask, error: string): Promise<"retry" | "failed"> {
    const outcome = task.attempts < task.maxAttempts ? "retry" : "failed";
    await this.tx((c) => c.query("update public.work_tasks set status = $2, error = $3 where id = $1 and status = 'running'",
      [task.id, outcome === "retry" ? "queued" : "failed", error]));
    return outcome;
  }

  async recordVerification(taskId: string, v: Verification) {
    await this.tx((c) => c.query("update public.work_tasks set status = $2, verification = $3 where id = $1 and status = 'done'",
      [taskId, v.ok ? "verified" : "rejected", JSON.stringify(v)]));
  }

  async nextClosable(): Promise<ClosableRequest | null> {
    const { rows } = await this.pool.query(
      `select r.id, r.kind from public.work_requests r
        where r.status = 'running'
          and not exists (select 1 from public.work_tasks t where t.request_id = r.id and t.status in ('queued', 'running', 'done'))
        order by r.created_at limit 1`);
    if (!rows[0]) return null;
    const tasks = (await this.pool.query(
      "select key, title, status, result, error, verification from public.work_tasks where request_id = $1 order by position", [rows[0].id])).rows;
    return { id: rows[0].id, kind: rows[0].kind, tasks };
  }

  async complete(requestId: string, report: WorkReport) {
    await this.tx(async (c) => {
      await c.query("update public.work_requests set status = 'verifying' where id = $1 and status = 'running'", [requestId]);
      await c.query("update public.work_requests set status = 'completed', report = $2 where id = $1 and status = 'verifying'",
        [requestId, JSON.stringify(report)]);
    });
  }

  async run(executor: string, input: CheckInput) {
    return runCheck(this.pool, executor, input);
  }

  async verify(executor: string, input: CheckInput, result: CheckResult) {
    return verifyCheck(this.pool, executor, input, result);
  }

  async fileDueBrief(): Promise<string | null> {
    const { rows } = await this.pool.query(
      `select s.org_id, s.requested_by from public.reeds_standing_requests s
         join public.organisations o on o.id = s.org_id
        where s.active and s.kind = 'signal_brief' and o.app <> 'tepos'
          and exists (select 1 from public.memberships m where m.org_id = s.org_id and m.user_id = s.requested_by
                       and m.role in ('org_admin', 'operator'))
          and not exists (select 1 from public.work_requests r where r.org_id = s.org_id and r.kind = 'signal_brief'
                           and r.created_at > now() - interval '6 days')
        order by s.created_at limit 1`);
    const due = rows[0];
    if (!due) return null;
    return this.tx(async (c) => {
      const ins = await c.query(
        `insert into public.work_requests (org_id, kind, status, requested_by) values ($1, 'signal_brief', 'received', $2) returning id`,
        [due.org_id, due.requested_by]);
      return ins.rows[0].id as string;
    });
  }
}
