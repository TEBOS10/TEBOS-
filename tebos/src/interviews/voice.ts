// Voice interview provider port, and ElevenLabs Agents as the first
// implementation. Only this file knows ElevenLabs' wire format.
//
//   placeCall        POST /v1/convai/twilio/outbound-call  (the agent phones the person)
//   getConversation  GET  /v1/convai/conversations/{id}    (status, transcript, duration)

export interface TranscriptTurn {
  role: "agent" | "user";
  message: string;
  timeInCallSecs: number | null;
}

export type CallState = "ringing" | "in_progress" | "processing" | "done" | "failed";

export interface ConversationSnapshot {
  state: CallState;
  transcript: TranscriptTurn[];
  durationSecs: number | null;
  endReason: string | null;
}

export type PlaceCallResult =
  | { ok: true; providerReference: string }
  | { ok: false; retryable: boolean; detail: string };

export interface VoiceProvider {
  readonly name: string;
  placeCall(to: string, variables: Record<string, string>): Promise<PlaceCallResult>;
  getConversation(reference: string): Promise<ConversationSnapshot | { error: string }>;
}

const API = "https://api.elevenlabs.io";
const TIMEOUT_MS = 20_000;

export interface ElevenLabsConfig {
  apiKey: string;
  agentId: string;
  /** The ElevenLabs id of the phone number calls come from (Twilio or SIP trunk, imported into ElevenLabs). */
  phoneNumberId: string;
  telephony?: "twilio" | "sip_trunk";
  fetch?: typeof fetch;
  baseUrl?: string;
}

export class ElevenLabsVoice implements VoiceProvider {
  readonly name = "elevenlabs";
  constructor(private readonly config: ElevenLabsConfig) {}

  private async call(method: string, path: string, body?: unknown) {
    const f = this.config.fetch ?? fetch;
    try {
      const res = await f(`${this.config.baseUrl ?? API}${path}`, {
        method,
        headers: { "xi-api-key": this.config.apiKey, ...(body ? { "content-type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: "error",
      });
      const text = await res.text();
      let json: unknown = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      return { kind: "response" as const, status: res.status, json };
    } catch (err) {
      return { kind: "network" as const, detail: `Could not reach ElevenLabs: ${(err as Error).message}` };
    }
  }

  async placeCall(to: string, variables: Record<string, string>): Promise<PlaceCallResult> {
    const path = this.config.telephony === "sip_trunk" ? "/v1/convai/sip-trunk/outbound-call" : "/v1/convai/twilio/outbound-call";
    const r = await this.call("POST", path, {
      agent_id: this.config.agentId,
      agent_phone_number_id: this.config.phoneNumberId,
      to_number: to,
      conversation_initiation_client_data: { dynamic_variables: variables },
    });
    if (r.kind === "network") return { ok: false, retryable: true, detail: r.detail };
    const json = (r.json ?? {}) as { success?: boolean; conversation_id?: string; message?: string; detail?: unknown };
    if (r.status >= 200 && r.status < 300 && json.success !== false && typeof json.conversation_id === "string" && json.conversation_id) {
      return { ok: true, providerReference: json.conversation_id };
    }
    const why = typeof json.message === "string" ? json.message : typeof json.detail === "string" ? json.detail : JSON.stringify(json.detail ?? "");
    return { ok: false, retryable: r.status === 429 || r.status >= 500, detail: `ElevenLabs could not place the call (HTTP ${r.status})${why ? `: ${why}` : ""}` };
  }

  async getConversation(reference: string): Promise<ConversationSnapshot | { error: string }> {
    const r = await this.call("GET", `/v1/convai/conversations/${encodeURIComponent(reference)}`);
    if (r.kind === "network") return { error: r.detail };
    if (r.status !== 200) return { error: `ElevenLabs answered HTTP ${r.status}` };
    const j = (r.json ?? {}) as {
      status?: string;
      transcript?: Array<{ role?: string; message?: string | null; time_in_call_secs?: number }>;
      metadata?: { call_duration_secs?: number; termination_reason?: string };
    };
    const state: CallState =
      j.status === "done" ? "done" : j.status === "failed" ? "failed" : j.status === "processing" ? "processing" : j.status === "in-progress" ? "in_progress" : "ringing";
    const transcript: TranscriptTurn[] = (j.transcript ?? [])
      .filter((t) => (t.role === "agent" || t.role === "user") && typeof t.message === "string" && t.message.trim())
      .map((t) => ({ role: t.role as "agent" | "user", message: t.message!.trim(), timeInCallSecs: typeof t.time_in_call_secs === "number" ? t.time_in_call_secs : null }));
    return {
      state,
      transcript,
      durationSecs: typeof j.metadata?.call_duration_secs === "number" ? j.metadata.call_duration_secs : null,
      endReason: j.metadata?.termination_reason ?? null,
    };
  }
}
