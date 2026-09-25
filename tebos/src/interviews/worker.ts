// The interview worker: places booked calls, follows them to the end, and
// turns what the person said into evidence.
//
//   dial     a booked call whose time has come -> dialling -> the provider calls
//   follow   a live call -> in_progress -> completed with its transcript, or
//            no_answer / failed with the reason (never "completed" without words)
//   extract  a completed call -> answers per playbook question, each quoting
//            the person word for word -> evidence labelled as their statements
//
// A call placed but not confirmed by the provider within 15 minutes is failed
// as "outcome unknown", not retried: calling someone twice is worse than asking
// them to rebook.

import { allQuestions, playbook as findPlaybook, type Playbook } from "../domain/playbooks";
import { ReasoningError, type ReasoningProvider } from "../intelligence/provider";
import { buildExtractionRequest, unanswered, validateAnswers, type AcceptedAnswer } from "./extract";
import type { ConversationSnapshot, TranscriptTurn, VoiceProvider } from "./voice";

export interface DueCall {
  id: string;
  orgId: string;
  businessId: string;
  phoneNumber: string;
  playbookKey: string;
  playbookVersion: number;
}

export interface CallBrief {
  businessName: string;
  website: string | null;
  /** What TEBOS already believes, from the public scan: unconfirmed. */
  knownFromScan: string[];
  /** What the owner has already told TEBOS in writing. */
  ownerContext: string[];
}

export interface ActiveCall {
  id: string;
  status: "dialling" | "in_progress";
  providerReference: string | null;
  startedAt: string | null;
}

export interface CompletedCall {
  id: string;
  orgId: string;
  businessId: string;
  playbookKey: string;
  playbookVersion: number;
  transcript: TranscriptTurn[];
}

export interface InterviewStore {
  /** Claims one booked call that is due (moves it to dialling). */
  claimDueCall(provider: string): Promise<DueCall | null>;
  loadBrief(call: DueCall): Promise<CallBrief>;
  recordPlaced(id: string, providerReference: string): Promise<void>;
  recordFailed(id: string, status: "no_answer" | "failed", detail: string): Promise<void>;
  nextActiveCall(): Promise<ActiveCall | null>;
  recordProgress(id: string): Promise<void>;
  recordCompleted(id: string, snapshot: ConversationSnapshot): Promise<void>;
  nextExtraction(): Promise<CompletedCall | null>;
  recordExtraction(
    call: CompletedCall,
    result: { status: "done" | "failed" | "not_available"; detail: string; answers: AcceptedAnswer[] },
  ): Promise<void>;
}

export const UNCONFIRMED_AFTER_MS = 15 * 60 * 1000;

export type InterviewReport =
  | { kind: "dialled"; id: string; ok: boolean; detail: string }
  | { kind: "followed"; id: string; state: string }
  | { kind: "extracted"; id: string; status: string; answers: number; rejected: number };

export class InterviewWorker {
  constructor(
    private readonly store: InterviewStore,
    private readonly voice: VoiceProvider | null,
    private readonly reasoning: ReasoningProvider | null,
    private readonly options: { log?: (e: Record<string, unknown>) => void; now?: () => Date } = {},
  ) {}

  private log(e: Record<string, unknown>) {
    this.options.log?.(e);
  }
  private now() {
    return this.options.now?.() ?? new Date();
  }

  async runOnce(): Promise<InterviewReport | null> {
    return (this.voice ? (await this.dialOnce()) ?? (await this.followOnce()) : null) ?? (await this.extractOnce());
  }

  async dialOnce(): Promise<InterviewReport | null> {
    if (!this.voice) return null;
    const call = await this.store.claimDueCall(this.voice.name);
    if (!call) return null;
    const book = findPlaybook(call.playbookKey, call.playbookVersion);
    if (!book) {
      const detail = `Unknown playbook ${call.playbookKey}@${call.playbookVersion}`;
      await this.store.recordFailed(call.id, "failed", detail);
      return { kind: "dialled", id: call.id, ok: false, detail };
    }
    const brief = await this.store.loadBrief(call);
    const placed = await this.voice.placeCall(call.phoneNumber, callVariables(book, brief));
    if (placed.ok) {
      await this.store.recordPlaced(call.id, placed.providerReference);
      this.log({ event: "interview.dialled", id: call.id, reference: placed.providerReference });
      return { kind: "dialled", id: call.id, ok: true, detail: placed.providerReference };
    }
    await this.store.recordFailed(call.id, "failed", placed.detail);
    this.log({ event: "interview.dial_failed", id: call.id, detail: placed.detail });
    return { kind: "dialled", id: call.id, ok: false, detail: placed.detail };
  }

  async followOnce(): Promise<InterviewReport | null> {
    if (!this.voice) return null;
    const call = await this.store.nextActiveCall();
    if (!call) return null;
    const age = call.startedAt ? this.now().getTime() - new Date(call.startedAt).getTime() : Infinity;
    if (!call.providerReference) {
      if (age > UNCONFIRMED_AFTER_MS) {
        await this.store.recordFailed(call.id, "failed", "Outcome unknown: the call was started but the provider never confirmed it. Book a new time.");
        return { kind: "followed", id: call.id, state: "failed" };
      }
      await this.store.recordProgress(call.id);
      return { kind: "followed", id: call.id, state: "waiting" };
    }
    const snap = await this.voice.getConversation(call.providerReference);
    if ("error" in snap) {
      await this.store.recordProgress(call.id);
      return { kind: "followed", id: call.id, state: `unknown: ${snap.error}` };
    }
    const spoke = snap.transcript.some((t) => t.role === "user");
    if (snap.state === "done" || snap.state === "failed") {
      if (!spoke) {
        const detail = snap.state === "failed" ? `The call did not connect${snap.endReason ? `: ${snap.endReason}` : ""}` : "Nobody answered, or the call ended before the person spoke";
        await this.store.recordFailed(call.id, "no_answer", detail);
        this.log({ event: "interview.no_answer", id: call.id, detail });
        return { kind: "followed", id: call.id, state: "no_answer" };
      }
      await this.store.recordCompleted(call.id, snap);
      this.log({ event: "interview.completed", id: call.id, turns: snap.transcript.length, durationSecs: snap.durationSecs });
      return { kind: "followed", id: call.id, state: "completed" };
    }
    await this.store.recordProgress(call.id);
    return { kind: "followed", id: call.id, state: snap.state };
  }

  async extractOnce(): Promise<InterviewReport | null> {
    const call = await this.store.nextExtraction();
    if (!call) return null;
    const book = findPlaybook(call.playbookKey, call.playbookVersion);
    const done = async (status: "done" | "failed" | "not_available", detail: string, answers: AcceptedAnswer[], rejected = 0): Promise<InterviewReport> => {
      await this.store.recordExtraction(call, { status, detail, answers });
      this.log({ event: "interview.extracted", id: call.id, status, answers: answers.length, rejected });
      return { kind: "extracted", id: call.id, status, answers: answers.length, rejected };
    };
    if (!book) return done("failed", `Unknown playbook ${call.playbookKey}@${call.playbookVersion}`, []);
    if (!this.reasoning) return done("not_available", "Answers aren't extracted yet: the worker has no reasoning provider (set ANTHROPIC_API_KEY). The transcript is kept.", []);
    try {
      const res = await this.reasoning.structured(buildExtractionRequest(book, call.transcript));
      const { accepted, rejected } = validateAnswers(book, call.transcript, res.value);
      const open = unanswered(book, accepted);
      const detail = `${accepted.length} of ${allQuestions(book).length} questions answered${rejected.length ? `; ${rejected.length} proposed answers rejected (not what the person said)` : ""}${open.length ? `. Not covered: ${open.join(", ")}` : ""}`;
      return done("done", detail, accepted, rejected.length);
    } catch (err) {
      const detail = err instanceof ReasoningError ? `Could not extract answers (${err.kind}): ${err.message}` : `Could not extract answers: ${(err as Error).message}`;
      return done("failed", detail, []);
    }
  }
}

/** Dynamic variables the voice agent's prompt uses. Plain text; the agent reads them, the person never sees them. */
export function callVariables(book: Playbook, brief: CallBrief): Record<string, string> {
  const questions = book.sections
    .map((s) => `${s.title}:\n${s.questions.map((q) => `- ${q.text}${q.followUps.length ? ` (if vague: ${q.followUps.join(" / ")})` : ""}`).join("\n")}`)
    .join("\n\n");
  const cap = (xs: string[], n: number) => xs.slice(0, n).map((x) => `- ${x.slice(0, 300)}`).join("\n");
  return {
    business_name: brief.businessName.slice(0, 120),
    playbook_name: book.name,
    questions,
    known_from_scan: brief.knownFromScan.length
      ? `From the business's public website (unconfirmed; check, don't assert):\n${cap(brief.knownFromScan, 8)}`
      : "Nothing yet from public sources.",
    owner_context: brief.ownerContext.length ? `What the owner already told us in writing:\n${cap(brief.ownerContext, 8)}` : "Nothing yet.",
  };
}
