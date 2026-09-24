// Reasoning provider port (dossier §49: model-agnostic architecture).
//
// TEBOS owns context, data, workflow, permissions, evidence, state and
// audit; a model only supplies reasoning. Everything above this interface
// is provider-neutral, and a model's answer is always treated as a proposal
// that TEBOS validates deterministically before anything is stored.

export type ReasoningEffort = "low" | "medium" | "high" | "xhigh" | "max";

export interface StructuredRequest {
  /** Stable instructions. Keep free of per-request data so it can be cached. */
  system: string;
  /** The task and its data. */
  prompt: string;
  /** JSON schema the answer must follow (all objects closed, all properties required). */
  jsonSchema: Record<string, unknown>;
  effort?: ReasoningEffort;
  maxTokens?: number;
}

export interface ReasoningUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface StructuredResponse {
  /** Parsed JSON — still untrusted: validate before use. */
  value: unknown;
  provider: string;
  /** The model that actually served the answer (may differ from the requested one after a fallback). */
  model: string;
  usage: ReasoningUsage;
}

export class ReasoningError extends Error {
  constructor(
    readonly kind: "refusal" | "truncated" | "invalid_output" | "provider_unavailable",
    message: string,
  ) {
    super(message);
    this.name = "ReasoningError";
  }
}

export interface ReasoningProvider {
  readonly name: string;
  structured(request: StructuredRequest): Promise<StructuredResponse>;
}
