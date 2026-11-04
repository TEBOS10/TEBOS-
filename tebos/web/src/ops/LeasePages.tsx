// A lease: starting one on a vacant unit, and its record: the tenant's statement (rent account and deposit account
// apart), recording payments, charges, credits and deposit refunds, correcting by reversal, and ending the lease.
import { Download } from "lucide-react";
import { useState, type FormEvent } from "react";
import { CHARGE_CATEGORIES, PAYMENT_METHODS, parseRand, position, saToday, signed, statement, toCsv, type Account, type Entry } from "@core/opsLedger";
import { Badge, Card, Empty, ErrorNote, Field, Loading, PageHeader } from "../components/ui";
import { addEntry, addLease, endLease, ledger, reverseEntry, type OpsEntry } from "../lib/opsData";
import { Link, navigate } from "../lib/router";
import { useOrg } from "../lib/session";
import { useQuery } from "../lib/useQuery";
import { NewTenantForm } from "./TenantPages";
import { Money, dayLabel, downloadCsv, leaseCovers, usePortfolio, useRoles } from "./util";

export function NewLeasePage({ unitId }: { unitId: string }) {
  const { db, organisation } = useOrg();
  const p = usePortfolio();
  const [f, setF] = useState({ tenant_id: "", starts_on: saToday(), ends_on: "", rent: "", due_day: "1", deposit: "", deposit_held_at: "" });
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  if (p.error) return <ErrorNote error={p.error} />;
  if (!p.data) return <Loading />;
  const unit = p.data.units.find((u) => u.id === unitId);
  if (!unit) return <Empty>That unit isn't in this account.</Empty>;
  const prop = p.data.properties.find((x) => x.id === unit.property_id);
  const rentDefault = unit.market_rent_cents != null ? String(unit.market_rent_cents / 100) : "";

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(null);
    const rent = parseRand(f.rent || rentDefault);
    const deposit = f.deposit.trim() ? parseRand(f.deposit) : 0;
    if (!f.tenant_id) { setErr(new Error("Choose the tenant, or add them first.")); return; }
    if (rent === null || rent <= 0) { setErr(new Error("Write the monthly rent as an amount, e.g. 6 500.")); return; }
    if (deposit === null) { setErr(new Error("Write the deposit as an amount, or leave it empty.")); return; }
    setBusy(true);
    try {
      const l = await addLease(db, { org_id: organisation.id, unit_id: unitId, tenant_id: f.tenant_id, starts_on: f.starts_on, ends_on: f.ends_on || null,
        rent_cents: rent, due_day: Number(f.due_day), deposit_cents: deposit, deposit_held_at: f.deposit_held_at.trim() || null });
      p.reload();
      navigate(`/leases/${l.id}`);
    } catch (x) { setErr(x); } finally { setBusy(false); }
  }
  return (
    <div className="stack">
      <PageHeader eyebrow={<Link to={`/properties/${unit.property_id}`}>{prop?.name}</Link>} title={`Start a lease: unit ${unit.label}`}>
        The lease gets a payment reference for the tenant to use on every EFT, so payments match themselves.
      </PageHeader>
      <Card title="Lease">
        <form className="form ops-form" onSubmit={(e) => void submit(e)} aria-label="Start a lease">
          <Field label="Tenant">
            <select className="input" required value={f.tenant_id} onChange={(e) => setF({ ...f, tenant_id: e.target.value })}>
              <option value="">Choose a tenant</option>
              {p.data.tenants.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
            </select>
          </Field>
          <div className="ops-row">
            <Field label="Starts on"><input className="input" type="date" required value={f.starts_on} onChange={(e) => setF({ ...f, starts_on: e.target.value })} /></Field>
            <Field label="Fixed term ends on" hint="Leave empty for month-to-month"><input className="input" type="date" value={f.ends_on} onChange={(e) => setF({ ...f, ends_on: e.target.value })} /></Field>
          </div>
          <div className="ops-row">
            <Field label="Monthly rent (R)"><input className="input" inputMode="decimal" required value={f.rent || rentDefault} onChange={(e) => setF({ ...f, rent: e.target.value })} /></Field>
            <Field label="Rent due on day">
              <select className="input" value={f.due_day} onChange={(e) => setF({ ...f, due_day: e.target.value })}>
                {Array.from({ length: 28 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
              </select>
            </Field>
          </div>
          <div className="ops-row">
            <Field label="Deposit agreed (R)"><input className="input" inputMode="decimal" value={f.deposit} onChange={(e) => setF({ ...f, deposit: e.target.value })} /></Field>
            <Field label="Deposit held at" hint="Bank and account name; never the account number. The law requires an interest-bearing account.">
              <input className="input" maxLength={120} value={f.deposit_held_at} onChange={(e) => setF({ ...f, deposit_held_at: e.target.value })} placeholder="e.g. FNB savings, deposits account" />
            </Field>
          </div>
          <ErrorNote error={err} title="Lease not started" />
          <button className="btn btn-primary" disabled={busy}>Start lease</button>
        </form>
      </Card>
      <Card title="New tenant?" subtitle="Add them here, then choose them above">
        <NewTenantForm onDone={(id) => { p.reload(); setF((x) => ({ ...x, tenant_id: id })); }} />
      </Card>
    </div>
  );
}

const label = (e: OpsEntry) => {
  if (e.kind === "charge") return CHARGE_CATEGORIES.find((c) => c.key === e.category)?.label ?? "Charge";
  if (e.kind === "payment") return `Payment · ${PAYMENT_METHODS.find((m) => m.key === e.method)?.label ?? ""}`;
  if (e.kind === "credit") return "Credit";
  if (e.kind === "refund") return "Deposit refund";
  return "Reversal";
};

export function LeasePage({ id }: { id: string }) {
  const { db } = useOrg();
  const p = usePortfolio();
  const roles = useRoles();
  const entries = useQuery(() => ledger(db, id), [id]);
  if (p.error) return <ErrorNote error={p.error} />;
  if (!p.data) return <Loading />;
  const lease = p.data.leases.find((l) => l.id === id);
  if (!lease) return <Empty>That lease isn't in this account.</Empty>;
  const unit = p.data.units.find((u) => u.id === lease.unit_id);
  const prop = unit && p.data.properties.find((x) => x.id === unit.property_id);
  const tenant = p.data.tenants.find((t) => t.id === lease.tenant_id);
  const today = saToday();
  const pos = entries.data ? position(entries.data as Entry[], today) : null;
  const reload = () => { entries.reload(); p.reload(); };

  function exportStatement() {
    if (!entries.data) return;
    const rows: Array<Array<string | number | null>> = [["Account", "Date", "Entry", "Reference", "Note", "Amount (R)", "Running (R)", "Reversed"]];
    for (const acct of ["rent", "deposit"] as Account[]) {
      for (const r of statement(entries.data as Array<OpsEntry & Entry>, acct)) {
        rows.push([acct, r.effective_on, label(r), r.reference, r.note, (r.amount_cents / 100).toFixed(2), (r.running_cents / 100).toFixed(2), r.reversed ? "yes" : ""]);
      }
    }
    downloadCsv(`statement-${lease!.ref}-${today}.csv`, toCsv(rows));
  }

  return (
    <div className="stack">
      <PageHeader eyebrow={<Link to={`/properties/${prop?.id}`}>{prop?.name} · unit {unit?.label}</Link>}
        title={<>{tenant?.full_name} <span className="muted ops-ref">{lease.ref}</span></>}
        actions={<button className="btn" onClick={exportStatement} disabled={!entries.data}><Download size={15} aria-hidden /> Statement (CSV)</button>}>
        {leaseCovers(lease, today) ? <Badge tone="good">Current</Badge> : <Badge tone="neutral">{lease.status === "ended" ? "Ended" : "Not started"}</Badge>}{" "}
        From {dayLabel(lease.starts_on)}{lease.ends_on ? ` to ${dayLabel(lease.ends_on)}` : ", month to month"}{lease.ended_on ? `; ended ${dayLabel(lease.ended_on)} (${lease.end_reason})` : ""}.
        {" "}<Money cents={lease.rent_cents} /> due on day {lease.due_day}. Tenant's payment reference: <strong className="mono">{lease.ref}</strong>.
      </PageHeader>

      {entries.error ? <ErrorNote error={entries.error} /> : !entries.data || !pos ? <Loading /> : (
        <>
          <section className="ops-kpis" aria-label="This lease" data-testid="lease-position">
            <div className="ops-kpi"><span className="ops-kpi-label">Balance</span><span className="ops-kpi-value"><Money cents={pos.balance_cents} basis="owed" /></span><span className="ops-kpi-basis">{pos.balance_cents < 0 ? "in credit" : "owed today"}</span></div>
            <div className={`ops-kpi ${pos.overdue_cents > 0 ? "warn" : ""}`}><span className="ops-kpi-label">Overdue</span><span className="ops-kpi-value"><Money cents={pos.overdue_cents} basis="owed" /></span><span className="ops-kpi-basis">{pos.d90_plus > 0 ? "some over 90 days" : pos.d61_90 > 0 ? "some over 60 days" : pos.d31_60 > 0 ? "some over 30 days" : "within 30 days"}</span></div>
            <div className="ops-kpi"><span className="ops-kpi-label">Deposit held</span><span className="ops-kpi-value"><Money cents={pos.deposit_held_cents} basis="held" /></span><span className="ops-kpi-basis">of <Money cents={lease.deposit_cents} /> agreed{lease.deposit_held_at ? ` · ${lease.deposit_held_at}` : ""}</span></div>
            <div className="ops-kpi"><span className="ops-kpi-label">Last payment</span><span className="ops-kpi-value">{pos.last_payment_on ? dayLabel(pos.last_payment_on) : "–"}</span><span className="ops-kpi-basis">rent account</span></div>
          </section>

          {roles.manage && lease.status === "active" && <RecordEntry leaseId={id} orgId={lease.org_id} leaseRef={lease.ref} onDone={reload} />}

          <Statement title="Rent account" subtitle="What the tenant owes: charges less payments and credits" entries={entries.data} account="rent" canReverse={roles.manage} onDone={reload} />
          <Statement title="Deposit account" subtitle="Held for the tenant; never income" entries={entries.data} account="deposit" canReverse={roles.manage} onDone={reload} />

          {roles.manage && lease.status === "active" && <EndLease leaseId={id} startsOn={lease.starts_on} onDone={reload} />}
        </>
      )}
    </div>
  );
}

function RecordEntry({ leaseId, orgId, leaseRef, onDone }: { leaseId: string; orgId: string; leaseRef: string; onDone: () => void }) {
  const { db } = useOrg();
  const [kind, setKind] = useState<"payment" | "charge" | "credit" | "refund">("payment");
  const [f, setF] = useState({ account: "rent" as Account, category: "utilities", method: "eft", amount: "", effective_on: saToday(), reference: "", note: "" });
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(null); setDone(null);
    const cents = parseRand(f.amount);
    if (cents === null || cents <= 0) { setErr(new Error("Write the amount, e.g. 6 500 or 6500,00.")); return; }
    if (kind === "credit" && f.note.trim().length < 3) { setErr(new Error("Say what the credit is for.")); return; }
    setBusy(true);
    try {
      const account: Account = kind === "refund" ? "deposit" : kind === "credit" ? "rent" : kind === "charge" ? (f.category === "deposit" ? "deposit" : "rent") : f.account;
      await addEntry(db, { org_id: orgId, lease_id: leaseId, kind, account, amount_cents: cents, effective_on: f.effective_on,
        category: kind === "charge" ? f.category : null, method: kind === "payment" ? f.method : null,
        period: null, reference: f.reference.trim() || null, note: f.note.trim() || null });
      setDone("Recorded.");
      setF({ ...f, amount: "", reference: "", note: "" });
      onDone();
    } catch (x) { setErr(x); } finally { setBusy(false); }
  }
  return (
    <Card title="Record" subtitle="Payments that arrived, other charges, credits and deposit refunds. Monthly rent is charged from the overview.">
      <div className="ops-tabs" role="tablist" aria-label="What to record">
        {(["payment", "charge", "credit", "refund"] as const).map((k) => (
          <button key={k} role="tab" aria-selected={kind === k} className={`btn btn-sm ${kind === k ? "btn-primary" : ""}`} onClick={() => setKind(k)} type="button">
            {k === "payment" ? "Payment" : k === "charge" ? "Charge" : k === "credit" ? "Credit" : "Deposit refund"}
          </button>
        ))}
      </div>
      <form className="form ops-form" onSubmit={(e) => void submit(e)} aria-label={`Record a ${kind}`}>
        <div className="ops-row">
          <Field label="Amount (R)"><input className="input" inputMode="decimal" required value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
          <Field label={kind === "payment" ? "Date received" : "Date"}><input className="input" type="date" required value={f.effective_on} max={kind === "payment" ? saToday() : undefined} onChange={(e) => setF({ ...f, effective_on: e.target.value })} /></Field>
        </div>
        {kind === "payment" && (
          <div className="ops-row">
            <Field label="Method">
              <select className="input" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>
                {PAYMENT_METHODS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
            </Field>
            <Field label="Towards">
              <select className="input" value={f.account} onChange={(e) => setF({ ...f, account: e.target.value as Account })}>
                <option value="rent">Rent and charges</option><option value="deposit">The deposit</option>
              </select>
            </Field>
            <Field label="Bank reference"><input className="input" maxLength={80} value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} placeholder={leaseRef} /></Field>
          </div>
        )}
        {kind === "charge" && (
          <Field label="For">
            <select className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
              {CHARGE_CATEGORIES.filter((c) => c.key !== "rent").map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </Field>
        )}
        <Field label={kind === "credit" ? "What the credit is for" : "Note"}><input className="input" maxLength={300} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        <ErrorNote error={err} title="Not recorded" />
        {done && <p className="note note-good" role="status">{done}</p>}
        <button className="btn btn-primary" disabled={busy}>Record {kind === "refund" ? "refund" : kind}</button>
      </form>
    </Card>
  );
}

function Statement({ title, subtitle, entries, account, canReverse, onDone }: { title: string; subtitle: string; entries: OpsEntry[]; account: Account; canReverse: boolean; onDone: () => void }) {
  const rows = statement(entries as Array<OpsEntry & Entry>, account);
  const byId = new Map((entries as Entry[]).map((e) => [e.id, e]));
  return (
    <Card title={title} subtitle={subtitle}>
      {rows.length === 0 ? <Empty>Nothing recorded yet.</Empty> : (
        <div className="ops-table-wrap">
          <table className="ops-table" data-testid={`statement-${account}`}>
            <thead><tr><th>Date</th><th>Entry</th><th>Reference / note</th><th className="num">Amount</th><th className="num">{account === "rent" ? "Owed" : "Held"}</th><th></th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={r.reversed || r.kind === "reversal" ? "ops-struck" : ""}>
                  <td data-label="Date">{dayLabel(r.effective_on)}</td>
                  <td data-label="Entry">{label(r)}{r.reversed && <Badge tone="neutral">reversed</Badge>}</td>
                  <td data-label="Reference" className="muted">{[r.reference, r.note].filter(Boolean).join(" · ")}</td>
                  <td data-label="Amount" className="num">{r.kind === "charge" && r.account === "deposit" ? <><Money cents={r.amount_cents} /> <span className="muted">agreed</span></> : <Money cents={signed(r, byId)} />}</td>
                  <td data-label={account === "rent" ? "Owed" : "Held"} className="num"><Money cents={r.running_cents} /></td>
                  <td className="ops-actions">{canReverse && !r.reversed && r.kind !== "reversal" && <Reverse entry={r} onDone={onDone} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function Reverse({ entry, onDone }: { entry: OpsEntry; onDone: () => void }) {
  const { db } = useOrg();
  const [err, setErr] = useState<unknown>(null);
  async function go() {
    const reason = window.prompt("Why is this entry being reversed? (kept on the record)");
    if (!reason) return;
    if (reason.trim().length < 5) { setErr(new Error("Give a reason of at least a few words.")); return; }
    setErr(null);
    try { await reverseEntry(db, entry, saToday(), reason); onDone(); } catch (x) { setErr(x); }
  }
  return <><button type="button" className="btn btn-sm" onClick={() => void go()}>Reverse</button><ErrorNote error={err} /></>;
}

function EndLease({ leaseId, startsOn, onDone }: { leaseId: string; startsOn: string; onDone: () => void }) {
  const { db } = useOrg();
  const [f, setF] = useState({ ended_on: saToday(), reason: "" });
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(null); setBusy(true);
    try { await endLease(db, leaseId, f.ended_on, f.reason); onDone(); } catch (x) { setErr(x); } finally { setBusy(false); }
  }
  return (
    <Card title="End the lease" subtitle="The record stays; the unit becomes vacant after the last day">
      <form className="ops-inline-form" onSubmit={(e) => void submit(e)} aria-label="End the lease">
        <Field label="Last day"><input className="input" type="date" required min={startsOn} value={f.ended_on} onChange={(e) => setF({ ...f, ended_on: e.target.value })} /></Field>
        <Field label="Why"><input className="input" required minLength={5} maxLength={300} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="e.g. Tenant gave notice" /></Field>
        <button className="btn" disabled={busy}>End lease</button>
        <ErrorNote error={err} title="Not ended" />
      </form>
    </Card>
  );
}
