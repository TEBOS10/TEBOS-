// The client channel: a business talks to TEBOS directly, and asks for changes within its plan. The database decides
// who may write, keeps every message as sent, sizes nothing on the client's word, and refuses a request over the
// month's allowance with the reason. TEBOS's maintainers answer here and carry the requests out.
import { CheckCircle2, CircleDashed, Send, XCircle } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Card, Empty, ErrorNote, Field, Loading, PageHeader, StatusBadge } from "../components/ui";
import {
  askChange, getChangeAllowance, listChangeRequests, listChannelOrganisations, listClientMessages, sendClientMessage, updateChange,
  type ChangeAllowance, type ChangeRequest,
} from "../lib/data";
import type { Db } from "../lib/supabase";
import { ago, day } from "../lib/format";
import { Link } from "../lib/router";
import { useOrg, useSignedIn } from "../lib/session";
import { useQuery } from "../lib/useQuery";
import { StaffOnly } from "./PipelinePage";

const PLAN_NAMES: Record<string, string> = { starter: "Small", growth: "Medium", company: "Company" };
const OPEN = ["received", "in_progress"];
const canAsk = (role: string) => role === "org_admin" || role === "operator";

// ---------------------------------------------------------------------------
// The client's page
// ---------------------------------------------------------------------------
export function ChannelPage() {
  const org = useOrg();
  if (org.organisation.private) {
    return <PageHeader title="TEBOS channel">The channel is for businesses on TEBOS. This is a private organisation.</PageHeader>;
  }
  return (
    <div className="stack">
      <PageHeader eyebrow="TEBOS" title="TEBOS channel">
        Talk to TEBOS directly, and ask for changes to your system. Your plan includes a number of changes each month; TEBOS
        shows what's left before you ask.
      </PageHeader>
      <Channel db={org.db} orgId={org.organisation.id} orgName={org.organisation.name} me={org.session.user.id}
        asTebos={false} canAsk={canAsk(org.role)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// TEBOS's maintainers: every client's channel
// ---------------------------------------------------------------------------
export function StaffChannelsPage({ orgId }: { orgId?: string }) {
  return (
    <StaffOnly title="Client channels">
      {(a) => (!a.maintainer ? <PageHeader title="Client channels">For TEBOS's maintainers.</PageHeader> : <StaffChannels orgId={orgId} />)}
    </StaffOnly>
  );
}

function StaffChannels({ orgId }: { orgId?: string }) {
  const { db, session } = useSignedIn();
  const q = useQuery(() => listChannelOrganisations(db), [], { pollMs: 15000, keepPolling: () => true });
  const current = q.data?.find((o) => o.id === orgId);
  return (
    <div className="stack">
      <PageHeader eyebrow="Maintainers" title="Client channels">
        Clients' messages and change requests. Answer as TEBOS, size a request that is really several changes, and close each
        one with what was done.
      </PageHeader>
      <Card title="Clients">
        {q.loading && !q.data && <Loading />}
        <ErrorNote error={q.error} title="Couldn't load the channels" />
        {q.data && q.data.length === 0 && <Empty>No client has written yet.</Empty>}
        {q.data && q.data.length > 0 && (
          <ul className="list" data-testid="channel-orgs">
            {q.data.map((o) => (
              <li key={o.id}>
                <div className="list-main">
                  <Link to={`/pipeline/channel/${o.id}`} className="list-title">{o.name}</Link>
                  <span className="list-meta">Last activity {ago(o.last)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {orgId && <Channel db={db} orgId={orgId} orgName={current?.name ?? "This client"} me={session.user.id} asTebos canAsk={false} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// One organisation's channel
// ---------------------------------------------------------------------------
function Channel({ db, orgId, orgName, me, asTebos, canAsk }: { db: Db; orgId: string; orgName: string; me: string; asTebos: boolean; canAsk: boolean }) {
  const allowance = useQuery(() => getChangeAllowance(db, orgId), [orgId]);
  const requests = useQuery(() => listChangeRequests(db, orgId), [orgId]);
  const refresh = () => { allowance.reload(); requests.reload(); };
  return (
    <>
      <AllowanceCard a={allowance.data ?? null} loading={allowance.loading} error={allowance.error} orgName={orgName} />
      {canAsk && <AskChangeCard db={db} orgId={orgId} a={allowance.data ?? null} onAsked={refresh} />}
      <RequestsCard db={db} rows={requests.data} loading={requests.loading} error={requests.error} asTebos={asTebos} canCancel={canAsk} onChanged={refresh} />
      <ConversationCard db={db} orgId={orgId} me={me} asTebos={asTebos} />
    </>
  );
}

function AllowanceCard({ a, loading, error, orgName }: { a: ChangeAllowance | null; loading: boolean; error: unknown; orgName: string }) {
  const left = a ? Math.max(0, a.allowance - a.used) : 0;
  return (
    <Card title="Changes this month" subtitle={orgName}>
      {loading && !a && <Loading />}
      <ErrorNote error={error} title="Couldn't load the allowance" />
      {a && (
        <div data-testid="allowance">
          {a.plan ? (
            <p>
              <strong>{left} of {a.allowance}</strong> change requests left on the {PLAN_NAMES[a.plan] ?? a.plan} plan.
              {" "}<span className="muted">New requests open on {day(a.resets_on)}.</span>
            </p>
          ) : (
            <p>
              There's no active TEBOS plan yet, so changes can't be requested. You can still write to TEBOS below.
              {" "}<Link to="/pricing">See the plans</Link>.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

function AskChangeCard({ db, orgId, a, onAsked }: { db: Db; orgId: string; a: ChangeAllowance | null; onAsked: () => void }) {
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [sent, setSent] = useState(false);
  const full = !!a && (!a.plan || a.used >= a.allowance);

  async function ask(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSent(false);
    try {
      await askChange(db, orgId, title.trim(), detail.trim() || null);
      setTitle("");
      setDetail("");
      setSent(true);
      onAsked();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Request a change" subtitle="One change to one thing: new photos for a gallery, a new page, a changed price list. A bigger piece of work counts as several, and TEBOS tells you before starting.">
      <form className="stack" onSubmit={ask} data-testid="ask-change">
        <Field label="What should change">
          <input value={title} maxLength={120} required onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Replace the gallery photos with the new ones" />
        </Field>
        <Field label="Details (optional)" hint="Where it is, and which images or text to use. Never put passwords here.">
          <textarea value={detail} maxLength={2000} rows={3} onChange={(e) => setDetail(e.target.value)} />
        </Field>
        <ErrorNote error={error} title="The request wasn't made" />
        {sent && <p className="note note-info" role="status">Sent. TEBOS will let you know here when it's done.</p>}
        <div>
          <button type="submit" className="btn btn-primary" disabled={busy || !title.trim() || full}>
            <Send size={16} aria-hidden /> {busy ? "Sending…" : "Request the change"}
          </button>
          {full && a?.plan && <span className="muted"> This month's requests are used; new ones open on {day(a.resets_on)}.</span>}
        </div>
      </form>
    </Card>
  );
}

function RequestsCard({ db, rows, loading, error, asTebos, canCancel, onChanged }: {
  db: Db; rows: ChangeRequest[] | undefined; loading: boolean; error: unknown; asTebos: boolean; canCancel: boolean; onChanged: () => void;
}) {
  return (
    <Card title="Change requests">
      {loading && !rows && <Loading />}
      <ErrorNote error={error} title="Couldn't load the requests" />
      {rows && rows.length === 0 && <Empty>No change requests yet.</Empty>}
      {rows && rows.length > 0 && (
        <ul className="list" data-testid="change-requests">
          {rows.map((r) => <RequestRow key={r.id} db={db} r={r} asTebos={asTebos} canCancel={canCancel} onChanged={onChanged} />)}
        </ul>
      )}
    </Card>
  );
}

function RequestRow({ db, r, asTebos, canCancel, onChanged }: { db: Db; r: ChangeRequest; asTebos: boolean; canCancel: boolean; onChanged: () => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const Icon = r.status === "done" ? CheckCircle2 : r.status === "declined" || r.status === "cancelled" ? XCircle : CircleDashed;

  async function act(patch: { status?: string; units?: number; outcome_note?: string | null }) {
    setBusy(true);
    setError(null);
    try {
      await updateChange(db, r.id, patch);
      setNote("");
      onChanged();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li>
      <div className="list-main">
        <span className="list-title"><Icon size={16} aria-hidden /> {r.title}</span>
        <span className="list-meta">
          {ago(r.created_at)} · counts as {r.units} · <StatusBadge status={r.status} />
          {r.outcome_note ? ` · ${r.outcome_note}` : ""}
        </span>
        {r.detail && <span className="muted">{r.detail}</span>}
        <ErrorNote error={error} title="That didn't go through" />
        {asTebos && OPEN.includes(r.status) && (
          <div className="stack" style={{ marginTop: 8 }}>
            {r.status === "received" && (
              <label className="muted">
                Counts as{" "}
                <select aria-label={`Size of ${r.title}`} value={r.units} disabled={busy} onChange={(e) => act({ units: Number(e.target.value) })}>
                  {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            )}
            <input aria-label={`Outcome of ${r.title}`} value={note} maxLength={2000} placeholder="What was done, or why it's declined" onChange={(e) => setNote(e.target.value)} />
            <div className="row">
              {r.status === "received" && <button type="button" className="btn" disabled={busy} onClick={() => act({ status: "in_progress" })}>Start</button>}
              {r.status === "in_progress" && <button type="button" className="btn btn-primary" disabled={busy || !note.trim()} onClick={() => act({ status: "done", outcome_note: note.trim() })}>Mark done</button>}
              <button type="button" className="btn" disabled={busy || !note.trim()} onClick={() => act({ status: "declined", outcome_note: note.trim() })}>Decline</button>
            </div>
          </div>
        )}
        {!asTebos && canCancel && r.status === "received" && (
          <div><button type="button" className="btn btn-link" disabled={busy} onClick={() => act({ status: "cancelled" })}>Cancel this request</button></div>
        )}
      </div>
    </li>
  );
}

function ConversationCard({ db, orgId, me, asTebos }: { db: Db; orgId: string; me: string; asTebos: boolean }) {
  const q = useQuery(() => listClientMessages(db, orgId), [orgId], { pollMs: 10000, keepPolling: () => true });
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function send(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await sendClientMessage(db, orgId, body.trim(), asTebos);
      setBody("");
      q.reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const who = (m: { from_tebos: boolean; author_id: string | null }) =>
    m.from_tebos ? (asTebos && m.author_id === me ? "You, as TEBOS" : "TEBOS") : m.author_id === me ? "You" : asTebos ? "The client" : "Your team";

  return (
    <Card title="Conversation" subtitle={asTebos ? "Everything here is kept as it was sent." : "Messages are kept as sent, so you and TEBOS always have the same record."}>
      {q.loading && !q.data && <Loading />}
      <ErrorNote error={q.error} title="Couldn't load the conversation" />
      {q.data && q.data.length === 0 && <Empty>No messages yet.</Empty>}
      {q.data && q.data.length > 0 && (
        <ol className="list" data-testid="messages">
          {q.data.map((m) => (
            <li key={m.id} className={m.from_tebos ? "msg msg-tebos" : "msg"}>
              <div className="list-main">
                <span className="list-meta"><strong>{who(m)}</strong> · {ago(m.created_at)}</span>
                <span style={{ whiteSpace: "pre-wrap" }}>{m.body}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
      <form className="stack" onSubmit={send} style={{ marginTop: 12 }}>
        <Field label={asTebos ? "Answer as TEBOS" : "Write to TEBOS"}>
          <textarea value={body} maxLength={4000} rows={3} onChange={(e) => setBody(e.target.value)} />
        </Field>
        <ErrorNote error={error} title="The message wasn't sent" />
        <div>
          <button type="submit" className="btn btn-primary" disabled={busy || !body.trim()}>
            <Send size={16} aria-hidden /> {busy ? "Sending…" : "Send"}
          </button>
        </div>
      </form>
    </Card>
  );
}
