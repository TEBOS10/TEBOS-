// The AI crew at work (ADR 0020): queued work is drafted by the team's agent on shift, through TEBOS's reasoning
// provider (Grok when XAI_API_KEY is set, ADR 0017). A draft is only a draft: the database lets only a person who is
// an admin approve it, and only a person mark it sent. This worker never approves, sends or publishes anything.
import { AI_WORK, pickAgent, type AiWork, type CrewAgent } from "../domain/aiCrew";
import { looksSecret } from "../domain/resilience";
import { ReasoningError, type ReasoningProvider } from "../intelligence/provider";

export interface CrewJob {
  id: string;
  orgId: string;
  kind: AiWork;
  brief: string;
  business: string;
  /** The customer's first name only: an agent needs to greet them, not to contact them. */
  customerFirstName: string | null;
  depositInstructions: string | null;
  agents: Array<CrewAgent & { instructions: string | null }>;
}

export interface CrewStore {
  /** The oldest queued work whose team has an active agent, skipping the ids given. */
  nextJob(skip: string[]): Promise<CrewJob | null>;
  /** Saves the draft if the work is still queued; false if someone else got there first. */
  saveDraft(taskId: string, agentId: string, draft: string): Promise<boolean>;
}

export type CrewReport = { taskId: string; outcome: "drafted" | "taken" | "refused" | "failed"; agent?: string };

const SYSTEM = `You are an agent on the team of a small creative business. You write drafts only: a person reads,
edits and approves every draft, and sends it themselves. Write in plain, warm, professional South African English.
Never invent prices, dates, availability, policies, discounts or facts that are not in the brief. Never ask for
passwords, card numbers or bank details, and never include any. If the brief lacks something you need, say so in
the draft in square brackets, e.g. [confirm the parking details]. Keep it short.`;

const SCHEMA = {
  type: "object",
  properties: { draft: { type: "string", description: "The draft, ready for a person to review." } },
  required: ["draft"],
  additionalProperties: false,
} as const;

const WHAT: Record<AiWork, string> = {
  reply_enquiry: "Reply to this booking request: thank them, restate what they asked for and when, explain that the date is held once the deposit arrives, and how to pay it if instructions are given.",
  call_sheet: "Write the call sheet for this confirmed shoot: date, time, what to bring or wear, and that the studio will confirm the photographer and address.",
  balance_reminder: "Write a friendly reminder that the balance is due before the gallery is released, with how to pay if instructions are given.",
  caption: "Write an Instagram caption for photos from this shoot. The customer agreed to publishing. Don't name the customer unless the brief says they want to be named. Two or three short lines and a few relevant hashtags.",
};

export class CrewWorker {
  private readonly skipped = new Set<string>();
  constructor(private readonly store: CrewStore, private readonly provider: ReasoningProvider, private readonly log: (e: Record<string, unknown>) => void = () => {}, private readonly now: () => Date = () => new Date()) {}

  async runOnce(): Promise<CrewReport | null> {
    const job = await this.store.nextJob([...this.skipped]);
    if (!job) return null;
    const agent = pickAgent(job.agents, job.kind, this.now());
    if (!agent) { this.skipped.add(job.id); return null; }
    const instructions = job.agents.find((a) => a.id === agent.id)?.instructions;
    const prompt = [
      `Business: ${job.business}`,
      `Your role: ${agent.name}, ${AI_WORK[job.kind].team} team.`,
      instructions ? `Your standing instructions from the business: ${instructions}` : null,
      `Task: ${WHAT[job.kind]}`,
      `Brief: ${job.brief}`,
      job.customerFirstName ? `Customer's first name: ${job.customerFirstName}` : null,
      job.depositInstructions && job.kind !== "caption" ? `How to pay (from the business): ${job.depositInstructions}` : null,
    ].filter(Boolean).join("\n");
    try {
      const res = await this.provider.structured({ system: SYSTEM, prompt, jsonSchema: SCHEMA as unknown as Record<string, unknown>, effort: "low", maxTokens: 1500 });
      const draft = String((res.value as { draft?: unknown })?.draft ?? "").trim();
      if (draft.length < 5 || draft.length > 4000 || looksSecret(draft)) {
        this.skipped.add(job.id);
        this.log({ event: "crew.draft_rejected", taskId: job.id, reason: "empty, too long or carrying a secret" });
        return { taskId: job.id, outcome: "failed" };
      }
      const saved = await this.store.saveDraft(job.id, agent.id, draft);
      this.log({ event: saved ? "crew.drafted" : "crew.taken", taskId: job.id, agent: agent.name, provider: res.provider });
      return { taskId: job.id, outcome: saved ? "drafted" : "taken", agent: agent.name };
    } catch (err) {
      this.skipped.add(job.id);
      if (err instanceof ReasoningError && err.kind === "refusal") return { taskId: job.id, outcome: "refused" };
      throw err;
    }
  }
}
