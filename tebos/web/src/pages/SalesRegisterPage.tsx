// The sales register, for an equity partner (ADR 0013): the business writes down each sale, and the owner closes each
// month. It keeps the partnership fair and clear. TEBOS never sees the bank account; the database keeps every entry
// (nothing is edited or removed; mistakes are corrected with a new line) and fixes a closed month's totals.
import { useState, type FormEvent } from "react";
import { AUDIT_FLAG_LABEL, EQUITY_PCT, VOTING_PCT, type AuditFlag } from "@core/equity";
import { money } from "@core/property";
import { saToday } from "@core/week";
import { Badge, Card, Empty, ErrorNote, Field, Loading, PageHeader } from "../components/ui";
import { audit, closeMonth, myTerms, recentSales, recordSale } from "../lib/equityData";
import { useOrg } from "../lib/session";
import { useQuery } from "../lib/useQuery";

const CHANNEL = { walk_in: "Walked in", phone: "Phoned", online: "Online", referral: "Referred", repeat: "Came back", other: "Other" } as const;
const monthName = (period: string) => new Date(`${period}T00:00:00Z`).toLocaleDateString("en-ZA", { month: "long", year: "numeric", timeZone: "UTC" });

export function SalesRegisterPage() {
  const org = useOrg();
  const terms = useQuery(() => myTerms(org.db, org.organisation.id), [org.organisation.id]);
  const months = useQuery(() => audit(org.db, org.organisation.id, 6), [org.organisation.id]);
  const sales = useQuery(() => recentSales(org.db, org.organisation.id), [org.organisation.id]);
  const reload = () => { months.reload(); sales.reload(); };
  const canRecord = org.role === "org_admin" || org.role === "operator";
  const thisMonth = months.data?.[0];
  // months are closed in order, from the partnership's first month; the current month closes once it has ended
  const since = terms.data ? terms.data.starts_on.slice(0, 8) + "01" : null;
  const toClose = since ? (months.data ?? []).filter((m) => !m.closed && m.period >= since && m.period < saToday().slice(0, 8) + "01").at(-1) : undefined;
  return (
    <div className="stack quiet">
      <PageHeader eyebrow={org.organisation.name} title="Sales">
        Write down every sale. It keeps your partnership with TEBOS fair and clear. TEBOS never sees your bank account.
      </PageHeader>
      {terms.data && <p className="muted" data-testid="equity-terms">Partnership: TEBOS holds {EQUITY_PCT}% and {VOTING_PCT}% of the votes, since {terms.data.starts_on}.</p>}
      {thisMonth && (
        <p className="lead-number" data-testid="this-month"><strong>{money(thisMonth.net_cents / 100)}</strong> this month · {thisMonth.sale_count} sale{thisMonth.sale_count === 1 ? "" : "s"}</p>
      )}
      {canRecord ? <AddSale orgId={org.organisation.id} onDone={reload} /> : <p className="muted">Your admin or an operator records sales.</p>}
      {toClose && org.role === "org_admin" && <CloseMonth orgId={org.organisation.id} period={toClose.period} total={toClose.net_cents} count={toClose.sale_count} onDone={reload} />}
      <Card title="Months">
        {months.error ? <ErrorNote error={months.error} title="Couldn't load your months" /> : !months.data ? <Loading /> : (
          <ul className="list web-list" data-testid="months">
            {months.data.map((m) => (
              <li key={m.period}>
                <div className="row" style={{ justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <span>{monthName(m.period)}</span>
                  <span><strong>{money(m.net_cents / 100)}</strong> {m.closed ? <Badge tone="good">Closed</Badge> : <Badge tone="neutral">Open</Badge>}</span>
                </div>
                {m.flags.length > 0 && <p className="muted" style={{ margin: "4px 0 0" }}>{m.flags.map((f) => AUDIT_FLAG_LABEL[f as AuditFlag] ?? f).join(" · ")}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Recent entries">
        {!sales.data ? <Loading /> : sales.data.length === 0 ? <Empty>Nothing recorded yet.</Empty> : (
          <ul className="list web-list" data-testid="sales">
            {sales.data.map((s) => (
              <li key={s.id} className="row" style={{ justifyContent: "space-between", gap: 8 }}>
                <span>{s.sold_on} · {s.kind === "sale" ? CHANNEL[s.channel as keyof typeof CHANNEL] : s.kind === "refund" ? "Refund" : `Correction: ${s.note}`}{s.reference ? ` · ${s.reference}` : ""}</span>
                <strong>{money(s.amount_cents / 100)}</strong>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function AddSale({ orgId, onDone }: { orgId: string; onDone: () => void }) {
  const org = useOrg();
  const [kind, setKind] = useState<"sale" | "refund" | "correction">("sale");
  const [f, setF] = useState({ sold_on: saToday(), amount: "", reference: "", channel: "walk_in", note: "" });
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState<string | null>(null);
  async function save(e: FormEvent) {
    e.preventDefault(); setError(null); setSaved(null);
    const rands = Number(f.amount);
    const cents = Math.round(Math.abs(rands) * 100) * (kind === "refund" || (kind === "correction" && rands < 0) ? -1 : 1);
    try {
      await recordSale(org.db, orgId, { sold_on: f.sold_on, kind, amount_cents: cents, reference: f.reference, channel: f.channel, note: f.note });
      setSaved(`${kind === "sale" ? "Sale" : kind === "refund" ? "Refund" : "Correction"} of ${money(Math.abs(cents) / 100)} recorded.`);
      setF({ ...f, amount: "", reference: "", note: "" });
      onDone();
    } catch (err) { setError(err); }
  }
  return (
    <Card title="Add">
      <form className="form" aria-label="Add a sale" onSubmit={save}>
        <div className="segmented" role="group" aria-label="What happened">
          {(["sale", "refund", "correction"] as const).map((k) => (
            <button key={k} type="button" aria-pressed={kind === k} className={kind === k ? "on" : ""} onClick={() => setKind(k)}>{k === "sale" ? "A sale" : k === "refund" ? "A refund" : "A correction"}</button>
          ))}
        </div>
        <Field label="Amount (rand)" hint={kind === "correction" ? "Minus for less, e.g. -150." : undefined}>
          <input className="input" type="number" step="0.01" min={kind === "correction" ? undefined : "0.01"} required inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
        </Field>
        <Field label="Date"><input className="input" type="date" required max={saToday()} value={f.sold_on} onChange={(e) => setF({ ...f, sold_on: e.target.value })} /></Field>
        {kind === "sale" && <Field label="How they found you"><select className="input" value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value })}>{Object.entries(CHANNEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>}
        <Field label="Invoice or receipt number" hint="Optional. No customer names or numbers."><input className="input" maxLength={60} value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
        {kind === "correction" && <Field label="What it corrects"><input className="input" required minLength={10} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>}
        <ErrorNote error={error} title="Not recorded" />
        {saved && <p role="status">{saved}</p>}
        <button className="btn btn-primary">Record</button>
      </form>
    </Card>
  );
}

function CloseMonth({ orgId, period, total, count, onDone }: { orgId: string; period: string; total: number; count: number; onDone: () => void }) {
  const org = useOrg();
  const [note, setNote] = useState("");
  const [error, setError] = useState<unknown>(null);
  return (
    <Card title={`Close ${monthName(period)}`} subtitle="Check that every sale is in. Once closed, the month's total is fixed.">
      <form className="form" aria-label={`Close ${monthName(period)}`} onSubmit={async (e) => {
        e.preventDefault(); setError(null);
        try { await closeMonth(org.db, orgId, period, note); onDone(); } catch (err) { setError(err); }
      }}>
        <p className="lead-number"><strong>{money(total / 100)}</strong> · {count} sale{count === 1 ? "" : "s"}</p>
        <Field label="Anything to add?"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <ErrorNote error={error} title="Not closed" />
        <button className="btn btn-primary">Close the month</button>
      </form>
    </Card>
  );
}
