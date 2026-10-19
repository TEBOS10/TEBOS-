// A reasoning provider behind an OpenAI-compatible endpoint: TEBOS's own
// model gateway (OmniRoute on the private Railway network, docs/tooling-connections.md),
// or any provider that speaks the same chat-completions API.
//
// - Answers are constrained to the task's JSON schema (response_format json_schema).
// - Errors map onto the same kinds as the Claude provider, so a gateway
//   outage pauses analysis instead of counting against a business.
// - Credentials come from the environment; never hard-coded or logged.

import { ReasoningError, type ReasoningProvider, type StructuredRequest, type StructuredResponse } from "./provider";

type Fetch = typeof fetch;

export interface GatewayConfig {
  /** Base URL ending in /v1, e.g. http://omniroute.railway.internal:20128/v1 */
  baseUrl: string;
  model: string;
  apiKey?: string;
  timeoutMs?: number;
}

export class GatewayProvider implements ReasoningProvider {
  readonly name = "gateway";

  constructor(private readonly config: GatewayConfig, private readonly fetchImpl: Fetch = fetch) {
    if (!/^https?:\/\//.test(config.baseUrl)) throw new Error("TEBOS_MODEL_GATEWAY_URL must be an http(s) URL");
    if (!config.model) throw new Error("TEBOS_GATEWAY_MODEL must name the model to request");
  }

  async structured(request: StructuredRequest): Promise<StructuredResponse> {
    const url = `${this.config.baseUrl.replace(/\/+$/, "")}/chat/completions`;
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: this.config.model,
          max_tokens: request.maxTokens ?? 16000,
          messages: [{ role: "system", content: request.system }, { role: "user", content: request.prompt }],
          response_format: { type: "json_schema", json_schema: { name: "answer", strict: true, schema: request.jsonSchema } },
        }),
        signal: AbortSignal.timeout(this.config.timeoutMs ?? 300_000),
      });
    } catch (err) {
      throw new ReasoningError("provider_unavailable", `The model gateway couldn't be reached: ${(err as Error).message}`);
    }

    if (res.status === 401 || res.status === 403) throw new ReasoningError("misconfigured", `The model gateway rejected the credentials (${res.status})`);
    if (res.status === 400 || res.status === 404 || res.status === 422) throw new ReasoningError("misconfigured", `The model gateway rejected the request (${res.status})`);
    if (res.status === 429 || res.status >= 500) throw new ReasoningError("provider_unavailable", `The model gateway is temporarily unavailable (${res.status})`);
    if (!res.ok) throw new ReasoningError("provider_unavailable", `The model gateway answered ${res.status}`);

    let body: {
      model?: string;
      choices?: Array<{ finish_reason?: string; message?: { content?: string | null; refusal?: string | null } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    try {
      body = (await res.json()) as typeof body;
    } catch {
      throw new ReasoningError("invalid_output", "The model gateway's answer was not JSON");
    }
    const choice = body.choices?.[0];
    if (!choice?.message) throw new ReasoningError("invalid_output", "The model gateway returned no answer");
    if (choice.message.refusal) throw new ReasoningError("refusal", "The model declined the request");
    if (choice.finish_reason === "length") throw new ReasoningError("truncated", "The answer was cut off at the token limit");

    let value: unknown;
    try {
      value = JSON.parse(choice.message.content ?? "");
    } catch {
      throw new ReasoningError("invalid_output", "The answer was not valid JSON");
    }
    return {
      value,
      provider: this.name,
      model: body.model ?? this.config.model,
      usage: { inputTokens: body.usage?.prompt_tokens ?? 0, outputTokens: body.usage?.completion_tokens ?? 0 },
    };
  }
}

/**
 * Tries each provider in order. Only a provider's own fault (unavailable or
 * misconfigured) moves on to the next; a refusal, a truncated or an invalid
 * answer is about the request, so it is returned as is. If every provider
 * fails, the last error is thrown and the worker's pause applies.
 */
export class FallbackProvider implements ReasoningProvider {
  readonly name: string;

  constructor(private readonly providers: ReasoningProvider[]) {
    if (providers.length === 0) throw new Error("A fallback needs at least one provider");
    this.name = providers.map((p) => p.name).join("+");
  }

  async structured(request: StructuredRequest): Promise<StructuredResponse> {
    let last: unknown;
    for (const p of this.providers) {
      try {
        return await p.structured(request);
      } catch (err) {
        if (err instanceof ReasoningError && (err.kind === "provider_unavailable" || err.kind === "misconfigured")) {
          last = err;
          continue;
        }
        throw err;
      }
    }
    throw last;
  }
}
