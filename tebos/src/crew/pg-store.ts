import type pg from "pg";
import type { CrewJob, CrewStore } from "./worker";

export class PgCrewStore implements CrewStore {
  constructor(private readonly pool: pg.Pool) {}

  async nextJob(skip: string[]): Promise<CrewJob | null> {
    const { rows } = await this.pool.query(
      `select t.id, t.org_id, t.kind, t.brief, coalesce(s.public_name, o.name) as business,
              split_part(b.customer_name, ' ', 1) as first_name, s.deposit_instructions
         from public.ai_tasks t
         join public.organisations o on o.id = t.org_id
         left join public.booking_settings s on s.org_id = t.org_id
         left join public.bookings b on b.id = t.booking_id
        where t.status = 'queued' and not (t.id = any($1::uuid[]))
          and exists (select 1 from public.ai_agents a where a.org_id = t.org_id and a.team = t.team and a.status = 'active')
        order by t.created_at limit 1`,
      [skip],
    );
    const r = rows[0];
    if (!r) return null;
    const agents = await this.pool.query(
      "select id, name, team, shift, status, instructions from public.ai_agents where org_id = $1 and status = 'active'",
      [r.org_id],
    );
    return {
      id: r.id, orgId: r.org_id, kind: r.kind, brief: r.brief, business: r.business,
      customerFirstName: r.first_name || null, depositInstructions: r.deposit_instructions ?? null, agents: agents.rows,
    };
  }

  async saveDraft(taskId: string, agentId: string, draft: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      "update public.ai_tasks set status = 'drafted', draft = $2, agent_id = $3 where id = $1 and status = 'queued'",
      [taskId, draft, agentId],
    );
    return rowCount === 1;
  }
}
