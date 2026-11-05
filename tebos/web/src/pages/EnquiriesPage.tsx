// Enquiries from the organisation's public website (ADR 0022): switch the form on or off, read what came in, reply
// outside TEBOS, then record that you did and close it. The database holds every rule: only admins and operators see
// the enquiries (they carry personal details), every move says why, and only an admin deletes one when the person asks.
import { Inbox } from "lucide-react";
import { useState, type FormEvent } from "react";
import { ENQUIRY_RELATIONSHIPS, ENQUIRY_SITUATIONS } from "@core/propertyEnquiry";
import { Badge, Card, Empty, ErrorNote, Field, Loading, PageHeader } from "../components/ui";
import { deleteEnquiry, enquiries, enquirySettings, moveEnquiry, setAccepting, type PropertyEnquiry } from "../lib/enquiriesData";
import { useOrg } from "../lib/session";
import { useQuery } from "../lib/useQuery";

const STATUS: Record<string, { label: string; tone: "warn" | "info" | "neutral" }> = {
  new: { label: "New", tone: "warn" }, contacted: { label: "Contacted", tone: "info" }, closed: { label: "Closed", tone: "neutral" },
};
const situation = (k: string) => ENQUIRY_SITUATIONS.find((s) => s.key === k)?.label ?? k;
const relationship = (k: string) => ENQUIRY_RELATIONSHIPS.find((r) => r.key === k)?.label ?? k;
const when = (iso: string) => new Date(iso).toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Johannesburg" });

export function EnquiriesPage() {
  const org = useOrg();
  const admin = org.role === "org_admin";
  const team = admin || org.role === "operator";
  const settings = useQuery(() => enquirySettings(org.db, org.organisation.id), [org.organisation.id]);
  const list = useQuery(() => (team ? enquiries(org.db, org.organisation.id) : Promise.resolve([])), [org.organisation.id, team]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const toggle = async () => {
    if (!settings.data) return;
    setBusy(true); setErr(null);
    try { await setAccepting(org.db, org.organisation.id, !settings.data.accepting); settings.reload(); } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const waiting = (list.data ?? []).filter((e) => e.status !== "closed");
  const closed = (list.data ?? []).filter((e) => e.status === "closed");
  return (
    <div className="stack">
      <PageHeader eyebrow={org.organisation.name} title="Enquiries">
        Property owners, and people acting for them, telling you about a property problem from your website. Reply by email or phone, then record it here.
      </PageHeader>

      <Card title="The website form"
        actions={admin && settings.data ? (
          <button type="button" className={`btn btn-sm ${settings.data.accepting ? "" : "btn-primary"}`} disabled={busy} onClick={() => void toggle()} data-testid="enquiry-toggle">
            {settings.data.accepting ? "Switch off" : "Switch on"}
          </button>
        ) : undefined}>
        {settings.error ? <ErrorNote error={settings.error} /> : settings.data === undefined ? <Loading /> : !settings.data ? (
          <Empty>This organisation doesn't take enquiries from a website.</Empty>
        ) : (
          <p data-testid="enquiry-state">
            <Badge tone={settings.data.accepting ? "good" : "neutral"}>{settings.data.accepting ? "On" : "Off"}</Badge>{" "}
            {settings.data.accepting ? "The website's form is taking enquiries." : "The website shows your email address instead of the form."}
            {!admin && " Only an admin switches it."}
          </p>
        )}
        <ErrorNote error={err} />
      </Card>

      {!team ? (
        <Card><Empty>Only the organisation's admins and operators see enquiries: they hold people's contact details.</Empty></Card>
      ) : list.error ? <ErrorNote error={list.error} title="Couldn't load enquiries" /> : !list.data ? <Loading /> : (
        <>
          <Card title="To answer" subtitle={waiting.length ? `${waiting.length} open` : undefined}>
            {waiting.length === 0 ? <Empty>Nothing waiting.</Empty> : (
              <ul className="list" data-testid="enquiries-open">
                {waiting.map((e) => <EnquiryItem key={e.id} e={e} admin={admin} onChange={list.reload} />)}
              </ul>
            )}
          </Card>
          {closed.length > 0 && (
            <Card title="Closed">
              <ul className="list">{closed.map((e) => <EnquiryItem key={e.id} e={e} admin={admin} onChange={list.reload} />)}</ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function EnquiryItem({ e, admin, onChange }: { e: PropertyEnquiry; admin: boolean; onChange: () => void }) {
  const { db } = useOrg();
  const [note, setNote] = useState("");
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const next = e.status === "new" ? (["contacted", "closed"] as const) : e.status === "contacted" ? (["closed"] as const) : [];
  const run = async (f: () => Promise<void>) => {
    setBusy(true); setErr(null);
    try { await f(); onChange(); } catch (x) { setErr(x); } finally { setBusy(false); }
  };
  const move = (status: "contacted" | "closed") => (ev?: FormEvent) => { ev?.preventDefault(); void run(() => moveEnquiry(db, e.id, status, note)); };
  return (
    <li className="enquiry-item" data-testid="enquiry">
      <details>
        <summary>
          <Inbox size={15} aria-hidden /> <strong>{e.name}</strong> · {situation(e.situation)} · {e.area}{" "}
          <Badge tone={STATUS[e.status]?.tone ?? "neutral"}>{STATUS[e.status]?.label ?? e.status}</Badge>{" "}
          <span className="muted">{e.ref} · {when(e.created_at)}</span>
        </summary>
        <div className="stack" style={{ gap: 10, marginTop: 10 }}>
          <p>{e.message}</p>
          <p className="muted">
            {relationship(e.relationship)} · <a href={`mailto:${e.email}?subject=${encodeURIComponent(`Your enquiry ${e.ref}`)}`}>{e.email}</a>
            {e.phone && <> · <a href={`tel:${e.phone.replace(/\s+/g, "")}`}>{e.phone}</a></>} · agreed to be contacted {when(e.consent_at)}
          </p>
          {e.status_note && <p className="muted">Last note: {e.status_note}</p>}
          {next.length > 0 && (
            <form className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "end" }} onSubmit={move(next[0]!)}>
              <Field label="What happened (kept with the enquiry)">
                <input className="input" required minLength={5} maxLength={500} value={note} onChange={(x) => setNote(x.target.value)} />
              </Field>
              {next.map((s) => (
                <button key={s} type="button" className={`btn btn-sm ${s === next[0] ? "btn-primary" : ""}`} disabled={busy || note.trim().length < 5} onClick={() => move(s)()}>
                  {s === "contacted" ? "Mark contacted" : "Close"}
                </button>
              ))}
            </form>
          )}
          {admin && (
            <p>
              <button type="button" className="btn btn-sm btn-ghost" disabled={busy}
                onClick={() => { if (window.confirm(`Delete ${e.ref} and ${e.name}'s details? This can't be undone. Do this when the person asks.`)) void run(() => deleteEnquiry(db, e.id)); }}>
                Delete on request
              </button>
            </p>
          )}
          <ErrorNote error={err} />
        </div>
      </details>
    </li>
  );
}
