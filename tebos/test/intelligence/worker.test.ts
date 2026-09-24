import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { AnthropicProvider } from "../../src/intelligence/anthropic-provider";
import type { AcceptedFinding, EvidenceForReasoning, FindingsInput } from "../../src/intelligence/findings";
import { ReasoningError, type ReasoningProvider, type StructuredRequest } from "../../src/intelligence/provider";
import { IntelligenceWorker, type ClaimedAnalysis, type IntelligenceStore, type RunFinish } from "../../src/intelligence/worker";

const evidence: EvidenceForReasoning[] = [
  { id: "ev-1", sourceId: "s1", sourceUri: "https://mmupi.example/", state: "acquired", fact: "Page links to WhatsApp", missingDescription: null, excerpt: "<a href=wa.me>", contentLocation: "a", confidence: 0.9 },
  { id: "ev-2", sourceId: "s2", sourceUri: "https://mmupi.example/contact", state: "unavailable", fact: null, missingDescription: "HTTP 503", excerpt: null, contentLocation: null, confidence: null },
];

class FakeStore implements IntelligenceStore {
  claims: ClaimedAnalysis[] = [{ runId: "run-1", scanId: "scan-1", orgId: "org", businessId: "biz" }];
  saved: AcceptedFinding[] = [];
  calls: Array<{ status: string; errorDetail: string | null }> = [];
  finish: RunFinish | null = null;
  constructor(private readonly ev: EvidenceForReasoning[]) {}
  async claimNextScan() {
    return this.claims.shift() ?? null;
  }
  async loadInput(): Promise<FindingsInput> {
    return { business: { name: "Mmupi", website: null, industry: null }, objective: null, userContext: [], evidence: this.ev, scanCoverage: 0.5, pagesRead: 1 };
  }
  async saveFindings(_c: ClaimedAnalysis, f: AcceptedFinding[]) {
    this.saved.push(...f);
    return f.map((_, i) => `finding-${i}`);
  }
  async recordToolCall(_c: ClaimedAnalysis, call: { status: string; errorDetail: string | null }) {
    this.calls.push(call);
  }
  async finishRun(_c: ClaimedAnalysis, f: RunFinish) {
    this.finish = f;
  }
}

const provider = (answer: unknown | Error): ReasoningProvider & { requests: StructuredRequest[] } => {
  const requests: StructuredRequest[] = [];
  return {
    name: "fake",
    requests,
    async structured(req) {
      requests.push(req);
      if (answer instanceof Error) throw answer;
      return { value: answer, provider: "fake", model: "fake-model", usage: { inputTokens: 100, outputTokens: 50 } };
    },
  };
};

const finding = {
  title: "WhatsApp is the enquiry channel",
  statement: "The home page sends enquiries to WhatsApp.",
  kind: "interpretation",
  category: "risk",
  impact_hypothesis: "Enquiries may go untracked.",
  supporting_evidence: ["E1"],
  contradicting_evidence: [],
  missing_information: [],
};

describe("intelligence worker", () => {
  it("stores validated findings and records the run, tokens and rejections", async () => {
    const store = new FakeStore(evidence);
    const p = provider({ findings: [finding, { ...finding, title: "Built on nothing", supporting_evidence: ["E2"] }] });
    const report = await new IntelligenceWorker(store, p, { workerId: "w" }).runOnce();

    expect(report).toMatchObject({ status: "succeeded", findings: 1 });
    expect(store.saved[0]!.supporting.map((e) => e.id)).toEqual(["ev-1"]);
    expect(store.finish).toMatchObject({ status: "succeeded", model: "fake-model", tokensIn: 100, tokensOut: 50 });
    expect((store.finish!.output.rejected as Array<{ title: string }>).map((r) => r.title)).toEqual(["Built on nothing"]);
    expect(store.calls).toEqual([expect.objectContaining({ status: "succeeded" })]);
  });

  it("makes no model call when the scan obtained no evidence", async () => {
    const store = new FakeStore([evidence[1]!]);
    const p = provider({ findings: [] });
    const report = await new IntelligenceWorker(store, p, { workerId: "w" }).runOnce();
    expect(p.requests).toHaveLength(0);
    expect(report).toMatchObject({ status: "succeeded", findings: 0 });
    expect(store.finish?.tokensIn).toBe(0);
  });

  it("records a failed run — not fake findings — when the model declines", async () => {
    const store = new FakeStore(evidence);
    const report = await new IntelligenceWorker(store, provider(new ReasoningError("refusal", "declined")), { workerId: "w" }).runOnce();
    expect(report).toMatchObject({ status: "failed", findings: 0 });
    expect(store.saved).toEqual([]);
    expect(store.finish).toMatchObject({ status: "failed", errorDetail: "refusal: declined" });
    expect(store.calls[0]).toMatchObject({ status: "failed" });
  });

  it("returns null when nothing is waiting", async () => {
    const store = new FakeStore(evidence);
    store.claims = [];
    expect(await new IntelligenceWorker(store, provider({ findings: [] }), { workerId: "w" }).runOnce()).toBeNull();
  });
});

describe("Claude provider", () => {
  const fakeClient = (message: Partial<Anthropic.Beta.BetaMessage>) => {
    const sent: unknown[] = [];
    const client = {
      beta: {
        messages: {
          create: async (body: unknown) => {
            sent.push(body);
            return { model: "claude-opus-5", stop_reason: "end_turn", stop_details: null, usage: { input_tokens: 10, output_tokens: 5 }, content: [], ...message };
          },
        },
      },
    } as unknown as Anthropic;
    return { client, sent };
  };
  const req: StructuredRequest = { system: "SYS", prompt: "PROMPT", jsonSchema: { type: "object" }, effort: "high" };

  it("sends a structured, cached, adaptive-thinking request with default refusal fallbacks", async () => {
    const { client, sent } = fakeClient({ content: [{ type: "text", text: '{"findings": []}', citations: null }] as Anthropic.Beta.BetaContentBlock[] });
    const res = await new AnthropicProvider("claude-opus-5", client).structured(req);
    expect(res).toMatchObject({ value: { findings: [] }, model: "claude-opus-5", usage: { inputTokens: 10, outputTokens: 5 } });
    expect(sent[0]).toMatchObject({
      model: "claude-opus-5",
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: "high", format: { type: "json_schema", schema: { type: "object" } } },
      system: [{ type: "text", text: "SYS", cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: "PROMPT" }],
    });
  });

  it("reports refusals and truncation instead of returning partial output", async () => {
    const refused = fakeClient({ stop_reason: "refusal", stop_details: { type: "refusal", category: null, explanation: null } as never });
    await expect(new AnthropicProvider("claude-opus-5", refused.client).structured(req)).rejects.toMatchObject({ kind: "refusal" });
    const cut = fakeClient({ stop_reason: "max_tokens" });
    await expect(new AnthropicProvider("claude-opus-5", cut.client).structured(req)).rejects.toMatchObject({ kind: "truncated" });
    const garbage = fakeClient({ content: [{ type: "text", text: "not json", citations: null }] as Anthropic.Beta.BetaContentBlock[] });
    await expect(new AnthropicProvider("claude-opus-5", garbage.client).structured(req)).rejects.toMatchObject({ kind: "invalid_output" });
  });
});
