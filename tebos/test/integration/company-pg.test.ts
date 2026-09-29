// TEBOS on its own board, against the real schema: TEBOS's company numbers
// are read from its own pipeline and payments, recorded as connected-system
// evidence on TEBOS's own business, and objectives bound to a reading are
// measured automatically, by the database reading the value itself. No
// client organisation can attach the connector.
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CompanySnapshotReader, PgMonitorStore, PgSnapshotReader } from "../../src/monitoring/pg-store";
import { MonitorWorker } from "../../src/monitoring/worker";

const enabled = process.env.TEBOS_TEST_DB === "1";
const OWNER = "95000000-0000-0000-0000-00000000000a";

describe.skipIf(!enabled)("TEBOS's company board against the TEBOS schema", () => {
  let pool: pg.Pool;
  let worker: MonitorWorker;
  let org: string, biz: string, conn: string, cash: string, leads: string, draft: string;

  beforeAll(async () => {
    pool = new pg.Pool({ max: 3 });
    worker = new MonitorWorker(new PgMonitorStore(pool, "it"), new PgSnapshotReader(), { readers: { "tebos-company": new CompanySnapshotReader(pool) } });
    await pool.query("insert into auth.users (id, email, email_confirmed_at) values ($1, 'owner@tebos.it', now())", [OWNER]);
    org = (await pool.query("insert into public.organisations (name, slug) values ('TEBOS', 'tebos-it') returning id")).rows[0].id;
    await pool.query("insert into public.memberships (org_id, user_id, role) values ($1, $2, 'org_admin')", [org, OWNER]);
    biz = (await pool.query("insert into public.businesses (org_id, name) values ($1, 'TEBOS') returning id", [org])).rows[0].id;
    await pool.query("insert into tebos_private.company_orgs (org_id) values ($1)", [org]);
    conn = (await pool.query("insert into public.connection_instances (org_id, business_id, connector_key, settings) values ($1, $2, 'tebos-company', '{\"interval_minutes\": 60}') returning id", [org, biz])).rows[0].id;

    const objective = async (title: string, metric: string, unit: string, direction: string, target: number, status: string, bind: [string, string[]] | null) =>
      (await pool.query(
        `insert into public.objectives (org_id, business_id, title, metric, unit, direction, target_value, period, due_on, owner_id, status, measure_metric, measure_path)
         values ($1, $2, $3, $4, $5, $6, $7, 'month', current_date + 60, $8, $9, $10, $11) returning id`,
        [org, biz, title, metric, unit, direction, target, OWNER, status, bind?.[0] ?? null, bind?.[1] ?? null])).rows[0].id;
    cash = await objective("Cash collected each month", "revenue", "ZAR", "at_least", 25000, "active", ["revenue.cash", ["this_month_zar"]]);
    leads = await objective("Leads decided within a day", "lead_response_time", "days", "at_most", 1, "active", ["pipeline.decisions", ["oldest_undecided_days"]]);
    draft = await objective("New leads each week", "custom", "count", "at_least", 10, "draft", ["leads.volume", ["last_7_days"]]);

    // a paying client and an enquiry: what the snapshot should count
    const enq = (await pool.query("insert into public.enquiries (plan, name, business, email) values ('starter', 'A', 'Paying Co', 'a@paying.test') returning id")).rows[0].id;
    await pool.query("select set_config('tebos.actor_type', 'agent', false), set_config('tebos.actor_id', 'it', false)");
    const opp = (await pool.query(
      `insert into public.opportunities (enquiry_id, plan, contact_name, business, email, status, amount_cents, payment_url, payment_reference)
       values ($1, 'starter', 'A', 'Paying Co', 'a@paying.test', 'new', 250000, 'https://pay.test/x', 'company-it-1') returning id`, [enq])).rows[0].id;
    await pool.query("insert into public.payments (opportunity_id, provider, reference, amount_cents, status, paid_at) values ($1, 'paystack', 'company-it-1', 250000, 'success', now())", [opp]);
  });

  afterAll(async () => {
    // leave nothing due for the other monitoring tests
    await pool?.query("update public.connection_instances set status = 'disabled' where id = $1", [conn]).catch(() => {});
    await pool?.end();
  });

  it("records TEBOS's own numbers as evidence on its own board, with no credential", async () => {
    expect(await worker.runOnce()).toMatchObject({ connectionId: conn, ok: true, recorded: true });
    const f = (await pool.query(
      `select e.fact, e.structured_value from public.evidence e join public.sources s on s.id = e.source_id where s.uri = $1`, [`tebos-company:${conn}`])).rows;
    const cashFact = f.find((x) => x.structured_value.metric === "revenue.cash");
    expect(cashFact.structured_value.this_month_zar).toBeGreaterThanOrEqual(2500);
    expect(cashFact.fact).toMatch(/^TEBOS collected R[\d,]+ this month/);
    // aggregates only: no client's name or email is in any of it
    expect(JSON.stringify(f)).not.toMatch(/Paying Co|a@paying\.test/);
    const c = (await pool.query("select status from public.connection_instances where id = $1", [conn])).rows[0];
    expect(c.status).toBe("connected");
  });

  it("measures active objectives bound to a reading, read by the database; drafts are left alone", async () => {
    const m = (await pool.query("select objective_id, basis, value::float as value, value_path from public.objective_measurements where business_id = $1", [biz])).rows;
    const cashM = m.find((x) => x.objective_id === cash);
    expect(cashM).toMatchObject({ basis: "measured", value_path: ["this_month_zar"] });
    expect(cashM.value).toBeGreaterThanOrEqual(2500);
    expect(m.some((x) => x.objective_id === leads)).toBe(true);
    expect(m.some((x) => x.objective_id === draft)).toBe(false);
  });

  it("keeps what an active objective is measured by fixed", async () => {
    await expect(pool.query("update public.objectives set measure_path = '{last_30_days_zar}' where id = $1", [cash])).rejects.toMatchObject({ hint: "TEBOS_INPUT_FROZEN" });
    // a draft's binding can still change
    await pool.query("update public.objectives set measure_path = '{last_30_days}' where id = $1", [draft]);
  });

  it("never lets another organisation attach TEBOS's company numbers", async () => {
    const other = (await pool.query("insert into public.organisations (name, slug) values ('Client', 'client-company-it') returning id")).rows[0].id;
    const otherBiz = (await pool.query("insert into public.businesses (org_id, name) values ($1, 'Client') returning id", [other])).rows[0].id;
    await expect(pool.query("insert into public.connection_instances (org_id, business_id, connector_key) values ($1, $2, 'tebos-company')", [other, otherBiz]))
      .rejects.toMatchObject({ hint: "TEBOS_PERMISSION_DENIED" });
  });
});
