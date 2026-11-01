// Equity partners, for TEBOS's staff (ADR 0013): businesses that work with TEBOS for a small share instead of fees.
// Only businesses that qualify, only with the founder's yes, at most five at a time, and only with a signed agreement.
// The database enforces every step; this page shows what's still needed, in plain words.
import { useState } from "react";
import { MACHINES, type EquityApplicationStatus } from "@core/states";
import {
  AUDIT_FLAG_LABEL, ELIGIBLE_SECTORS, EQUITY_PCT, EQUITY_STATUS_LABEL, MAX_EQUITY_PARTNERS, qualificationGaps, REVENUE_BANDS, VOTING_PCT,
  type AuditFlag, type RevenueBand, type Sector,
} from "@core/equity";
import { money } from "@core/property";
import { saToday } from "@core/week";
import { Badge, Card, Empty, ErrorNote, Field, Loading, PageHeader } from "../components/ui";
import {
  allTerms, applications, audit, clientOrgs, moveApplication, openApplication, recordTerms, saveFacts, type Application, type Facts, type Terms,
} from "../lib/equityData";
import { useSignedIn } from "../lib/session";
import { useQuery } from "../lib/useQuery";
import { StaffOnly } from "./PipelinePage";

const PACKAGE = { starter: "Small", growth: "Medium", company: "Company" } as const;
const IN_PLACE: EquityApplicationStatus[] = ["approved", "agreement_signed", "active"];

export function EquityPage() {
  return <StaffOnly title="Equity partners">{(a) => <Partners isFounder={Boolean(a.admin)} />}</StaffOnly>;
}

function Partners({ isFounder }: { isFounder: boolean }) {
  const { db } = useSignedIn();
  const apps = useQuery(() => applications(db), []);
  const terms = useQuery(() => allTerms(db), []);
  const orgs = useQuery(() => clientOrgs(db), []);
  const [opening, setOpening] = useState(false);
  const reload = () => { apps.reload(); terms.reload(); };
  const taken = (apps.data ?? []).filter((x) => IN_PLACE.includes(x.status as EquityApplicationStatus)).length;
  return (
    <div className="stack quiet">
      <PageHeader eyebrow="TEBOS" title="Equity partners"
        actions={<button className="btn btn-primary" onClick={() => setOpening((o) => !o)}>{opening ? "Close" : "New application"}</button>}>
        For businesses that can't pay yet: TEBOS works for a {EQUITY_PCT}% share and {VOTING_PCT}% of the votes instead of fees.
        Only businesses that qualify, only with the founder's yes, and never more than {MAX_EQUITY_PARTNERS} at a time.
      </PageHeader>
      <p className="lead-number" data-testid="equity-places"><strong>{taken}</strong> of {MAX_EQUITY_PARTNERS} places taken</p>
      {opening && <NewApplication orgs={orgs.data ?? []} onDone={() => { setOpening(false); reload(); }} />}
      {apps.error ? <ErrorNote error={apps.error} title="Couldn't load the applications" /> : !apps.data ? <Loading /> : apps.data.length === 0 ? (
        <Card><Empty>No applications yet.</Empty></Card>
      ) : (
        <ol className="list web-list" data-testid="equity-applications">
          {apps.data.map((a) => (
            <ApplicationCard key={a.id} a={a} isFounder={isFounder} orgs={orgs.data ?? []} terms={(terms.data ?? []).find((t) => t.application_id === a.id) ?? null} onDone={reload} />
          ))}
        </ol>
      )}
    </div>
  );
}

function NewApplication({ orgs, onDone }: { orgs: Array<{ org_id: string; org_name: string }>; onDone: () => void }) {
  const { db } = useSignedIn();
  const [f, setF] = useState({ business_name: "", sector: "retail", revenue_band: "10k_50k", org_id: "", status_note: "" });
  const [error, setError] = useState<unknown>(null);
  return (
    <Card title="New application">
      <form className="form" aria-label="New application" onSubmit={async (e) => {
        e.preventDefault(); setError(null);
        try { await openApplication(db, { ...f, org_id: f.org_id || null }); onDone(); } catch (err) { setError(err); }
      }}>
        <Field label="Business name"><input className="input" required minLength={2} value={f.business_name} onChange={(e) => setF({ ...f, business_name: e.target.value })} /></Field>
        <Field label="Their TEBOS account" hint="If they already have one.">
          <select className="input" value={f.org_id} onChange={(e) => setF({ ...f, org_id: e.target.value })}>
            <option value="">Not yet</option>
            {orgs.map((o) => <option key={o.org_id} value={o.org_id}>{o.org_name}</option>)}
          </select>
        </Field>
        <Field label="Kind of business"><select className="input" value={f.sector} onChange={(e) => setF({ ...f, sector: e.target.value })}>{Object.entries(ELIGIBLE_SECTORS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="Money coming in each month"><select className="input" value={f.revenue_band} onChange={(e) => setF({ ...f, revenue_band: e.target.value })}>{Object.entries(REVENUE_BANDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="How they came to us"><textarea className="input" rows={2} required minLength={10} value={f.status_note} onChange={(e) => setF({ ...f, status_note: e.target.value })} /></Field>
        <ErrorNote error={error} title="Not opened" />
        <button className="btn btn-primary">Open the application</button>
      </form>
    </Card>
  );
}

function ApplicationCard({ a, isFounder, orgs, terms, onDone }: { a: Application; isFounder: boolean; orgs: Array<{ org_id: string; org_name: string }>; terms: Terms | null; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const status = a.status as EquityApplicationStatus;
  const gaps = qualificationGaps({
    registrationNumber: a.registration_number, tradingSince: a.trading_since, sector: a.sector as Sector, revenueBand: a.revenue_band as RevenueBand,
    revenueEvidenceNote: a.revenue_evidence_note, ownerFullTime: a.owner_full_time, reportingConsent: a.reporting_consent,
  }, saToday());
  const tone = status === "active" ? "good" : status === "declined" || status === "withdrawn" || status === "exited" ? "neutral" : status === "qualified" ? "warn" : "info";
  return (
    <li className="card" data-testid="equity-application">
      <button type="button" className="row-button" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="card-title">{a.business_name}</span>
        <Badge tone={tone}>{EQUITY_STATUS_LABEL[status]}</Badge>
      </button>
      {open && (
        <div className="stack" style={{ marginTop: 14 }}>
          <p className="muted">{a.status_note}</p>
          {(status === "applied" || status === "screening") && <FactsForm a={a} orgs={orgs} onDone={onDone} />}
          {(status === "applied" || status === "screening") && (
            gaps.length === 0
              ? <p data-testid="equity-gaps"><Badge tone="good">Qualifies</Badge> Every rule is met.</p>
              : <div data-testid="equity-gaps"><p><strong>Doesn't qualify yet:</strong></p><ul>{gaps.map((g) => <li key={g}>{g.split(": ")[1]}</li>)}</ul></div>
          )}
          {status === "qualified" && !isFounder && <p className="muted">Waiting for the founder to say yes or no.</p>}
          {status === "agreement_signed" && !terms && (isFounder ? <StartTerms a={a} onDone={onDone} /> : <p className="muted">The founder records the terms once the agreement is signed.</p>)}
          {status === "active" && a.org_id && <Audit orgId={a.org_id} />}
          <Decide a={a} isFounder={isFounder} hasTerms={Boolean(terms)} onDone={onDone} />
        </div>
      )}
    </li>
  );
}

function FactsForm({ a, orgs, onDone }: { a: Application; orgs: Array<{ org_id: string; org_name: string }>; onDone: () => void }) {
  const { db } = useSignedIn();
  const [f, setF] = useState<Facts>({
    registration_number: a.registration_number, trading_since: a.trading_since, sector: a.sector, revenue_band: a.revenue_band, employees: a.employees,
    owner_full_time: a.owner_full_time, revenue_evidence_note: a.revenue_evidence_note, reporting_consent: a.reporting_consent, package: a.package, org_id: a.org_id,
  });
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const text = (k: keyof Facts) => ({ value: (f[k] as string | null) ?? "", onChange: (e: { target: { value: string } }) => { setSaved(false); setF({ ...f, [k]: e.target.value || null }); } });
  return (
    <form className="form" aria-label={`The facts about ${a.business_name}`} onSubmit={async (e) => {
      e.preventDefault(); setError(null); setSaved(false);
      try { await saveFacts(db, a.id, f); setSaved(true); onDone(); } catch (err) { setError(err); }
    }}>
      <Field label="Their TEBOS account"><select className="input" {...text("org_id")}><option value="">Not yet</option>{orgs.map((o) => <option key={o.org_id} value={o.org_id}>{o.org_name}</option>)}</select></Field>
      <Field label="CIPC registration number" hint="Like 2019/123456/07."><input className="input" pattern="[0-9]{4}/[0-9]{6}/[0-9]{2}" {...text("registration_number")} /></Field>
      <Field label="Trading since"><input className="input" type="date" {...text("trading_since")} /></Field>
      <Field label="Kind of business"><select className="input" {...text("sector")}>{Object.entries(ELIGIBLE_SECTORS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
      <Field label="Money coming in each month"><select className="input" {...text("revenue_band")}>{Object.entries(REVENUE_BANDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
      <Field label="What you saw to confirm it" hint="E.g. three months of statements, seen on a call. Don't copy or keep the statements."><textarea className="input" rows={2} {...text("revenue_evidence_note")} /></Field>
      <Field label="Package they'd get"><select className="input" {...text("package")}>{Object.entries(PACKAGE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
      <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={f.owner_full_time} onChange={(e) => setF({ ...f, owner_full_time: e.target.checked })} /> An owner works in it full time</label>
      <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={f.reporting_consent} onChange={(e) => setF({ ...f, reporting_consent: e.target.checked })} /> The owner agrees to record every sale in TEBOS</label>
      <ErrorNote error={error} title="Not saved" />
      {saved && <p role="status">Saved.</p>}
      <button className="btn">Save the facts</button>
    </form>
  );
}

function Decide({ a, isFounder, hasTerms, onDone }: { a: Application; isFounder: boolean; hasTerms: boolean; onDone: () => void }) {
  const { db } = useSignedIn();
  const status = a.status as EquityApplicationStatus;
  const next = (((MACHINES.equity_application.transitions as Record<string, readonly string[]>)[status] ?? []) as EquityApplicationStatus[])
    .filter((s) => (s !== "approved" || isFounder) && (s !== "active" || hasTerms));
  const [to, setTo] = useState<EquityApplicationStatus | "">("");
  const [note, setNote] = useState("");
  const [ref, setRef] = useState("");
  const [error, setError] = useState<unknown>(null);
  if (next.length === 0) return null;
  return (
    <form className="form" aria-label={`Next step for ${a.business_name}`} onSubmit={async (e) => {
      e.preventDefault(); if (!to) return; setError(null);
      try { await moveApplication(db, a.id, to, note, to === "agreement_signed" ? ref : undefined); setTo(""); setNote(""); onDone(); } catch (err) { setError(err); }
    }}>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <select className="input" aria-label="Next step" style={{ flex: "1 1 200px" }} value={to} onChange={(e) => setTo(e.target.value as EquityApplicationStatus)}>
          <option value="">Next step</option>
          {next.map((s) => <option key={s} value={s}>{EQUITY_STATUS_LABEL[s]}</option>)}
        </select>
      </div>
      {to === "agreement_signed" && <Field label="Where the signed agreement is kept"><input className="input" required minLength={5} value={ref} onChange={(e) => setRef(e.target.value)} /></Field>}
      {to && <Field label="Why"><textarea className="input" rows={2} required minLength={10} value={note} onChange={(e) => setNote(e.target.value)} /></Field>}
      <ErrorNote error={error} title="Not moved" />
      {to && <button className="btn btn-primary">Confirm</button>}
    </form>
  );
}

function StartTerms({ a, onDone }: { a: Application; onDone: () => void }) {
  const { db } = useSignedIn();
  const [start, setStart] = useState(saToday());
  const [error, setError] = useState<unknown>(null);
  if (!a.org_id) return <p className="muted">Link their TEBOS account first.</p>;
  return (
    <form className="form" aria-label="Record the terms" onSubmit={async (e) => {
      e.preventDefault(); setError(null);
      try { await recordTerms(db, a, start); onDone(); } catch (err) { setError(err); }
    }}>
      <p>{EQUITY_PCT}% equity · {VOTING_PCT}% of the votes · {PACKAGE[a.package as keyof typeof PACKAGE]} package · agreement: {a.agreement_ref}</p>
      <Field label="Starts on"><input className="input" type="date" required value={start} onChange={(e) => setStart(e.target.value)} /></Field>
      <ErrorNote error={error} title="Not recorded" />
      <button className="btn btn-primary">Record the terms</button>
    </form>
  );
}

function Audit({ orgId }: { orgId: string }) {
  const { db } = useSignedIn();
  const q = useQuery(() => audit(db, orgId, 6), [orgId]);
  if (q.error) return <ErrorNote error={q.error} title="Couldn't load their sales" />;
  if (!q.data) return <Loading />;
  return (
    <table className="table" data-testid="equity-audit">
      <thead><tr><th>Month</th><th>Sales</th><th>Closed</th><th>Look at</th></tr></thead>
      <tbody>{q.data.map((m) => (
        <tr key={m.period}><td>{m.period.slice(0, 7)}</td><td>{money(m.net_cents / 100)} · {m.sale_count}</td><td>{m.closed ? "Yes" : "Not yet"}</td>
          <td>{m.flags.length ? m.flags.map((fl) => AUDIT_FLAG_LABEL[fl as AuditFlag] ?? fl).join("; ") : "Nothing"}</td></tr>
      ))}</tbody>
    </table>
  );
}
