// The maintainer's queue against the real schema: a client's objective slips
// and a connection breaks; TEBOS raises both once for the client's maintainer;
// when the connection recovers, its item resolves itself.
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PgMaintenanceStore } from "../../src/maintenance/pg-store";
import { MaintenanceWorker } from "../../src/maintenance/worker";

const enabled = process.env.TEBOS_TEST_DB === "1";
const MAINT = "9ab00000-0000-0000-0000-00000000000a";
const OWNER = "9ab00000-0000-0000-0000-00000000000b";

describe.skipIf(!enabled)("the maintainer's queue against the TEBOS schema", () => {
  let pool: pg.Pool;
  let worker: MaintenanceWorker;
  let org: string, opp: string, conn: string, objective: string;

  beforeAll(async () => {
    pool = new pg.Pool({ max: 3 });
    worker = new MaintenanceWorker(new PgMaintenanceStore(pool, "maintenance-worker:it"));
    await pool.query("insert into auth.users (id, email, email_confirmed_at) values ($1, 'm@maint.it', now()), ($2, 'o@maint.it', now())", [MAINT, OWNER]);
    await pool.query("insert into public.platform_staff (user_id, role) values ($1, 'maintainer')", [MAINT]);
    org = (await pool.query("insert into public.organisations (name, slug) values ('Maint IT', 'maint-it') returning id")).rows[0].id;
    await pool.query("insert into public.memberships (org_id, user_id, role) values ($1, $2, 'org_admin')", [org, OWNER]);
    const biz = (await pool.query("insert into public.businesses (org_id, name) values ($1, 'Maint IT') returning id", [org])).rows[0].id;
    await pool.query("select set_config('tebos.actor_type', 'agent', false), set_config('tebos.actor_id', 'it', false)");
    const enq = (await pool.query("insert into public.enquiries (plan, name, business, email) values ('starter', 'O', 'Maint IT', 'o@maint.it') returning id")).rows[0].id;
    opp = (await pool.query(
      `insert into public.opportunities (enquiry_id, plan, contact_name, business, email, maintainer_id, org_id, status)
       values ($1, 'starter', 'O', 'Maint IT', 'o@maint.it', $2, $3, 'new') returning id`, [enq, MAINT, org])).rows[0].id;
    // onboarded, as the pipeline would leave it (the guards need each step's proof, so this is set directly for the test)
    await pool.query("alter table public.opportunities disable trigger user");
    await pool.query("update public.opportunities set status = 'onboarded' where id = $1", [opp]);
    await pool.query("alter table public.opportunities enable trigger user");
    // an objective due in 5 days with no measured value, and a broken connection
    objective = (await pool.query(
      `insert into public.objectives (org_id, business_id, title, metric, unit, direction, target_value, period, due_on, owner_id, status)
       values ($1, $2, 'Replies within a day', 'lead_response_time', 'days', 'at_most', 1, 'point_in_time', current_date + 5, $3, 'active') returning id`,
      [org, biz, OWNER])).rows[0].id;
    conn = (await pool.query("insert into public.connection_instances (org_id, business_id, connector_key) values ($1, $2, 'bame-ops') returning id", [org, biz])).rows[0].id;
    await pool.query("update public.connection_instances set status = 'unavailable', last_failure_at = now(), failure_detail = 'refused' where id = $1", [conn]);
  });

  afterAll(async () => {
    await pool?.query("update public.connection_instances set status = 'disabled' where id = $1", [conn]).catch(() => {});
    await pool?.end();
  });

  const items = async () => (await pool.query("select kind, subject_id, severity, status, opportunity_id from public.maintainer_items where org_id = $1 order by kind", [org])).rows;
  const scanNow = async () => {
    await pool.query("delete from tebos_private.maintenance_scans where org_id = $1", [org]);
    let r;
    while ((r = await worker.runOnce()) && r.orgId !== org) { /* other organisations in the test database */ }
    return r;
  };

  it("raises what's slipping, once, for the client's maintainer", async () => {
    expect(await scanNow()).toMatchObject({ orgId: org, raised: 2 });
    expect(await items()).toEqual([
      { kind: "connection_broken", subject_id: conn, severity: "high", status: "open", opportunity_id: opp },
      { kind: "objective_at_risk", subject_id: objective, severity: "high", status: "open", opportunity_id: opp },
    ]);
    expect(await scanNow()).toMatchObject({ raised: 0, resolved: 0, open: 2 });
    expect((await items()).length).toBe(2);
    // the maintainer sees them; the client doesn't
    const as = async (user: string) => {
      const c = await pool.connect();
      try {
        await c.query("begin; set local role authenticated");
        await c.query("select set_config('request.jwt.claim.sub', $1, true)", [user]);
        return (await c.query("select count(*)::int as n from public.maintainer_items where org_id = $1", [org])).rows[0].n;
      } finally {
        await c.query("rollback");
        c.release();
      }
    };
    expect(await as(MAINT)).toBe(2);
    expect(await as(OWNER)).toBe(0);
  });

  it("resolves an item by itself when the problem clears", async () => {
    await pool.query("update public.connection_instances set status = 'configured', failure_detail = null where id = $1", [conn]);
    expect(await scanNow()).toMatchObject({ resolved: 1 });
    expect((await items()).find((i) => i.kind === "connection_broken")).toMatchObject({ status: "resolved" });
  });
});
