// Properties and their units. Occupancy is shown from leases (never typed); a unit can be held back with a reason.
// The monthly performance report is printable and labels every figure's basis.
import { Printer } from "lucide-react";
import { useState, type FormEvent } from "react";
import { PROVINCES, UNIT_TYPES, parseRand, saToday } from "@core/opsLedger";
import { Badge, Card, Empty, ErrorNote, Field, Loading, PageHeader } from "../components/ui";
import { addProperty, addUnit, maintenance, monthSummary, updateUnit, type OpsUnit } from "../lib/opsData";
import { Link, navigate } from "../lib/router";
import { useOrg } from "../lib/session";
import { useQuery } from "../lib/useQuery";
import { BASIS_LABEL, Money, dayLabel, leaseCovers, monthLabel, thisMonth, usePortfolio, useRoles } from "./util";

const unitType = (k: string) => UNIT_TYPES.find((u) => u.key === k)?.label ?? k;

export function PropertiesPage() {
  const p = usePortfolio();
  const roles = useRoles();
  const today = saToday();
  if (p.error) return <ErrorNote error={p.error} title="Couldn't load properties" />;
  if (!p.data) return <Loading />;
  const { properties, units, leases } = p.data;
  return (
    <div className="stack">
      <PageHeader title="Properties">Each property's units, who lives where, and what each unit is worth a month.</PageHeader>
      {properties.length === 0 ? <Empty>No properties yet.</Empty> : (
        <div className="ops-cards" data-testid="properties">
          {properties.map((pr) => {
            const us = units.filter((u) => u.property_id === pr.id);
            const let_ = us.filter((u) => leases.some((l) => l.unit_id === u.id && leaseCovers(l, today))).length;
            return (
              <Link key={pr.id} to={`/properties/${pr.id}`} className="ops-card-link">
                <span className="ops-card-title">{pr.name}</span>
                <span className="muted">{[pr.street, pr.suburb, pr.city].filter(Boolean).join(", ")}</span>
                <span className="ops-card-meta">{us.length} unit{us.length === 1 ? "" : "s"} · {let_} let · {us.length - let_} not let</span>
              </Link>
            );
          })}
        </div>
      )}
      {roles.manage && <NewProperty onDone={(id) => { p.reload(); navigate(`/properties/${id}`); }} />}
    </div>
  );
}

function NewProperty({ onDone }: { onDone: (id: string) => void }) {
  const { db, organisation } = useOrg();
  const [f, setF] = useState({ name: "", street: "", suburb: "", city: "", province: "Gauteng", postal_code: "", kind: "residential" });
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(null); setBusy(true);
    try {
      const row = await addProperty(db, { org_id: organisation.id, name: f.name.trim(), street: f.street.trim() || null, suburb: f.suburb.trim() || null,
        city: f.city.trim(), province: f.province || null, postal_code: f.postal_code.trim() || null, kind: f.kind });
      onDone(row.id);
    } catch (x) { setErr(x); } finally { setBusy(false); }
  }
  return (
    <Card title="Add a property">
      <form className="form ops-form" onSubmit={(e) => void submit(e)} aria-label="Add a property">
        <Field label="Name"><input className="input" required minLength={2} maxLength={120} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Esselen Court" /></Field>
        <div className="ops-row">
          <Field label="Street"><input className="input" maxLength={160} value={f.street} onChange={(e) => setF({ ...f, street: e.target.value })} /></Field>
          <Field label="Suburb"><input className="input" maxLength={80} value={f.suburb} onChange={(e) => setF({ ...f, suburb: e.target.value })} /></Field>
        </div>
        <div className="ops-row">
          <Field label="City or town"><input className="input" required minLength={2} maxLength={80} value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></Field>
          <Field label="Province">
            <select className="input" value={f.province} onChange={(e) => setF({ ...f, province: e.target.value })}>
              {PROVINCES.map((pv) => <option key={pv}>{pv}</option>)}
            </select>
          </Field>
          <Field label="Postal code"><input className="input" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={f.postal_code} onChange={(e) => setF({ ...f, postal_code: e.target.value })} /></Field>
        </div>
        <Field label="Kind">
          <select className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
            <option value="residential">Residential</option><option value="commercial">Commercial</option><option value="mixed">Mixed use</option>
          </select>
        </Field>
        <ErrorNote error={err} title="Not added" />
        <button className="btn btn-primary" disabled={busy}>Add property</button>
      </form>
    </Card>
  );
}

export function PropertyPage({ id }: { id: string }) {
  const { db, organisation } = useOrg();
  const p = usePortfolio();
  const roles = useRoles();
  const m = useQuery(() => maintenance(db, organisation.id), [organisation.id]);
  const today = saToday();
  if (p.error) return <ErrorNote error={p.error} />;
  if (!p.data) return <Loading />;
  const prop = p.data.properties.find((x) => x.id === id);
  if (!prop) return <Empty>That property isn't in this account.</Empty>;
  const units = p.data.units.filter((u) => u.property_id === id);
  const history = (m.data ?? []).filter((r) => r.property_id === id);
  return (
    <div className="stack">
      <PageHeader eyebrow={<Link to="/properties">Properties</Link>} title={prop.name}
        actions={<Link className="btn" to={`/properties/${id}/report/${thisMonth()}`}><Printer size={15} aria-hidden /> Monthly report</Link>}>
        {[prop.street, prop.suburb, prop.city, prop.province, prop.postal_code].filter(Boolean).join(", ")}
      </PageHeader>
      <Card title="Units" subtitle="Let or vacant comes from leases; market rent is what a vacant unit should earn">
        {units.length === 0 ? <Empty>No units yet: add the first below.</Empty> : (
          <div className="ops-table-wrap">
            <table className="ops-table" data-testid="units">
              <thead><tr><th>Unit</th><th>Type</th><th>Status</th><th className="num">Rent</th><th></th></tr></thead>
              <tbody>
                {units.map((u) => {
                  const lease = p.data!.leases.find((l) => l.unit_id === u.id && leaseCovers(l, today));
                  const tenant = lease && p.data!.tenants.find((t) => t.id === lease.tenant_id);
                  return (
                    <tr key={u.id}>
                      <td data-label="Unit"><strong>{u.label}</strong></td>
                      <td data-label="Type">{unitType(u.unit_type)}</td>
                      <td data-label="Status">
                        {lease ? <><Badge tone="good">Let</Badge> <Link to={`/leases/${lease.id}`}>{tenant?.full_name}</Link> <span className="muted">{lease.ref}</span></>
                          : u.held_back ? <><Badge tone="neutral">Held back</Badge> <span className="muted">{u.held_back_reason}</span></>
                          : <Badge tone="warn">Vacant</Badge>}
                      </td>
                      <td data-label="Rent" className="num">
                        {lease ? <Money cents={lease.rent_cents} /> : u.market_rent_cents != null ? <span title={BASIS_LABEL.estimated}><Money cents={u.market_rent_cents} basis="estimated" /> <span className="muted">market</span></span> : <span className="muted">–</span>}
                      </td>
                      <td className="ops-actions">
                        {roles.manage && !lease && !u.held_back && <Link className="btn btn-sm btn-primary" to={`/leases/new/${u.id}`}>Start a lease</Link>}
                        {roles.manage && !lease && <HoldBack unit={u} onDone={p.reload} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {roles.manage && <NewUnit propertyId={id} onDone={p.reload} />}
      </Card>
      <Card title="Maintenance history">
        {m.error ? <ErrorNote error={m.error} /> : !m.data ? <Loading /> : history.length === 0 ? <Empty>No maintenance recorded.</Empty> : (
          <ul className="ops-list">
            {history.map((r) => (
              <li key={r.id}>
                <Link to={`/maintenance/${r.id}`}>{r.ref} · {r.title}</Link>
                <span className="muted">{r.status.replace("_", " ")} · {dayLabel(r.reported_on)}{r.cost_cents != null ? " · " : ""}{r.cost_cents != null && <Money cents={r.cost_cents} basis="actual" />}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function NewUnit({ propertyId, onDone }: { propertyId: string; onDone: () => void }) {
  const { db, organisation } = useOrg();
  const [f, setF] = useState({ label: "", unit_type: "one_bed", rent: "" });
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(null);
    const cents = f.rent.trim() ? parseRand(f.rent) : null;
    if (f.rent.trim() && cents === null) { setErr(new Error("Write the market rent as an amount, e.g. 6 500 or 6500,00.")); return; }
    setBusy(true);
    try {
      await addUnit(db, { org_id: organisation.id, property_id: propertyId, label: f.label.trim(), unit_type: f.unit_type, market_rent_cents: cents });
      setF({ label: "", unit_type: f.unit_type, rent: "" });
      onDone();
    } catch (x) { setErr(x); } finally { setBusy(false); }
  }
  return (
    <form className="ops-inline-form" onSubmit={(e) => void submit(e)} aria-label="Add a unit">
      <Field label="Unit"><input className="input" required maxLength={40} value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="e.g. 4B" /></Field>
      <Field label="Type">
        <select className="input" value={f.unit_type} onChange={(e) => setF({ ...f, unit_type: e.target.value })}>
          {UNIT_TYPES.map((u) => <option key={u.key} value={u.key}>{u.label}</option>)}
        </select>
      </Field>
      <Field label="Market rent (R)"><input className="input" inputMode="decimal" value={f.rent} onChange={(e) => setF({ ...f, rent: e.target.value })} placeholder="6 500" /></Field>
      <button className="btn" disabled={busy}>Add unit</button>
      <ErrorNote error={err} title="Unit not added" />
    </form>
  );
}

function HoldBack({ unit, onDone }: { unit: OpsUnit; onDone: () => void }) {
  const { db } = useOrg();
  const [err, setErr] = useState<unknown>(null);
  async function toggle() {
    setErr(null);
    try {
      if (unit.held_back) await updateUnit(db, unit.id, { held_back: false, held_back_reason: null });
      else {
        const reason = window.prompt("Why is this unit off the market? (e.g. being renovated)");
        if (!reason || reason.trim().length < 3) return;
        await updateUnit(db, unit.id, { held_back: true, held_back_reason: reason.trim() });
      }
      onDone();
    } catch (x) { setErr(x); }
  }
  return <><button type="button" className="btn btn-sm" onClick={() => void toggle()}>{unit.held_back ? "Back on the market" : "Hold back"}</button><ErrorNote error={err} /></>;
}

export function PropertyReportPage({ id, month }: { id: string; month: string }) {
  const { db, organisation } = useOrg();
  const p = usePortfolio();
  const s = useQuery(() => monthSummary(db, organisation.id, month, id), [organisation.id, month, id]);
  const prop = p.data?.properties.find((x) => x.id === id);
  if (s.error) return <ErrorNote error={s.error} />;
  if (!s.data || !p.data) return <Loading />;
  if (!prop) return <Empty>That property isn't in this account.</Empty>;
  const d = s.data;
  const rows: Array<[string, number, keyof typeof BASIS_LABEL]> = [
    ["Expected rent (from leases)", d.expected_cents, "expected"],
    ["Billed (rent charged)", d.billed_cents, "billed"],
    ["Received (payments recorded)", d.received_cents, "received"],
    ["Outstanding now", d.outstanding_cents, "owed"],
    ["of which overdue", d.overdue_cents, "owed"],
    ["Maintenance spend (completed this month)", d.maintenance_spend_cents, "actual"],
    ["Net of maintenance (received − spend)", d.received_cents - d.maintenance_spend_cents, "actual"],
    ["Vacancy (market rent of vacant units, estimated)", d.vacancy_estimate_cents, "estimated"],
    ["Deposits held (not income)", d.deposits_held_cents, "held"],
  ];
  return (
    <div className="stack ops-report" data-testid="report">
      <div className="no-print ops-cluster ops-spread">
        <Link to={`/properties/${id}`}>← {prop.name}</Link>
        <button className="btn" onClick={() => window.print()}><Printer size={15} aria-hidden /> Print or save as PDF</button>
      </div>
      <header>
        <p className="eyebrow">{organisation.name} · Monthly property performance</p>
        <h1 className="page-title">{prop.name}: {monthLabel(month)}</h1>
        <p className="muted">{[prop.street, prop.suburb, prop.city].filter(Boolean).join(", ")} · figures as at {d.as_of}</p>
      </header>
      <table className="ops-table ops-report-table">
        <tbody>
          {rows.map(([label, cents, basis]) => (
            <tr key={label}><td>{label}</td><td className="num"><Money cents={cents} basis={basis} /></td><td className="muted ops-small">{basis}</td></tr>
          ))}
        </tbody>
      </table>
      <table className="ops-table">
        <tbody>
          <tr><td>Units</td><td className="num">{d.units}</td></tr>
          <tr><td>Let / vacant / held back</td><td className="num">{d.occupied} / {d.vacant} / {d.held_back}</td></tr>
          <tr><td>Occupancy</td><td className="num">{d.units ? `${Math.round((d.occupied * 100) / d.units)}%` : "–"}</td></tr>
          <tr><td>Maintenance requests open</td><td className="num">{d.maintenance_open}</td></tr>
        </tbody>
      </table>
      <p className="muted ops-small">Expected comes from the leases; billed from rent charged; received from payments recorded; estimated from the market rent of vacant units. Deposits are held for tenants and never counted as income. Tidy Property Operations records payments; it does not hold or move money.</p>
    </div>
  );
}
