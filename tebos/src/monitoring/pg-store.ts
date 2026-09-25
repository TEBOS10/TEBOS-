// Postgres side of the platform monitor: which connections are due, reading
// their credential, and recording snapshots as connected-system evidence.
// Writes are attributed to the agent (monitor-worker:<id>); the schema's
// guards still apply ("connected" needs a credential and a fresh check).

import pg from "pg";
import { transitionPath, type ConnectionStatus } from "../domain/states";
import type { ParsedSnapshot } from "./bame";
import type { DueMonitor, MonitorStore, ReadResult, SnapshotReader } from "./worker";

export class PgMonitorStore implements MonitorStore {
  private readonly actor: string;
  constructor(
    private readonly pool: pg.Pool,
    workerId: string,
  ) {
    this.actor = `monitor-worker:${workerId}`;
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

  private async move(c: pg.PoolClient, id: string, from: ConnectionStatus, to: ConnectionStatus, fields: string, params: unknown[]) {
    const path = transitionPath("connection", from, to) ?? [];
    for (const step of path.slice(0, -1)) await c.query("update public.connection_instances set status = $2 where id = $1", [id, step]);
    await c.query(`update public.connection_instances set status = $2, ${fields} where id = $1`, [id, path.at(-1) ?? from, ...params]);
  }

  async nextDue(connectorKeys: string[]): Promise<DueMonitor | null> {
    const { rows } = await this.pool.query(
      `select ci.id, ci.org_id, ci.business_id, ci.connector_key, ci.credential_ref_id, ci.status,
              last.structured_value ->> 'snapshot_hash' as last_hash, last.retrieved_at as last_recorded_at
         from public.connection_instances ci
         left join lateral (
           select e.structured_value, e.retrieved_at from public.evidence e
             join public.sources s on s.id = e.source_id
            where s.business_id = ci.business_id and s.source_type = 'connected_system' and s.uri = ci.connector_key || ':' || ci.id
            order by e.retrieved_at desc limit 1
         ) last on true
        where ci.connector_key = any ($1) and ci.business_id is not null and ci.credential_ref_id is not null
          and ci.status in ('configured', 'connected', 'degraded', 'unavailable')
          and coalesce(ci.last_success_at, '-infinity') < now() - make_interval(mins => coalesce((ci.settings ->> 'interval_minutes')::int, 60))
          and coalesce(ci.last_failure_at, '-infinity') < now() - interval '15 minutes'
        order by coalesce(ci.last_success_at, '-infinity')
        limit 1`,
      [connectorKeys],
    );
    const r = rows[0];
    return r
      ? { connectionId: r.id, orgId: r.org_id, businessId: r.business_id, connectorKey: r.connector_key, credentialRefId: r.credential_ref_id, status: r.status,
          lastHash: r.last_hash ?? null, lastRecordedAt: r.last_recorded_at ? new Date(r.last_recorded_at).toISOString() : null }
      : null;
  }

  async readCredential(ref: string): Promise<string | null> {
    return (await this.pool.query("select tebos_private.read_credential($1) as s", [ref])).rows[0]?.s ?? null;
  }

  async recordSnapshot(m: DueMonitor, parsed: Extract<ParsedSnapshot, { ok: true }>, record: boolean): Promise<void> {
    await this.tx(async (c) => {
      const cur = (await c.query("select status from public.connection_instances where id = $1 for update", [m.connectionId])).rows[0];
      if (!cur) return;
      await this.move(c, m.connectionId, cur.status, "connected",
        "granted_scopes = $3, last_verified_at = clock_timestamp(), last_success_at = clock_timestamp(), failure_detail = null", [["operations:read"]]);
      if (!record) return;
      const uri = `${m.connectorKey}:${m.connectionId}`;
      await c.query(
        `insert into public.sources (org_id, business_id, source_type, uri, label, reliability)
         values ($1, $2, 'connected_system', $3, $4, 0.95)
         on conflict (business_id, source_type, (coalesce(uri, ''))) do nothing`,
        [m.orgId, m.businessId, uri, "Operations snapshot (read-only)"],
      );
      const source = (await c.query("select id from public.sources where business_id = $1 and source_type = 'connected_system' and uri = $2", [m.businessId, uri])).rows[0].id;
      for (const f of parsed.facts) {
        await c.query(
          `insert into public.evidence (org_id, business_id, source_id, state, fact, excerpt, structured_value, content_location, retrieved_at, extraction_status, confidence)
           values ($1, $2, $3, 'acquired', $4, $5, $6, $7, $8, 'complete', 0.95)`,
          [m.orgId, m.businessId, source, f.fact, JSON.stringify(f.value), { metric: f.key, ...f.value, snapshot_hash: parsed.hash, connector: m.connectorKey },
           `snapshot ${f.key}`, parsed.takenAt],
        );
      }
    });
  }

  async recordFailure(m: DueMonitor, kind: "auth" | "unavailable" | "invalid", detail: string): Promise<void> {
    await this.tx(async (c) => {
      const cur = (await c.query("select status from public.connection_instances where id = $1 for update", [m.connectionId])).rows[0];
      if (!cur) return;
      await this.move(c, m.connectionId, cur.status, kind === "auth" ? "authentication_required" : "unavailable",
        "last_failure_at = clock_timestamp(), failure_detail = $3", [detail.slice(0, 1000)]);
    });
  }
}

/** Reads a snapshot with a short-lived connection as the platform's read-only login. */
export class PgSnapshotReader implements SnapshotReader {
  constructor(private readonly fn = "tebos_export.operational_snapshot") {}

  async read(connectionString: string): Promise<ReadResult> {
    if (!/^[a-z_]+\.[a-z_]+$/.test(this.fn)) return { ok: false, kind: "invalid", detail: "Bad snapshot function name" };
    const client = new pg.Client({ connectionString, connectionTimeoutMillis: 15_000, statement_timeout: 20_000 });
    try {
      await client.connect();
      const { rows } = await client.query(`select ${this.fn}() as snapshot`);
      return { ok: true, snapshot: rows[0]?.snapshot };
    } catch (err) {
      const e = err as { code?: string; message?: string };
      const kind = e.code === "28P01" || e.code === "28000" || e.code === "42501" ? "auth" : "unavailable";
      return { ok: false, kind, detail: `${kind === "auth" ? "The platform refused TEBOS's read-only login" : "Could not read the platform"}: ${e.message ?? "unknown error"}` };
    } finally {
      await client.end().catch(() => {});
    }
  }
}
