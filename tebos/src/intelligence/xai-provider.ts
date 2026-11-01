// Grok (xAI) as a reasoning provider. xAI's API speaks the same chat-completions
// format as TEBOS's model gateway, with schema-constrained answers
// (response_format json_schema, strict), so this is the gateway provider pointed
// at xAI. It runs only in the worker: the key (XAI_API_KEY) is set by the founder
// in Railway, never in the web apps, never in chat, never logged.

import { GatewayProvider } from "./gateway-provider";

export const XAI_BASE_URL = "https://api.x.ai/v1";
export const DEFAULT_XAI_MODEL = "grok-4.7";

export function xaiProvider(apiKey: string, model: string = DEFAULT_XAI_MODEL, fetchImpl?: typeof fetch): GatewayProvider {
  if (!apiKey.trim()) throw new Error("XAI_API_KEY is empty");
  return new GatewayProvider({ baseUrl: XAI_BASE_URL, model: model.trim() || DEFAULT_XAI_MODEL, apiKey, name: "xai", label: "xAI" }, fetchImpl);
}
