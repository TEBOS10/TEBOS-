import { describe, expect, it } from "vitest";
import { FallbackProvider, GatewayProvider } from "../src/intelligence/gateway-provider";
import { ReasoningError, type ReasoningProvider, type StructuredRequest } from "../src/intelligence/provider";

const request: StructuredRequest = { system: "Rules", prompt: "Task", jsonSchema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false } };

function fakeFetch(status: number, body: unknown, seen: Array<{ url: string; init: RequestInit }> = []): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    seen.push({ url: String(url), init: init ?? {} });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}
const answer = (content: string, extra: Record<string, unknown> = {}) => ({
  model: "served-model", choices: [{ finish_reason: "stop", message: { content, ...extra } }], usage: { prompt_tokens: 12, completion_tokens: 3 },
});
const kindOf = async (p: Promise<unknown>) => { try { await p; return "ok"; } catch (e) { return e instanceof ReasoningError ? e.kind : "other"; } };

describe("the model gateway provider", () => {
  it("asks for a schema-constrained answer, with the key only in the header", async () => {
    const seen: Array<{ url: string; init: RequestInit }> = [];
    const g = new GatewayProvider({ baseUrl: "http://gateway.internal:20128/v1/", model: "router/default", apiKey: "k-test" }, fakeFetch(200, answer('{"ok":true}'), seen));
    const res = await g.structured(request);
    expect(res).toEqual({ value: { ok: true }, provider: "gateway", model: "served-model", usage: { inputTokens: 12, outputTokens: 3 } });
    expect(seen[0]!.url).toBe("http://gateway.internal:20128/v1/chat/completions");
    expect((seen[0]!.init.headers as Record<string, string>).authorization).toBe("Bearer k-test");
    const body = JSON.parse(String(seen[0]!.init.body));
    expect(body.response_format).toMatchObject({ type: "json_schema", json_schema: { strict: true, schema: request.jsonSchema } });
    expect(body.messages).toEqual([{ role: "system", content: "Rules" }, { role: "user", content: "Task" }]);
    expect(String(seen[0]!.init.body)).not.toContain("k-test");
  });

  it("maps failures to the worker's kinds, so an outage pauses analysis instead of blaming a business", async () => {
    const make = (status: number, body: unknown = {}) => new GatewayProvider({ baseUrl: "https://g.example/v1", model: "m" }, fakeFetch(status, body));
    expect(await kindOf(make(401).structured(request))).toBe("misconfigured");
    expect(await kindOf(make(400).structured(request))).toBe("misconfigured");
    expect(await kindOf(make(429).structured(request))).toBe("provider_unavailable");
    expect(await kindOf(make(503).structured(request))).toBe("provider_unavailable");
    expect(await kindOf(make(200, answer("not json")).structured(request))).toBe("invalid_output");
    expect(await kindOf(make(200, answer("", { refusal: "no" })).structured(request))).toBe("refusal");
    expect(await kindOf(make(200, { choices: [{ finish_reason: "length", message: { content: "{" } }] }).structured(request))).toBe("truncated");
    const down = new GatewayProvider({ baseUrl: "https://g.example/v1", model: "m" }, (async () => { throw new Error("ECONNREFUSED"); }) as typeof fetch);
    expect(await kindOf(down.structured(request))).toBe("provider_unavailable");
  });

  it("refuses a missing URL or model at start-up", () => {
    expect(() => new GatewayProvider({ baseUrl: "gateway:20128", model: "m" })).toThrow();
    expect(() => new GatewayProvider({ baseUrl: "http://g/v1", model: "" })).toThrow();
  });
});

describe("falling back between providers", () => {
  const ok = (name: string): ReasoningProvider => ({ name, structured: async () => ({ value: { ok: true }, provider: name, model: name, usage: { inputTokens: 1, outputTokens: 1 } }) });
  const failing = (name: string, kind: ReasoningError["kind"]): ReasoningProvider => ({ name, structured: async () => { throw new ReasoningError(kind, `${name} ${kind}`); } });

  it("moves on only when a provider itself fails", async () => {
    expect((await new FallbackProvider([failing("a", "provider_unavailable"), ok("b")]).structured(request)).provider).toBe("b");
    expect((await new FallbackProvider([failing("a", "misconfigured"), ok("b")]).structured(request)).provider).toBe("b");
    expect(await kindOf(new FallbackProvider([failing("a", "refusal"), ok("b")]).structured(request))).toBe("refusal");
    expect(await kindOf(new FallbackProvider([failing("a", "invalid_output"), ok("b")]).structured(request))).toBe("invalid_output");
  });

  it("throws the last provider's fault when every provider fails", async () => {
    const p = new FallbackProvider([failing("a", "misconfigured"), failing("b", "provider_unavailable")]);
    expect(p.name).toBe("a+b");
    expect(await kindOf(p.structured(request))).toBe("provider_unavailable");
  });
});

describe("naming the workspace for a key that isn't scoped to one", async () => {
  const { workspaceHeaders } = await import("../src/intelligence/anthropic-provider");
  it("adds the header only when an ID is set, and refuses something that isn't an ID", () => {
    expect(workspaceHeaders(undefined)).toEqual({});
    expect(workspaceHeaders("  ")).toEqual({});
    expect(workspaceHeaders("wrkspc_01AbC")).toEqual({ "anthropic-workspace-id": "wrkspc_01AbC" });
    expect(() => workspaceHeaders("not a workspace; id")).toThrow();
  });
});

describe("Grok (xAI)", () => {
  it("calls xAI's endpoint with the key only in the header, under its own name", async () => {
    const { xaiProvider, XAI_BASE_URL, DEFAULT_XAI_MODEL } = await import("../src/intelligence/xai-provider");
    const seen: Array<{ url: string; init: RequestInit }> = [];
    const g = xaiProvider("xai-test-key", undefined, fakeFetch(200, answer('{"ok":true}'), seen));
    expect(g.name).toBe("xai");
    expect((await g.structured(request)).provider).toBe("xai");
    expect(seen[0]!.url).toBe(`${XAI_BASE_URL}/chat/completions`);
    expect(XAI_BASE_URL).toBe("https://api.x.ai/v1");
    expect((seen[0]!.init.headers as Record<string, string>).authorization).toBe("Bearer xai-test-key");
    const body = JSON.parse(String(seen[0]!.init.body));
    expect(body.model).toBe(DEFAULT_XAI_MODEL);
    expect(body.response_format).toMatchObject({ type: "json_schema", json_schema: { strict: true } });
    expect(String(seen[0]!.init.body)).not.toContain("xai-test-key");
  });

  it("uses the chosen model, refuses an empty key, and names itself in errors", async () => {
    const { xaiProvider } = await import("../src/intelligence/xai-provider");
    const seen: Array<{ url: string; init: RequestInit }> = [];
    await xaiProvider("k", "grok-other", fakeFetch(200, answer('{"ok":true}'), seen)).structured(request);
    expect(JSON.parse(String(seen[0]!.init.body)).model).toBe("grok-other");
    expect(() => xaiProvider("  ")).toThrow();
    const err = await xaiProvider("k", undefined, fakeFetch(401, {})).structured(request).catch((e) => e);
    expect(err).toBeInstanceOf(ReasoningError);
    expect(err.kind).toBe("misconfigured");
    expect(err.message).toMatch(/^xAI /);
  });

  it("is a fallback after Claude: an outage moves on to Grok", async () => {
    const { xaiProvider } = await import("../src/intelligence/xai-provider");
    const claudeDown: ReasoningProvider = { name: "anthropic", structured: async () => { throw new ReasoningError("provider_unavailable", "down"); } };
    const chain = new FallbackProvider([claudeDown, xaiProvider("k", undefined, fakeFetch(200, answer('{"ok":true}')))]);
    expect(chain.name).toBe("anthropic+xai");
    expect((await chain.structured(request)).provider).toBe("xai");
  });
});
