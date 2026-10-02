// The intake worker: rings a prospect the moment staff start an intake call in
// a meeting, follows the call to its end, and queues the next-day email.
//
//   dial       requested -> dialling -> the voice agent phones them now
//   follow     a live call -> completed with its transcript (and their yes or
//              no, if the agent collected a clear one), or no_answer / failed
//              with the reason. Never "completed" without words.
//   follow-up  the day after a completed call, once TEBOS has opened the
//              prospect's opportunity: an outline of what TEBOS would build,
//              queued in the client outbox (sent when email is configured).
//
// A call placed but not confirmed by the provider within 15 minutes is failed
// as "outcome unknown", not retried: calling someone twice is worse than not.

import { followUpDueAt, followUpEmail, readWantsToProceed } from "../domain/intake";
import type { ConversationSnapshot, VoiceProvider } from "../interviews/voice";

export interface RequestedCall {
  id: string;
  phoneNumber: string;
  name: string;
  business: string;
  industry: string | null;
}

export interface LiveCall {
  id: string;
  providerReference: string | null;
  startedAt: string | null;
}

export interface DueFollowUp {
  id: string;
  opportunityId: string;
  name: string;
  business: string;
  email: string;
  industry: string | null;
  wantsToProceed: boolean | null;
}

export interface IntakeStore {
  /** Claims the oldest requested call (moves it to dialling). */
  claimRequested(provider: string): Promise<RequestedCall | null>;
  recordPlaced(id: string, providerReference: string): Promise<void>;
  recordFailed(id: string, status: "no_answer" | "failed", detail: string): Promise<void>;
  nextLiveCall(): Promise<LiveCall | null>;
  recordProgress(id: string): Promise<void>;
  recordCompleted(id: string, snap: ConversationSnapshot, wantsToProceed: boolean | null, followUpDueAt: Date): Promise<void>;
  /** A completed call whose follow-up is due and whose opportunity TEBOS has opened. */
  nextDueFollowUp(): Promise<DueFollowUp | null>;
  queueFollowUp(f: DueFollowUp, email: { subject: string; text: string }): Promise<void>;
}

export const UNCONFIRMED_AFTER_MS = 15 * 60 * 1000;

export type IntakeReport =
  | { kind: "dialled"; id: string; ok: boolean; detail: string }
  | { kind: "followed"; id: string; state: string }
  | { kind: "follow_up_queued"; id: string };

export class IntakeWorker {
  constructor(
    private readonly store: IntakeStore,
    private readonly voice: VoiceProvider | null,
    private readonly options: { waitlistUrl: string; log?: (e: Record<string, unknown>) => void; now?: () => Date },
  ) {}

  private log(e: Record<string, unknown>) {
    this.options.log?.(e);
  }
  private now() {
    return this.options.now?.() ?? new Date();
  }

  async runOnce(): Promise<IntakeReport | null> {
    return (this.voice ? (await this.dialOnce()) ?? (await this.followOnce()) : null) ?? (await this.followUpOnce());
  }

  async dialOnce(): Promise<IntakeReport | null> {
    if (!this.voice) return null;
    const call = await this.store.claimRequested(this.voice.name);
    if (!call) return null;
    const placed = await this.voice.placeCall(call.phoneNumber, {
      prospect_name: call.name,
      business_name: call.business,
      kind_of_business: call.industry ?? "not given",
      call_purpose: "intake",
    });
    if (placed.ok) {
      await this.store.recordPlaced(call.id, placed.providerReference);
      this.log({ event: "intake.dialled", id: call.id, reference: placed.providerReference });
      return { kind: "dialled", id: call.id, ok: true, detail: placed.providerReference };
    }
    await this.store.recordFailed(call.id, "failed", placed.detail);
    this.log({ event: "intake.dial_failed", id: call.id, detail: placed.detail });
    return { kind: "dialled", id: call.id, ok: false, detail: placed.detail };
  }

  async followOnce(): Promise<IntakeReport | null> {
    if (!this.voice) return null;
    const call = await this.store.nextLiveCall();
    if (!call) return null;
    const age = call.startedAt ? this.now().getTime() - new Date(call.startedAt).getTime() : Infinity;
    if (!call.providerReference) {
      if (age > UNCONFIRMED_AFTER_MS) {
        await this.store.recordFailed(call.id, "failed", "Outcome unknown: the call was started but the provider never confirmed it.");
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
    if (snap.state === "done" || snap.state === "failed") {
      if (!snap.transcript.some((t) => t.role === "user")) {
        const detail = snap.state === "failed" ? `The call did not connect${snap.endReason ? `: ${snap.endReason}` : ""}` : "Nobody answered, or the call ended before the person spoke";
        await this.store.recordFailed(call.id, "no_answer", detail);
        this.log({ event: "intake.no_answer", id: call.id, detail });
        return { kind: "followed", id: call.id, state: "no_answer" };
      }
      const wants = readWantsToProceed(snap.collected);
      await this.store.recordCompleted(call.id, snap, wants, followUpDueAt(this.now()));
      this.log({ event: "intake.completed", id: call.id, turns: snap.transcript.length, wantsToProceed: wants });
      return { kind: "followed", id: call.id, state: "completed" };
    }
    await this.store.recordProgress(call.id);
    return { kind: "followed", id: call.id, state: snap.state };
  }

  async followUpOnce(): Promise<IntakeReport | null> {
    const due = await this.store.nextDueFollowUp();
    if (!due) return null;
    const email = followUpEmail({ name: due.name, business: due.business, industry: due.industry, wantsToProceed: due.wantsToProceed, waitlistUrl: this.options.waitlistUrl });
    await this.store.queueFollowUp(due, email);
    this.log({ event: "intake.follow_up_queued", id: due.id });
    return { kind: "follow_up_queued", id: due.id };
  }
}
