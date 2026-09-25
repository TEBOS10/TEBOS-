// Transactional email input (capability email.send_transactional).
//
// This is what an action executes, what its approver sees, and what the
// database freezes once approval is requested. It is checked here before a
// person is asked to approve it, and again by the execution worker right
// before it is sent.

export interface EmailInput {
  to: string[];
  subject: string;
  text: string;
  replyTo: string | null;
}

export const EMAIL_LIMITS = { recipients: 20, subject: 200, text: 20_000 } as const;

// Deliberately strict: a single mailbox, no display names, no comments, no
// quoted local parts. Anything fancier is refused rather than guessed at.
const ADDRESS = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

export function isEmailAddress(s: string): boolean {
  return s.length <= 254 && ADDRESS.test(s) && !s.includes("..");
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; problems: string[] };

export function parseEmailInput(raw: unknown): Parsed<EmailInput> {
  const problems: string[] = [];
  const r = (raw ?? {}) as Record<string, unknown>;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, problems: ["The email is missing"] };

  const toRaw = Array.isArray(r.to) ? r.to : typeof r.to === "string" ? r.to.split(/[,;\s]+/) : [];
  const to = [...new Set(toRaw.map((x) => String(x).trim().toLowerCase()).filter(Boolean))];
  if (to.length === 0) problems.push("Add at least one recipient");
  if (to.length > EMAIL_LIMITS.recipients) problems.push(`At most ${EMAIL_LIMITS.recipients} recipients`);
  const bad = to.filter((a) => !isEmailAddress(a));
  if (bad.length) problems.push(`Not an email address: ${bad.join(", ")}`);

  const subject = typeof r.subject === "string" ? r.subject.trim() : "";
  if (!subject) problems.push("Add a subject");
  if (subject.length > EMAIL_LIMITS.subject) problems.push(`The subject is longer than ${EMAIL_LIMITS.subject} characters`);
  if (/[\r\n]/.test(subject)) problems.push("The subject must be a single line");

  const text = typeof r.text === "string" ? r.text.replace(/\r\n/g, "\n").trim() : "";
  if (!text) problems.push("Add the message");
  if (text.length > EMAIL_LIMITS.text) problems.push(`The message is longer than ${EMAIL_LIMITS.text} characters`);

  const replyToRaw = typeof r.replyTo === "string" ? r.replyTo.trim().toLowerCase() : "";
  if (replyToRaw && !isEmailAddress(replyToRaw)) problems.push("The reply-to address is not an email address");

  if (problems.length) return { ok: false, problems };
  return { ok: true, value: { to, subject, text, replyTo: replyToRaw || null } };
}

/**
 * The sender configured on a connection: "orders@clay.example" or
 * "Clay Studio <orders@clay.example>". The name may not contain characters
 * that could smuggle extra headers or addresses.
 */
export function parseFromAddress(raw: unknown): Parsed<{ address: string; name: string | null; header: string }> {
  const s = typeof raw === "string" ? raw.trim() : "";
  const m = /^(?:([^<>"\r\n,;@]{1,80})\s*<([^<>\s]+)>|([^<>\s]+))$/.exec(s);
  const address = (m?.[2] ?? m?.[3] ?? "").toLowerCase();
  if (!m || !isEmailAddress(address)) return { ok: false, problems: ['Set the sender as "orders@yourdomain.com" or "Your Business <orders@yourdomain.com>"'] };
  const name = m[1]?.trim() || null;
  return { ok: true, value: { address, name, header: name ? `${name} <${address}>` : address } };
}
