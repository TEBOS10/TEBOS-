// REEDS request types (docs/audit/2026-10-14-platform-audit.md, phase 2). A
// request type is a fixed plan: the tasks TEBOS runs to answer it, each with
// an acceptance test the verifier checks independently. The planner is
// deterministic: the same request, by the same kind of person, always gets
// the same plan. Free-text requests planned by a model come later, into these
// same task types.
//
// Mirrors the kind check on public.work_requests (test/schema-parity.test.ts).

export type RequestKind = "attention_today" | "business_status" | "external_task" | "signal_brief";

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
  /** A signal whose absence is the warning (no demand this week): it needs attention when the count is zero. */
  attentionWhenZero?: boolean;
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
  { key: "capital.ingestion", title: "The market-data feed's latest update", executor: "check.capital_ingestion", scope: "platform",
    acceptance: "Read the latest market-data ingestion run. The verifier re-reads it; it counts as needing attention unless its status is ok.",
    none: "The market-data feed's latest update succeeded.", some: () => "The market-data feed's latest update did not succeed." },
];

/** "How are my businesses doing?": the organisation's objectives against their targets, and where the founder is still the only record. */
export const STATUS_TASKS: readonly TaskSpec[] = [
  { key: "objectives.off_target", title: "Objectives whose latest measured reading misses the target", executor: "count.objectives_off_target", scope: "org",
    acceptance: `Count this organisation's active objectives whose latest measured reading misses its target (below an at-least target, above an at-most one). ${COUNT_TEST}`,
    none: "Every measured objective is on target.", some: (n) => `${plural(n, "objective is", "objectives are")} off target on the latest measured reading.` },
  { key: "objectives.unmeasured", title: "Objectives with no measured reading", executor: "count.objectives_unmeasured", scope: "org",
    acceptance: `Count this organisation's active objectives with no reading measured from a connected system. ${COUNT_TEST}`,
    none: "Every active objective has a measured reading.", some: (n) => `${plural(n, "objective has", "objectives have")} no measured reading yet; what the owner said doesn't count.` },
  { key: "objectives.overdue", title: "Objectives past their date", executor: "count.objectives_overdue", scope: "org",
    acceptance: `Count this organisation's active objectives whose due date has passed. ${COUNT_TEST}`,
    none: "No active objective is past its date.", some: (n) => `${plural(n, "objective is", "objectives are")} past the date and still open: mark each achieved from a measured reading, or missed.` },
  { key: "board.founder_only", title: "Steps only the founder does, written down nowhere", executor: "count.founder_only_steps", scope: "org",
    acceptance: `Count this organisation's current board steps done by the founder and not documented. ${COUNT_TEST}`,
    none: "No step depends on the founder's memory alone.", some: (n) => `${plural(n, "step depends", "steps depend")} on the founder alone, with no written rule.` },
];

/**
 * The weekly signal brief (ADR 0007): each signal from the company's own records, with the threshold that makes
 * it need attention. Cost, competitor and technology signals come from outside the database and are added later.
 */
export const SIGNAL_TASKS: readonly TaskSpec[] = [
  { key: "signals.demand", title: "Demand: new enquiries and leads in the last 7 days", executor: "count.demand_7d", scope: "platform",
    acceptance: `Count enquiries and opportunities created in the 7 days before the task ran; none at all is the warning. ${COUNT_TEST}`,
    none: "Demand is quiet: no new enquiry or lead in the last 7 days. Draft the next outreach.",
    some: (n) => `${plural(n, "new enquiry or lead", "new enquiries and leads")} in the last 7 days.`, attentionWhenZero: true },
  { key: "signals.cash", title: "Cash: client invoices past their due date", executor: "count.invoices_overdue", scope: "platform",
    acceptance: `Count open, unpaid invoices whose due date has passed. ${COUNT_TEST}`,
    none: "No client invoice is overdue.", some: (n) => `${plural(n, "client invoice is", "client invoices are")} overdue: chase payment.` },
  { key: "signals.delivery", title: "Delivery: property workstreams past their deadline", executor: "count.pra_overdue", scope: "org",
    acceptance: `Count this organisation's open property workstreams whose deadline has passed. ${COUNT_TEST}`,
    none: "No property workstream is past its deadline.", some: (n) => `${plural(n, "property workstream is", "property workstreams are")} past the deadline: fix these first.` },
  { key: "signals.reliability", title: "Reliability: automated runs that failed in the last 24 hours", executor: "count.agent_runs_failed", scope: "org",
    acceptance: `Count this organisation's agent runs that failed in the 24 hours before the task ran. ${COUNT_TEST}`,
    none: "No automated run failed in the last 24 hours.", some: (n) => `${plural(n, "automated run", "automated runs")} failed in the last 24 hours.` },
  { key: "signals.email", title: "Reliability: client emails that failed to send", executor: "count.emails_failed", scope: "platform",
    acceptance: `Count client emails that used every attempt without being sent. ${COUNT_TEST}`,
    none: "No client email has failed.", some: (n) => `${plural(n, "client email has", "client emails have")} failed to send.` },
  { key: "signals.security", title: "Security: the audit trail", executor: "check.audit_chain", scope: "org",
    acceptance: "Verify this organisation's audit chain with tebos_private.audit_verify. The verifier runs it again; it needs attention unless the chain is intact.",
    none: "The audit trail is intact: no event changed, removed or reordered.", some: () => "The audit trail is not intact: investigate before anything else." },
];

export const REQUEST_KINDS: Record<RequestKind, { title: string; description: string }> = {
  attention_today: {
    title: "What needs my attention today?",
    description: "Approvals waiting, failed runs, overdue delivery and open maintainer items; for platform admins also leads, enquiries, failed emails and the market-data feed.",
  },
  business_status: {
    title: "How are my businesses doing?",
    description: "Objectives against their targets, objectives with no measured reading or past their date, and steps that still depend on the founder alone.",
  },
  signal_brief: {
    title: "The weekly signal brief",
    description: "Demand, cash, delivery, reliability and security, each read from TEBOS's own records against its threshold. Can repeat every week by itself.",
  },
  external_task: {
    title: "Work for an AI client",
    description: "One piece of work with your acceptance test, done by an AI client through the Model Bridge and reviewed by a person before it counts.",
  },
};

/** The AI clients an external task can be given to (mirrors work_requests.task_executor). */
export const EXTERNAL_EXECUTORS = ["external.coding_agent", "external.chat_assistant"] as const;
export type ExternalExecutor = (typeof EXTERNAL_EXECUTORS)[number];
export const isExternalExecutor = (e: string): e is ExternalExecutor => e.startsWith("external.");

/** What the person asked for, for an external task. */
export interface ExternalAsk {
  title: string;
  acceptance: string;
  executor: ExternalExecutor;
}

/** What an AI client hands in. A person reviews it; it is never verified by the client. */
export interface ExternalResult {
  summary: string;
  evidence?: string[];
  needs_decision?: boolean;
}

export const isRequestKind = (k: string): k is RequestKind => k in REQUEST_KINDS;

/** The plan for a request: the same request by the same kind of person always gets the same tasks. */
export function planRequest(kind: RequestKind, requester: { platformAdmin: boolean }, ask?: ExternalAsk): TaskSpec[] {
  switch (kind) {
    case "external_task":
      if (!ask) throw new Error("an external task needs its title, acceptance test and AI client");
      return [{ key: "external.work", title: ask.title, executor: ask.executor, acceptance: ask.acceptance, scope: "org",
        none: "", some: () => "" }];
    case "attention_today":
      return ATTENTION_TASKS.filter((t) => t.scope === "org" || requester.platformAdmin);
    case "business_status":
      return [...STATUS_TASKS];
    case "signal_brief":
      return SIGNAL_TASKS.filter((t) => t.scope === "org" || requester.platformAdmin);
  }
}

export const taskSpec = (key: string): TaskSpec | undefined => [...ATTENTION_TASKS, ...STATUS_TASKS, ...SIGNAL_TASKS].find((t) => t.key === key);

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
  const attention = spec.attentionWhenZero ? result.count === 0 : result.count > 0;
  return { key: spec.key, title: spec.title, text, attention, checked: true };
}

export interface WorkReport {
  title: string;
  summary: string;
  lines: ReportLine[];
}

/** The report line for reviewed AI work: what the client handed in, and the reviewer's note. */
export function externalLine(title: string, result: ExternalResult, reviewNote: string | null): ReportLine {
  const text = reviewNote ? `${result.summary} Reviewed: ${reviewNote}` : result.summary;
  return { key: "external.work", title, text, attention: Boolean(result.needs_decision), checked: true };
}

export function composeReport(kind: RequestKind, lines: ReportLine[]): WorkReport {
  const needs = lines.filter((l) => l.attention && l.checked).length;
  const unchecked = lines.filter((l) => !l.checked).length;
  const parts = [needs === 0 ? "Nothing needs your attention." : `${plural(needs, "thing needs", "things need")} your attention.`];
  if (unchecked > 0) parts.push(`${plural(unchecked, "check", "checks")} couldn't be completed.`);
  return { title: REQUEST_KINDS[kind].title, summary: parts.join(" "), lines };
}
