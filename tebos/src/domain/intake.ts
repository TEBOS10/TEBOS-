// Intake calls: the short call TEBOS places the moment a prospect asks, in a
// meeting. Not the diagnostic (that stays paid): what takes their time, and
// whether they want to go ahead. The next day TEBOS emails them an outline of
// what it would build, from the blueprint for their kind of business: the
// names of the pieces and flows only (the same outline the public /systems
// page shows), never the rules or a diagnosis.

import { blueprintByKey } from "./blueprints";

/** What the prospect agrees to, word for word, before TEBOS rings them. */
export const INTAKE_CONSENT_TEXT =
  "Yes, TEBOS may call me now on this number for a short intake call (about five minutes) about my business, and may record and transcribe it to follow up with me.";

/** What the voice agent is asked to collect on the call. */
export const INTAKE_ANSWER_KEY = "wants_to_proceed";

/** The agent's answer, read strictly: only a clear yes or no counts. */
export function readWantsToProceed(collected: Record<string, unknown> | undefined): boolean | null {
  const v = collected?.[INTAKE_ANSWER_KEY];
  if (v === true || v === false) return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true" || s === "yes") return true;
    if (s === "false" || s === "no") return false;
  }
  return null;
}

/** 09:00 in Johannesburg (UTC+2, no daylight saving) on the day after the call. */
export function followUpDueAt(endedAt: Date): Date {
  const local = new Date(endedAt.getTime() + 2 * 3600_000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1, 7, 0, 0));
}

export interface FollowUpInput {
  name: string;
  business: string;
  industry: string | null;
  wantsToProceed: boolean | null;
  waitlistUrl: string;
}

export function followUpEmail(i: FollowUpInput): { subject: string; text: string } {
  const first = i.name.trim().split(/\s+/)[0] || i.name.trim();
  if (i.wantsToProceed === false) {
    return {
      subject: `Thank you for your time, ${first}`,
      text: [
        `Hi ${first},`,
        "",
        `Thank you for taking our call yesterday about ${i.business}. You said now isn't the right time, and that's completely fine.`,
        "We won't contact you again unless you ask us to. If things change, you can always join the waiting list:",
        i.waitlistUrl,
        "",
        "TEBOS",
      ].join("\n"),
    };
  }

  const bp = i.industry ? blueprintByKey(i.industry) : undefined;
  const outline = bp
    ? [
        `For a ${bp.industry.toLowerCase()} like ${i.business}, TEBOS would start your operating system with:`,
        "",
        "The pieces it runs on:",
        ...bp.pieces.map((p) => `- ${p.name}`),
        "",
        "The flows the work moves through:",
        ...bp.flows.map((f) => `- ${f.name}: from "${f.startsWhen}" to "${f.doneWhen}"`),
        "",
        "Every piece is a proposal until you confirm it, and we fit it to how you really work: your tools, your people and your rules.",
      ]
    : [
        `TEBOS would start by mapping how ${i.business} really runs: the pieces it runs on, the flows the work moves through, and where it still depends on you.`,
        "Every piece is a proposal until you confirm it.",
      ];

  const next =
    i.wantsToProceed === true
      ? [
          "You told us you'd like to go ahead. You're on the waiting list, and the person you met will be in touch to confirm your start.",
          "Once you start, your draft operating system is on your board on day 1 and confirmed with you by day 3.",
        ]
      : [
          "You're on the waiting list. Would you like to go ahead? Just reply yes or no to this email; either answer is fine.",
          "Once you start, your draft operating system is on your board on day 1 and confirmed with you by day 3.",
        ];

  return {
    subject: `What TEBOS would build for ${i.business}`,
    text: [`Hi ${first},`, "", `Thank you for taking our call yesterday.`, "", ...outline, "", ...next, "", "TEBOS"].join("\n"),
  };
}
