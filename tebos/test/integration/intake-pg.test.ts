// An intake call from a meeting, end to end, against the real TEBOS schema:
// staff start it with the prospect's consent, the worker rings at once, follows
// the call, stores what was said and their yes or no once, and the next day
// queues an outline email. The voice provider is a stand-in; the database is real.
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PgIntakeStore } from "../../src/intake/pg-store";
import { IntakeWorker } from "../../src/intake/worker";
import type { ConversationSnapshot, PlaceCallResult, VoiceProvider } from "../../src/interviews/voice";

const enabled = process.env.TEBOS_TEST_DB === "1";
const CLOSER = "6a000000-0000-0000-0000-00000000000a";
const CONSENT = "Yes, TEBOS may call me now on this number for a short intake call.";

class FakeVoice implements VoiceProvider {
  readonly name = "voice";
  placed: Array<{ to: string; variables: Record<string, string> }> = [];
  result: PlaceCallResult = { ok: true, providerReference: "conv_intake_1" };
  snapshot: ConversationSnapshot = { state: "ringing", transcript: [], durationSecs: null, endReason: null };
  async placeCall(to: string, variables: Record<string, string>) {
    this.placed.push({ to, variables });
    return this.result;
  }
  async getConversation() {
    return this.snapshot;
  }
}

describe.skipIf(!enabled)("intake calls from meetings against the TEBOS schema", () => {
  let pool: pg.Pool;
  const voice = new FakeVoice();
  let now = new Date();
  let worker: IntakeWorker;
  let call: string, missed: string;

  async function asCloser<T = pg.QueryResult>(sql: string, params: unknown[] = []): Promise<T> {
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query("set local role authenticated");
      await c.query("select set_config('request.jwt.claim.sub', $1, true)", [CLOSER]);
      const r = await c.query(sql, params);
      await c.query("commit");
      return r as T;
    } catch (e) {
      await c.query("rollback").catch(() => {});
      throw e;
    } finally {
      c.release();
    }
  }
  const row = async (sql: string, params: unknown[]) => (await pool.query(sql, params)).rows[0];
  const start = async (name: string, business: string, email: string, phone: string, industry: string | null) =>
    (await asCloser<pg.QueryResult>("select public.start_meeting_call($1, $2, $3, $4, $5, '6-20', $6) as id", [name, business, email, phone, industry, CONSENT])).rows[0]
      .id as string;

  beforeAll(async () => {
    pool = new pg.Pool({ max: 3 });
    worker = new IntakeWorker(new PgIntakeStore(pool, "it"), voice, { waitlistUrl: "https://tebos.test/waitlist", now: () => now });
    await pool.query("insert into auth.users (id, email, email_confirmed_at) values ($1, 'closer@tebos.test', now())", [CLOSER]);
    await pool.query("insert into public.platform_staff (user_id, role) values ($1, 'sales')", [CLOSER]);
    call = await start("Lerato Mokoena", "Pulse Gym", "lerato@pulse.test", "082 555 0101", "marketing-agency");
  });

  afterAll(async () => {
    // other test files share this database and pick up open enquiries and unsent
    // emails: give this file's prospects an opportunity and mark its email handled
    await pool?.query(
      `insert into public.opportunities (enquiry_id, plan, contact_name, business, email)
       select e.id, e.plan, e.name, e.business, e.email
         from public.enquiries e join public.intake_calls i on i.enquiry_id = e.id
        where not exists (select 1 from public.opportunities o where o.enquiry_id = e.id)`,
    );
    await pool?.query("update public.outbox_emails set sent_at = now(), provider_reference = 'test' where kind = 'intake_follow_up' and sent_at is null");
    await pool?.end();
  });

  it("rings the prospect straight away, briefed with who they are", async () => {
    expect(await worker.dialOnce()).toMatchObject({ kind: "dialled", id: call, ok: true });
    expect(voice.placed[0]).toEqual({
      to: "+27825550101",
      variables: { prospect_name: "Lerato Mokoena", business_name: "Pulse Gym", kind_of_business: "marketing-agency", call_purpose: "intake" },
    });
    expect(await row("select status, provider_reference from public.intake_calls where id = $1", [call])).toEqual({ status: "dialling", provider_reference: "conv_intake_1" });
    expect(await worker.dialOnce()).toBeNull(); // never twice
  });

  it("follows the call, and stores what was said and their answer once it ends", async () => {
    voice.snapshot = { state: "in_progress", transcript: [], durationSecs: null, endReason: null };
    expect(await worker.followOnce()).toMatchObject({ state: "in_progress" });
    expect(await row("select status from public.intake_calls where id = $1", [call])).toEqual({ status: "in_progress" });

    now = new Date("2026-10-06T14:30:00Z"); // a Tuesday afternoon in Johannesburg
    voice.snapshot = {
      state: "done",
      durationSecs: 251.4,
      endReason: "client ended call",
      transcript: [
        { role: "agent", message: "What takes most of your time each week?", timeInCallSecs: 10 },
        { role: "user", message: "Checking who is in the gym, and answering messages.", timeInCallSecs: 14 },
        { role: "agent", message: "Would you like to go ahead?", timeInCallSecs: 200 },
        { role: "user", message: "Yes, let's do it.", timeInCallSecs: 204 },
      ],
      collected: { wants_to_proceed: true },
    };
    expect(await worker.followOnce()).toMatchObject({ state: "completed" });
    const r = await row(
      "select status, duration_secs, jsonb_array_length(transcript) as turns, wants_to_proceed, outcome_source, follow_up_due_at from public.intake_calls where id = $1",
      [call],
    );
    expect(r).toMatchObject({ status: "completed", duration_secs: 251, turns: 4, wants_to_proceed: true, outcome_source: "call" });
    expect(new Date(r.follow_up_due_at).toISOString()).toBe("2026-10-07T07:00:00.000Z"); // 09:00 the next morning
  });

  it("queues the outline the next day, once TEBOS has opened the opportunity, and only once", async () => {
    expect(await worker.followUpOnce()).toBeNull(); // not due yet
    await pool.query("update public.intake_calls set follow_up_due_at = now() - interval '1 minute' where id = $1", [call]);
    expect(await worker.followUpOnce()).toBeNull(); // no opportunity yet
    const enquiry = (await row("select enquiry_id from public.intake_calls where id = $1", [call])).enquiry_id;
    const opp = (await row(
      "insert into public.opportunities (enquiry_id, plan, contact_name, business, email) values ($1, 'starter', 'Lerato Mokoena', 'Pulse Gym', 'lerato@pulse.test') returning id",
      [enquiry],
    )).id;
    expect(await worker.followUpOnce()).toEqual({ kind: "follow_up_queued", id: call });
    const mail = await row("select to_email, subject, body from public.outbox_emails where opportunity_id = $1 and kind = 'intake_follow_up'", [opp]);
    expect(mail.to_email).toBe("lerato@pulse.test");
    expect(mail.subject).toBe("What TEBOS would build for Pulse Gym");
    expect(mail.body).toContain("You told us you'd like to go ahead");
    expect(mail.body).toContain("The flows the work moves through:");
    expect(await worker.followUpOnce()).toBeNull();
  });

  it("a call nobody answers says so, and is never completed", async () => {
    missed = await start("Sipho Dlamini", "Iron Works", "sipho@iron.test", "+27 82 555 0103", null);
    voice.result = { ok: true, providerReference: "conv_intake_2" };
    expect(await worker.dialOnce()).toMatchObject({ id: missed, ok: true });
    voice.snapshot = { state: "done", transcript: [{ role: "agent", message: "Hello?", timeInCallSecs: 1 }], durationSecs: 20, endReason: "no answer" };
    expect(await worker.followOnce()).toMatchObject({ id: missed, state: "no_answer" });
    expect(await row("select status, transcript, wants_to_proceed, failure_detail from public.intake_calls where id = $1", [missed])).toEqual({
      status: "no_answer", transcript: null, wants_to_proceed: null, failure_detail: "Nobody answered, or the call ended before the person spoke",
    });
  });

  it("a call the provider refuses is failed with its reason", async () => {
    const refused = await start("Thabo Nkosi", "Thabo Builds", "thabo@builds.test", "+27825550104", null);
    voice.result = { ok: false, retryable: false, detail: "The number is not reachable" };
    expect(await worker.dialOnce()).toMatchObject({ id: refused, ok: false });
    expect(await row("select status, failure_detail from public.intake_calls where id = $1", [refused])).toEqual({ status: "failed", failure_detail: "The number is not reachable" });
  });
});
