// The audit chain under concurrent writers: several connections append to the same
// organisation's chain at once, and the verifier still finds it intact, every
// event counted. Appends are serialised by write_audit's per-chain lock, so id
// order is chain order; this proves the verifier relies on nothing more.
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const enabled = process.env.TEBOS_TEST_DB === "1";

describe.skipIf(!enabled)("audit chain: concurrent writers", () => {
  let pool: pg.Pool;
  let org: string;
  let other: string;

  beforeAll(async () => {
    pool = new pg.Pool({ max: 8 });
    org = (await pool.query("insert into public.organisations (name, slug) values ('Concurrent chain', 'concurrent-chain') returning id")).rows[0].id;
    other = (await pool.query("insert into public.organisations (name, slug) values ('Other chain', 'other-chain') returning id")).rows[0].id;
  });
  afterAll(async () => {
    await pool?.end();
  });

  const write = async (orgId: string, n: number) => {
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query("select tebos_private.write_audit($1, 'test.concurrent', 'test', null, null, jsonb_build_object('n', $2::int))", [orgId, n]);
      // hold the transaction open a moment, so writers really overlap
      await c.query("select pg_sleep(0.005)");
      await c.query("commit");
    } finally {
      c.release();
    }
  };

  it("stays intact with overlapping appends to two chains", async () => {
    const writes = Array.from({ length: 60 }, (_, i) => write(i % 3 === 0 ? other : org, i));
    await Promise.all(writes);

    const { rows } = await pool.query("select * from tebos_private.audit_verify(array[$1, $2]::uuid[], false)", [org, other]);
    const byOrg = new Map(rows.map((r) => [r.org_id as string, r]));
    // each organisation's chain also holds its "organisation created" event
    expect(byOrg.get(org)).toMatchObject({ status: "intact", first_bad_id: null });
    expect(Number(byOrg.get(org)!.events)).toBe(1 + 40);
    expect(byOrg.get(other)).toMatchObject({ status: "intact", first_bad_id: null });
    expect(Number(byOrg.get(other)!.events)).toBe(1 + 20);
  });

  it("reports the head of each chain, for recording outside the database", async () => {
    const { rows } = await pool.query("select last_id, last_hash from tebos_private.audit_verify(array[$1]::uuid[], false)", [org]);
    const head = await pool.query("select id, hash from public.audit_events where org_id = $1 order by id desc limit 1", [org]);
    expect(String(rows[0].last_id)).toBe(String(head.rows[0].id));
    expect(rows[0].last_hash).toBe(head.rows[0].hash);
  });
});
