// Billing, for TEBOS's platform admins: every client's monthly fee and next
// invoice, what's open and overdue, and the decisions only a person makes:
// setting a Company fee from the agreed proposal, pausing or ending billing,
// voiding an invoice, recording an EFT. TEBOS issues, sends and chases
// invoices itself; it never charges a card.
import { daysLate, mayPause } from "@core/billing";
import { formatRand, PLAN_TERMS, type PlanKey } from "@core/plans";
import { useState, type FormEvent } from "react";
import { Badge, Card, Empty, ErrorNote, Field, Loading, PageHeader, StatusBadge } from "../components/ui";
import {
  billingOverview,
  changeFee,
  recordInvoiceEft,
  setBillingStatus,
  startBilling,
  voidInvoice,
  type BillingAccount,
  type Invoice,
} from "../lib/data";
import { when } from "../lib/format";
import { Link } from "../lib/router";
import { useSignedIn } from "../lib/session";
import { useQuery } from "../lib/useQuery";
import { StaffOnly } from "./PipelinePage";

const planName = (p: string) => PLAN_TERMS[p as PlanKey]?.name ?? p;
const rands = (text: string) => Math.round(Number(text.replace(/[^0-9.]/g, "")) * 100);

export function BillingPage() {
  return <StaffOnly title="Billing">{(a) => (!a.admin ? <PageHeader title="Billing">Only TEBOS's platform admins manage billing.</PageHeader> : <Billing />)}</StaffOnly>;
}

function Billing() {
  const { db } = useSignedIn();
  const q = useQuery(() => billingOverview(db), []);
  const clientOf = (oppId: string) => q.data?.clients.find((c) => c.id === oppId);
  const accounts = q.data?.accounts ?? [];
  const invoices = q.data?.invoices ?? [];
  const open = invoices.filter((i) => i.status === "open");
  const overdue = open.filter((i) => daysLate(i.due_on) > 0);
  const mrr = accounts.filter((a) => a.status === "active").reduce((s, a) => s + (a.monthly_cents ?? 0), 0);

  return (
    <div className="stack">
      <PageHeader eyebrow={<Link to="/pipeline">Client pipeline</Link>} title="Billing">
        TEBOS issues each client's invoice on its date, emails a secure payment link and reminds them at 3 and 10 days late. It
        never charges a card. Pausing a late client, voiding an invoice and recording an EFT are your decisions.
      </PageHeader>
      {q.error ? <ErrorNote error={q.error} title="Couldn't load billing" /> : !q.data ? <Loading /> : (
        <>
          <div className="grid grid-4" data-testid="billing-stats">
            <section className="card stat"><span className="stat-value">{formatRand(mrr)}</span><span className="stat-label">Billed monthly</span><span className="stat-sub">Active clients, excluding VAT</span></section>
            <section className="card stat"><span className="stat-value">{accounts.filter((a) => a.status === "awaiting_fee").length}</span><span className="stat-label">Waiting for a fee</span><span className="stat-sub">Company clients: set the agreed fee</span></section>
            <section className="card stat"><span className="stat-value">{open.length}</span><span className="stat-label">Open invoices</span><span className="stat-sub">Sent, not yet paid</span></section>
            <section className="card stat"><span className="stat-value">{overdue.length}</span><span className="stat-label">Overdue</span><span className="stat-sub">{formatRand(overdue.reduce((s, i) => s + i.amount_cents, 0))} in total</span></section>
          </div>
          <Card title="Clients">
            {accounts.length === 0 ? <Empty>No billing yet. Each client's account opens when they're onboarded.</Empty> : (
              <ul className="list" data-testid="billing-accounts">
                {accounts.map((a) => <AccountRow key={a.id} account={a} client={clientOf(a.opportunity_id)?.business ?? "Client"} onChanged={q.reload} />)}
              </ul>
            )}
          </Card>
          <Card title="Invoices">
            {invoices.length === 0 ? <Empty>No invoices yet.</Empty> : (
              <ul className="list" data-testid="invoices">
                {invoices.map((i) => <InvoiceRow key={i.id} invoice={i} client={clientOf(i.opportunity_id)?.business ?? "Client"} onChanged={q.reload} />)}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function AccountRow({ account: a, client, onChanged }: { account: BillingAccount; client: string; onChanged: () => void }) {
  const { db } = useSignedIn();
  const [mode, setMode] = useState<"none" | "start" | "fee" | "status">("none");
  const [form, setForm] = useState({ amount: "", date: "", note: "", status: "paused" as "active" | "paused" | "ended" });
  const [error, setError] = useState<unknown>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (mode === "start") await startBilling(db, a.id, rands(form.amount), form.date, form.note);
      if (mode === "fee") await changeFee(db, a.id, rands(form.amount), form.note);
      if (mode === "status") await setBillingStatus(db, a.id, form.status, form.note);
      setMode("none");
      onChanged();
    } catch (err) {
      setError(err);
    }
  }
  return (
    <li style={{ flexDirection: "column", alignItems: "stretch" }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="list-main">
          <span className="list-title">{client}</span>
          <span className="list-meta">
            {planName(a.plan)} · {a.monthly_cents ? `${formatRand(a.monthly_cents)} a month` : "fee not set"}
            {a.status === "active" && a.next_invoice_on ? ` · next invoice ${when(a.next_invoice_on)}` : ""}
            {a.status_note ? ` · ${a.status_note}` : ""}
          </span>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <StatusBadge status={a.status === "awaiting_fee" ? "pending" : a.status} />
          {a.status === "awaiting_fee" && <button className="btn btn-sm btn-primary" onClick={() => setMode("start")}>Set the agreed fee</button>}
          {a.status !== "awaiting_fee" && a.status !== "ended" && <button className="btn btn-sm" onClick={() => setMode("fee")}>Change fee</button>}
          {a.status !== "ended" && a.status !== "awaiting_fee" && <button className="btn btn-sm" onClick={() => { setForm({ ...form, status: a.status === "paused" ? "active" : "paused" }); setMode("status"); }}>{a.status === "paused" ? "Resume" : "Pause or end"}</button>}
        </div>
      </div>
      {mode !== "none" && (
        <form className="form" style={{ marginTop: 8 }} onSubmit={submit} aria-label={`Billing for ${client}`}>
          <div className="form-row">
            {(mode === "start" || mode === "fee") && (
              <Field label="Monthly fee (R, excluding VAT)"><input className="input" required inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
            )}
            {mode === "start" && <Field label="First invoice on"><input className="input" type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>}
            {mode === "status" && (
              <Field label="Billing">
                <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as typeof form.status })}>
                  {a.status === "paused" ? <option value="active">Resume</option> : <option value="paused">Pause</option>}
                  <option value="ended">End (client has left)</option>
                </select>
              </Field>
            )}
          </div>
          <Field label={mode === "status" ? "Why" : "Where the fee comes from"}>
            <input className="input" required value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder={mode === "status" ? "e.g. Two invoices more than 14 days late" : "e.g. Proposal accepted by Naledi on 3 November"} />
          </Field>
          <ErrorNote error={error} title="Not saved" />
          <div className="row">
            <button className="btn btn-sm btn-primary">Save</button>
            <button type="button" className="btn btn-sm" onClick={() => setMode("none")}>Cancel</button>
          </div>
        </form>
      )}
    </li>
  );
}

function InvoiceRow({ invoice: i, client, onChanged }: { invoice: Invoice; client: string; onChanged: () => void }) {
  const { db } = useSignedIn();
  const [mode, setMode] = useState<"none" | "eft" | "void">("none");
  const [form, setForm] = useState({ reference: "", amount: String(i.amount_cents / 100), paidOn: new Date().toISOString().slice(0, 10), note: "" });
  const [error, setError] = useState<unknown>(null);
  const late = i.status === "open" ? daysLate(i.due_on) : 0;
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (mode === "eft") await recordInvoiceEft(db, i, form.reference, rands(form.amount), new Date(form.paidOn).toISOString(), form.note);
      if (mode === "void") await voidInvoice(db, i.id, form.note);
      setMode("none");
      onChanged();
    } catch (err) {
      setError(err);
    }
  }
  return (
    <li style={{ flexDirection: "column", alignItems: "stretch" }} data-testid="invoice">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="list-main">
          <span className="list-title">{i.number} · {client} · {formatRand(i.amount_cents)}</span>
          <span className="list-meta">
            {when(i.period_start)} to {when(i.period_end)} · due {when(i.due_on)}
            {i.status === "open" && !i.payment_url ? " · payment link waits for the Paystack key" : ""}
            {i.void_reason ? ` · void: ${i.void_reason}` : ""}
          </span>
        </div>
        <div className="row" style={{ gap: 6 }}>
          {i.status === "open" && late > 0 ? <Badge tone={mayPause(i.due_on) ? "bad" : "warn"}>{late} days late</Badge> : <StatusBadge status={i.status === "paid" ? "completed" : i.status === "void" ? "cancelled" : "pending"} />}
          {i.status === "open" && <button className="btn btn-sm" onClick={() => setMode("eft")}>Record EFT</button>}
          {i.status === "open" && <button className="btn btn-sm" onClick={() => setMode("void")}>Void</button>}
        </div>
      </div>
      {mayPause(i.due_on) && i.status === "open" && <p className="list-meta" style={{ color: "var(--bad-fg)" }}>More than 14 days late: the agreement lets you pause the service. That's your decision (Pause, on the client above).</p>}
      {mode !== "none" && (
        <form className="form" style={{ marginTop: 8 }} onSubmit={submit} aria-label={`${mode === "eft" ? "Record an EFT for" : "Void"} ${i.number}`}>
          {mode === "eft" && (
            <div className="form-row">
              <Field label="Bank reference"><input className="input" required value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></Field>
              <Field label="Amount (R)"><input className="input" required inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
              <Field label="Paid on"><input className="input" type="date" required value={form.paidOn} onChange={(e) => setForm({ ...form, paidOn: e.target.value })} /></Field>
            </div>
          )}
          <Field label={mode === "eft" ? "Note" : "Why void it"}>
            <input className="input" required value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder={mode === "eft" ? "e.g. Seen on the FNB statement" : "e.g. Issued at the wrong fee; a corrected invoice follows"} />
          </Field>
          <ErrorNote error={error} title="Not saved" />
          <div className="row">
            <button className="btn btn-sm btn-primary">{mode === "eft" ? "Record EFT" : "Void invoice"}</button>
            <button type="button" className="btn btn-sm" onClick={() => setMode("none")}>Cancel</button>
          </div>
        </form>
      )}
    </li>
  );
}
