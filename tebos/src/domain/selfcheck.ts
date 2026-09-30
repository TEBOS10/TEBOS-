// The free self-check: "How much does your business run through you?"
// Ten questions, each answered no (0), sometimes (1) or yes (2). The score is
// the share of the maximum, as a whole percentage. The database recomputes
// it from the answers (tebos_private.self_check_score), so the published
// totals can't be inflated by what a browser sends; test/selfcheck.test.ts
// keeps the two in step.

export type Answer = 0 | 1 | 2;

export interface Question {
  key: string;
  area: string;
  text: string;
  /** The first fix, shown when the answer is sometimes or yes. */
  fix: string;
}

export const QUESTIONS: Question[] = [
  { key: "leads", area: "Sales", text: "Does a new lead wait for you before anyone replies or quotes?",
    fix: "Write down which leads anyone can answer, and what they say. Give first replies an owner and a same-day target." },
  { key: "pricing", area: "Pricing", text: "Are prices, discounts or scope decided case by case, by you?",
    fix: "Write your pricing rules and the limits within which someone else can decide. Keep only the exceptions for yourself." },
  { key: "complaints", area: "Clients", text: "When a client complains, does it end up on your desk?",
    fix: "Name who owns client issues, what they can do without asking, and when it comes to you." },
  { key: "delivery", area: "Delivery", text: "Would your team list different steps from you for 'client says yes' to 'work delivered'?",
    fix: "Map that flow together, step by step, with who does each one. Agree it, and write it down." },
  { key: "handovers", area: "Handovers", text: "Do handovers between people happen in chat, where nobody else can check them?",
    fix: "Agree one place where each handover happens, and what it must contain." },
  { key: "late", area: "Visibility", text: "Do you find out something is late only when a client tells you?",
    fix: "Give every piece of work a due date and an owner, somewhere the whole team can see it." },
  { key: "revenue", area: "Finance", text: "Is your monthly revenue something you have to work out, rather than read?",
    fix: "Pick the one system that holds the truth about money, and read the month's figure from it." },
  { key: "away", area: "Resilience", text: "When you were last away for a week, did anything important stop?",
    fix: "List what stopped. Each item is a decision or a step that needs a written rule and a second owner." },
  { key: "hiring", area: "People", text: "Do new people learn the job by shadowing, because nothing is written down?",
    fix: "Write down the three things a new hire gets wrong first, and how they're done here." },
  { key: "targets", area: "Objectives", text: "Are your targets feelings about how the month went, rather than numbers with a date?",
    fix: "Set two objectives with a number, a date and an owner, measured from a system." },
];

export const MAX_SCORE = QUESTIONS.length * 2;

export function scoreOf(answers: readonly number[]): number | null {
  if (answers.length !== QUESTIONS.length || answers.some((a) => a !== 0 && a !== 1 && a !== 2)) return null;
  const total = answers.reduce((s, a) => s + a, 0);
  return Math.round((total / MAX_SCORE) * 100);
}

export interface Band {
  key: "structured" | "middleware" | "runs_through_you";
  title: string;
  summary: string;
}

export function bandOf(score: number): Band {
  if (score <= 30) return { key: "structured", title: "Structured", summary: "Your business mostly runs without you. Keep it that way by measuring the flows that matter." };
  if (score <= 60) return { key: "middleware", title: "The middleware in places", summary: "The business runs through you where it matters most. Those steps are its single point of failure, and your ceiling." };
  return { key: "runs_through_you", title: "The business runs through you", summary: "You are the operating system. Growth will make it heavier, not lighter, until the structure moves out of your head." };
}

/** The areas to fix first: yes before sometimes, in question order. */
export function firstFixes(answers: readonly number[], limit = 3): Question[] {
  return QUESTIONS.map((q, i) => ({ q, a: answers[i] ?? 0 }))
    .filter((x) => x.a > 0)
    .sort((x, y) => y.a - x.a)
    .slice(0, limit)
    .map((x) => x.q);
}

export const SIZE_BANDS = ["1-5", "6-20", "21-50", "51-200", "200+"] as const;
export type SizeBand = (typeof SIZE_BANDS)[number];
export const REGIONS = ["ZA", "NG", "KE", "africa_other", "other"] as const;
export type Region = (typeof REGIONS)[number];

/** Which plan fits a business of this size. */
export const planForSize = (size: SizeBand | null) => (size === "21-50" || size === "51-200" || size === "200+" ? "company" : "starter");
