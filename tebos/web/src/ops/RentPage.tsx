// Rent and arrears: who owes what and for how long (oldest charge settled first), the month's payments for
// reconciliation, and importing payments from a bank statement: preview first, import only what the person confirms.
import { ChevronLeft, ChevronRight, Download, Upload } from "lucide-react";
import { useState } from "react";
import { PAYMENT_METHODS, matchReference, parsePaymentsCsv, toCsv, type ImportLine, type ImportProblem } from "@core/opsLedger";
import { Card, Empty, ErrorNote, Loading, PageHeader } from "../components/ui";
import { addEntry, ledgerBetween, positions } from "../lib/opsData";
import { Link } from "../lib/router";
import { useOrg } from "../lib/session";
import { useQuery } from "../lib/useQuery";
import { Money, dayLabel, downloadCsv, monthLabel, nextMonth, prevMonth, thisMonth, usePortfolio, useRoles } from "./util";

export function RentPage() {
  const { db, organisation } = useOrg();
  const p = usePortfolio();
  const roles = useRoles();
  const pos = useQuery(() => positions(db, organisation.id), [organisation.id]);
  const [month, setMonth] = useState(thisMonth());
  const pays = useQuery(() => ledgerBetween(db, organisation.id, month, nextMonth(month)), [organisation.id, month]);
  if (p.error) return <ErrorNote error={p.error} />;
  if (!p.data) return <Loading />;
  const { leases, tenants, units, properties } = p.data;
  const who = (leaseId: string) => {
    const l = leases.find((x) => x.id === leaseId);
    const t = l && tenants.find((x) => x.id === l.tenant_id);
    const u = l && units.find((x) => x.id === l.unit_id);
    const pr = u && properties.find((x) => x.id === u.property_id);
    return { lease: l, tenant: t?.full_name ?? "–", place: `${pr?.name ?? ""} ${u?.label ?? ""}`.trim() };
  };
  const owing = (pos.data ?? []).filter((x) => x.balance_cents !== 0 || x.overdue_cents > 0).sort((a, b) => b.overdue_cents - a.overdue_cents || b.balance_cents - a.balance_cents);
  const reversed = new Set((pays.data ?? []).filter((e) => e.kind === "reversal").map((e) => e.reverses_id));
  const payments = (pays.data ?? []).filter((e) => e.kind === "payment" && !reversed.has(e.id));
  const byMethod = PAYMENT_METHODS.map((m) => ({ ...m, cents: payments.filter((e) => e.method === m.key && e.account === "rent").reduce((s, e) => s + e.amount_cents, 0) })).filter((m) => m.cents > 0);
  const totalRent = payments.filter((e) => e.account === "rent").reduce((s, e) => s + e.amount_cents, 0);
  const totalDeposit = payments.filter((e) => e.account === "deposit").reduce((s, e) => s + e.amount_cents, 0);

  function exportArrears() {
    const rows: Array<Array<string | number | null>> = [["Lease", "Tenant", "Unit", "Balance (R)", "Overdue (R)", "1-30", "31-60", "61-90", "90+", "Last payment"]];
    for (const x of owing) {
      const w = who(x.lease_id);
      rows.push([w.lease?.ref ?? "", w.tenant, w.place, x.balance_cents / 100, x.overdue_cents / 100, x.d1_30 / 100, x.d31_60 / 100, x.d61_90 / 100, x.d90_plus / 100, x.last_payment_on]);
    }
    downloadCsv(`arrears-${thisMonth()}.csv`, toCsv(rows));
  }
  function exportPayments() {
    const rows: Array<Array<string | number | null>> = [["Date", "Lease", "Tenant", "Towards", "Method", "Reference", "Amount (R)"]];
    for (const e of payments) {
      const w = who(e.lease_id);
      rows.push([e.effective_on, w.lease?.ref ?? "", w.tenant, e.account, e.method, e.reference, (e.amount_cents / 100).toFixed(2)]);
    }
    downloadCsv(`payments-${month.slice(0, 7)}.csv`, toCsv(rows));
  }

  return (
    <div className="stack">
      <PageHeader title="Rent and arrears">Who owes what and for how long, and the payments that arrived, ready to reconcile against the bank.</PageHeader>

      <Card title="Who owes" subtitle="Computed from charges and payments; payments settle the oldest charge first"
        actions={<button className="btn btn-sm" onClick={exportArrears} disabled={!pos.data}><Download size={14} aria-hidden /> CSV</button>}>
        {pos.error ? <ErrorNote error={pos.error} /> : !pos.data ? <Loading /> : owing.length === 0 ? <Empty>Every account is settled.</Empty> : (
          <div className="ops-table-wrap">
            <table className="ops-table" data-testid="arrears">
              <thead><tr><th>Tenant</th><th>Unit</th><th className="num">Balance</th><th className="num">Overdue</th><th className="num">1–30</th><th className="num">31–60</th><th className="num">61–90</th><th className="num">90+</th><th>Last paid</th></tr></thead>
              <tbody>
                {owing.map((x) => {
                  const w = who(x.lease_id);
                  return (
                    <tr key={x.lease_id} className={x.d61_90 + x.d90_plus > 0 ? "ops-alert" : ""}>
                      <td data-label="Tenant"><Link to={`/leases/${x.lease_id}`}>{w.tenant}</Link> <span className="muted">{w.lease?.ref}</span></td>
                      <td data-label="Unit">{w.place}</td>
                      <td data-label="Balance" className="num"><Money cents={x.balance_cents} basis="owed" /></td>
                      <td data-label="Overdue" className="num"><Money cents={x.overdue_cents} basis="owed" /></td>
                      <td data-label="1–30" className="num"><Money cents={x.d1_30} /></td>
                      <td data-label="31–60" className="num"><Money cents={x.d31_60} /></td>
                      <td data-label="61–90" className="num"><Money cents={x.d61_90} /></td>
                      <td data-label="90+" className="num"><Money cents={x.d90_plus} /></td>
                      <td data-label="Last paid">{x.last_payment_on ? dayLabel(x.last_payment_on) : "never"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={`Payments: ${monthLabel(month)}`} subtitle="For reconciliation against your bank statement"
        actions={
          <span className="row" style={{ gap: 6 }}>
            <button className="btn btn-sm" aria-label="Previous month" onClick={() => setMonth(prevMonth(month))}><ChevronLeft size={14} aria-hidden /></button>
            <button className="btn btn-sm" aria-label="Next month" onClick={() => setMonth(nextMonth(month))}><ChevronRight size={14} aria-hidden /></button>
            <button className="btn btn-sm" onClick={exportPayments} disabled={!pays.data}><Download size={14} aria-hidden /> CSV</button>
          </span>
        }>
        {pays.error ? <ErrorNote error={pays.error} /> : !pays.data ? <Loading /> : (
          <>
            <dl className="ops-dl ops-dl-wide" data-testid="payments-totals">
              <div><dt>Rent received</dt><dd><Money cents={totalRent} basis="received" /></dd></div>
              <div><dt>Deposits received</dt><dd><Money cents={totalDeposit} basis="held" /></dd></div>
              {byMethod.map((m) => <div key={m.key}><dt>{m.label}</dt><dd><Money cents={m.cents} /></dd></div>)}
            </dl>
            {payments.length === 0 ? <Empty>No payments recorded this month.</Empty> : (
              <ul className="ops-list" data-testid="payments">
                {payments.map((e) => {
                  const w = who(e.lease_id);
                  return (
                    <li key={e.id}>
                      <span>{dayLabel(e.effective_on)} · <Link to={`/leases/${e.lease_id}`}>{w.tenant}</Link> <span className="muted">{e.reference}</span></span>
                      <span>{e.account === "deposit" && <span className="muted">deposit · </span>}<Money cents={e.amount_cents} basis="received" /></span>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </Card>

      {roles.manage && <ImportPayments leases={leases.map((l) => ({ id: l.id, ref: l.ref, org_id: l.org_id, tenant: who(l.id).tenant }))} onDone={() => { pays.reload(); pos.reload(); }} />}
    </div>
  );
}

type Row = ImportLine & { lease: string | null; take: boolean };

function ImportPayments({ leases, onDone }: { leases: Array<{ id: string; ref: string; org_id: string; tenant: string }>; onDone: () => void }) {
  const { db } = useOrg();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [problems, setProblems] = useState<ImportProblem[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [result, setResult] = useState<string | null>(null);

  async function read(file: File) {
    setErr(null); setResult(null);
    const { lines, problems: probs } = parsePaymentsCsv(await file.text());
    const refs = leases.map((l) => l.ref);
    setRows(lines.map((l) => {
      const ref = matchReference(l.reference, refs);
      return { ...l, lease: ref ? leases.find((x) => x.ref === ref)!.id : null, take: !!ref };
    }));
    setProblems(probs);
  }
  async function importChosen() {
    if (!rows) return;
    setBusy(true); setErr(null);
    let ok = 0;
    const failed: string[] = [];
    for (const r of rows.filter((x) => x.take && x.lease)) {
      const l = leases.find((x) => x.id === r.lease)!;
      try {
        await addEntry(db, { org_id: l.org_id, lease_id: l.id, kind: "payment", account: "rent", method: "eft", amount_cents: r.amount_cents,
          effective_on: r.date, reference: r.reference.slice(0, 80) || null, note: "Imported from bank statement" });
        ok++;
      } catch (x) { failed.push(`line ${r.line}: ${(x as { message?: string }).message ?? "refused"}`); }
    }
    setBusy(false);
    setResult(`Imported ${ok} payment${ok === 1 ? "" : "s"}.${failed.length ? ` Not imported: ${failed.join("; ")}.` : ""}`);
    setRows(null);
    onDone();
  }
  const chosen = rows?.filter((r) => r.take && r.lease) ?? [];
  return (
    <Card title="Import payments from a bank statement" subtitle="CSV with date, reference and amount. Lines are matched by the lease's payment reference (L-0001); nothing is saved until you confirm.">
      <label className="btn ops-file">
        <Upload size={15} aria-hidden /> Choose CSV file
        <input type="file" accept=".csv,text/csv" aria-label="Bank statement CSV" onChange={(e) => { const f = e.target.files?.[0]; if (f) void read(f); e.target.value = ""; }} />
      </label>
      {result && <p className="note note-good" role="status" data-testid="import-result">{result}</p>}
      <ErrorNote error={err} />
      {rows && (
        <div className="stack" style={{ gap: 10, marginTop: 12 }}>
          {rows.length === 0 ? <Empty>No money-in lines found.</Empty> : (
            <div className="ops-table-wrap">
              <table className="ops-table" data-testid="import-preview">
                <thead><tr><th></th><th>Date</th><th>Bank reference</th><th className="num">Amount</th><th>Lease</th></tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.line} className={r.lease ? "" : "ops-struck"}>
                      <td><input type="checkbox" aria-label={`Import line ${r.line}`} checked={r.take} disabled={!r.lease} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, take: e.target.checked } : x)))} /></td>
                      <td data-label="Date">{dayLabel(r.date)}</td>
                      <td data-label="Reference">{r.reference}</td>
                      <td data-label="Amount" className="num"><Money cents={r.amount_cents} /></td>
                      <td data-label="Lease">{r.lease ? (() => { const l = leases.find((x) => x.id === r.lease)!; return `${l.ref} · ${l.tenant}`; })() : <span className="muted">No single lease reference found</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {problems.length > 0 && <p className="muted ops-small">Skipped: {problems.map((p) => `line ${p.line} (${p.problem})`).join("; ")}</p>}
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-primary" disabled={busy || chosen.length === 0} onClick={() => void importChosen()}>Import {chosen.length} payment{chosen.length === 1 ? "" : "s"}</button>
            <button className="btn" onClick={() => setRows(null)}>Cancel</button>
          </div>
        </div>
      )}
    </Card>
  );
}
