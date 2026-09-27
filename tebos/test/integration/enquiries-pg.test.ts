// Enquiry alerts against the real schema: claiming counts the attempt, a
// claimed enquiry isn't offered again for 5 minutes, and "notified" needs the
// provider's message id.
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PgEnquiryStore } from "../../src/notify/pg-store";

const enabled = process.env.TEBOS_TEST_DB === "1";

describe.skipIf(!enabled)("enquiry alerts against the TEBOS schema", () => {
  let pool: pg.Pool;
  let store: PgEnquiryStore;
  let id: string;
  const row = async () => (await pool.query("select * from public.enquiries where id = $1", [id])).rows[0];

  beforeAll(async () => {
    pool = new pg.Pool({ max: 2 });
    store = new PgEnquiryStore(pool);
    await pool.query("update public.enquiries set notified_at = now(), notify_reference = 'earlier' where notified_at is null");
    id = (await pool.query("insert into public.enquiries (plan, name, business, email) values ('growth', 'Sipho', 'Clay Co', 'sipho@clay.example') returning id")).rows[0].id;
  });
  afterAll(async () => { await pool?.end(); });

  it("claims the enquiry once, counting the attempt", async () => {
    const e = await store.claimNext();
    expect(e).toMatchObject({ id, plan: "growth", attempts: 1 });
    expect(await store.claimNext()).toBeNull(); // not again within 5 minutes
  });

  it("records a failure, then offers it again after the wait", async () => {
    await store.markFailed(id, "Resend is busy");
    expect(await row()).toMatchObject({ notified_at: null, notify_error: "Resend is busy" });
    await pool.query("update public.enquiries set notify_last_try = now() - interval '6 minutes' where id = $1", [id]);
    expect(await store.claimNext()).toMatchObject({ id, attempts: 2 });
  });

  it("marks it notified with the provider's id, and never offers it again", async () => {
    await store.markSent(id, "re_msg_42");
    expect(await row()).toMatchObject({ notify_reference: "re_msg_42", notify_error: null });
    expect((await row()).notified_at).not.toBeNull();
    await pool.query("update public.enquiries set notify_last_try = now() - interval '1 day' where id = $1", [id]);
    expect(await store.claimNext()).toBeNull();
    await expect(pool.query("update public.enquiries set notify_reference = null where id = $1", [id])).rejects.toThrow(/enquiries_notified_has_reference/);
  });
});
