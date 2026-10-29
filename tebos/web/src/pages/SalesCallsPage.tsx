// Today's calls: the sales desk's daily list (migration sales_prospects). Each business says where it was found and
// why it fits; a person makes the call and records what happened. Nothing here sends anything: a call is made by a
// person, and electronic marketing to someone who hasn't agreed is not allowed (POPIA s69).
import { useState, type FormEvent } from "react";
import { Phone } from "lucide-react";
import { needsOutcome, PROSPECT_STATUS_LABEL } from "@core/prospects";
import { saToday } from "@core/week";
import type { SalesProspectStatus } from "@core/states";
import { Card, Empty, ErrorNote, Field, Loading, PageHeader } from "../components/ui";
import { addProspect, callsToday, prospectCounts, recordCall, type NewProspect, type ProspectRow } from "../lib/salesData";
import { useSignedIn } from "../lib/session";
import { useQuery } from "../lib/useQuery";
import { StaffOnly } from "./PipelinePage";

const OUTCOMES: Array<{ status: SalesProspectStatus; label: string }> = [
  { status: "no_answer", label: "No answer" },
  { status: "interested", label: "Interested" },
  { status: "meeting_booked", label: "Meeting booked" },
  { status: "not_interested", label: "Not interested" },
  { status: "do_not_contact", label: "Asked not to be called" },
];

export function SalesCallsPage() {
  return <StaffOnly title="Today's calls">{() => <Calls />}</StaffOnly>;
}

function Calls() {
  const { db } = useSignedIn();
  const today = saToday();
  const list = useQuery(() => callsToday(db), []);
  const counts = useQuery(() => prospectCounts(db), []);
  const [adding, setAdding] = useState(false);
  const reload = () => { list.reload(); counts.reload(); };
  const calls = list.data ?? [];
  return (
    <div className="stack">
      <PageHeader eyebrow="TEBOS sales desk" title="Today's calls"
        actions={<button className="btn" onClick={() => setAdding((a) => !a)}>{adding ? "Close" : "Add a business"}</button>}>
        Businesses worth a call today, each with where it was found and why it fits. Call, then record what happened:
        the next call is scheduled for you. Interest becomes a lead in the pipeline. Email and WhatsApp only once they've
        agreed.
      </PageHeader>
      {adding && <AddProspect onDone={() => { setAdding(false); reload(); }} />}
      {counts.data && (
        <p className="muted" data-testid="prospect-counts">
          {counts.data.total} businesses on the desk · {counts.data.by.interested ?? 0} interested · {counts.data.by.meeting_booked ?? 0} meetings ·{" "}
          {counts.data.by.became_enquiry ?? 0} became enquiries
        </p>
      )}
      {list.error ? <ErrorNote error={list.error} title="Couldn't load today's calls" /> : !list.data ? <Loading /> : calls.length === 0 ? (
        <Card><Empty>No calls due today. New businesses are added each morning; add one yourself with "Add a business".</Empty></Card>
      ) : (
        <ol className="list" data-testid="calls-today">
          {calls.map((p) => <Prospect key={p.id} p={p} today={today} onDone={reload} />)}
        </ol>
      )}
    </div>
  );
}

function Prospect({ p, today, onDone }: { p: ProspectRow; today: string; onDone: () => void }) {
  const { db } = useSignedIn();
  const [choice, setChoice] = useState<SalesProspectStatus | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!choice) return;
    setBusy(true);
    setError(null);
    try {
      await recordCall(db, p.id, choice, note, today);
      onDone();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <li className="card" data-testid="call">
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <h2 className="card-title">{p.business_name}</h2>
        <span className="badge">{PROSPECT_STATUS_LABEL[p.status as SalesProspectStatus] ?? p.status}</span>
      </div>
      <p className="muted">{p.industry} · {p.area}</p>
      <p><strong>Why it fits:</strong> {p.why_fit}</p>
      {p.last_outcome && <p className="muted"><strong>Last call:</strong> {p.last_outcome}</p>}
      <p className="row" style={{ gap: 12, flexWrap: "wrap" }}>
        {p.phone && <a className="btn btn-primary" href={`tel:${p.phone.replace(/[^0-9+]/g, "")}`}><Phone size={15} aria-hidden /> {p.phone}</a>}
        {p.website && <a href={p.website} target="_blank" rel="noreferrer">Website</a>}
        <a href={p.source_url} target="_blank" rel="noreferrer">Where we found them</a>
      </p>
      <form className="form" onSubmit={save} aria-label={`Record the call to ${p.business_name}`}>
        <div className="row" role="group" aria-label="What happened" style={{ gap: 8, flexWrap: "wrap" }}>
          {OUTCOMES.map((o) => (
            <button key={o.status} type="button" className={`btn btn-sm${choice === o.status ? " btn-primary" : ""}`}
              aria-pressed={choice === o.status} onClick={() => setChoice(o.status)}>{o.label}</button>
          ))}
        </div>
        {choice && needsOutcome(choice) && (
          <Field label="What did they say?">
            <textarea className="input" rows={2} required minLength={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        )}
        {choice === "do_not_contact" && <p className="muted">They won't be called again. This can't be undone.</p>}
        <ErrorNote error={error} title="Not saved" />
        {choice && <button className="btn btn-primary" disabled={busy}>Save</button>}
      </form>
    </li>
  );
}

const EMPTY: NewProspect = { business_name: "", industry: "", area: "", website: "", phone: "", source_url: "", why_fit: "" };

function AddProspect({ onDone }: { onDone: () => void }) {
  const { db } = useSignedIn();
  const [f, setF] = useState<NewProspect>(EMPTY);
  const [error, setError] = useState<unknown>(null);
  const set = (k: keyof NewProspect) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await addProspect(db, f);
      onDone();
    } catch (err) {
      setError(err);
    }
  }
  return (
    <Card title="Add a business">
      <form className="form" onSubmit={save} aria-label="Add a business">
        <Field label="Business name"><input className="input" required value={f.business_name} onChange={set("business_name")} /></Field>
        <Field label="Industry"><input className="input" required value={f.industry} onChange={set("industry")} /></Field>
        <Field label="Area"><input className="input" required value={f.area} onChange={set("area")} /></Field>
        <Field label="Business phone" hint="The business's own number, not a person's cellphone."><input className="input" value={f.phone} onChange={set("phone")} /></Field>
        <Field label="Website"><input className="input" type="url" placeholder="https://" value={f.website} onChange={set("website")} /></Field>
        <Field label="Where you found them" hint="A link, e.g. their listing or site."><input className="input" type="url" required placeholder="https://" value={f.source_url} onChange={set("source_url")} /></Field>
        <Field label="Why they fit" hint="What you saw that TEBOS would fix. No personal emails or numbers."><textarea className="input" rows={2} required minLength={10} value={f.why_fit} onChange={set("why_fit")} /></Field>
        <ErrorNote error={error} title="Not added" />
        <button className="btn btn-primary">Add</button>
      </form>
    </Card>
  );
}
