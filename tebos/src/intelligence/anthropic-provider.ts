// Claude implementation of the reasoning provider.
//
// - Model: claude-opus-5 by default (override with TEBOS_REASONING_MODEL).
// - Adaptive thinking; effort chosen per task.
// - Structured outputs: the answer is constrained to the task's JSON schema.
// - Server-side refusal fallbacks ("default"): if a safety classifier
//   declines, the API re-runs the request on Anthropic's recommended
//   fallback model; the model that actually answered is recorded.
// - The system prompt is cached (it is identical across scans).

import Anthropic from "@anthropic-ai/sdk";
import { ReasoningError, type ReasoningProvider, type StructuredRequest, type StructuredResponse } from "./provider";

export const DEFAULT_CLAUDE_MODEL = "claude-opus-5";

export class AnthropicProvider implements ReasoningProvider {
  readonly name = "anthropic";
  private readonly client: Anthropic;

  constructor(
    private readonly model: string = process.env.TEBOS_REASONING_MODEL || DEFAULT_CLAUDE_MODEL,
    client?: Anthropic,
  ) {
    // Credentials come from the environment (ANTHROPIC_API_KEY); never hard-coded.
    this.client = client ?? new Anthropic();
  }

  async structured(request: StructuredRequest): Promise<StructuredResponse> {
    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await this.client.beta.messages.create({
        model: this.model,
        max_tokens: request.maxTokens ?? 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        thinking: { type: "adaptive" },
        output_config: {
          effort: request.effort ?? "high",
          format: { type: "json_schema", schema: request.jsonSchema },
        },
        system: [{ type: "text", text: request.system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: request.prompt }],
      });
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
        throw new ReasoningError("provider_unavailable", `Anthropic rejected the credentials: ${err.message}`);
      }
      if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.InternalServerError || err instanceof Anthropic.APIConnectionError) {
        throw new ReasoningError("provider_unavailable", `Anthropic is temporarily unavailable: ${err.message}`);
      }
      throw err;
    }

    if (response.stop_reason === "refusal") {
      const category = response.stop_details?.category ?? "unspecified";
      throw new ReasoningError("refusal", `The model declined the request (category: ${category}), including any fallback`);
    }
    if (response.stop_reason === "max_tokens") {
      throw new ReasoningError("truncated", "The answer was cut off at the token limit");
    }

    const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      throw new ReasoningError("invalid_output", "The answer was not valid JSON");
    }
    return {
      value,
      provider: this.name,
      model: response.model,
      usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
    };
  }
}
