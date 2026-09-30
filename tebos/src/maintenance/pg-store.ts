// Postgres side of the maintenance worker. Reads a client's records as
// TEBOS's server and writes only the queue (maintainer_items), attributed to
// the maintenance agent.

import pg from "pg";
import { DISMISS_FOR_DAYS, signalKey, type ClientState, type Signal } from "../domain/maintenance";
import type { MaintenanceStore, OpenItem } from "./worker";

export class PgMaintenanceStore implements MaintenanceStore {
  constructor(private readonly pool: pg.Pool, private readonly actorId = "maintenance-worker") {}

  async nextOrgToScan() {
    const { rows } = await this.pool.query(
      `with orgs as (
         select o.org_id, o.id as opportunity_id from public.opportunities o where o.status = 'onboarded' and o.org_id is not null
         union all
         select c.org_id, null from tebos_private.company_orgs c
       )
       select orgs.org_id, orgs.opportunity_id from orgs
         left join tebos_private.maintenance_scans s on s.org_id = orgs.org_id
        where coalesce(s.scanned_at, '-infinity') < now() - interval '1 hour'
        order by coalesce(s.scanned_at, '-infinity') limit 1`,
    );
    return rows[0] ? { orgId: rows[0].org_id as string, opportunityId: (rows[0].opportunity_id as string | null) ?? null } : null;
  }

  async clientState(orgId: string): Promise<ClientState> {
    const [objectives, connections, findings, approvals] = await Promise.all([
      this.pool.query(
        `select o.id, o.title, o.direction, o.target_value::float as target, o.due_on::text as due_on,
                coalesce((select max(a.occurred_at) from public.audit_events a
                           where a.entity_type = 'objectives' and a.entity_id = o.id and a.after ->> 'status' = 'active'), o.created_at) as activated_at,
                m.value::float as value, m.measured_at
           from public.objectives o
           left join lateral (select value, measured_at from public.objective_measurements
                               where objective_id = o.id and basis = 'measured' order by measured_at desc limit 1) m on true
          where o.org_id = $1 and o.status = 'active'`, [orgId]),
      this.pool.query(
        `select ci.id, coalesce(c.name, ci.connector_key) || coalesce(' (' || b.name || ')', '') as label, ci.status,
                coalesce(ci.last_failure_at, ci.updated_at) as since
           from public.connection_instances ci
           left join public.connectors c on c.key = ci.connector_key
           left join public.businesses b on b.id = ci.business_id
          where ci.org_id = $1 and ci.status in ('authentication_required', 'expired', 'unavailable', 'degraded')`, [orgId]),
      this.pool.query("select count(*)::int as n, min(created_at) as oldest from public.findings where org_id = $1 and status = 'draft'", [orgId]),
      this.pool.query("select count(*)::int as n, min(requested_at) as oldest from public.approvals where org_id = $1 and status = 'pending'", [orgId]),
    ]);
    const iso = (d: unknown) => (d ? new Date(d as string).toISOString() : null);
    return {
      objectives: objectives.rows.map((r) => ({
        id: r.id, title: r.title, direction: r.direction, targetValue: r.target, dueOn: r.due_on, activatedAt: iso(r.activated_at)!,
        latest: r.value === null ? null : { value: r.value, measuredAt: iso(r.measured_at)! },
      })),
      connections: connections.rows.map((r) => ({ id: r.id, label: r.label, status: r.status, since: iso(r.since)! })),
      findingsWaiting: { count: findings.rows[0].n, oldest: iso(findings.rows[0].oldest) },
      approvalsWaiting: { count: approvals.rows[0].n, oldest: iso(approvals.rows[0].oldest) },
    };
  }

  async openItems(orgId: string): Promise<OpenItem[]> {
    const { rows } = await this.pool.query("select id, kind, subject_id from public.maintainer_items where org_id = $1 and status = 'open'", [orgId]);
    return rows.map((r) => ({ id: r.id, kind: r.kind, subjectId: r.subject_id }));
  }

  async recentlyDismissed(orgId: string): Promise<string[]> {
    const { rows } = await this.pool.query(
      `select kind, subject_id from public.maintainer_items
        where org_id = $1 and status = 'dismissed' and closed_at > now() - make_interval(days => $2)`,
      [orgId, DISMISS_FOR_DAYS],
    );
    return rows.map((r) => signalKey({ kind: r.kind as Signal["kind"], subjectId: r.subject_id }));
  }

  async apply(orgId: string, opportunityId: string | null, change: { raise: Signal[]; refresh: Array<{ id: string; signal: Signal }>; resolve: string[] }) {
    const c = await this.pool.connect();
    try {
      await c.query("begin");
      await c.query("select set_config('tebos.actor_type', 'agent', true), set_config('tebos.actor_id', $1, true)", [this.actorId]);
      for (const s of change.raise) {
        await c.query(
          `insert into public.maintainer_items (org_id, opportunity_id, kind, subject_id, severity, title, detail) values ($1, $2, $3, $4, $5, $6, $7)
           on conflict do nothing`,
          [orgId, opportunityId, s.kind, s.subjectId, s.severity, s.title, s.detail],
        );
      }
      for (const r of change.refresh) {
        // wording and severity follow the latest reading (days left, values); only when they changed, so the audit stays quiet
        await c.query(
          `update public.maintainer_items set severity = $2, title = $3, detail = $4, last_seen_at = now()
            where id = $1 and status = 'open' and (severity, title, detail) is distinct from ($2, $3, $4)`,
          [r.id, r.signal.severity, r.signal.title, r.signal.detail],
        );
      }
      if (change.resolve.length) {
        await c.query("update public.maintainer_items set status = 'resolved', closed_at = now() where id = any ($1) and status = 'open'", [change.resolve]);
      }
      await c.query(
        `insert into tebos_private.maintenance_scans (org_id, scanned_at) values ($1, now())
         on conflict (org_id) do update set scanned_at = excluded.scanned_at`, [orgId]);
      await c.query("commit");
    } catch (err) {
      await c.query("rollback").catch(() => {});
      throw err;
    } finally {
      c.release();
    }
  }
}
