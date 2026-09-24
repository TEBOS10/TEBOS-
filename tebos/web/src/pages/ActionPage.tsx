import { checkActionTransition, type ActionState, type ApprovalState, type TransitionContext } from "@core/actions";
import { approvalPolicy, type RiskTier } from "@core/risk";
import type { ActionStatus, ApprovalStatus, ActionRunStatus } from "@core/states";
import { useState, type FormEvent, type ReactNode } from "react";
import { Card, Empty, ErrorNote, Field, Loading, PageHeader, StatusBadge } from "../components/ui";
import { auditTrail, decideApproval, getAction, recordManualRun, recordOutcome, requestApproval, setActionStatus, verifyAction, type Action, type OutcomeDraft } from "../lib/data";
import { ago, RISK_LABEL, statusLabel, when } from "../lib/format";
import { usePeople } from "../lib/people";
import { Link } from "../lib/router";
import { useOrg } from "../lib/session";
import { useQuery } from "../lib/useQuery";

const PATH: ActionStatus[] = ["proposed", "ready", "awaiting_approval", "approved", "queued", "running", "completed", "verified"];

export function ActionPage({ id }: { id: string }) {
  const org = useOrg();
  const { nameOf, actorLabel } = usePeople();
  const q = useQuery(() => getAction(org.db, id), [id]);
  const audit = useQuery(() => auditTrail(org.db, org.organisation.id, id), [id, q.data?.action.updated_at]);
  if (q.loading && !q.data) return <Loading />;
  if (q.error) return <ErrorNote error={q.error} title="Couldn't load this action" />;
  if (!q.data) return <PageHeader title="Action not found">It doesn't exist, or it belongs to another organisation.</PageHeader>;
  const { action, finding, business, approvals, runs, outcomes, dependencies } = q.data;
  const policy = approvalPolicy(action.risk_tier as RiskTier);
  const path = action.approval_required ? PATH : PATH.filter((s) => s !== "awaiting_approval" && s !== "approved");
  const currentIndex = path.indexOf(action.status as ActionStatus);

  return (
    <div className="stack">
      <PageHeader
        eyebrow={
          <>
            <Link to={`/businesses/${business.id}`}>{business.name}</Link> · Action
          </>
        }
        title={action.title}
      >
        <StatusBadge status={action.status} />
        <span>{RISK_LABEL[action.risk_tier]}</span>
        <span>· priority {action.priority}</span>
        {action.capability_key && <span className="mono">· {action.capability_key}</span>}
      </PageHeader>

      <Card>
        <div className="lifecycle" aria-label="Lifecycle">
          {path.map((s, i) => (
            <span key={s} className="row" style={{ gap: 6 }}>
              <span className={`step ${s === action.status ? "current" : currentIndex > i ? "done" : ""}`}>{statusLabel(s)}</span>
              {i < path.length - 1 && <span className="sep">→</span>}
            </span>
          ))}
          {!path.includes(action.status as ActionStatus) && <StatusBadge status={action.status} />}
        </div>
        {action.blocked_reason && action.status === "blocked" && (
          <div className="note note-warn" style={{ marginTop: 10 }}>
            <strong>Blocked:</strong> {action.blocked_reason}
          </div>
        )}
      </Card>

      <div className="grid grid-main">
        <div className="stack">
          <Card title="What and why">
            <p>{action.objective}</p>
            <dl className="confidence-parts" style={{ marginTop: 12 }}>
              <Detail k="Because of">
                <Link to={`/findings/${finding.id}`}>{finding.title}</Link>
              </Detail>
              <Detail k="Expected outcome">{action.expected_outcome ?? <span className="faint">Not stated</span>}</Detail>
              <Detail k="Verified when">{action.evidence_requirement ?? <span className="faint">Not stated</span>}</Detail>
              <Detail k="Approval">{policy.required ? `Required${policy.separateApprover ? " — second person" : ""}, one execution per approval` : "Not required"}</Detail>
              {action.result && <Detail k="Result">{action.result}</Detail>}
            </dl>
          </Card>
          <NextSteps data={q.data} onChange={q.reload} />
          <Card title="History" subtitle="Every change, who made it, and when">
            {audit.loading && !audit.data && <Loading />}
            <ErrorNote error={audit.error} title="Couldn't load the history" />
            {audit.data && audit.data.length === 0 && <Empty>No history yet.</Empty>}
            {audit.data && (
              <ul className="list">
                {audit.data.map((e) => (
                  <li key={e.id}>
                    <div className="list-main">
                      <span className="list-title">{describeEvent(e.action, e.after)}</span>
                      <span className="list-meta">
                        {actorLabel(e.actor_type, e.actor_id)} ·{" "}
                        {when(e.occurred_at)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <div className="stack">
          <Card title="Approvals">
            {approvals.length === 0 ? (
              <Empty>{action.approval_required ? "Not requested yet." : "This action doesn't need approval."}</Empty>
            ) : (
              <ul className="list">
                {approvals.map((a) => (
                  <li key={a.id}>
                    <div className="list-main">
                      <span className="list-title">{a.requested_operation}</span>
                      <span className="list-meta">
                        requested by {nameOf(a.requested_by)} {ago(a.requested_at)}
                        {a.decided_at ? ` · decided by ${nameOf(a.decided_by)} ${ago(a.decided_at)}` : ""}
                        {a.decision_note ? ` · "${a.decision_note}"` : ""}
                      </span>
                    </div>
                    <StatusBadge status={a.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Runs" subtitle="Each execution attempt">
            {runs.length === 0 ? (
              <Empty>Not executed yet.</Empty>
            ) : (
              <ul className="list">
                {runs.map((r) => (
                  <li key={r.id}>
                    <div className="list-main">
                      <span className="list-title">{statusLabel(r.execution_method)} run</span>
                      <span className="list-meta">
                        {when(r.created_at)}
                        {r.verified ? ` · verified: ${r.verification_method}` : ""}
                        {r.error_detail ? ` · ${r.error_detail}` : ""}
                      </span>
                    </div>
                    <StatusBadge status={r.verified ? "verified" : r.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {dependencies.length > 0 && (
            <Card title="Depends on">
              <ul className="list">
                {dependencies.map((d) => (
                  <li key={d.id}>
                    <Link to={`/actions/${d.id}`}>{d.title}</Link>
                    <StatusBadge status={d.status} />
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <OutcomesCard action={action} outcomes={outcomes} onChange={q.reload} />
        </div>
      </div>
    </div>
  );
}

function Detail({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div>
      <dt>{k}</dt>
      <dd style={{ display: "block" }}>{children}</dd>
    </div>
  );
}

export function describeEvent(action: string, after: unknown): string {
  const a = (after ?? {}) as { status?: string; title?: string; requested_operation?: string };
  const [table, verb] = action.split(".");
  const thing = { actions: "Action", approvals: "Approval", action_runs: "Run", outcomes: "Outcome" }[table ?? ""] ?? table;
  if (verb === "transition") return `${thing} → ${statusLabel(a.status ?? "")}`;
  if (verb === "insert") return `${thing} created${a.status ? ` (${statusLabel(a.status)})` : ""}`;
  if (verb === "update") return `${thing} updated`;
  return `${thing} ${verb}`;
}

type Loaded = NonNullable<Awaited<ReturnType<typeof getAction>>>;

/** The legal next steps for this action, each pre-checked with the same rules the database enforces. */
function NextSteps({ data, onChange }: { data: Loaded; onChange: () => void }) {
  const org = useOrg();
  const { action, approvals, runs, outcomes, dependencies } = data;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState("");

  const state: ActionState = {
    id: action.id,
    status: action.status as ActionStatus,
    riskTier: action.risk_tier as RiskTier,
    approvalRequired: action.approval_required,
    ownerUserId: action.owner_user_id,
    capabilityKey: action.capability_key,
    blockedReason: reason || action.blocked_reason,
  };
  const ctx: TransitionContext = {
    approvals: approvals.map<ApprovalState>((a) => ({
      id: a.id,
      status: a.status as ApprovalStatus,
      riskTier: a.risk_tier as RiskTier,
      requestedBy: a.requested_by,
      decidedBy: a.decided_by,
      decidedAt: a.decided_at,
      expiresAt: a.expires_at,
    })),
    runs: runs.map((r) => ({ status: r.status as ActionRunStatus, verified: r.verified })),
    dependencyStatuses: dependencies.map((d) => d.status as ActionStatus),
    hasVerifiedOutcome: outcomes.some((o) => o.verified_at),
  };
  const check = (to: ActionStatus) => checkActionTransition(state, to, ctx);
  const canAct = org.can("action.transition");
  const canDecide = org.can("approval.decide");
  const pending = approvals.find((a) => a.status === "pending");
  const succeededRun = runs.find((r) => r.status === "succeeded" && !r.verified);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setNote("");
      setReason("");
      setMethod("");
      onChange();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  const move = (to: ActionStatus, extra: Parameters<typeof setActionStatus>[3] = {}) => run(() => setActionStatus(org.db, action.id, to as Action["status"], extra));

  const steps: ReactNode[] = [];
  const step = (key: string, label: string, to: ActionStatus | null, onClick: () => void, extra?: ReactNode, tone = "btn-primary") => {
    const c = to ? check(to) : ({ ok: true } as const);
    steps.push(
      <div className="next-step" key={key}>
        <div className="list-main" style={{ flex: 1 }}>
          <span className="list-title">{label}</span>
          {!c.ok && <span className="why-not">{c.reason}</span>}
          {extra}
        </div>
        <button className={`btn btn-sm ${tone}`} disabled={busy || !c.ok} onClick={onClick}>
          {label}
        </button>
      </div>,
    );
  };

  if (canAct) {
    switch (action.status) {
      case "proposed":
        step("ready", "Mark ready", "ready", () => move("ready"));
        break;
      case "ready":
        if (action.approval_required) step("request", "Request approval", null, () => run(() => requestApproval(org.db, action, note)), <NoteInput value={note} onChange={setNote} placeholder="Anything the approver should know (optional)" />);
        else step("queue", "Queue for execution", "queued", () => move("queued"));
        break;
      case "approved":
        step("queue", "Queue for execution", "queued", () => move("queued"));
        break;
      case "queued":
        step("start", "Start execution", "running", () => move("running"), <span className="list-meta">{action.approval_required ? "Starting uses up the approval." : "Marks the work as in progress."}</span>);
        break;
      case "running":
        step("done", "Record as done", null, () => run(() => recordManualRun(org.db, action, { succeeded: true, summary: note || "Completed" })), <NoteInput value={note} onChange={setNote} placeholder="What was done" />);
        step("fail", "Record as failed", null, () => run(() => recordManualRun(org.db, action, { succeeded: false, summary: note || "Failed" })), undefined, "btn-danger");
        break;
      case "completed":
        // Verification is the proof itself, so it can't be pre-checked against a verified run; it needs a method and a succeeded run.
        steps.push(
          <div className="next-step" key="verify">
            <div className="list-main" style={{ flex: 1 }}>
              <span className="list-title">Verify the result</span>
              {!succeededRun && <span className="why-not">There is no succeeded run to verify.</span>}
              <NoteInput value={method} onChange={setMethod} placeholder={action.evidence_requirement ? `How was it checked? (${action.evidence_requirement})` : "How was the result checked?"} />
            </div>
            <button className="btn btn-sm btn-primary" disabled={busy || !succeededRun || !method.trim()} onClick={() => succeededRun && run(() => verifyAction(org.db, action, succeededRun.id, method.trim()))}>
              Verify
            </button>
          </div>,
        );
        if (ctx.hasVerifiedOutcome) step("verify-outcome", "Mark verified by outcome", "verified", () => move("verified"), <span className="list-meta">A verified outcome has been recorded for this action.</span>);
        break;
      case "blocked":
      case "failed":
        step("retry", action.status === "blocked" ? "Unblock" : "Try again", "ready", () => move("ready", { blocked_reason: null }));
        break;
    }
    if (["proposed", "ready", "queued", "running"].includes(action.status)) {
      steps.push(
        <div className="next-step" key="block">
          <div className="list-main" style={{ flex: 1 }}>
            <span className="list-title">Block</span>
            <NoteInput value={reason} onChange={setReason} placeholder="What is it waiting on?" />
          </div>
          <button className="btn btn-sm" disabled={busy || !reason.trim() || !check("blocked").ok} onClick={() => move("blocked", { blocked_reason: reason.trim() })}>
            Block
          </button>
        </div>,
      );
    }
    if (["proposed", "ready", "awaiting_approval", "approved", "queued", "blocked", "failed"].includes(action.status)) {
      step("cancel", "Cancel action", "cancelled", () => move("cancelled"), undefined, "btn-danger");
    }
  }

  if (pending && canDecide) {
    steps.unshift(
      <div className="next-step" key="decide">
        <div className="list-main" style={{ flex: 1 }}>
          <span className="list-title">Decide: {pending.requested_operation}</span>
          <span className="list-meta">
            {RISK_LABEL[pending.risk_tier]}
            {pending.requested_by === org.userId && pending.risk_tier >= 3 ? " · you requested this, so someone else must decide" : ""}
          </span>
          <NoteInput value={note} onChange={setNote} placeholder="Decision note (optional)" />
        </div>
        <div className="row">
          <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => run(() => decideApproval(org.db, pending.id, "approved", note))}>
            Approve
          </button>
          <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => run(() => decideApproval(org.db, pending.id, "rejected", note))}>
            Reject
          </button>
        </div>
      </div>,
    );
  }

  return (
    <Card title="Next steps" subtitle={canAct || canDecide ? "Only steps that are allowed right now can be taken" : "Your role can view this action but not change it"}>
      {steps.length ? <div className="next-steps">{steps}</div> : <Empty>{action.status === "verified" ? "Done and verified." : "No steps available to you right now."}</Empty>}
      <div style={{ marginTop: 10 }}>
        <ErrorNote error={error} title="That step wasn't taken" />
      </div>
    </Card>
  );
}

function NoteInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <Field label="">
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
    </Field>
  );
}

type Outcomes = Loaded["outcomes"];

const EMPTY_OUTCOME = { metric: "", unit: "", baseline: "", expected: "", observed: "", observedAt: "", note: "", verificationMethod: "" };
const num = (v: string) => (v.trim() === "" ? null : Number(v));

/**
 * What changed because of this action. An outcome is only marked verified
 * when an observed value was recorded AND the person says how it was checked;
 * an expectation alone is never shown as a result.
 */
function OutcomesCard({ action, outcomes, onChange }: { action: Action; outcomes: Outcomes; onChange: () => void }) {
  const org = useOrg();
  const [draft, setDraft] = useState(EMPTY_OUTCOME);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const canRecord = org.can("action.transition") && ["running", "completed", "verified"].includes(action.status);
  const set = (k: keyof typeof EMPTY_OUTCOME) => (e: { target: { value: string } }) => setDraft((d) => ({ ...d, [k]: e.target.value }));
  const numbersOk = [draft.baseline, draft.expected, draft.observed].every((v) => v.trim() === "" || Number.isFinite(Number(v)));
  const willVerify = draft.observed.trim() !== "" && draft.verificationMethod.trim() !== "";

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const d: OutcomeDraft = {
        metric: draft.metric,
        unit: draft.unit,
        baseline: num(draft.baseline),
        expected: num(draft.expected),
        observed: num(draft.observed),
        observedAt: draft.observedAt ? new Date(draft.observedAt).toISOString() : null,
        note: draft.note,
        verificationMethod: draft.verificationMethod,
      };
      await recordOutcome(org.db, action, d);
      setDraft(EMPTY_OUTCOME);
      setOpen(false);
      onChange();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Outcomes" subtitle="What changed, measured against the baseline">
      {outcomes.length === 0 ? (
        <Empty>{canRecord ? "No outcome recorded yet." : "No outcome recorded."}</Empty>
      ) : (
        <ul className="list">
          {outcomes.map((o) => (
            <li key={o.id}>
              <div className="list-main">
                <span className="list-title">{o.metric}</span>
                <span className="list-meta">
                  baseline {o.baseline_value ?? "not recorded"} · expected {o.expected_value ?? "not stated"} · observed {o.observed_value ?? "not yet"} {o.unit ?? ""}
                </span>
                <span className="list-meta">{o.verified_at ? `Verified ${ago(o.verified_at)}: ${o.verification_method}` : "Not verified"}</span>
                {o.note && <span className="list-meta">{o.note}</span>}
              </div>
              <StatusBadge status={o.verified_at ? "verified" : "unverified"} />
            </li>
          ))}
        </ul>
      )}
      {canRecord && !open && (
        <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={() => setOpen(true)}>
          Record an outcome
        </button>
      )}
      {canRecord && open && (
        <form className="form" onSubmit={save} style={{ marginTop: 12 }} aria-label="Record an outcome">
          <Field label="Metric">
            <input className="input" value={draft.metric} onChange={set("metric")} required placeholder="e.g. Orders captured per week" />
          </Field>
          <div className="form-row">
            <Field label="Unit">
              <input className="input" value={draft.unit} onChange={set("unit")} placeholder="orders" />
            </Field>
            <Field label="Baseline">
              <input className="input" inputMode="decimal" value={draft.baseline} onChange={set("baseline")} />
            </Field>
          </div>
          <div className="form-row">
            <Field label="Expected">
              <input className="input" inputMode="decimal" value={draft.expected} onChange={set("expected")} />
            </Field>
            <Field label="Observed">
              <input className="input" inputMode="decimal" value={draft.observed} onChange={set("observed")} />
            </Field>
          </div>
          <Field label="Observed on">
            <input className="input" type="date" value={draft.observedAt} onChange={set("observedAt")} />
          </Field>
          <Field label="How was the observed value checked?" hint="Leave empty if it wasn't checked. Only a checked, observed value counts as verified.">
            <input className="input" value={draft.verificationMethod} onChange={set("verificationMethod")} placeholder="e.g. Counted orders in the order form export" />
          </Field>
          <Field label="Note">
            <input className="input" value={draft.note} onChange={set("note")} />
          </Field>
          {!numbersOk && <div className="note note-warn">Baseline, expected and observed must be numbers.</div>}
          <ErrorNote error={error} title="Outcome not recorded" />
          <div className="row">
            <button className="btn btn-primary btn-sm" disabled={busy || !draft.metric.trim() || !numbersOk}>
              {willVerify ? "Record verified outcome" : "Record outcome"}
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </Card>
  );
}
