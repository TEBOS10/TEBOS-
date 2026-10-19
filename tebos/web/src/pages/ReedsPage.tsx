// REEDS: ask TEBOS for something and get back a verified answer. The page can
// only ask and cancel; TEBOS's worker plans, runs and checks each task, and
// the database lets a request show as done only when every task passed its
// independent check. Built to be used from a phone.
import { REQUEST_KINDS, type RequestKind } from "@core/work";
import { AlertTriangle, CheckCircle2, CircleDashed, Send } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Card, Empty, ErrorNote, Field, Loading, PageHeader, StatusBadge } from "../components/ui";
import { askExternalTask, askWorkRequest, cancelWorkRequest, getWorkRequest, inboxFor, listWorkRequests, reviewWorkTask, type WorkRequest, type WorkTask } from "../lib/data";
import { CLIENT_KINDS } from "./AiClientsPage";
import { alertsFrom } from "../lib/inbox";
import { usePeople } from "../lib/people";
import { ago, RISK_LABEL, when } from "../lib/format";
import { Link, navigate } from "../lib/router";
import { useOrg } from "../lib/session";
import { useQuery } from "../lib/useQuery";

const OPEN = ["received", "planned", "running", "verifying"];
const KINDS = Object.entries(REQUEST_KINDS) as Array<[RequestKind, (typeof REQUEST_KINDS)[RequestKind]]>;

interface ReportLine { key: string; title: string; text: string; attention: boolean; checked: boolean }
interface Report { title: string; summary: string; lines: ReportLine[] }
const reportOf = (r: WorkRequest) => (r.report as unknown as Report | null) ?? null;
const kindTitle = (k: string) => (REQUEST_KINDS as Record<string, { title: string }>)[k]?.title ?? k;
const requestTitle = (r: WorkRequest) => (r.kind === "external_task" && r.task_title ? r.task_title : kindTitle(r.kind));
const canAsk = (role: string) => role === "org_admin" || role === "operator";

export function ReedsPage() {
  const org = useOrg();
  const q = useQuery(() => listWorkRequests(org.db, org.organisation.id), [org.organisation.id], {
    pollMs: 3000, keepPolling: (rows) => rows.some((r) => OPEN.includes(r.status)),
  });
  return (
    <div className="stack">
      <PageHeader eyebrow="REEDS" title="Ask TEBOS">
        Ask for something, and TEBOS plans it, does it, checks every result independently, and reports back. A request shows as done only
        when every part has passed its check.
        {!org.organisation.private && <>{" "}<Link to="/ai-clients">AI clients</Link> can take work too; a person reviews what they hand in.</>}
      </PageHeader>
      {canAsk(org.role) ? <AskCard onAsked={(id) => navigate(`/reeds/${id}`)} /> : (
        <p className="note note-info" role="status">Admins and operators of {org.organisation.name} can ask TEBOS for work. You can read what was asked and answered.</p>
      )}
      <Inbox />
      <Card title="Requests" subtitle={`Asked in ${org.organisation.name}`}>
        {q.loading && !q.data && <Loading />}
        <ErrorNote error={q.error} title="Couldn't load requests" />
        {q.data && q.data.length === 0 && <Empty>No requests yet.</Empty>}
        {q.data && q.data.length > 0 && (
          <ul className="list" data-testid="reeds-requests">
            {q.data.map((r) => (
              <li key={r.id}>
                <div className="list-main">
                  <Link to={`/reeds/${r.id}`} className="list-title">{requestTitle(r)}</Link>
                  <span className="list-meta">
                    {ago(r.created_at)}
                    {r.status === "completed" && reportOf(r) ? ` · ${reportOf(r)!.summary}` : ""}
                    {r.status === "failed" && r.failure_detail ? ` · ${r.failure_detail}` : ""}
                  </span>
                </div>
                <StatusBadge status={r.status} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function AskCard({ onAsked }: { onAsked: (id: string) => void }) {
  const org = useOrg();
  const [kind, setKind] = useState<RequestKind>(KINDS[0]![0]);
  const [note, setNote] = useState("");
  const [title, setTitle] = useState("");
  const [acceptance, setAcceptance] = useState("");
  const [executor, setExecutor] = useState("external.coding_agent");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function ask(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = kind === "external_task"
        ? await askExternalTask(org.db, org.organisation.id, { title: title.trim(), acceptance: acceptance.trim(), executor })
        : await askWorkRequest(org.db, org.organisation.id, kind, note.trim() || null);
      onAsked(r.id);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="What do you need?" subtitle="TEBOS answers from your own records. It never invents a figure: what it can't check, it says.">
      <form className="stack" onSubmit={ask}>
        <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="sr-only">Request</legend>
          {KINDS.map(([k, v]) => (
            <label key={k} className="choice">
              <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} />
              <span><strong>{v.title}</strong><br /><span className="muted">{v.description}</span></span>
            </label>
          ))}
        </fieldset>
        {kind === "external_task" ? (
          <>
            <Field label="What should be done">
              <input className="input" required minLength={3} maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Write the guide to issuing AI tokens" />
            </Field>
            <Field label="Acceptance test" hint="What must be true for you to accept the result. You review it against this.">
              <textarea className="input" required minLength={10} maxLength={1000} rows={3} value={acceptance} onChange={(e) => setAcceptance(e.target.value)} />
            </Field>
            <Field label="Which AI client">
              <select className="input" value={executor} onChange={(e) => setExecutor(e.target.value)}>
                {Object.entries(CLIENT_KINDS).map(([k, v]) => <option key={k} value={`external.${k}`}>{v.split(" (")[0]}</option>)}
              </select>
            </Field>
          </>
        ) : (
          <Field label="Note (optional)" hint="For your own record: TEBOS doesn't act on it yet.">
            <input className="input" value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} placeholder="e.g. before the Monday meeting" />
          </Field>
        )}
        <ErrorNote error={error} title="The request wasn't sent" />
        <div><button type="submit" className="btn btn-primary" disabled={busy}><Send size={15} aria-hidden /> {busy ? "Sending…" : "Ask TEBOS"}</button></div>
      </form>
    </Card>
  );
}

const STAGES: Array<{ label: string; reached: (s: string) => boolean }> = [
  { label: "Asked", reached: () => true },
  { label: "Planned", reached: (s) => s !== "received" },
  { label: "Done and checked", reached: (s) => s === "verifying" || s === "completed" },
  { label: "Reported", reached: (s) => s === "completed" },
];

export function ReedsRequestPage({ id }: { id: string }) {
  const org = useOrg();
  const q = useQuery(() => getWorkRequest(org.db, id), [id], { pollMs: 2500, keepPolling: (d) => !!d && OPEN.includes(d.request.status) });
  const [error, setError] = useState<unknown>(null);
  if (q.loading && !q.data) return <Loading />;
  if (q.error) return <ErrorNote error={q.error} title="Couldn't load this request" />;
  if (!q.data) return <Empty>This request doesn't exist, or isn't in your organisation.</Empty>;
  const { request: r, tasks } = q.data;
  const report = reportOf(r);
  const open = OPEN.includes(r.status);

  async function cancel() {
    setError(null);
    try {
      await cancelWorkRequest(org.db, r.id);
      q.reload();
    } catch (err) {
      setError(err);
    }
  }

  return (
    <div className="stack">
      <PageHeader eyebrow={<Link to="/reeds">REEDS</Link>} title={requestTitle(r)}
        actions={open && canAsk(org.role) ? <button type="button" className="btn" onClick={cancel}>Cancel request</button> : undefined}>
        Asked {when(r.created_at)}{r.note ? ` · “${r.note}”` : ""}
      </PageHeader>
      <ErrorNote error={error} title="The request wasn't cancelled" />
      {r.status === "failed" || r.status === "cancelled" ? null : (
        <ol className="reeds-stages" aria-label="Progress" data-testid="reeds-stages">
          {STAGES.map((s) => (
            <li key={s.label} data-reached={s.reached(r.status)}>{s.reached(r.status) ? <CheckCircle2 size={15} aria-hidden /> : <CircleDashed size={15} aria-hidden />} {s.label}</li>
          ))}
        </ol>
      )}
      {r.status === "completed" && report && (
        <Card title="Report" subtitle={report.summary}>
          <ul className="list" data-testid="reeds-report">
            {report.lines.map((l) => (
              <li key={l.key} data-attention={l.attention}>
                <div className="list-main">
                  <span className="list-title">{l.attention && <AlertTriangle size={14} aria-hidden />} {l.text}</span>
                  <span className="list-meta">{l.title}{l.checked ? " · checked" : " · not checked"}</span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {r.status === "failed" && (
        <div className="note note-warn" role="status" data-testid="reeds-failed">
          <strong>TEBOS couldn't complete this request.</strong> {r.failure_detail} Nothing was reported, because not every part could be checked.
        </div>
      )}
      {r.status === "cancelled" && <p className="note note-info" role="status">This request was cancelled.</p>}
      {open && <p className="note note-info" role="status" data-testid="reeds-working">TEBOS is working on it. This page updates by itself.</p>}
      <Card title="How it was done" subtitle="Each task, the test it had to pass, and what the independent check found.">
        {tasks.length === 0 ? <Empty>Not planned yet.</Empty> : (
          <ul className="list" data-testid="reeds-tasks">
            {tasks.map((t) => <TaskItem key={t.id} t={t} onReviewed={q.reload} />)}
          </ul>
        )}
      </Card>
    </div>
  );
}

function TaskItem({ t, onReviewed }: { t: WorkTask; onReviewed: () => void }) {
  const v = t.verification as { ok?: boolean; detail?: string } | null;
  const external = t.executor.startsWith("external.");
  const result = external ? (t.result as { summary?: string; evidence?: string[]; needs_decision?: boolean; submitted_by?: string } | null) : null;
  return (
    <li>
      <div className="list-main">
        <span className="list-title">{t.title}</span>
        <span className="list-meta">Test: {t.acceptance}</span>
        {external && t.status === "queued" && <span className="list-meta">Waiting for an AI client to take it.</span>}
        {external && t.status === "running" && <span className="list-meta">An AI client is working on it{t.lease_until ? ` (until ${when(t.lease_until)})` : ""}.</span>}
        {result?.summary && (
          <span className="list-meta" data-testid="external-result">
            Handed in{result.submitted_by ? ` by ${result.submitted_by}` : ""}: {result.summary}
            {result.evidence?.length ? ` · Evidence: ${result.evidence.join(", ")}` : ""}
            {result.needs_decision ? " · It asks you to decide something." : ""}
          </span>
        )}
        {v?.detail && <span className="list-meta">{external ? "Review" : "Check"}: {v.detail}</span>}
        {t.error && <span className="list-meta">Error: {t.error}</span>}
        {t.attempts > 1 && <span className="list-meta">{t.attempts} attempts</span>}
        {external && t.status === "done" && <Review t={t} onReviewed={onReviewed} />}
      </div>
      <StatusBadge status={t.status} />
    </li>
  );
}

/** A person accepts or rejects what an AI client handed in. Nothing counts until they do. */
function Review({ t, onReviewed }: { t: WorkTask; onReviewed: () => void }) {
  const org = useOrg();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  if (org.role !== "org_admin" && org.role !== "approver") return <span className="list-meta">Waiting for an approver or admin to review it.</span>;
  if (!org.twoStep) return <span className="list-meta">Reviewing needs a session that passed two-step sign-in. <Link to="/account">Turn it on</Link>.</span>;

  async function decide(ok: boolean) {
    setBusy(true);
    setError(null);
    try {
      await reviewWorkTask(org.db, t.id, ok, note.trim() || null);
      onReviewed();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack" data-testid="external-review" style={{ marginTop: 8 }}>
      <Field label="Review note" hint="Required to reject: say what doesn't meet the test.">
        <input className="input" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <ErrorNote error={error} title="The review wasn't saved" />
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => decide(true)}>Accept: it meets the test</button>
        <button type="button" className="btn btn-sm" disabled={busy || note.trim().length < 3} onClick={() => decide(false)}>Reject</button>
      </div>
    </div>
  );
}

/** What is waiting on a decision and what has gone wrong, so the phone is enough to keep up. Decisions are made on the action's page, with its evidence. */
function Inbox() {
  const org = useOrg();
  const { nameOf } = usePeople();
  const q = useQuery(() => inboxFor(org.db, org.organisation.id), [org.organisation.id], { pollMs: 60_000, keepPolling: () => true });
  if (q.loading && !q.data) return <Loading />;
  if (q.error) return <ErrorNote error={q.error} title="Couldn't load your inbox" />;
  if (!q.data) return null;
  const alerts = alertsFrom(q.data.failedRuns, q.data.overdue);
  const decide = org.can("approval.decide");
  return (
    <Card title="Your inbox" subtitle={`${q.data.approvals.length} waiting on a decision · ${alerts.length} ${alerts.length === 1 ? "alert" : "alerts"}`}>
      <div className="stack" data-testid="reeds-inbox">
        <section aria-label="Waiting on a decision">
          <h3 className="inbox-head">Waiting on a decision</h3>
          {q.data.approvals.length === 0 ? <Empty>Nothing is waiting for a decision.</Empty> : (
            <ul className="list">
              {q.data.approvals.map(({ approval: a, action }) => (
                <li key={a.id}>
                  <div className="list-main">
                    {action ? <Link to={`/actions/${action.id}`} className="list-title">{action.title}</Link> : <span className="list-title">{a.requested_operation}</span>}
                    <span className="list-meta">{RISK_LABEL[a.risk_tier]} · requested by {nameOf(a.requested_by)} {ago(a.requested_at)}</span>
                  </div>
                  {action && <Link to={`/actions/${action.id}`} className="btn btn-sm">{decide ? "Review and decide" : "View"}</Link>}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-label="Alerts">
          <h3 className="inbox-head">Alerts</h3>
          {alerts.length === 0 ? <Empty>No failures in the last day, and no objective is past its date.</Empty> : (
            <ul className="list">
              {alerts.map((a) => (
                <li key={a.key}>
                  <div className="list-main">
                    <span className="list-title"><AlertTriangle size={14} aria-hidden /> {a.title}{a.count > 1 ? ` · ${a.count} times in the last day` : ""}</span>
                    <span className="list-meta">{a.detail}{a.key.startsWith("run:") ? ` · last ${ago(a.at)}` : ""}</span>
                  </div>
                  {a.link && <Link to={a.link} className="btn btn-sm">Open</Link>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Card>
  );
}
