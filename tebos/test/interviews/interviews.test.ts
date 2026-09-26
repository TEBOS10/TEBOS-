import { describe, expect, it } from "vitest";
import { checkBookingTime, normalisePhone } from "../../src/domain/interview";
import { allQuestions, marketingAgencyPlaybook, playbook, PLAYBOOKS } from "../../src/domain/playbooks";
import { buildExtractionRequest, unanswered, validateAnswers } from "../../src/interviews/extract";
import { ElevenLabsVoice, type TranscriptTurn } from "../../src/interviews/voice";
import { callVariables } from "../../src/interviews/worker";

describe("booking rules", () => {
  it("normalises phone numbers to E.164, South African local numbers included", () => {
    expect(normalisePhone("082 123 4567")).toBe("+27821234567");
    expect(normalisePhone("+27 (82) 123-4567")).toBe("+27821234567");
    expect(normalisePhone("0044 20 7946 0958")).toBe("+442079460958");
    for (const bad of ["12345", "082 123", "+27 82 123 45678", "call me", "821234567"]) expect(normalisePhone(bad)).toBeNull();
  });
  it("books only between 5 minutes and 30 days ahead", () => {
    const now = new Date("2026-09-25T10:00:00Z");
    expect(checkBookingTime(new Date("2026-09-25T10:03:00Z"), now).ok).toBe(false);
    expect(checkBookingTime(new Date("2026-09-26T09:00:00Z"), now).ok).toBe(true);
    expect(checkBookingTime(new Date("2026-11-01T09:00:00Z"), now).ok).toBe(false);
    expect(checkBookingTime(new Date("nonsense"), now).ok).toBe(false);
  });
});

describe("playbooks", () => {
  it("have unique, stable question keys and say what would confirm each answer", () => {
    for (const p of PLAYBOOKS) {
      const keys = allQuestions(p).map((q) => q.key);
      expect(new Set(keys).size).toBe(keys.length);
      for (const k of keys) expect(k).toMatch(/^[a-z][a-z0-9_.-]{0,80}$/);
      for (const q of allQuestions(p)) expect(q.diagnoses.length).toBeGreaterThan(10);
    }
    expect(playbook("marketing-agency", 1)).toBe(marketingAgencyPlaybook);
    expect(playbook("marketing-agency", 99)).toBeNull();
  });
});

const transcript: TranscriptTurn[] = [
  { role: "agent", message: "Hi, I'm TEBOS's AI interviewer. How many active clients do you have?", timeInCallSecs: 0 },
  { role: "user", message: "We've got nine clients, six on retainers and three projects.", timeInCallSecs: 8 },
  { role: "agent", message: "And your biggest client is about forty percent of revenue, right?", timeInCallSecs: 20 },
  { role: "user", message: "Uh, yeah, roughly a third honestly.", timeInCallSecs: 25 },
];

describe("extracting answers from a call", () => {
  it("keeps answers quoted from what the person actually said", () => {
    const { accepted, rejected } = validateAnswers(marketingAgencyPlaybook, transcript, {
      answers: [
        { question_key: "clients.mix", summary: "The owner says they have nine clients: six retainers, three projects.", quote: "six on retainers and three projects", turn: 1 },
        { question_key: "clients.concentration", summary: "Biggest client is 40% of revenue.", quote: "forty percent of revenue", turn: 2 },
        { question_key: "clients.concentration", summary: "Biggest client is about a third of revenue.", quote: "roughly a third honestly", turn: 3 },
        { question_key: "clients.mix", summary: "dup", quote: "nine clients", turn: 1 },
        { question_key: "made.up", summary: "x", quote: "nine clients", turn: 1 },
        { question_key: "pipeline.sources", summary: "Referrals.", quote: "mostly referrals", turn: 3 },
        { question_key: "finance.cashflow", summary: "x", quote: "nine", turn: 9 },
      ],
    });
    expect(accepted.map((a) => [a.questionKey, a.turn])).toEqual([["clients.mix", 1], ["clients.concentration", 3]]);
    expect(accepted[1]!.timeInCallSecs).toBe(25);
    expect(rejected.map((r) => r.reason)).toEqual([
      "Cites the interviewer, not the person",
      "Question already answered",
      "Not a question in this playbook",
      "Quote is not what the person said",
      "Cites a turn that does not exist",
    ]);
    expect(unanswered(marketingAgencyPlaybook, accepted)).not.toContain("clients.mix");
  });
  it("survives a malformed model answer", () => {
    expect(validateAnswers(marketingAgencyPlaybook, transcript, "nonsense").accepted).toEqual([]);
    expect(validateAnswers(marketingAgencyPlaybook, transcript, { answers: [null, 4] }).accepted).toEqual([]);
  });
  it("gives the model every question and every turn, with roles", () => {
    const req = buildExtractionRequest(marketingAgencyPlaybook, transcript);
    expect(req.prompt).toContain("clients.concentration:");
    expect(req.prompt).toContain("[3] user: Uh, yeah");
  });
});

describe("briefing the voice agent", () => {
  it("marks what came from the public scan as unconfirmed, and lists the playbook", () => {
    const v = callVariables(marketingAgencyPlaybook, { businessName: "Bright Agency", website: null, knownFromScan: ["No pricing page: prices aren't published"], ownerContext: [] });
    expect(v.business_name).toBe("Bright Agency");
    expect(v.known_from_scan).toContain("unconfirmed");
    expect(v.questions).toContain("Clients and revenue:");
    expect(v.owner_context).toBe("Nothing yet.");
  });
});

describe("ElevenLabs voice provider", () => {
  const fake = (responses: Array<{ status: number; body: unknown } | Error>) => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const f = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const r = responses.shift()!;
      if (r instanceof Error) throw r;
      return new Response(JSON.stringify(r.body), { status: r.status });
    }) as unknown as typeof fetch;
    return { f, calls };
  };

  it("places an outbound call with the agent, number and briefing", async () => {
    const { f, calls } = fake([{ status: 200, body: { success: true, conversation_id: "conv_1", callSid: "CA1" } }]);
    const v = new ElevenLabsVoice({ apiKey: "xi", agentId: "agent_1", phoneNumberId: "pn_1", fetch: f });
    expect(await v.placeCall("+27821234567", { business_name: "Bright" })).toEqual({ ok: true, providerReference: "conv_1" });
    expect(calls[0]!.url).toBe("https://api.elevenlabs.io/v1/convai/twilio/outbound-call");
    expect((calls[0]!.init.headers as Record<string, string>)["xi-api-key"]).toBe("xi");
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      agent_id: "agent_1", agent_phone_number_id: "pn_1", to_number: "+27821234567",
      conversation_initiation_client_data: { dynamic_variables: { business_name: "Bright" } },
    });
  });

  it("reports refusals and outages honestly", async () => {
    const { f } = fake([{ status: 422, body: { detail: "Invalid phone number" } }, new Error("socket hang up"), { status: 200, body: { success: false, message: "Twilio error" } }]);
    const v = new ElevenLabsVoice({ apiKey: "xi", agentId: "a", phoneNumberId: "p", fetch: f });
    expect(await v.placeCall("+1", {})).toMatchObject({ ok: false, retryable: false, detail: expect.stringContaining("Invalid phone number") });
    expect(await v.placeCall("+1", {})).toMatchObject({ ok: false, retryable: true });
    expect(await v.placeCall("+1", {})).toMatchObject({ ok: false, detail: expect.stringContaining("Twilio error") });
  });

  it("reads a finished conversation's transcript", async () => {
    const { f } = fake([{ status: 200, body: { status: "done", metadata: { call_duration_secs: 812, termination_reason: "end_call tool" },
      transcript: [{ role: "agent", message: "Hello", time_in_call_secs: 0 }, { role: "user", message: " Hi there ", time_in_call_secs: 3 }, { role: "user", message: null }] } }]);
    const v = new ElevenLabsVoice({ apiKey: "xi", agentId: "a", phoneNumberId: "p", fetch: f });
    expect(await v.getConversation("conv_1")).toEqual({
      state: "done", durationSecs: 812, endReason: "end_call tool",
      transcript: [{ role: "agent", message: "Hello", timeInCallSecs: 0 }, { role: "user", message: "Hi there", timeInCallSecs: 3 }],
    });
  });
});
