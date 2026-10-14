// REEDS request types (docs/audit/2026-10-14-platform-audit.md, phase 2). A
// request type is a fixed plan: the tasks TEBOS runs to answer it, each with
// an acceptance test the verifier checks independently. The planner is
// deterministic: the same request, by the same kind of person, always gets
// the same plan. Free-text requests planned by a model come later, into these
// same task types.
//
// Mirrors the kind check on public.work_requests (test/schema-parity.test.ts).

export type RequestKind = "attention_today";

/** Who a task's figures are about: the requester's organisation, or the whole platform (platform admins only). */
export type TaskScope = "org" | "platform";

export interface TaskSpec {
  key: string;
  title: string;
  /** Which executor runs it; the verifier for the same key checks it. */
  executor: string;
  /** What must be true to call the result correct. Stored with the task. */
  acceptance: string;
  scope: TaskScope;
  /** The report line when nothing needs attention, and when something does. */
  none: string;
  some: (n: number) => string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const COUNT_TEST = "The verifier recounts independently, and every listed record must still match; both must agree with the result.";

export const ATTENTION_TASKS: readonly TaskSpec[] = [
  { key: "approvals.pending", title: "Approvals waiting for a decision", executor: "count.approvals_pending", scope: "org",
    acceptance: `Count this organisation's pending approvals. ${COUNT_TEST}`,
    none: "No approvals are waiting for a decision.", some: (n) => `${plural(n, "approval is", "approvals are")} waiting for a decision.` },
  { key: "agent_runs.failed", title: "Automated runs that failed in the last 24 hours", executor: "count.agent_runs_failed", scope: "org",
    acceptance: `Count this organisation's agent runs that failed in the 24 hours before the task ran. ${COUNT_TEST}`,
    none: "No automated runs failed in the last 24 hours.", some: (n) => `${plural(n, "automated run", "automated runs")} failed in the last 24 hours.` },
  { key: "delivery.overdue", title: "Client delivery steps past their date", executor: "count.delivery_overdue", scope: "org",
    acceptance: `Count this organisation's open delivery steps whose due date has passed. ${COUNT_TEST}`,
    none: "No delivery steps are overdue.", some: (n) => `${plural(n, "delivery step is", "delivery steps are")} overdue.` },
  { key: "maintainer.open", title: "Open items in the maintainer's queue", executor: "count.maintainer_open", scope: "org",
    acceptance: `Count this organisation's open maintainer items. ${COUNT_TEST}`,
    none: "The maintainer's queue is clear.", some: (n) => `${plural(n, "item is", "items are")} open in the maintainer's queue.` },
  { key: "pipeline.to_decide", title: "Leads waiting for a decision", executor: "count.leads_to_decide", scope: "platform",
    acceptance: `Count screened opportunities waiting for a decision. ${COUNT_TEST}`,
    none: "No leads are waiting for a decision.", some: (n) => `${plural(n, "lead is", "leads are")} waiting for a decision.` },
  { key: "enquiries.recent", title: "New enquiries in the last 7 days", executor: "count.enquiries_recent", scope: "platform",
    acceptance: `Count enquiries received in the 7 days before the task ran. ${COUNT_TEST}`,
    none: "No new enquiries in the last 7 days.", some: (n) => `${plural(n, "new enquiry", "new enquiries")} in the last 7 days.` },
  { key: "outbox.failed", title: "Client emails that failed to send", executor: "count.emails_failed", scope: "platform",
    acceptance: `Count client emails that used every attempt without being sent. ${COUNT_TEST}`,
    none: "No client emails have failed.", some: (n) => `${plural(n, "client email has", "client emails have")} failed to send.` },
  { key: "capital.ingestion", title: "Tidy Capital's latest market-data update", executor: "check.capital_ingestion", scope: "platform",
    acceptance: "Read the latest Tidy Capital ingestion run. The verifier re-reads it; it counts as needing attention unless its status is ok.",
    none: "Tidy Capital's latest market-data update succeeded.", some: () => "Tidy Capital's latest market-data update did not succeed." },
];

export const REQUEST_KINDS: Record<RequestKind, { title: string; description: string }> = {
  attention_today: {
    title: "What needs my attention today?",
    description: "Approvals waiting, failed runs, overdue delivery and open maintainer items; for platform admins also leads, enquiries, failed emails and Tidy Capital's data.",
  },
};

export const isRequestKind = (k: string): k is RequestKind => k in REQUEST_KINDS;

/** The plan for a request: the same request by the same kind of person always gets the same tasks. */
export function planRequest(kind: RequestKind, requester: { platformAdmin: boolean }): TaskSpec[] {
  switch (kind) {
    case "attention_today":
      return ATTENTION_TASKS.filter((t) => t.scope === "org" || requester.platformAdmin);
  }
}

export const taskSpec = (key: string): TaskSpec | undefined => ATTENTION_TASKS.find((t) => t.key === key);

/** What an executor found. Unavailable is an honest "couldn't check", never a zero. */
export type CheckResult =
  | { available: true; count: number; ids: string[]; detail?: string }
  | { available: false; reason: string };

export interface ReportLine {
  key: string;
  title: string;
  text: string;
  attention: boolean;
  checked: boolean;
}

/** One line per task, from verified results only. */
export function reportLine(spec: TaskSpec, result: CheckResult): ReportLine {
  if (!result.available) {
    return { key: spec.key, title: spec.title, text: `Couldn't check: ${result.reason}`, attention: true, checked: false };
  }
  const text = result.count === 0 ? spec.none : `${spec.some(result.count)}${result.detail ? ` ${result.detail}` : ""}`;
  return { key: spec.key, title: spec.title, text, attention: result.count > 0, checked: true };
}

export interface WorkReport {
  title: string;
  summary: string;
  lines: ReportLine[];
}

export function composeReport(kind: RequestKind, lines: ReportLine[]): WorkReport {
  const needs = lines.filter((l) => l.attention && l.checked).length;
  const unchecked = lines.filter((l) => !l.checked).length;
  const parts = [needs === 0 ? "Nothing needs your attention." : `${plural(needs, "thing needs", "things need")} your attention.`];
  if (unchecked > 0) parts.push(`${plural(unchecked, "check", "checks")} couldn't be completed.`);
  return { title: REQUEST_KINDS[kind].title, summary: parts.join(" "), lines };
}
