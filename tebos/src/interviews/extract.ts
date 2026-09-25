// Turning an interview transcript into evidence. The model proposes which
// answer belongs to which playbook question; TEBOS keeps only answers whose
// quote appears word for word in something the person said.

import { allQuestions, type Playbook } from "../domain/playbooks";
import type { StructuredRequest } from "../intelligence/provider";
import type { TranscriptTurn } from "./voice";

export interface ProposedAnswer {
  question_key: string;
  summary: string;
  quote: string;
  turn: number;
}

export interface AcceptedAnswer {
  questionKey: string;
  question: string;
  summary: string;
  quote: string;
  turn: number;
  timeInCallSecs: number | null;
}

export interface RejectedAnswer {
  questionKey: string;
  reason: string;
}

const SYSTEM = `You read the transcript of a diagnostic interview with the owner or manager of a business.
For each playbook question, find where the PERSON (role "user", never the interviewer) answered it.
Rules:
- Only use what the person said. Never infer, never use the interviewer's words as an answer.
- "summary" restates the answer in one or two plain sentences, in the third person ("The owner says...").
- "quote" is copied exactly, character for character, from that one user turn: the shortest passage that supports the summary.
- "turn" is the index of that user turn in the transcript.
- Skip questions the person did not answer. Do not guess.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["answers"],
  properties: {
    answers: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question_key", "summary", "quote", "turn"],
        properties: {
          question_key: { type: "string" },
          summary: { type: "string" },
          quote: { type: "string" },
          turn: { type: "integer" },
        },
      },
    },
  },
};

export function buildExtractionRequest(playbook: Playbook, transcript: TranscriptTurn[]): StructuredRequest {
  const questions = allQuestions(playbook).map((q) => `- ${q.key}: ${q.text}`).join("\n");
  const turns = transcript.map((t, i) => `[${i}] ${t.role}: ${t.message}`).join("\n");
  return {
    system: SYSTEM,
    prompt: `Playbook questions:\n${questions}\n\nTranscript (index, role, words):\n${turns}`,
    jsonSchema: SCHEMA,
    effort: "medium",
    maxTokens: 8000,
  };
}

const norm = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();

/** Deterministic checks: a known question, a real user turn, and a quote that is really in it. One answer per question. */
export function validateAnswers(playbook: Playbook, transcript: TranscriptTurn[], raw: unknown): { accepted: AcceptedAnswer[]; rejected: RejectedAnswer[] } {
  const questions = new Map(allQuestions(playbook).map((q) => [q.key, q]));
  const proposed = ((raw as { answers?: unknown })?.answers ?? []) as ProposedAnswer[];
  const accepted: AcceptedAnswer[] = [];
  const rejected: RejectedAnswer[] = [];
  const seen = new Set<string>();
  for (const a of Array.isArray(proposed) ? proposed : []) {
    const key = typeof a?.question_key === "string" ? a.question_key : "";
    const q = questions.get(key);
    const turn = Number.isInteger(a?.turn) ? transcript[a.turn] : undefined;
    const quote = typeof a?.quote === "string" ? a.quote.trim() : "";
    const summary = typeof a?.summary === "string" ? a.summary.trim() : "";
    let reason: string | null = null;
    if (!q) reason = "Not a question in this playbook";
    else if (seen.has(key)) reason = "Question already answered";
    else if (!turn) reason = "Cites a turn that does not exist";
    else if (turn.role !== "user") reason = "Cites the interviewer, not the person";
    else if (quote.length < 3 || !norm(turn.message).includes(norm(quote))) reason = "Quote is not what the person said";
    else if (!summary || summary.length > 600) reason = "Summary missing or too long";
    if (reason) {
      rejected.push({ questionKey: key || "(none)", reason });
      continue;
    }
    seen.add(key);
    accepted.push({ questionKey: key, question: q!.text, summary, quote, turn: a.turn, timeInCallSecs: turn!.timeInCallSecs });
  }
  return { accepted, rejected };
}

export const unanswered = (playbook: Playbook, accepted: AcceptedAnswer[]) =>
  allQuestions(playbook).filter((q) => !accepted.some((a) => a.questionKey === q.key)).map((q) => q.key);
