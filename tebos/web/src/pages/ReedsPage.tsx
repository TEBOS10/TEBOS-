// REEDS: ask TEBOS for something and get back a verified answer. The page can
// only ask and cancel; TEBOS's worker plans, runs and checks each task, and
// the database lets a request show as done only when every task passed its
// independent check. Built to be used from a phone.
import { REQUEST_KINDS, type RequestKind } from "@core/work";
import { AlertTriangle, CheckCircle2, CircleDashed, Send } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Card, Empty, ErrorNote, Field, Loading, PageHeader, StatusBadge } from "../components/ui";
import { askWorkRequest, cancelWorkRequest, getWorkRequest, inboxFor, listWorkRequests, type WorkRequest, type WorkTask } from "../lib/data";
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
                  <Link to={`/reeds/${r.id}`} className="list-title">{kindTitle(r.kind)}</Link>
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function ask(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await askWorkRequest(org.db, org.organisation.id, kind, note.trim() || null);
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
        <Field label="Note (optional)" hint="For your own record: TEBOS doesn't act on it yet.">
          <input className="input" value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} placeholder="e.g. before the Monday meeting" />
        </Field>
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
      <PageHeader eyebrow={<Link to="/reeds">REEDS</Link>} title={kindTitle(r.kind)}
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
            {tasks.map((t) => <TaskItem key={t.id} t={t} />)}
          </ul>
        )}
      </Card>
    </div>
  );
}

function TaskItem({ t }: { t: WorkTask }) {
  const v = t.verification as { ok?: boolean; detail?: string } | null;
  return (
    <li>
      <div className="list-main">
        <span className="list-title">{t.title}</span>
        <span className="list-meta">Test: {t.acceptance}</span>
        {v?.detail && <span className="list-meta">Check: {v.detail}</span>}
        {t.error && <span className="list-meta">Error: {t.error}</span>}
        {t.attempts > 1 && <span className="list-meta">{t.attempts} attempts</span>}
      </div>
      <StatusBadge status={t.status} />
    </li>
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
