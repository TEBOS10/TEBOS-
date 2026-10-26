// REEDS intake in TEPOS: capture what came in, see what it asks for, decide what only you can decide. Each source's
// real connection state is shown as it is; until a sync has run, "not connected" is the truth, and nothing here
// pretends otherwise.
import { useState } from "react";
import {
  COMMITMENT_STATUS_LABEL,
  OWNER_LABEL,
  OWNERS,
  SOURCE_LABEL,
  SOURCE_TYPES,
  TRIAGE,
  WORKSPACES,
  dailyBrief,
  type Commitment,
  type SourceType,
} from "@core/reeds-intake";
import { saToday } from "@core/week";
import type { ReedsCommitmentStatus } from "@core/states";
import { ErrorNote, Loading } from "../components/ui";
import { Link } from "../lib/router";
import { useOrg } from "../lib/session";
import { useQuery } from "../lib/useQuery";
import { capture, decide, ensureSources, loadIntake, resolveConflict, updateCommitment, type CommitmentRow, type IntegrationRow, type SourceEventRow } from "./intakeData";

const when = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Johannesburg" }).format(new Date(iso)) : "never");
const BASIS: Record<string, string> = { verified: "verified", reported: "as reported", inferred: "inferred", unknown: "date unknown", none: "no deadline" };

export function useFounderOrg() {
  const org = useOrg();
  const home = org.organisations.find((o) => o.organisation.private && o.organisation.slug === "irekun") ?? org.organisations.find((o) => o.organisation.private);
  return { org, orgId: home?.organisation.id };
}

export const asCommitment = (c: CommitmentRow): CommitmentRow & Commitment => ({
  ...c, owner: c.owner as Commitment["owner"], dueOn: c.due_on, dueBasis: c.due_basis as Commitment["dueBasis"],
  priority: c.priority as Commitment["priority"], status: c.status as ReedsCommitmentStatus, approval: c.approval as Commitment["approval"], nextAction: c.next_action,
});

export function IntakePage() {
  const { org, orgId } = useFounderOrg();
  const q = useQuery(async () => {
    if (!orgId) return null;
    await ensureSources(org.db, orgId);
    return loadIntake(org.db, orgId);
  }, [orgId]);
  if (!orgId) return <div className="tepos"><h1>Intake</h1><p className="tepos-muted">REEDS intake needs your private organisation.</p></div>;
  if (q.loading && !q.data) return <div className="tepos"><Loading label="Opening intake" /></div>;
  if (q.error || !q.data) return <div className="tepos"><ErrorNote error={q.error} title="Couldn't open intake" /></div>;
  const { sources, events, commitments, decisions, conflicts } = q.data;
  const today = saToday();
  const brief = dailyBrief(commitments.map(asCommitment), today);
  const eventOf = (id: string) => events.find((e) => e.id === id);

  return (
    <div className="tepos week intake" data-testid="intake-page">
      <header className="tepos-head">
        <div className="tepos-eyebrow"><Link to="/">TEPOS</Link> / REEDS intake</div>
        <h1>Intake</h1>
        <p>What came in, what it asks for, and what only you can decide. Every item keeps its source.</p>
      </header>

      <SourceHealth sources={sources} />
      <CaptureForm orgId={orgId} onDone={q.reload} />

      <section aria-label="Commitments" className="tepos-card">
        <h2>Commitments ({brief.overdue.length} late, {brief.dueToday.length} due today, {brief.undated.length} without a date)</h2>
        <ul className="intake-list" data-testid="commitments">
          {commitments.filter((c) => c.status !== "cancelled").map((c) => (
            <CommitmentItem key={c.id} c={c} source={eventOf(c.source_event_id)} today={today} onSaved={q.reload} />
          ))}
        </ul>
        {commitments.length === 0 && <p className="tepos-muted">Nothing captured yet.</p>}
      </section>

      {conflicts.length > 0 && (
        <section aria-label="Conflicts" className="tepos-card intake-conflicts" data-testid="conflicts">
          <h2>Sources that disagree</h2>
          <ul className="intake-list">
            {conflicts.map((x) => {
              const c = commitments.find((y) => y.id === x.commitment_id);
              return (
                <li key={x.id}>
                  <strong>{c?.title}</strong>: recorded {x.field === "due_on" ? "date" : x.field} <b>{x.recorded_value ?? "none"}</b>, a later source says <b>{x.reported_value}</b>
                  {" "}<span className="tepos-muted">({eventOf(x.source_event_id)?.summary ?? "source"})</span>
                  <div className="task-why-actions">
                    <button className="btn btn-ghost-dark" onClick={async () => { await resolveConflict(org.db, x, false); q.reload(); }}>Keep {x.recorded_value}</button>
                    <button className="btn" onClick={async () => { await resolveConflict(org.db, x, true); q.reload(); }}>Take {x.reported_value}</button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-label="Decisions" className="tepos-card" data-testid="decisions">
        <h2>Decisions only you can make</h2>
        <ul className="intake-list">
          {decisions.filter((d) => d.status === "open" || d.status === "deferred").map((d) => <DecisionItem key={d.id} d={d} source={d.source_event_id ? eventOf(d.source_event_id) : undefined} onSaved={q.reload} />)}
        </ul>
        {!decisions.some((d) => d.status === "open" || d.status === "deferred") && <p className="tepos-muted">No decisions waiting.</p>}
      </section>

      <section aria-label="Recently received" className="tepos-card">
        <h2>Recently received</h2>
        <ul className="intake-list" data-testid="events">
          {events.map((e) => (
            <li key={e.id} id={`src-${e.id}`}>
              <span className="lens lens-intelligence">{SOURCE_LABEL[e.source_type as SourceType]}</span> {e.summary}
              <div className="tepos-muted intake-meta">
                {when(e.received_at)}{e.sender_label ? ` · from ${e.sender_label}` : ""} · {e.triage.replace("_", " ")} · {e.workspace}
                {e.source_ref ? ` · ref ${e.source_ref}` : ""}
                {e.source_link && <> · <a href={e.source_link} target="_blank" rel="noreferrer">open the source</a></>}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function SourceHealth({ sources }: { sources: IntegrationRow[] }) {
  const label: Record<string, string> = { not_connected: "Not connected", connected: "Connected", failing: "Failing" };
  return (
    <section aria-label="Sources" className="tepos-card" data-testid="source-health">
      <h2>Sources</h2>
      <ul className="intake-sources">
        {sources.map((s) => (
          <li key={s.id} className={`source-${s.state}`} data-testid={`source-${s.source_type}`}>
            <strong>{SOURCE_LABEL[s.source_type as SourceType]}</strong>
            <span className="source-state">{s.source_type === "manual" ? "Always available" : label[s.state]}</span>
            <span className="tepos-muted">
              {s.source_type === "manual" ? `${s.imported} captured, ${s.duplicates} repeats recognised` :
                s.state === "not_connected" ? "No sync has run; nothing is read from here yet." :
                `Last success ${when(s.last_success_at)} · last failure ${when(s.last_failure_at)}${s.last_error ? ` · ${s.last_error}` : ""}`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CaptureForm({ orgId, onDone }: { orgId: string; onDone: () => void }) {
  const { org } = useFounderOrg();
  const blank = { kind: "commitment", title: "", owner: "founder", due_on: "", due_basis: "reported", priority: "normal", next_action: "", approval: "not_needed", recommendation: "" };
  const [f, setF] = useState({ sourceType: "manual" as SourceType, sourceRef: "", sourceLink: "", sender: "", summary: "", triage: "commitment", workspace: "personal" });
  const [items, setItems] = useState([blank]);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const set = (k: keyof typeof f, v: string) => setF({ ...f, [k]: v });
  const setItem = (i: number, k: string, v: string) => setItems(items.map((x, n) => (n === i ? { ...x, [k]: v } : x)));

  return (
    <form className="tepos-card intake-capture" data-testid="capture" onSubmit={async (e) => {
      e.preventDefault();
      setError(null); setResult(null);
      try {
        const r = await capture(org.db, orgId, { ...f, items: items.filter((x) => x.title.trim()).map((x) => (x.kind === "decision"
          ? { kind: "decision", title: x.title, recommendation: x.recommendation, due_on: x.due_on }
          : { kind: "commitment", title: x.title, owner: x.owner, due_on: x.due_on, due_basis: x.due_on ? x.due_basis : "unknown", priority: x.priority, next_action: x.next_action, approval: x.approval })) });
        setResult(r.duplicate ? "Already captured: this source is on record, so nothing was added." :
          `Captured: ${r.created} item${r.created === 1 ? "" : "s"}${r.conflicts ? `, ${r.conflicts} conflict${r.conflicts === 1 ? "" : "s"} to settle` : ""}${r.skipped ? `, ${r.skipped} already recorded` : ""}.`);
        if (!r.duplicate) { setF({ ...f, sourceRef: "", sourceLink: "", sender: "", summary: "" }); setItems([blank]); }
        onDone();
      } catch (err) { setError(err); }
    }}>
      <h2>Capture</h2>
      <p className="tepos-muted">Paste a message, note or email summary. Add only real actions or decisions: not every sentence is a task.</p>
      <div className="intake-row">
        <label>Source<select value={f.sourceType} onChange={(e) => set("sourceType", e.target.value)}>
          {SOURCE_TYPES.filter((t) => t !== "calendar").map((t) => <option key={t} value={t}>{SOURCE_LABEL[t]}</option>)}
        </select></label>
        <label>Its ID (optional)<input value={f.sourceRef} onChange={(e) => set("sourceRef", e.target.value)} placeholder="Message ID or export line" maxLength={300} /></label>
        <label>Link (optional)<input value={f.sourceLink} onChange={(e) => set("sourceLink", e.target.value)} placeholder="https://" maxLength={500} pattern="(https://|/)\S*" /></label>
        <label>From (optional)<input value={f.sender} onChange={(e) => set("sender", e.target.value)} placeholder="e.g. Principal" maxLength={120} /></label>
      </div>
      <label>Summary<textarea rows={3} required value={f.summary} onChange={(e) => set("summary", e.target.value)} maxLength={1000} placeholder="What it says, in a sentence or two" /></label>
      <div className="intake-row">
        <label>It is<select value={f.triage} onChange={(e) => set("triage", e.target.value)}>{TRIAGE.filter((t) => t !== "untriaged").map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}</select></label>
        <label>Workspace<select value={f.workspace} onChange={(e) => set("workspace", e.target.value)}>{WORKSPACES.map((w) => <option key={w} value={w}>{w}</option>)}</select></label>
      </div>
      {items.map((x, i) => (
        <fieldset key={i} className="intake-item">
          <legend>What it asks for {items.length > 1 ? i + 1 : ""}</legend>
          <div className="intake-row">
            <label>Kind<select value={x.kind} onChange={(e) => setItem(i, "kind", e.target.value)}><option value="commitment">An action</option><option value="decision">A decision for you</option></select></label>
            <label className="grow">{x.kind === "decision" ? "The question" : "The action"}<input value={x.title} onChange={(e) => setItem(i, "title", e.target.value)} maxLength={200} /></label>
          </div>
          <div className="intake-row">
            <label>{x.kind === "decision" ? "Decide by" : "Due"}<input type="date" value={x.due_on} onChange={(e) => setItem(i, "due_on", e.target.value)} /></label>
            {x.kind === "commitment" ? (
              <>
                <label>The date is<select value={x.due_basis} onChange={(e) => setItem(i, "due_basis", e.target.value)} disabled={!x.due_on}>
                  <option value="reported">as someone said</option><option value="verified">verified</option><option value="inferred">my inference</option>
                </select></label>
                <label>Owner<select value={x.owner} onChange={(e) => setItem(i, "owner", e.target.value)}>{OWNERS.map((o) => <option key={o} value={o}>{OWNER_LABEL[o]}</option>)}</select></label>
                <label>Priority<select value={x.priority} onChange={(e) => setItem(i, "priority", e.target.value)}><option>high</option><option>normal</option><option>low</option></select></label>
                <label>Needs your approval<select value={x.approval} onChange={(e) => setItem(i, "approval", e.target.value)}><option value="not_needed">No</option><option value="required">Yes</option></select></label>
              </>
            ) : <label className="grow">Recommendation<input value={x.recommendation} onChange={(e) => setItem(i, "recommendation", e.target.value)} maxLength={1000} /></label>}
          </div>
          {x.kind === "commitment" && <label>Next action<input value={x.next_action} onChange={(e) => setItem(i, "next_action", e.target.value)} maxLength={300} /></label>}
        </fieldset>
      ))}
      <div className="task-why-actions">
        {items.length < 5 && <button type="button" className="btn btn-ghost-dark" onClick={() => setItems([...items, blank])}>Add another</button>}
        <button className="btn">Capture</button>
      </div>
      {result && <p role="status" data-testid="capture-result">{result}</p>}
      <ErrorNote error={error} title="Not captured" />
    </form>
  );
}

function CommitmentItem({ c, source, today, onSaved }: { c: CommitmentRow; source?: SourceEventRow; today: string; onSaved: () => void }) {
  const { org } = useFounderOrg();
  const [evidence, setEvidence] = useState("");
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState<"done" | "blocked" | null>(null);
  const [error, setError] = useState<unknown>(null);
  const status = c.status as ReedsCommitmentStatus;
  const late = c.due_on !== null && c.due_on < today && status !== "done";
  async function save(patch: Parameters<typeof updateCommitment>[2]) {
    setError(null);
    try { await updateCommitment(org.db, c.id, patch); setMode(null); onSaved(); } catch (e) { setError(e); }
  }
  return (
    <li className={`intake-commitment status-${status}`} data-testid="commitment" id={`c-${c.id}`}>
      <div className="task-top">
        <h3>{c.title}</h3>
        <span className="task-min">{COMMITMENT_STATUS_LABEL[status]}</span>
      </div>
      <div className="tepos-muted intake-meta">
        {OWNER_LABEL[c.owner as keyof typeof OWNER_LABEL]} · {c.due_on ? <span className={late ? "late" : ""}>{late ? "late, " : ""}due {c.due_on} ({BASIS[c.due_basis]})</span> : <span data-testid="no-date">{BASIS[c.due_basis]}</span>}
        {c.priority === "high" ? " · high priority" : ""}{c.approval === "required" ? " · needs your approval" : c.approval === "approved" ? " · approved" : ""}
      </div>
      {c.next_action && <p className="task-action">Next: {c.next_action}</p>}
      {source && <p className="intake-source" data-testid="commitment-source">From: {source.summary}{source.source_ref ? ` (ref ${source.source_ref})` : ""}{source.source_link && <> · <a href={source.source_link} target="_blank" rel="noreferrer">source</a></>}</p>}
      {c.completion_evidence && <p className="task-reason">Evidence: {c.completion_evidence}</p>}
      {c.blocked_reason && status === "blocked" && <p className="task-reason">Blocked: {c.blocked_reason}</p>}
      {status !== "done" && (
        <div className="task-status">
          {c.approval === "required" && <>
            <button className="chip" onClick={() => void save({ approval: "approved" })}>Approve</button>
            <button className="chip" onClick={() => void save({ approval: "rejected", status: status === "captured" ? "cancelled" : status })}>Reject</button>
          </>}
          {status === "captured" && <button className="chip" onClick={() => void save({ status: "ready" })}>Ready</button>}
          {(status === "ready" || status === "blocked" || status === "awaiting_approval") && <button className="chip" onClick={() => void save({ status: "in_progress" })}>Start</button>}
          {(status === "ready" || status === "in_progress" || status === "review") && <button className="chip" onClick={() => setMode("done")}>Done…</button>}
          {(status === "ready" || status === "in_progress") && <button className="chip" onClick={() => setMode("blocked")}>Blocked…</button>}
        </div>
      )}
      {mode === "done" && (
        <form className="task-why" onSubmit={(e) => { e.preventDefault(); void save({ status: "done", completion_evidence: evidence }); }}>
          <label>The evidence: what was sent, saved, booked or tested
            <input value={evidence} onChange={(e) => setEvidence(e.target.value)} required maxLength={1000} placeholder="e.g. Sent 10:42, in Sent items" />
          </label>
          <div className="task-why-actions"><button className="btn">Mark done</button><button type="button" className="btn btn-ghost-dark" onClick={() => setMode(null)}>Cancel</button></div>
        </form>
      )}
      {mode === "blocked" && (
        <form className="task-why" onSubmit={(e) => { e.preventDefault(); void save({ status: "blocked", blocked_reason: reason }); }}>
          <label>What blocks it, and who can unblock it<input value={reason} onChange={(e) => setReason(e.target.value)} required maxLength={500} /></label>
          <div className="task-why-actions"><button className="btn">Save</button><button type="button" className="btn btn-ghost-dark" onClick={() => setMode(null)}>Cancel</button></div>
        </form>
      )}
      <ErrorNote error={error} title="Not saved" />
    </li>
  );
}

function DecisionItem({ d, source, onSaved }: { d: { id: string; question: string; recommendation: string | null; decide_by: string | null; evidence: string | null }; source?: SourceEventRow; onSaved: () => void }) {
  const { org } = useFounderOrg();
  const [decision, setDecision] = useState("");
  const [rationale, setRationale] = useState("");
  const [error, setError] = useState<unknown>(null);
  return (
    <li data-testid="decision">
      <h3>{d.question}</h3>
      <div className="tepos-muted intake-meta">{d.decide_by ? `Decide by ${d.decide_by}` : "No date"}{source ? ` · from: ${source.summary}` : ""}</div>
      {d.recommendation && <p className="task-action">Recommendation: {d.recommendation}</p>}
      {d.evidence && <p className="task-done">Evidence: {d.evidence}</p>}
      <form className="task-why" onSubmit={async (e) => { e.preventDefault(); setError(null); try { await decide(org.db, d.id, decision, rationale); onSaved(); } catch (err) { setError(err); } }}>
        <label>Your decision<input value={decision} onChange={(e) => setDecision(e.target.value)} required maxLength={1000} /></label>
        <label>Why (optional)<input value={rationale} onChange={(e) => setRationale(e.target.value)} maxLength={1000} /></label>
        <button className="btn">Record the decision</button>
      </form>
      <ErrorNote error={error} title="Not saved" />
    </li>
  );
}
