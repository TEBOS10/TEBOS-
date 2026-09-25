// The platform monitor against real Postgres: a stand-in "platform" schema
// with the same export function and a login that can only call it. Checks
// that snapshots become connected-system evidence, that unchanged snapshots
// aren't duplicated, and that a refused login is recorded honestly.
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PgMonitorStore, PgSnapshotReader } from "../../src/monitoring/pg-store";
import { MonitorWorker } from "../../src/monitoring/worker";

const enabled = process.env.TEBOS_TEST_DB === "1";

describe.skipIf(!enabled)("platform monitoring against the TEBOS schema", () => {
  let pool: pg.Pool;
  let worker: MonitorWorker;
  let org: string, biz: string, conn: string;
  const connString = (user: string) =>
    `postgresql://${user}:x@/${process.env.PGDATABASE}?host=${encodeURIComponent(process.env.PGHOST ?? "localhost")}&port=${process.env.PGPORT ?? 5432}`;
  const setCredential = async (secret: string) => {
    const v = (await pool.query("select vault.create_secret($1) as id", [secret])).rows[0].id;
    const ref = (await pool.query("insert into public.credential_references (org_id, connector_key, vault_ref, label) values ($1, 'bame-ops', $2, 'reader') returning id", [org, `vault:${v}`])).rows[0].id;
    await pool.query("update public.connection_instances set credential_ref_id = $2 where id = $1", [conn, ref]);
  };
  const facts = async () =>
    (await pool.query(
      `select e.fact, e.state, e.structured_value, s.source_type from public.evidence e join public.sources s on s.id = e.source_id
        where s.uri = $1 order by e.created_at, e.fact`, [`bame-ops:${conn}`])).rows;

  beforeAll(async () => {
    pool = new pg.Pool({ max: 3 });
    worker = new MonitorWorker(new PgMonitorStore(pool, "it"), new PgSnapshotReader());
    await pool.query(`
      create schema if not exists tebos_export;
      create or replace function tebos_export.operational_snapshot() returns jsonb language sql stable as $$
        select jsonb_build_object('schema_version', 1, 'taken_at', now(),
          'leads', jsonb_build_object('total', 3, 'last_30_days', 3, 'unassigned', 1, 'oldest_unassigned_days', 4, 'by_status', '{}'::jsonb),
          'notifications', jsonb_build_object('unread', 2, 'oldest_unread_days', 1, 'unread_by_department', '{"sales": 2}'::jsonb),
          'staff', jsonb_build_object('by_department', '{"sales": 2}'::jsonb, 'admins', 1, 'invites_pending', 0))
      $$;
      do $$ begin
        if not exists (select 1 from pg_roles where rolname = 'it_reader') then create role it_reader login; end if;
        if not exists (select 1 from pg_roles where rolname = 'it_stranger') then create role it_stranger login; end if;
      end $$;
      revoke all on function tebos_export.operational_snapshot() from public;
      grant usage on schema tebos_export to it_reader, it_stranger;
      grant execute on function tebos_export.operational_snapshot() to it_reader;
    `);
    org = (await pool.query("insert into public.organisations (name, slug) values ('Monitor IT', 'monitor-it') returning id")).rows[0].id;
    biz = (await pool.query("insert into public.businesses (org_id, name) values ($1, 'BAME') returning id", [org])).rows[0].id;
    conn = (await pool.query("insert into public.connection_instances (org_id, business_id, connector_key, settings) values ($1, $2, 'bame-ops', '{\"interval_minutes\": 60}') returning id", [org, biz])).rows[0].id;
    await setCredential(connString("it_reader"));
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("reads the snapshot, marks the connection connected, and records facts as connected-system evidence", async () => {
    expect(await worker.runOnce()).toMatchObject({ connectionId: conn, ok: true, recorded: true });
    const c = (await pool.query("select status, granted_scopes, last_verified_at from public.connection_instances where id = $1", [conn])).rows[0];
    expect(c).toMatchObject({ status: "connected", granted_scopes: ["operations:read"] });
    const f = await facts();
    expect(f.map((x) => x.fact)).toContain("1 lead is not assigned to any department; the oldest has waited 4 days.");
    expect(f.every((x) => x.state === "acquired" && x.source_type === "connected_system" && x.structured_value.snapshot_hash)).toBe(true);
    expect(await worker.runOnce()).toBeNull(); // not due again within its interval
  });

  it("doesn't duplicate an unchanged snapshot, but records a change", async () => {
    const before = (await facts()).length;
    await pool.query("update public.connection_instances set last_success_at = now() - interval '2 hours' where id = $1", [conn]);
    expect(await worker.runOnce()).toMatchObject({ ok: true, recorded: false });
    expect((await facts()).length).toBe(before);

    await pool.query(`create or replace function tebos_export.operational_snapshot() returns jsonb language sql stable as $$
      select jsonb_build_object('schema_version', 1, 'taken_at', now(),
        'leads', jsonb_build_object('total', 5, 'last_30_days', 5, 'unassigned', 0, 'by_status', '{}'::jsonb),
        'staff', jsonb_build_object('by_department', '{"sales": 2}'::jsonb, 'admins', 1, 'invites_pending', 0)) $$`);
    await pool.query("update public.connection_instances set last_success_at = now() - interval '2 hours' where id = $1", [conn]);
    expect(await worker.runOnce()).toMatchObject({ ok: true, recorded: true });
    expect((await facts()).map((x) => x.fact)).toContain("Every lead is assigned to a department.");
  });

  it("a login that may not read the snapshot needs re-authentication, with the reason", async () => {
    await setCredential(connString("it_stranger"));
    await pool.query("update public.connection_instances set last_success_at = now() - interval '2 hours' where id = $1", [conn]);
    expect(await worker.runOnce()).toMatchObject({ ok: false });
    const c = (await pool.query("select status, failure_detail from public.connection_instances where id = $1", [conn])).rows[0];
    expect(c.status).toBe("authentication_required");
    expect(c.failure_detail).toMatch(/refused TEBOS's read-only login/);
    expect(await worker.runOnce()).toBeNull(); // not retried until someone fixes it
  });
});
