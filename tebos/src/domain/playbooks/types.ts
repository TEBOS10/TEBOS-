// Industry diagnostic playbooks (dossier §7/§14). A playbook is reviewed,
// versioned code: the questions an interview asks, what each one helps
// diagnose, and what evidence would confirm the answer. Interviews record
// the playbook key and version they used, so answers stay interpretable
// when a playbook changes.

export interface PlaybookQuestion {
  /** Stable key, e.g. "clients.concentration". Never reuse a key for a different question. */
  key: string;
  /** Asked as written in a form, and as the gist for the voice interviewer. */
  text: string;
  /** Natural follow-ups the interviewer may use when an answer is vague. */
  followUps: string[];
  /** The operational problem this question helps detect. */
  diagnoses: string;
  /** Evidence that would confirm the answer (documents to upload or systems to connect). */
  confirmWith: string[];
}

export interface PlaybookSection {
  key: string;
  title: string;
  questions: PlaybookQuestion[];
}

export interface Playbook {
  key: string;
  version: number;
  industry: string;
  name: string;
  /** Who the interview is for, shown before booking. */
  audience: string;
  sections: PlaybookSection[];
}

export const allQuestions = (p: Playbook): PlaybookQuestion[] => p.sections.flatMap((s) => s.questions);
