// A booked call, end to end, against the real TEBOS schema: the worker dials
// at the booked time, follows the call, stores the transcript once, and turns
// the person's words into evidence labelled as their statements. The voice
// provider and the model are stand-ins; the database is real.
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ReasoningProvider, StructuredRequest, StructuredResponse } from "../../src/intelligence/provider";
import { PgInterviewStore } from "../../src/interviews/pg-store";
import type { ConversationSnapshot, PlaceCallResult, VoiceProvider } from "../../src/interviews/voice";
import { InterviewWorker } from "../../src/interviews/worker";
import { CALL_CONSENT_TEXT } from "../../src/domain/interview";

const enabled = process.env.TEBOS_TEST_DB === "1";
const OWNER = "60000000-0000-0000-0000-00000000000a";

class FakeVoice implements VoiceProvider {
  readonly name = "elevenlabs";
  placed: Array<{ to: string; variables: Record<string, string> }> = [];
  result: PlaceCallResult = { ok: true, providerReference: "conv_it_1" };
  snapshot: ConversationSnapshot = { state: "ringing", transcript: [], durationSecs: null, endReason: null };
  async placeCall(to: string, variables: Record<string, string>) {
    this.placed.push({ to, variables });
    return this.result;
  }
  async getConversation() {
    return this.snapshot;
  }
}

class FakeModel implements ReasoningProvider {
  readonly name = "fake";
  async structured(_r: StructuredRequest): Promise<StructuredResponse> {
    return {
      value: { answers: [
        { question_key: "clients.mix", summary: "The owner says they have nine clients, six on retainer.", quote: "nine clients, six on retainer", turn: 1 },
        { question_key: "finance.cashflow", summary: "Clients pay in 60 days.", quote: "they always pay on time", turn: 1 },
      ] },
      provider: "fake", model: "fake", usage: { inputTokens: 1, outputTokens: 1 },
    };
  }
}

describe.skipIf(!enabled)("diagnostic interviews against the TEBOS schema", () => {
  let pool: pg.Pool;
  let worker: InterviewWorker;
  const voice = new FakeVoice();
  let org: string, biz: string, call: string, missed: string;

  async function asOwner<T = pg.QueryResult>(sql: string, params: unknown[] = []): Promise<T> {
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query("set local role authenticated");
      await c.query("select set_config('request.jwt.claim.sub', $1, true)", [OWNER]);
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
  const book = async (phone: string) =>
    (await asOwner<pg.QueryResult>(
      `insert into public.interview_sessions (org_id, business_id, channel, playbook_key, playbook_version, status, phone_number, scheduled_for, consent_text, consent_given_by, consent_given_at)
       values ($1, $2, 'voice', 'marketing-agency', 1, 'scheduled', $3, now() + interval '6 minutes', $4, $5, now()) returning id`,
      [org, biz, phone, CALL_CONSENT_TEXT, OWNER],
    )).rows[0].id as string;

  beforeAll(async () => {
    pool = new pg.Pool({ max: 3 });
    worker = new InterviewWorker(new PgInterviewStore(pool, "it"), voice, new FakeModel());
    await pool.query("insert into auth.users (id, email, email_confirmed_at) values ($1, 'owner@bright.test', now())", [OWNER]);
    org = (await asOwner<pg.QueryResult>("select public.create_organisation('Interview IT', 'interview-it') as id")).rows[0].id;
    biz = (await asOwner<pg.QueryResult>("insert into public.businesses (org_id, name, website) values ($1, 'Bright Agency', 'https://bright.example/') returning id", [org])).rows[0].id;
    await asOwner("insert into public.business_contexts (org_id, business_id, kind, statement, supplied_by) values ($1, $2, 'problem', 'Projects always run over', $3)", [org, biz, OWNER]);
    call = await book("+27821234567");
    missed = await book("+27829876543");
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("does not call before the booked time", async () => {
    expect(await worker.dialOnce()).toBeNull();
    expect(voice.placed).toHaveLength(0);
  });

  it("calls at the booked time, briefed with what TEBOS knows", async () => {
    await pool.query("update public.interview_sessions set scheduled_for = now() - interval '1 minute' where id = $1", [call]);
    expect(await worker.dialOnce()).toMatchObject({ kind: "dialled", id: call, ok: true });
    expect(voice.placed[0]).toMatchObject({ to: "+27821234567", variables: { business_name: "Bright Agency", owner_context: expect.stringContaining("Projects always run over") } });
    expect(await row("select status, provider, provider_reference from public.interview_sessions where id = $1", [call])).toEqual({
      status: "dialling", provider: "elevenlabs", provider_reference: "conv_it_1",
    });
    expect(await worker.dialOnce()).toBeNull(); // never twice
  });

  it("follows the call and stores the transcript once it ends", async () => {
    await pool.query("update public.interview_sessions set last_checked_at = now() - interval '1 minute', started_at = now() - interval '1 minute' where id = $1", [call]);
    voice.snapshot = { state: "in_progress", transcript: [], durationSecs: null, endReason: null };
    expect(await worker.followOnce()).toMatchObject({ state: "in_progress" });

    await pool.query("update public.interview_sessions set last_checked_at = now() - interval '1 minute', started_at = now() - interval '1 minute' where id = $1", [call]);
    voice.snapshot = {
      state: "done", durationSecs: 640, endReason: "end_call",
      transcript: [
        { role: "agent", message: "Hi, I'm TEBOS's AI interviewer. This call is recorded. How many clients do you have?", timeInCallSecs: 0 },
        { role: "user", message: "We have nine clients, six on retainer, and honestly cash is tight.", timeInCallSecs: 9 },
      ],
    };
    expect(await worker.followOnce()).toMatchObject({ state: "completed" });
    const s = await row("select status, duration_seconds, transcript from public.interview_sessions where id = $1", [call]);
    expect(s.status).toBe("completed");
    expect(s.duration_seconds).toBe(640);
    expect(s.transcript).toHaveLength(2);
  });

  it("turns the person's words into labelled evidence, and rejects what they didn't say", async () => {
    expect(await worker.extractOnce()).toMatchObject({ kind: "extracted", status: "done", answers: 1, rejected: 1 });
    const ev = (await pool.query(
      `select e.state, e.fact, e.excerpt, e.content_location, e.structured_value, s.source_type, e.created_by_actor
         from public.evidence e join public.sources s on s.id = e.source_id where s.uri = $1`, [`interview:${call}`])).rows;
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({
      state: "user_supplied", source_type: "user_statement", excerpt: "nine clients, six on retainer", content_location: "call at 0:09",
      created_by_actor: "agent", structured_value: { question_key: "clients.mix", channel: "voice", playbook: "marketing-agency@1" },
    });
    expect((await row("select extraction_detail from public.interview_sessions where id = $1", [call])).extraction_detail).toMatch(/1 of \d+ questions answered; 1 proposed answers rejected/);
  });

  it("a call nobody answers is recorded as unanswered, with why", async () => {
    await pool.query("update public.interview_sessions set scheduled_for = now() - interval '1 minute' where id = $1", [missed]);
    voice.result = { ok: true, providerReference: "conv_it_2" };
    await worker.dialOnce();
    await pool.query("update public.interview_sessions set last_checked_at = now() - interval '1 minute', started_at = now() - interval '1 minute' where id = $1", [missed]);
    voice.snapshot = { state: "failed", transcript: [{ role: "agent", message: "Hello?", timeInCallSecs: 0 }], durationSecs: 12, endReason: "no-answer" };
    expect(await worker.followOnce()).toMatchObject({ state: "no_answer" });
    expect(await row("select status, failure_detail, transcript from public.interview_sessions where id = $1", [missed])).toEqual({
      status: "no_answer", failure_detail: "The call did not connect: no-answer", transcript: null,
    });
  });

  it("a person can't mark a call as done", async () => {
    const other = await book("+27821112222");
    await expect(asOwner("update public.interview_sessions set status = 'dialling' where id = $1", [other])).rejects.toMatchObject({ hint: "TEBOS_SERVER_ONLY" });
    await asOwner("update public.interview_sessions set status = 'cancelled' where id = $1", [other]);
  });
});
