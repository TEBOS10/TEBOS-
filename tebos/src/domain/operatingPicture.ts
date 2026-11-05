// The operating picture: how a business actually runs, across four parts the founder named (5 Nov 2026): who owns
// and decides, how the work flows, the money, and how long things take. A public website shows almost none of it, so
// the picture says plainly, part by part, what was seen from outside, what the owner has said, and what is still
// unknown, with the questions that would answer it. Nothing here is estimated: an unknown stays unknown.
import { allQuestions, type Playbook } from "./playbooks";

export type PartKey = "ownership" | "operations" | "money" | "time";
export type PartStatus = "unknown" | "seen_outside" | "owner_stated" | "both";

export interface PartDefinition {
  key: PartKey;
  title: string;
  /** what this part answers, in one line */
  covers: string;
  /** interview question keys that inform it (by prefix) */
  questionPrefixes: string[];
  /** public evidence kinds (from the website reader) that inform it */
  publicKinds: string[];
  /** why the website can't settle it */
  outsideLimit: string;
}

export const OPERATING_PARTS: readonly PartDefinition[] = [
  {
    key: "ownership", title: "Ownership and decisions", covers: "Who owns the business, who decides, and what still runs through the owner.",
    questionPrefixes: ["owner.", "priorities."], publicKinds: [],
    outsideLimit: "A website rarely says who owns a business or who makes the decisions.",
  },
  {
    key: "operations", title: "How the work flows", covers: "How customers arrive, how work is done and handed over, who does what and with which tools.",
    questionPrefixes: ["customers.", "team.", "pipeline.", "scoping.", "delivery.", "capacity.", "clients.", "retention."],
    publicKinds: ["phone", "email", "whatsapp", "form", "social_link"],
    outsideLimit: "The website shows how customers can get in touch, not what happens after they do.",
  },
  {
    key: "money", title: "The money", covers: "Revenue, margins, pricing, invoicing and the numbers the owner watches.",
    questionPrefixes: ["money.", "numbers.", "finance.", "results."], publicKinds: [],
    outsideLimit: "A private business's revenue and margins are not public.",
  },
  {
    key: "time", title: "How long things take", covers: "Response time to new customers, time to deliver, time to get paid.",
    questionPrefixes: ["time."], publicKinds: [],
    outsideLimit: "Response and delivery times can't be read from a website; only records show them.",
  },
];

/** One evidence row, as the interface and worker already load it. */
export interface PictureEvidence {
  id: string;
  state: string;
  fact: string | null;
  structured_value: Record<string, unknown> | null;
  retrieved_at?: string | null;
  created_at: string;
}

export interface PartView {
  part: PartDefinition;
  status: PartStatus;
  /** facts read from the public website */
  seen: PictureEvidence[];
  /** answers the owner gave (their statements, not verified fact) */
  stated: Array<{ evidence: PictureEvidence; question: string; questionKey: string }>;
  /** questions from the interview that would fill this part and haven't been answered */
  openQuestions: Array<{ key: string; text: string }>;
}

const OBTAINED = new Set(["acquired", "partially_acquired"]);

function partForQuestion(key: string): PartDefinition | undefined {
  return OPERATING_PARTS.find((p) => p.questionPrefixes.some((pre) => key.startsWith(pre)));
}

/** Build the picture from a business's evidence and the interview playbook it would use. */
export function operatingPicture(evidence: PictureEvidence[], playbook: Playbook): PartView[] {
  const live = evidence.filter((e) => e.state !== "stale" && e.state !== "unsupported" && e.state !== "conflicting");
  const answeredKeys = new Set<string>();
  const views = OPERATING_PARTS.map<PartView>((part) => ({ part, status: "unknown", seen: [], stated: [], openQuestions: [] }));
  const byKey = new Map(views.map((v) => [v.part.key, v]));

  for (const e of live) {
    const sv = e.structured_value ?? {};
    const qKey = typeof sv.question_key === "string" ? sv.question_key : null;
    if (qKey && e.state === "user_supplied") {
      answeredKeys.add(qKey);
      const part = partForQuestion(qKey);
      if (part) byKey.get(part.key)!.stated.push({ evidence: e, question: typeof sv.question === "string" ? sv.question : qKey, questionKey: qKey });
      continue;
    }
    const kind = typeof sv.kind === "string" ? sv.kind : null;
    if (kind && OBTAINED.has(e.state)) {
      for (const v of views) if (v.part.publicKinds.includes(kind)) v.seen.push(e);
    }
  }

  for (const q of allQuestions(playbook)) {
    if (answeredKeys.has(q.key)) continue;
    const part = partForQuestion(q.key);
    if (part) byKey.get(part.key)!.openQuestions.push({ key: q.key, text: q.text });
  }

  for (const v of views) {
    // one public fact per kind is enough to show what's visible; keep the newest
    const newest = new Map<string, PictureEvidence>();
    for (const e of [...v.seen].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
      const k = `${String(e.structured_value?.kind)}:${e.fact}`;
      if (!newest.has(k)) newest.set(k, e);
    }
    v.seen = [...newest.values()];
    v.status = v.seen.length && v.stated.length ? "both" : v.stated.length ? "owner_stated" : v.seen.length ? "seen_outside" : "unknown";
  }
  return views;
}

/** How much of the picture is known at all: parts with anything recorded, out of four. Not a score of the business. */
export function pictureCoverage(views: PartView[]): { known: number; total: number } {
  return { known: views.filter((v) => v.status !== "unknown").length, total: views.length };
}
