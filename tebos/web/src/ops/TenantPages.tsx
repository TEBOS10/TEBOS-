// Tenants: contact details (no ID numbers in Release 1: data minimisation) and their lease history.
import { useState, type FormEvent } from "react";
import { saToday } from "@core/opsLedger";
import { Badge, Card, Empty, ErrorNote, Field, Loading, PageHeader } from "../components/ui";
import { addTenant } from "../lib/opsData";
import { Link } from "../lib/router";
import { useOrg } from "../lib/session";
import { Money, dayLabel, leaseCovers, usePortfolio, useRoles } from "./util";

export function TenantsPage() {
  const p = usePortfolio();
  const roles = useRoles();
  const today = saToday();
  const [q, setQ] = useState("");
  if (p.error) return <ErrorNote error={p.error} />;
  if (!p.data) return <Loading />;
  const { tenants, leases, units } = p.data;
  const shown = tenants.filter((t) => t.full_name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="stack">
      <PageHeader title="Tenants">Everyone who rents from you, where they live, and their history.</PageHeader>
      <input className="input ops-search" type="search" aria-label="Search tenants" placeholder="Search by name" value={q} onChange={(e) => setQ(e.target.value)} />
      {shown.length === 0 ? <Empty>{tenants.length ? "No tenant matches." : "No tenants yet. Start a lease from a vacant unit, or add a tenant below."}</Empty> : (
        <div className="ops-table-wrap">
          <table className="ops-table" data-testid="tenants">
            <thead><tr><th>Name</th><th>Contact</th><th>Lives in</th></tr></thead>
            <tbody>
              {shown.map((t) => {
                const now = leases.find((l) => l.tenant_id === t.id && leaseCovers(l, today));
                const unit = now && units.find((u) => u.id === now.unit_id);
                return (
                  <tr key={t.id}>
                    <td data-label="Name"><Link to={`/tenants/${t.id}`}>{t.full_name}</Link></td>
                    <td data-label="Contact" className="muted">{[t.email, t.phone].filter(Boolean).join(" · ") || "–"}</td>
                    <td data-label="Lives in">{now ? <Link to={`/leases/${now.id}`}>{unit?.label} <span className="muted">{now.ref}</span></Link> : <span className="muted">No current lease</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {roles.manage && <Card title="Add a tenant"><NewTenantForm onDone={() => p.reload()} /></Card>}
    </div>
  );
}

export function NewTenantForm({ onDone }: { onDone: (id: string) => void }) {
  const { db, organisation } = useOrg();
  const [f, setF] = useState({ full_name: "", email: "", phone: "" });
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(null); setBusy(true);
    try {
      const t = await addTenant(db, { org_id: organisation.id, full_name: f.full_name.trim(), email: f.email.trim() || null, phone: f.phone.trim() || null });
      setF({ full_name: "", email: "", phone: "" });
      onDone(t.id);
    } catch (x) { setErr(x); } finally { setBusy(false); }
  }
  return (
    <form className="form ops-form" onSubmit={(e) => void submit(e)} aria-label="Add a tenant">
      <Field label="Full name"><input className="input" required minLength={2} maxLength={120} value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
      <div className="ops-row">
        <Field label="Email"><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Phone"><input className="input" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
      </div>
      <p className="muted ops-small">Only what you need to run the tenancy. No ID numbers here: keep identity documents with your lease file.</p>
      <ErrorNote error={err} title="Tenant not added" />
      <button className="btn btn-primary" disabled={busy}>Add tenant</button>
    </form>
  );
}

export function TenantPage({ id }: { id: string }) {
  const p = usePortfolio();
  const today = saToday();
  if (p.error) return <ErrorNote error={p.error} />;
  if (!p.data) return <Loading />;
  const t = p.data.tenants.find((x) => x.id === id);
  if (!t) return <Empty>That tenant isn't in this account.</Empty>;
  const history = p.data.leases.filter((l) => l.tenant_id === id);
  return (
    <div className="stack">
      <PageHeader eyebrow={<Link to="/tenants">Tenants</Link>} title={t.full_name}>{[t.email, t.phone].filter(Boolean).join(" · ") || "No contact details recorded"}</PageHeader>
      <Card title="Leases" subtitle="Every lease this tenant has had">
        {history.length === 0 ? <Empty>No leases yet.</Empty> : (
          <ul className="ops-list" data-testid="tenant-leases">
            {history.map((l) => {
              const u = p.data!.units.find((x) => x.id === l.unit_id);
              const pr = u && p.data!.properties.find((x) => x.id === u.property_id);
              return (
                <li key={l.id}>
                  <Link to={`/leases/${l.id}`}>{l.ref} · {pr?.name} {u?.label}</Link>
                  <span>{leaseCovers(l, today) ? <Badge tone="good">Current</Badge> : <Badge tone="neutral">{l.status === "ended" ? "Ended" : "Not started"}</Badge>} <span className="muted">{dayLabel(l.starts_on)}{l.ended_on ? ` – ${dayLabel(l.ended_on)}` : ""}</span> <Money cents={l.rent_cents} /></span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
