// The client's side of web delivery (docs/web-delivery/, ADR 0012): their website project from their own TEBOS
// account. They see where it stands and what TEBOS needs from them, approve scope, design and release (their admin
// only: the database refuses anyone else), and ask TEBOS for changes. A change request counts against their plan's
// monthly allowance, like every request in their channel. TEBOS's team does the work; nothing here is done for them.
import { useState, type FormEvent } from "react";
import type { WebProjectStatus } from "@core/states";
import { clientToDos, completion, qaPassed, WEB_STATUS_LABEL } from "@core/web-delivery";
import { saToday } from "@core/week";
import { Badge, Card, Empty, ErrorNote, Field, Loading, PageHeader } from "../components/ui";
import { useOrg } from "../lib/session";
import { useQuery } from "../lib/useQuery";
import { approve, askForChange, clientProjects, type ClientProject } from "../lib/webDeliveryData";
import { ClockBadge, History, StageTrack } from "./WebDeliveryPage";

export function WebsitePage() {
  const org = useOrg();
  const q = useQuery(() => clientProjects(org.db), [org.organisation.id]);
  const mine = (q.data ?? []).filter((p) => p.project.org_id === org.organisation.id);
  return (
    <div className="stack web-page">
      <PageHeader eyebrow={org.organisation.name} title="Your website">
        Your website project with TEBOS: where it stands, what we need from you, and how to ask for changes. TEBOS's team
        builds, tests and deploys it; you approve the scope, the design and the release.
      </PageHeader>
      {q.error ? <ErrorNote error={q.error} title="Couldn't load your website" /> : !q.data ? <Loading /> : mine.length === 0 ? (
        <Card><Empty>No website project yet. Once your plan is active, TEBOS opens your project and it appears here.</Empty></Card>
      ) : mine.map((p) => <Project key={p.project.id} p={p} isAdmin={org.role === "org_admin"} canAsk={org.role === "org_admin" || org.role === "operator"} onDone={q.reload} />)}
    </div>
  );
}

function Project({ p, isAdmin, canAsk, onDone }: { p: ClientProject; isAdmin: boolean; canAsk: boolean; onDone: () => void }) {
  const today = saToday();
  const status = p.project.status as WebProjectStatus;
  const latest = p.scopes[0];
  const approved = (kind: string) => Boolean(latest && p.approvals.some((a) => a.revision_id === latest.id && a.kind === kind));
  const passed = qaPassed(p.qa.map((r) => ({ revision: p.scopes.find((s) => s.id === r.revision_id)?.revision ?? -1, verdict: r.verdict as "pass" | "conditional_pass" | "fail", criticalOpen: r.critical_open, at: r.created_at })), latest?.revision ?? null);
  const assetsNeeded = p.assets.filter((a) => a.status === "missing" || a.status === "client_approval_required").length;
  const todos = clientToDos({ status, isAdmin, hasScope: Boolean(latest), approved: { scope: approved("scope"), design: approved("design"), release: approved("release") }, qaPassed: passed, assetsNeeded });
  const preview = p.deployments.find((d) => d.environment === "preview" && d.outcome === "live");
  const live = p.deployments.find((d) => d.environment === "production" && d.outcome === "live");
  const pct = completion(p.tasks.filter((t) => t.status !== "cancelled").length, p.tasks.filter((t) => t.status === "done").length);
  return (
    <section className="stack" data-testid="client-project">
      <Card title={p.project.name} subtitle={`${p.project.ref} · ${pct === null ? "work not started yet" : `${pct}% of the work accepted`}`}
        actions={<span className="row" style={{ gap: 6, flexWrap: "wrap" }}><Badge tone="info">{WEB_STATUS_LABEL[status]}</Badge><ClockBadge p={p.project} today={today} /></span>}>
        <StageTrack status={status} />
        <p style={{ marginTop: 12 }}>{p.project.status_note}</p>
        <p className="row" style={{ gap: 12, flexWrap: "wrap" }}>
          {live && <a className="btn btn-primary" href={live.url} target="_blank" rel="noreferrer">Your live website</a>}
          {preview && <a className="btn" href={preview.url} target="_blank" rel="noreferrer">See the preview</a>}
        </p>
      </Card>
      <Card title="What we need from you">
        {todos.length === 0 ? <Empty>Nothing right now. TEBOS is working on it.</Empty> : (
          <ul data-testid="client-todos">{todos.map((t) => <li key={t}>{t}</li>)}</ul>
        )}
        {assetsNeeded > 0 && (
          <ul className="muted">{p.assets.filter((a) => a.status === "missing" || a.status === "client_approval_required").map((a) => <li key={a.id}>{a.label}</li>)}</ul>
        )}
      </Card>
      {latest && (
        <Card title={`What we agreed (revision ${latest.revision})`} subtitle="Read this before you approve: it's what TEBOS builds and tests against.">
          <dl className="web-scope">
            <dt>Pages</dt><dd>{latest.pages.join(", ")}</dd>
            <dt>Features</dt><dd>{latest.features.join(", ") || "None"}</dd>
            <dt>Your visitors' first step</dt><dd>{latest.primary_conversion}</dd>
            <dt>Not included</dt><dd>{latest.exclusions}</dd>
            <dt>Running costs you pay</dt><dd>{latest.recurring_costs}</dd>
            <dt>Accepted when</dt><dd><ul>{latest.acceptance_criteria.map((c) => <li key={c}>{c}</li>)}</ul></dd>
          </dl>
          <div className="stack" style={{ marginTop: 12 }}>
            <Approve p={p} kind="scope" label="Approve the scope and its costs" done={approved("scope")} isAdmin={isAdmin} onDone={onDone} />
            <Approve p={p} kind="design" label="Approve the design direction" done={approved("design")} isAdmin={isAdmin} onDone={onDone} />
            {(status === "client_review" || approved("release")) && (
              <Approve p={p} kind="release" label="Approve the release: put it live" done={approved("release")} isAdmin={isAdmin} onDone={onDone}
                note={preview ? "Check the preview first." : "The preview link appears above once it's ready."} />
            )}
          </div>
        </Card>
      )}
      <AskForChange p={p} canAsk={canAsk} onDone={onDone} />
      <History f={p} />
    </section>
  );
}

function Approve({ p, kind, label, done, isAdmin, note, onDone }: { p: ClientProject; kind: "scope" | "design" | "release"; label: string; done: boolean; isAdmin: boolean; note?: string; onDone: () => void }) {
  const org = useOrg();
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  if (done) return <p><Badge tone="good">Approved</Badge> {label.replace(/^Approve /, "")}</p>;
  if (!isAdmin) return <p className="muted">{label}: waiting for your organisation's admin.</p>;
  return (
    <div>
      <button className="btn btn-primary" disabled={busy} onClick={async () => {
        setBusy(true); setError(null);
        try { await approve(org.db, p.project, p.scopes[0]!.id, kind, ""); onDone(); } catch (err) { setError(err); } finally { setBusy(false); }
      }}>{label}</button>
      {note && <span className="muted"> {note}</span>}
      <ErrorNote error={error} title="Not approved" />
    </div>
  );
}

function AskForChange({ p, canAsk, onDone }: { p: ClientProject; canAsk: boolean; onDone: () => void }) {
  const org = useOrg();
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [sent, setSent] = useState(false);
  async function send(e: FormEvent) {
    e.preventDefault();
    setError(null); setSent(false);
    try { await askForChange(org.db, p.project, title, detail); setTitle(""); setDetail(""); setSent(true); onDone(); } catch (err) { setError(err); }
  }
  return (
    <Card title="Ask TEBOS for a change" subtitle="Your request goes straight to the TEBOS team running your website. It counts against your plan's monthly change requests.">
      {p.changes.length > 0 && (
        <ul className="list web-list" data-testid="client-changes">
          {p.changes.map((c) => <li key={c.id}><strong>{c.title}</strong> <Badge tone={c.status === "done" ? "good" : c.status === "received" ? "neutral" : "info"}>{c.status.replace(/_/g, " ")}</Badge>{c.outcome_note && <p className="muted" style={{ margin: "4px 0 0" }}>{c.outcome_note}</p>}</li>)}
        </ul>
      )}
      {canAsk ? (
        <form className="form" aria-label="Ask for a change" onSubmit={send}>
          <Field label="What should change?"><input className="input" required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="Details" hint="Where on the site, and what it should say or show."><textarea className="input" rows={3} value={detail} onChange={(e) => setDetail(e.target.value)} /></Field>
          <ErrorNote error={error} title="Not sent" />
          {sent && <p role="status">Received by TEBOS. You'll see its progress here.</p>}
          <button className="btn btn-primary">Send the request</button>
        </form>
      ) : <p className="muted">Your organisation's admin or an operator can ask for changes.</p>}
    </Card>
  );
}
