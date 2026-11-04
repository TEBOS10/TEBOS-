// Maintenance: reported → quoted → approved (by the owner or an approver) → in progress → done with the actual cost;
// or declined / cancelled with a reason. Photos are private to the account. Suppliers live here too.
import { Camera } from "lucide-react";
import { useState, type FormEvent } from "react";
import { MAINTENANCE_PRIORITIES, parseRand, saToday } from "@core/opsLedger";
import { Badge, Card, Empty, ErrorNote, Field, Loading, PageHeader } from "../components/ui";
import { addPhoto, addRequest, addSupplier, maintenance, photoUrl, photos, suppliers, updateRequest, type OpsMaintenance, type OpsSupplier } from "../lib/opsData";
import { Link, navigate } from "../lib/router";
import { useOrg } from "../lib/session";
import { useQuery } from "../lib/useQuery";
import { Money, dayLabel, usePortfolio, useRoles } from "./util";

const STATUS: Record<string, { label: string; tone: "warn" | "info" | "good" | "neutral" | "bad" }> = {
  reported: { label: "Reported", tone: "warn" }, quoted: { label: "Quote to approve", tone: "info" }, approved: { label: "Approved", tone: "good" },
  in_progress: { label: "In progress", tone: "info" }, done: { label: "Done", tone: "neutral" }, declined: { label: "Quote declined", tone: "bad" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};
const OPEN = ["reported", "quoted", "declined", "approved", "in_progress"];

export function MaintenancePage() {
  const { db, organisation } = useOrg();
  const p = usePortfolio();
  const roles = useRoles();
  const m = useQuery(() => maintenance(db, organisation.id), [organisation.id]);
  const s = useQuery(() => suppliers(db, organisation.id), [organisation.id]);
  const [show, setShow] = useState<"open" | "closed">("open");
  if (p.error) return <ErrorNote error={p.error} />;
  if (!p.data) return <Loading />;
  const place = (r: OpsMaintenance) => {
    const pr = p.data!.properties.find((x) => x.id === r.property_id);
    const u = r.unit_id && p.data!.units.find((x) => x.id === r.unit_id);
    return `${pr?.name ?? ""}${u ? ` · ${u.label}` : ""}`;
  };
  const list = (m.data ?? []).filter((r) => (show === "open" ? OPEN.includes(r.status) : !OPEN.includes(r.status)));
  const toApprove = (m.data ?? []).filter((r) => r.status === "quoted").length;
  return (
    <div className="stack">
      <PageHeader title="Maintenance">From the report to the invoice: who quoted, who approved, what it cost.</PageHeader>
      {roles.approve && toApprove > 0 && <p className="note note-warn" role="status">{toApprove} quote{toApprove === 1 ? " is" : "s are"} waiting for your approval.</p>}
      <div className="ops-tabs" role="tablist" aria-label="Show">
        <button role="tab" aria-selected={show === "open"} className={`btn btn-sm ${show === "open" ? "btn-primary" : ""}`} onClick={() => setShow("open")}>Open</button>
        <button role="tab" aria-selected={show === "closed"} className={`btn btn-sm ${show === "closed" ? "btn-primary" : ""}`} onClick={() => setShow("closed")}>Finished</button>
      </div>
      {m.error ? <ErrorNote error={m.error} /> : !m.data ? <Loading /> : list.length === 0 ? <Empty>{show === "open" ? "Nothing open." : "Nothing finished yet."}</Empty> : (
        <ul className="ops-list ops-list-cards" data-testid="requests">
          {list.map((r) => (
            <li key={r.id}>
              <Link to={`/maintenance/${r.id}`}><strong>{r.title}</strong> <span className="muted">{r.ref}</span></Link>
              <span className="muted">{place(r)} · {dayLabel(r.reported_on)}</span>
              <span>{r.priority === "urgent" && <Badge tone="bad">Urgent</Badge>} <Badge tone={STATUS[r.status]?.tone ?? "neutral"}>{STATUS[r.status]?.label ?? r.status}</Badge>
                {r.quote_cents != null && r.status !== "done" && <> <Money cents={r.quote_cents} /> <span className="muted">quoted</span></>}
                {r.cost_cents != null && <> <Money cents={r.cost_cents} basis="actual" /></>}</span>
            </li>
          ))}
        </ul>
      )}
      {roles.manage && <NewRequest onDone={(id) => navigate(`/maintenance/${id}`)} />}
      <Card title="Suppliers">
        {s.error ? <ErrorNote error={s.error} /> : !s.data ? <Loading /> : s.data.length === 0 ? <Empty>No suppliers yet.</Empty> : (
          <ul className="ops-list" data-testid="suppliers">
            {s.data.map((x) => <li key={x.id}><span><strong>{x.name}</strong> <span className="muted">{x.trade}</span></span><span className="muted">{[x.phone, x.email].filter(Boolean).join(" · ")}</span></li>)}
          </ul>
        )}
        {roles.manage && <NewSupplier onDone={s.reload} />}
      </Card>
    </div>
  );
}

function NewRequest({ onDone }: { onDone: (id: string) => void }) {
  const { db, organisation } = useOrg();
  const p = usePortfolio();
  const [f, setF] = useState({ property_id: "", unit_id: "", title: "", description: "", priority: "normal" });
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  if (!p.data) return null;
  const units = p.data.units.filter((u) => u.property_id === f.property_id);
  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(null); setBusy(true);
    try {
      const r = await addRequest(db, { org_id: organisation.id, property_id: f.property_id, unit_id: f.unit_id || null, title: f.title.trim(), description: f.description.trim() || null, priority: f.priority });
      onDone(r.id);
    } catch (x) { setErr(x); } finally { setBusy(false); }
  }
  return (
    <Card title="Report maintenance">
      <form className="form ops-form" onSubmit={(e) => void submit(e)} aria-label="Report maintenance">
        <div className="ops-row">
          <Field label="Property">
            <select className="input" required value={f.property_id} onChange={(e) => setF({ ...f, property_id: e.target.value, unit_id: "" })}>
              <option value="">Choose</option>
              {p.data.properties.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </Field>
          <Field label="Unit (optional)">
            <select className="input" value={f.unit_id} onChange={(e) => setF({ ...f, unit_id: e.target.value })} disabled={!f.property_id}>
              <option value="">Common area / whole property</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
            </select>
          </Field>
          <Field label="Priority">
            <select className="input" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>
              {MAINTENANCE_PRIORITIES.map((x) => <option key={x} value={x}>{x[0]!.toUpperCase() + x.slice(1)}</option>)}
            </select>
          </Field>
        </div>
        <Field label="What's wrong"><input className="input" required minLength={3} maxLength={120} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Geyser leaking" /></Field>
        <Field label="Details"><textarea className="input" rows={3} maxLength={2000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <ErrorNote error={err} title="Not reported" />
        <button className="btn btn-primary" disabled={busy}>Report</button>
      </form>
    </Card>
  );
}

function NewSupplier({ onDone }: { onDone: () => void }) {
  const { db, organisation } = useOrg();
  const [f, setF] = useState({ name: "", trade: "", phone: "", email: "" });
  const [err, setErr] = useState<unknown>(null);
  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(null);
    try {
      await addSupplier(db, { org_id: organisation.id, name: f.name.trim(), trade: f.trade.trim() || null, phone: f.phone.trim() || null, email: f.email.trim() || null });
      setF({ name: "", trade: "", phone: "", email: "" }); onDone();
    } catch (x) { setErr(x); }
  }
  return (
    <form className="ops-inline-form" onSubmit={(e) => void submit(e)} aria-label="Add a supplier">
      <Field label="Supplier"><input className="input" required minLength={2} maxLength={120} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="Trade"><input className="input" maxLength={80} value={f.trade} onChange={(e) => setF({ ...f, trade: e.target.value })} placeholder="Plumber" /></Field>
      <Field label="Phone"><input className="input" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
      <Field label="Email"><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
      <button className="btn">Add supplier</button>
      <ErrorNote error={err} title="Supplier not added" />
    </form>
  );
}

export function RequestPage({ id }: { id: string }) {
  const { db, organisation } = useOrg();
  const p = usePortfolio();
  const roles = useRoles();
  const m = useQuery(() => maintenance(db, organisation.id), [organisation.id]);
  const s = useQuery(() => suppliers(db, organisation.id), [organisation.id]);
  if (m.error) return <ErrorNote error={m.error} />;
  if (!m.data || !p.data) return <Loading />;
  const r = m.data.find((x) => x.id === id);
  if (!r) return <Empty>That request isn't in this account.</Empty>;
  const pr = p.data.properties.find((x) => x.id === r.property_id);
  const u = r.unit_id && p.data.units.find((x) => x.id === r.unit_id);
  const sup = s.data?.find((x) => x.id === r.supplier_id);
  return (
    <div className="stack">
      <PageHeader eyebrow={<Link to="/maintenance">Maintenance</Link>} title={<>{r.title} <span className="muted ops-ref">{r.ref}</span></>}>
        <Link to={`/properties/${r.property_id}`}>{pr?.name}</Link>{u ? ` · unit ${u.label}` : " · whole property"} · reported {dayLabel(r.reported_on)}{" "}
        {r.priority === "urgent" && <Badge tone="bad">Urgent</Badge>} <Badge tone={STATUS[r.status]?.tone ?? "neutral"}>{STATUS[r.status]?.label ?? r.status}</Badge>
      </PageHeader>
      <Card title="Details">
        <dl className="ops-dl ops-dl-wide" data-testid="request-details">
          {r.description && <div><dt>Details</dt><dd>{r.description}</dd></div>}
          <div><dt>Supplier</dt><dd>{sup ? `${sup.name}${sup.trade ? ` (${sup.trade})` : ""}` : "–"}</dd></div>
          <div><dt>Quote</dt><dd>{r.quote_cents != null ? <><Money cents={r.quote_cents} /> {r.quote_ref && <span className="muted">{r.quote_ref}</span>}</> : "–"}</dd></div>
          <div><dt>Decision</dt><dd>{r.decided_at ? `${STATUS[r.status === "declined" ? "declined" : "approved"]!.label} on ${dayLabel(r.decided_at.slice(0, 10))}` : "–"}</dd></div>
          <div><dt>Actual cost</dt><dd>{r.cost_cents != null ? <><Money cents={r.cost_cents} basis="actual" /> · finished {r.completed_on && dayLabel(r.completed_on)}</> : "–"}</dd></div>
          {r.status_note && <div><dt>Note</dt><dd>{r.status_note}</dd></div>}
        </dl>
      </Card>
      <NextStep r={r} suppliers={s.data ?? []} roles={roles} onDone={m.reload} />
      <Photos r={r} canAdd={roles.manage && OPEN.includes(r.status)} />
    </div>
  );
}

function NextStep({ r, suppliers: sups, roles, onDone }: { r: OpsMaintenance; suppliers: OpsSupplier[]; roles: ReturnType<typeof useRoles>; onDone: () => void }) {
  const { db } = useOrg();
  const [f, setF] = useState({ supplier_id: r.supplier_id ?? "", quote: "", quote_ref: "", cost: "", completed_on: saToday(), note: "" });
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  async function run(patch: Parameters<typeof updateRequest>[2]) {
    setErr(null); setBusy(true);
    try { await updateRequest(db, r.id, patch); onDone(); } catch (x) { setErr(x); } finally { setBusy(false); }
  }
  const money = (s: string) => parseRand(s);
  const canQuote = roles.manage && (r.status === "reported" || r.status === "declined");
  const canDecide = roles.approve && r.status === "quoted";
  const canStart = roles.manage && r.status === "approved";
  const canFinish = roles.manage && r.status === "in_progress";
  const canCancel = roles.manage && OPEN.includes(r.status);
  if (!canQuote && !canDecide && !canStart && !canFinish && !canCancel) {
    return r.status === "quoted" ? <p className="note note-info">Waiting for the owner or an approver to decide on the quote.</p> : null;
  }
  return (
    <Card title="Next step">
      <div className="stack" style={{ gap: 14 }}>
        {canQuote && (
          <form className="ops-inline-form" aria-label="Record the quote" onSubmit={(e) => { e.preventDefault(); const q = money(f.quote); if (q === null || q <= 0) { setErr(new Error("Write the quote as an amount.")); return; } void run({ status: "quoted", supplier_id: f.supplier_id || null, quote_cents: q, quote_ref: f.quote_ref.trim() || null }); }}>
            <Field label="Supplier">
              <select className="input" required value={f.supplier_id} onChange={(e) => setF({ ...f, supplier_id: e.target.value })}>
                <option value="">Choose (add suppliers on the Maintenance page)</option>
                {sups.filter((x) => x.active).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </Field>
            <Field label="Quote (R)"><input className="input" inputMode="decimal" required value={f.quote} onChange={(e) => setF({ ...f, quote: e.target.value })} /></Field>
            <Field label="Quote reference"><input className="input" maxLength={80} value={f.quote_ref} onChange={(e) => setF({ ...f, quote_ref: e.target.value })} /></Field>
            <button className="btn btn-primary" disabled={busy}>Record quote</button>
          </form>
        )}
        {canDecide && (
          <div className="ops-inline-form" aria-label="Decide on the quote">
            <Field label="Note (optional for approval, needed to decline)"><input className="input" maxLength={500} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
            <button className="btn btn-primary" disabled={busy} onClick={() => void run({ status: "approved", status_note: f.note.trim() || null })}>Approve quote</button>
            <button className="btn" disabled={busy} onClick={() => void run({ status: "declined", status_note: f.note.trim() })}>Decline</button>
          </div>
        )}
        {canStart && <button className="btn btn-primary" disabled={busy} onClick={() => void run({ status: "in_progress" })}>Work has started</button>}
        {canFinish && (
          <form className="ops-inline-form" aria-label="Mark done" onSubmit={(e) => { e.preventDefault(); const c = money(f.cost); if (c === null) { setErr(new Error("Write the actual cost as an amount (0 if free).")); return; } void run({ status: "done", cost_cents: c, completed_on: f.completed_on }); }}>
            <Field label="Actual cost (R)"><input className="input" inputMode="decimal" required value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} /></Field>
            <Field label="Finished on"><input className="input" type="date" required max={saToday()} value={f.completed_on} onChange={(e) => setF({ ...f, completed_on: e.target.value })} /></Field>
            <button className="btn btn-primary" disabled={busy}>Mark done</button>
          </form>
        )}
        {canCancel && (
          <form className="ops-inline-form" aria-label="Cancel the request" onSubmit={(e) => { e.preventDefault(); void run({ status: "cancelled", status_note: f.note.trim() }); }}>
            <Field label="Why cancel"><input className="input" required minLength={5} maxLength={500} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
            <button className="btn" disabled={busy}>Cancel request</button>
          </form>
        )}
        <ErrorNote error={err} title="Not saved" />
      </div>
    </Card>
  );
}

function Photos({ r, canAdd }: { r: OpsMaintenance; canAdd: boolean }) {
  const { db, organisation } = useOrg();
  const q = useQuery(async () => {
    const list = await photos(db, r.id);
    return Promise.all(list.map(async (ph) => ({ ...ph, url: await photoUrl(db, ph.path) })));
  }, [r.id]);
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  async function upload(file: File) {
    setErr(null); setBusy(true);
    try { await addPhoto(db, organisation.id, r.id, file); q.reload(); } catch (x) { setErr(x); } finally { setBusy(false); }
  }
  return (
    <Card title="Photos" subtitle="Private to this account">
      {q.error ? <ErrorNote error={q.error} /> : !q.data ? <Loading /> : q.data.length === 0 ? <Empty>No photos yet.</Empty> : (
        <div className="ops-photos" data-testid="photos">
          {q.data.map((ph) => ph.url ? <a key={ph.id} href={ph.url} target="_blank" rel="noreferrer"><img src={ph.url} alt={ph.file_name} /></a> : <span key={ph.id} className="muted">{ph.file_name}</span>)}
        </div>
      )}
      {canAdd && (
        <label className="btn ops-file" aria-disabled={busy}>
          <Camera size={15} aria-hidden /> Add a photo
          <input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Add a photo" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
        </label>
      )}
      <ErrorNote error={err} title="Photo not added" />
    </Card>
  );
}
