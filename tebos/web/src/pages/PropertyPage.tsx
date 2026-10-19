// Property Revenue Architecture (Tidy Enterprise): the case workspace. Cases,
// evidence, labelled figures, pathways and gates are stored, checked by the
// database and audited; the figures shown are computed by @core/property from
// what is recorded, and say "Not established" when an input is missing.
import {
  AUTHORITY, BASES, checkDisposition, checkEvidence, checkFigure, checkGate, checkPathway, CONFIDENCE, DISPOSITIONS, EVIDENCE_CATEGORIES,
  EVIDENCE_CHECKLIST, EVIDENCE_STATUSES, evidenceReadiness, economics, FIGURES, FIGURE_KEYS, GATES, GATE_STATUSES, isStale, money,
  OBJECTIVES, PATHWAYS, PROBLEMS, PROPERTY_TYPES, PROPERTY_TYPE_LABEL, SPECIALISTS, SUSPECTED_CAUSES,
  type Authority, type Basis, type Disposition, type EvidenceCategory, type EvidenceStatus, type FigureKey, type GateKey,
  type GateStatus, type Metric, type PathwayKey, type PathwayStatus, type Specialist,
  APPROVALS, OUTCOME_KEYS, OUTCOME_LABEL, WORKSTREAM_STATUSES, checkWorkstream, scorecard, workstreamExceptions,
  type ActualBasis, type ApprovalState, type OutcomeKey, type WorkstreamStatus,
} from "@core/property";
import type { Check } from "@core/rules";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { ErrorNote, Loading } from "../components/ui";
import {
  clearPropertyFigure, createPropertyCase, deletePropertyEvidence, getPropertyCase, listPropertyCases, propertyCaseHistory,
  savePropertyEvidence, savePropertyFigure, savePropertyGate, savePropertyPathway, updatePropertyCase,
  capturePropertyBaseline, createPropertyReview, savePropertyActual, savePropertyWorkstream, setPropertyTarget,
  type PropertyActual, type PropertyEvidence, type PropertyFigure, type PropertyGate, type PropertyPathway, type PropertyWorkstream,
} from "../lib/data";
import { ago, when } from "../lib/format";
import { caseExport, toBaseline, toEvidence, toFigure, toGate, toReviews, toWorkstream } from "../lib/property";
import { Link, navigate } from "../lib/router";
import { useOrg } from "../lib/session";
import { useQuery } from "../lib/useQuery";

type CaseData = NonNullable<Awaited<ReturnType<typeof getPropertyCase>>>;
const today = () => new Date().toISOString().slice(0, 10);
const blank = (s: string) => (s.trim() === "" ? null : s.trim());
const DISPOSITION_TONE: Record<Disposition, string> = { proceed: "green", nurture: "", hold_optimise: "amber", do_nothing: "", reject: "red" };
const BASIS_TONE: Record<Basis, string> = { verified: "green", owner_reported: "amber", estimated: "" };

function useCanWork() {
  const { role } = useOrg();
  return role === "org_admin" || role === "operator";
}

/** Runs a write, shows its refusal in the database's own words, and reloads on success. */
function useWrite(onDone: () => void) {
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  async function run(check: Check | null, f: () => Promise<unknown>) {
    setError(null);
    if (check && !check.ok) {
      setError(new Error(check.reason));
      return false;
    }
    setBusy(true);
    try {
      await f();
      onDone();
      return true;
    } catch (e) {
      setError(e);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { error, busy, run };
}

function Tag({ tone = "", children }: { tone?: string; children: ReactNode }) {
  return <span className={`pra-tag ${tone}`}>{children}</span>;
}

function Shell({ children }: { children: ReactNode }) {
  return <div className="pra">{children}</div>;
}

// ===========================================================================
// Case list
// ===========================================================================

export function PropertyCasesPage() {
  const org = useOrg();
  const canWork = useCanWork();
  const q = useQuery(() => listPropertyCases(org.db, org.organisation.id), [org.organisation.id]);
  const asOf = new Date().toISOString();
  return (
    <Shell>
      <header className="pra-top">
        <div>
          <div className="pra-eyebrow">Tidy Enterprise · Property Revenue Architecture</div>
          <h1>Property cases</h1>
          <p className="pra-sub">Each case turns a property's current condition into an evidence-led decision. Unknown figures stay unknown: nothing is assumed to be zero.</p>
        </div>
      </header>
      {canWork && <NewCase onCreated={(id) => navigate(`/property/${id}`)} />}
      <section className="pra-card" aria-label="Cases">
        <div className="pra-head"><div><h2>Cases in {org.organisation.name}</h2><p>Newest activity first.</p></div></div>
        {q.loading && !q.data && <Loading />}
        <ErrorNote error={q.error} title="Couldn't load the cases" />
        {q.data && q.data.cases.length === 0 && <p className="pra-empty">No cases yet. Open the first one when an owner with a real property and a stated problem is ready.</p>}
        {q.data && q.data.cases.length > 0 && (
          <div className="pra-table-wrap">
            <table className="pra-table" data-testid="property-cases">
              <thead><tr><th>Case</th><th>Problem</th><th>Disposition</th><th>Evidence readiness</th><th>Figures</th><th>Updated</th></tr></thead>
              <tbody>
                {q.data.cases.map((c) => {
                  const ready = evidenceReadiness(q.data!.evidence.filter((e) => e.case_id === c.id).map(toEvidence), asOf);
                  const n = q.data!.figures.filter((f) => f.case_id === c.id).length;
                  return (
                    <tr key={c.id}>
                      <td><Link to={`/property/${c.id}`}><strong>{c.ref}</strong> · {c.label}</Link></td>
                      <td>{PROBLEMS[c.problem as keyof typeof PROBLEMS] ?? c.problem}</td>
                      <td><Tag tone={DISPOSITION_TONE[c.disposition as Disposition]}>{DISPOSITIONS[c.disposition as Disposition]?.label ?? c.disposition}</Tag></td>
                      <td>{ready.percent}%</td>
                      <td>{n} of {FIGURE_KEYS.length}</td>
                      <td>{ago(c.updated_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </Shell>
  );
}

function NewCase({ onCreated }: { onCreated: (id: string) => void }) {
  const org = useOrg();
  const [label, setLabel] = useState("");
  const [problem, setProblem] = useState("underperforming_income");
  const [objective, setObjective] = useState("improve_cash_flow");
  const [type, setType] = useState("");
  const [reason, setReason] = useState("");
  const w = useWrite(() => {});
  async function submit(e: FormEvent) {
    e.preventDefault();
    let id = "";
    const check: Check = !label.trim() ? { ok: false, code: "TEBOS_VALIDATION", reason: "Name the case." } : checkDisposition({ authority: "unconfirmed" }, "hold_optimise", reason);
    const ok = await w.run(check, async () => {
      const c = await createPropertyCase(org.db, org.organisation.id, { label: label.trim(), problem, objective, property_type: type || null, disposition_reason: reason.trim() });
      id = c.id;
    });
    if (ok) onCreated(id);
  }
  return (
    <form className="pra-card" onSubmit={submit} aria-label="Open a case">
      <div className="pra-head"><div><h2>Open a case</h2><p>The case starts as HOLD–OPTIMISE with the owner's authority unconfirmed. The database numbers it.</p></div></div>
      <div className="pra-fields">
        <label className="pra-field pra-full">Case / property label<input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Client A — rental property" /></label>
        <label className="pra-field">Primary problem<select value={problem} onChange={(e) => setProblem(e.target.value)}>{Object.entries(PROBLEMS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="pra-field">Owner objective<select value={objective} onChange={(e) => setObjective(e.target.value)}>{Object.entries(OBJECTIVES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="pra-field">Property type<select value={type} onChange={(e) => setType(e.target.value)}><option value="">Not supplied</option>{PROPERTY_TYPES.map((t) => <option key={t} value={t}>{PROPERTY_TYPE_LABEL[t]}</option>)}</select></label>
        <label className="pra-field pra-full">Why HOLD–OPTIMISE for now<textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Income underperformance reported; evidence incomplete. Establish the baseline first." /></label>
      </div>
      <ErrorNote error={w.error} title="The case wasn't opened" />
      <button className="pra-btn primary" disabled={w.busy}>Open case</button>
    </form>
  );
}

// ===========================================================================
// Case workspace
// ===========================================================================

const TABS = [
  ["overview", "Overview"], ["assessment", "Assessment"], ["evidence", "Evidence room"], ["economics", "Economics"],
  ["pathways", "Pathways"], ["workstreams", "Workstreams"], ["outcomes", "Outcomes"], ["gates", "Execution gates"], ["history", "History"],
] as const;
type Tab = (typeof TABS)[number][0];

export function PropertyCasePage({ id }: { id: string }) {
  const org = useOrg();
  const q = useQuery(() => getPropertyCase(org.db, id), [id]);
  const [tab, setTab] = useState<Tab>("overview");
  if (q.loading && !q.data) return <Shell><Loading /></Shell>;
  if (q.error) return <Shell><ErrorNote error={q.error} title="Couldn't load the case" /></Shell>;
  if (!q.data) return <Shell><h1>Case not found</h1><p className="pra-sub">It doesn't exist, or it belongs to another organisation.</p></Shell>;
  const data = q.data;
  const c = data.case;
  return (
    <Shell>
      <header className="pra-top">
        <div>
          <div className="pra-eyebrow"><Link to="/property">Property cases</Link> / {c.ref}</div>
          <h1>{c.label}</h1>
          <p className="pra-sub">{PROBLEMS[c.problem as keyof typeof PROBLEMS]} · {OBJECTIVES[c.objective as keyof typeof OBJECTIVES]}</p>
        </div>
        <div className="pra-actions">
          <Tag tone={DISPOSITION_TONE[c.disposition as Disposition]}>{DISPOSITIONS[c.disposition as Disposition].label}</Tag>
          <Link to={`/property/${c.id}/report`} className="pra-btn primary">Assessment report</Link>
          <Link to={`/property/${c.id}/month`} className="pra-btn">Monthly update</Link>
        </div>
      </header>
      <nav className="pra-tabs" aria-label="Case sections">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" className={tab === k ? "active" : ""} aria-current={tab === k ? "page" : undefined} onClick={() => setTab(k)}>{label}</button>
        ))}
      </nav>
      {tab === "overview" && <Overview data={data} />}
      {tab === "assessment" && <Assessment data={data} onChanged={q.reload} />}
      {tab === "evidence" && <EvidenceRoom data={data} onChanged={q.reload} />}
      {tab === "economics" && <Economics data={data} onChanged={q.reload} />}
      {tab === "pathways" && <Pathways data={data} onChanged={q.reload} />}
      {tab === "workstreams" && <Workstreams data={data} onChanged={q.reload} />}
      {tab === "outcomes" && <Outcomes data={data} onChanged={q.reload} />}
      {tab === "gates" && <Gates data={data} onChanged={q.reload} />}
      {tab === "history" && <History data={data} />}
    </Shell>
  );
}

const fmtMetric = (m: Metric, kind: "money" | "percent" | "months" = "money") =>
  m.value === null ? "Not established" : kind === "money" ? money(m.value) : kind === "percent" ? `${m.value.toFixed(1)}%` : `${m.value.toFixed(1)} months`;

function MetricNote({ m }: { m: Metric }) {
  if (m.value !== null) return <span>{m.basis ? `${BASES[m.basis]} basis` : ""} · {m.formula}</span>;
  if (m.missing.length) return <span>Missing: {m.missing.map((k) => FIGURES[k].label.toLowerCase()).join(", ")}</span>;
  return <span>Not defined for these figures · {m.formula}</span>;
}

function Overview({ data }: { data: CaseData }) {
  const econ = economics(data.figures.map(toFigure));
  const ready = evidenceReadiness(data.evidence.map(toEvidence), new Date().toISOString());
  const c = data.case;
  return (
    <>
      <div className="pra-metrics">
        <article className="pra-card"><div className="pra-label">Monthly cash flow after debt</div><div className="pra-value" data-testid="m-cash">{fmtMetric(econ.cashFlow)}</div><div className="pra-note"><MetricNote m={econ.cashFlow} /></div></article>
        <article className="pra-card"><div className="pra-label">Net operating income</div><div className="pra-value">{fmtMetric(econ.noi)}</div><div className="pra-note"><MetricNote m={econ.noi} /></div></article>
        <article className="pra-card"><div className="pra-label">Rent collection rate</div><div className="pra-value">{fmtMetric(econ.collectionRate, "percent")}</div><div className="pra-note"><MetricNote m={econ.collectionRate} /></div></article>
        <article className="pra-card"><div className="pra-label">Evidence readiness</div><div className="pra-value" data-testid="m-evidence">{ready.percent}%</div><div className="pra-note">{ready.checked} of {ready.total} material items checked and current · weighted by importance</div></article>
      </div>
      {econ.warnings.length > 0 && <div className="pra-notice" role="alert">{econ.warnings.map((w) => <p key={w}>{w}</p>)}</div>}
      <div className="pra-two">
        <article className="pra-card">
          <div className="pra-head"><div><h2>Current case position</h2><p>{DISPOSITIONS[c.disposition as Disposition].meaning}</p></div><Tag tone={DISPOSITION_TONE[c.disposition as Disposition]}>{DISPOSITIONS[c.disposition as Disposition].label}</Tag></div>
          <p className="pra-text">{c.disposition_reason}</p>
          <p className="pra-note">Since {when(c.disposition_at)} · owner authority: {AUTHORITY[c.authority as Authority].toLowerCase()}</p>
        </article>
        <article className="pra-card">
          <div className="pra-head"><div><h2>Decision integrity</h2><p>Rules the database enforces on this case.</p></div></div>
          <ul className="pra-rules">
            <li><strong>Unknown is not zero.</strong> A figure not supplied has no value, and nothing that needs it is calculated.</li>
            <li><strong>Evidence before commitment.</strong> A verified figure rests on evidence that was checked; PROCEED needs confirmed authority.</li>
            <li><strong>Measure realised value.</strong> Collected rent, not advertised rent; forecasts are always estimates.</li>
          </ul>
        </article>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Assessment profile and disposition
// ---------------------------------------------------------------------------

function Assessment({ data, onChanged }: { data: CaseData; onChanged: () => void }) {
  const org = useOrg();
  const canWork = useCanWork();
  const c = data.case;
  const [f, setF] = useState({
    label: c.label, property_type: c.property_type ?? "", problem: c.problem, objective: c.objective, suspected_cause: c.suspected_cause,
    authority: c.authority, authority_note: c.authority_note ?? "", constraints: c.constraints ?? "", desired_outcome: c.desired_outcome ?? "",
  });
  const [disp, setDisp] = useState<Disposition>(c.disposition as Disposition);
  const [reason, setReason] = useState("");
  const profile = useWrite(onChanged);
  const decision = useWrite(() => { setReason(""); onChanged(); });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  return (
    <div className="pra-two">
      <form className="pra-card" aria-label="Assessment profile" onSubmit={(e) => { e.preventDefault(); void profile.run(null, () => updatePropertyCase(org.db, c.id, {
        label: f.label.trim(), property_type: f.property_type || null, problem: f.problem, objective: f.objective, suspected_cause: f.suspected_cause,
        authority: f.authority, authority_note: blank(f.authority_note), constraints: blank(f.constraints), desired_outcome: blank(f.desired_outcome),
      })); }}>
        <div className="pra-head"><div><h2>Assessment profile</h2><p>Record the facts and constraints before analysis. Say which are verified and which are the owner's claims.</p></div></div>
        <fieldset className="pra-fields" disabled={!canWork}>
          <label className="pra-field pra-full">Case / property label<input value={f.label} onChange={set("label")} /></label>
          <label className="pra-field">Primary problem<select value={f.problem} onChange={set("problem")}>{Object.entries(PROBLEMS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="pra-field">Owner objective<select value={f.objective} onChange={set("objective")}>{Object.entries(OBJECTIVES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="pra-field">Property type<select value={f.property_type} onChange={set("property_type")}><option value="">Not supplied</option>{PROPERTY_TYPES.map((t) => <option key={t} value={t}>{PROPERTY_TYPE_LABEL[t]}</option>)}</select></label>
          <label className="pra-field">Suspected cause (not yet verified)<select value={f.suspected_cause} onChange={set("suspected_cause")}>{Object.entries(SUSPECTED_CAUSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="pra-field">Owner authority / mandate<select value={f.authority} onChange={set("authority")}>{Object.entries(AUTHORITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="pra-field">How authority was confirmed<input value={f.authority_note} onChange={set("authority_note")} placeholder="e.g. title deed and signed mandate, 16 Oct" /></label>
          <label className="pra-field pra-full">Deadlines, constraints and known issues<textarea rows={3} value={f.constraints} onChange={set("constraints")} /></label>
          <label className="pra-field pra-full">Definition of success<textarea rows={2} value={f.desired_outcome} onChange={set("desired_outcome")} placeholder="To be quantified after the baseline" /></label>
        </fieldset>
        <ErrorNote error={profile.error} title="The profile wasn't saved" />
        {canWork && <button className="pra-btn" disabled={profile.busy}>Save profile</button>}
      </form>
      <form className="pra-card" aria-label="Disposition" onSubmit={(e) => { e.preventDefault(); void decision.run(
        disp === c.disposition ? { ok: false, code: "TEBOS_VALIDATION", reason: "Choose a different disposition to record a change." } : checkDisposition({ authority: c.authority as Authority }, disp, reason),
        () => updatePropertyCase(org.db, c.id, { disposition: disp, disposition_reason: reason.trim() }),
      ); }}>
        <div className="pra-head"><div><h2>Disposition</h2><p>Change it only when evidence justifies it. Every change keeps its reason and time.</p></div><Tag tone={DISPOSITION_TONE[c.disposition as Disposition]}>{DISPOSITIONS[c.disposition as Disposition].label}</Tag></div>
        <p className="pra-text">{c.disposition_reason}</p>
        <p className="pra-note">Recorded {when(c.disposition_at)}</p>
        {canWork && (
          <fieldset className="pra-fields">
            <label className="pra-field pra-full">New disposition<select value={disp} onChange={(e) => setDisp(e.target.value as Disposition)}>{Object.entries(DISPOSITIONS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
            <p className="pra-note pra-full">{DISPOSITIONS[disp].meaning}</p>
            <label className="pra-field pra-full">Reason and evidence for the change<textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
          </fieldset>
        )}
        <ErrorNote error={decision.error} title="The disposition wasn't recorded" />
        {canWork && <button className="pra-btn primary" disabled={decision.busy}>Record disposition</button>}
        <div className="pra-notice">The disposition is an internal workflow status, not a statement that the property is profitable, financeable or legally compliant.</div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Evidence room
// ---------------------------------------------------------------------------

function EvidenceRoom({ data, onChanged }: { data: CaseData; onChanged: () => void }) {
  const canWork = useCanWork();
  const asOf = new Date().toISOString();
  const ready = evidenceReadiness(data.evidence.map(toEvidence), asOf);
  const [editing, setEditing] = useState<{ item?: PropertyEvidence; kind?: string } | null>(null);
  const extra = data.evidence.filter((e) => !EVIDENCE_CHECKLIST.some((c) => c.kind === e.kind));
  return (
    <>
      <section className="pra-card" aria-label="Evidence readiness">
        <div className="pra-head"><div><h2>Evidence room</h2><p>Readiness weighs each item by how material it is and by its quality: checked and current counts fully; received, or checked but older than six months, half.</p></div><Tag>{ready.percent}% ready</Tag></div>
        <div className="pra-progress" role="progressbar" aria-valuenow={ready.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Evidence readiness"><div style={{ width: `${ready.percent}%` }} /></div>
        {(ready.conflicting.length > 0 || ready.stale.length > 0) && (
          <div className="pra-notice" role="alert">
            {ready.conflicting.map((e) => <p key={e.id}>Conflicting: {e.title}. Reconcile it before the evidence gate can pass.</p>)}
            {ready.stale.map((e) => <p key={e.id}>Stale: {e.title}. Older than six months; obtain a current one.</p>)}
          </div>
        )}
      </section>
      {editing && <EvidenceForm data={data} item={editing.item} kind={editing.kind} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChanged(); }} />}
      <div className="pra-two">
        {(Object.keys(EVIDENCE_CATEGORIES) as EvidenceCategory[]).filter((cat) => cat !== "authority").map((cat) => (
          <section key={cat} className="pra-card" aria-label={EVIDENCE_CATEGORIES[cat]}>
            <h3 className="pra-h3">{EVIDENCE_CATEGORIES[cat]}</h3>
            <ul className="pra-checks">
              {EVIDENCE_CHECKLIST.filter((c) => c.category === cat).map((c) => {
                const items = data.evidence.filter((e) => e.kind === c.kind);
                return (
                  <li key={c.kind} className="pra-check" data-testid={`evidence-${c.kind}`}>
                    <div>
                      <strong>{c.title}</strong> <span className="pra-weight" title="How material this item is">weight {c.weight}</span>
                      <small>{c.hint}</small>
                      {items.length === 0 && <small className="pra-missing">Not requested yet</small>}
                      {items.map((e) => (
                        <div key={e.id} className="pra-item">
                          <EvidenceStatusTag e={e} asOf={asOf} />
                          <span>{e.source ? `${e.source}` : "Source not recorded"}{e.period_end ? ` · to ${e.period_end}` : ""}{e.responsible ? ` · ${e.responsible}` : ""}</span>
                          {canWork && <button type="button" className="pra-link" onClick={() => setEditing({ item: e })}>Edit</button>}
                        </div>
                      ))}
                    </div>
                    {canWork && <button type="button" className="pra-btn ghost" onClick={() => setEditing({ kind: c.kind })}>{items.length ? "Add another" : "Record"}</button>}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      <section className="pra-card" aria-label="Other evidence">
        <div className="pra-head"><div><h2>Other evidence</h2><p>Title deeds, mandates, plans, quotes, valuations: anything outside the checklist.</p></div>{canWork && <button type="button" className="pra-btn" onClick={() => setEditing({ kind: "other" })}>+ Add evidence</button>}</div>
        {extra.length === 0 ? <p className="pra-empty">None recorded.</p> : (
          <ul className="pra-checks">{extra.map((e) => (
            <li key={e.id} className="pra-check"><div><strong>{e.title}</strong><div className="pra-item"><EvidenceStatusTag e={e} asOf={asOf} /><span>{e.source ?? "Source not recorded"}</span></div></div>
              {canWork && <button type="button" className="pra-link" onClick={() => setEditing({ item: e })}>Edit</button>}</li>
          ))}</ul>
        )}
      </section>
    </>
  );
}

function EvidenceStatusTag({ e, asOf }: { e: PropertyEvidence; asOf: string }) {
  const stale = e.status === "checked" && isStale(toEvidence(e), asOf);
  const tone = e.status === "checked" ? (stale ? "amber" : "green") : e.status === "conflicting" ? "red" : e.status === "received" ? "amber" : "";
  return <Tag tone={tone}>{stale ? "checked · stale" : e.status}{e.confidence ? ` · ${e.confidence} confidence` : ""}</Tag>;
}

function EvidenceForm({ data, item, kind, onClose, onSaved }: { data: CaseData; item?: PropertyEvidence; kind?: string; onClose: () => void; onSaved: () => void }) {
  const org = useOrg();
  const spec = EVIDENCE_CHECKLIST.find((c) => c.kind === (item?.kind ?? kind));
  const [f, setF] = useState({
    title: item?.title ?? spec?.title ?? "", category: item?.category ?? spec?.category ?? "authority", status: item?.status ?? "requested",
    source: item?.source ?? "", period_start: item?.period_start ?? "", period_end: item?.period_end ?? "", received_on: item?.received_on ?? "",
    responsible: item?.responsible ?? "", confidence: item?.confidence ?? "", document_ref: item?.document_ref ?? "", notes: item?.notes ?? "", follow_up: item?.follow_up ?? "",
  });
  const w = useWrite(onSaved);
  const del = useWrite(onSaved);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const row = {
    id: item?.id, org_id: data.case.org_id, case_id: data.case.id, kind: item?.kind ?? kind ?? "other", category: f.category, title: f.title.trim(),
    status: f.status, source: blank(f.source), period_start: blank(f.period_start), period_end: blank(f.period_end), received_on: blank(f.received_on),
    responsible: blank(f.responsible), confidence: blank(f.confidence), document_ref: blank(f.document_ref), notes: blank(f.notes), follow_up: blank(f.follow_up),
  };
  const check = !row.title ? { ok: false as const, code: "TEBOS_VALIDATION" as const, reason: "Give the evidence a title." } : checkEvidence({
    status: row.status as EvidenceStatus, source: row.source, confidence: row.confidence as never, receivedOn: row.received_on, notes: row.notes, periodStart: row.period_start, periodEnd: row.period_end,
  });
  return (
    <form className="pra-card pra-editor" aria-label={item ? `Edit ${item.title}` : "Record evidence"} onSubmit={(e) => { e.preventDefault(); void w.run(check, () => savePropertyEvidence(org.db, row)); }}>
      <div className="pra-head"><div><h2>{item ? "Edit evidence" : "Record evidence"}</h2><p>Mark an item checked only after it has been obtained and checked against its source.</p></div><button type="button" className="pra-btn ghost" onClick={onClose}>Close</button></div>
      <div className="pra-fields">
        <label className="pra-field pra-full">Title<input value={f.title} onChange={set("title")} /></label>
        {!spec && <label className="pra-field">Category<select value={f.category} onChange={set("category")}>{Object.entries(EVIDENCE_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>}
        <label className="pra-field">Status<select value={f.status} onChange={set("status")}>{EVIDENCE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
        <label className="pra-field">Confidence<select value={f.confidence} onChange={set("confidence")}><option value="">Not assessed</option>{CONFIDENCE.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
        <label className="pra-field">Source<input value={f.source} onChange={set("source")} placeholder="e.g. bank statement, managing agent" /></label>
        <label className="pra-field">Responsible person<input value={f.responsible} onChange={set("responsible")} /></label>
        <label className="pra-field">Period from<input type="date" value={f.period_start} onChange={set("period_start")} /></label>
        <label className="pra-field">Period to<input type="date" value={f.period_end} onChange={set("period_end")} /></label>
        <label className="pra-field">Received on<input type="date" value={f.received_on} onChange={set("received_on")} /></label>
        <label className="pra-field">Document reference<input value={f.document_ref} onChange={set("document_ref")} placeholder="Where the document is kept (not uploaded here yet)" /></label>
        <label className="pra-field pra-full">Reconciliation notes<textarea rows={2} value={f.notes} onChange={set("notes")} placeholder="Conflicting figures, stale documents, open questions" /></label>
        <label className="pra-field pra-full">Follow-up action<input value={f.follow_up} onChange={set("follow_up")} /></label>
      </div>
      <ErrorNote error={w.error ?? del.error} title="The evidence wasn't saved" />
      <div className="pra-row">
        <button className="pra-btn primary" disabled={w.busy}>Save evidence</button>
        {item && <button type="button" className="pra-btn ghost" disabled={del.busy} onClick={() => {
          if (window.confirm(`Remove "${item.title}"? Its record stays in the case history.`)) void del.run(null, () => deletePropertyEvidence(org.db, item.id));
        }}>Remove</button>}
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Economics
// ---------------------------------------------------------------------------

function Economics({ data, onChanged }: { data: CaseData; onChanged: () => void }) {
  const canWork = useCanWork();
  const econ = economics(data.figures.map(toFigure));
  const [annual, setAnnual] = useState(false);
  const groups = [["asset", "Asset"], ["income", "Income"], ["costs", "Costs and debt"], ["scenario", "Scenario assumptions (always estimates)"]] as const;
  const show = (m: Metric) => (annual && m.value !== null ? { ...m, value: m.value * 12 } : m);
  return (
    <>
      <div className="pra-notice">Enter monthly rand figures and say what each one is. Leave unknown figures empty: they are never treated as zero. Rent due should equal scheduled rent less vacancy loss; the shortfall between rent due and rent collected is counted separately, once.</div>
      <div className="pra-two">
        <section className="pra-card" aria-label="Figures">
          {groups.map(([g, title]) => (
            <div key={g}>
              <h3 className="pra-h3">{title}</h3>
              {FIGURE_KEYS.filter((k) => FIGURES[k].group === g).map((k) => (
                <FigureRow key={k} k={k} data={data} existing={data.figures.find((f) => f.key === k)} canWork={canWork} onChanged={onChanged} />
              ))}
            </div>
          ))}
        </section>
        <section className="pra-card" aria-label="Calculated indicators">
          <div className="pra-head"><div><h2>Calculated indicators</h2><p>Shown only when every input is supplied, labelled by the weakest input's basis.</p></div>
            <button type="button" className="pra-btn ghost" aria-pressed={annual} onClick={() => setAnnual(!annual)}>{annual ? "Annual" : "Monthly"}</button></div>
          {econ.warnings.length > 0 && <div className="pra-notice" role="alert">{econ.warnings.map((w) => <p key={w}>{w}</p>)}</div>}
          {([
            ["Effective income", show(econ.effectiveIncome), "money"], ["Collection shortfall", show(econ.collectionShortfall), "money"],
            ["Net operating income (NOI)", show(econ.noi), "money"], ["Cash flow after debt and reserve", show(econ.cashFlow), "money"],
            ["Rent collection rate", econ.collectionRate, "percent"], ["Physical occupancy", econ.occupancy, "percent"],
            ["Operating expense ratio", econ.expenseRatio, "percent"], ["Break-even occupancy", econ.breakEvenOccupancy, "percent"],
          ] as const).map(([label, m, kind]) => (
            <div key={label} className="pra-kpi" data-testid={`kpi-${label}`}>
              <div><span>{label}</span><small><MetricNote m={m} /></small></div>
              <strong>{fmtMetric(m, kind)}{m.value !== null && m.basis && m.basis !== "verified" ? <Tag tone={BASIS_TONE[m.basis]}>{BASES[m.basis]}</Tag> : null}</strong>
            </div>
          ))}
          <p className="pra-note">Tax, timing effects and one-off capital costs are kept out of monthly cash flow; treat them separately.</p>
        </section>
      </div>
      <div className="pra-three">
        <article className="pra-card"><h3 className="pra-h3">Base case</h3><div className="pra-value">{fmtMetric(econ.scenarios.base)}</div><div className="pra-note"><MetricNote m={econ.scenarios.base} /></div></article>
        <article className="pra-card"><h3 className="pra-h3">Optimisation case <Tag>Estimate</Tag></h3><div className="pra-value">{fmtMetric(econ.scenarios.optimisation)}</div>
          <div className="pra-note"><MetricNote m={econ.scenarios.optimisation} /></div><div className="pra-note">Simple payback: {fmtMetric(econ.scenarios.payback, "months")}</div></article>
        <article className="pra-card"><h3 className="pra-h3">Downside case <Tag>Stress test</Tag></h3><div className="pra-value">{fmtMetric(econ.scenarios.downside)}</div><div className="pra-note"><MetricNote m={econ.scenarios.downside} /></div>
          <div className="pra-note">One-off capital need: {fmtMetric(econ.oneOffCapex)}</div></article>
      </div>
    </>
  );
}

function FigureRow({ k, data, existing, canWork, onChanged }: { k: FigureKey; data: CaseData; existing?: PropertyFigure; canWork: boolean; onChanged: () => void }) {
  const org = useOrg();
  const spec = FIGURES[k];
  const [value, setValue] = useState(existing ? String(Number(existing.value)) : "");
  const [basis, setBasis] = useState<Basis>((existing?.basis as Basis) ?? (spec.forecast ? "estimated" : "owner_reported"));
  const [evidenceId, setEvidenceId] = useState(existing?.evidence_id ?? "");
  const [asOf, setAsOf] = useState(existing?.as_of ?? today());
  const w = useWrite(onChanged);
  const checked = data.evidence.filter((e) => e.status === "checked");
  const save = (e: FormEvent) => {
    e.preventDefault();
    const n = value.trim() === "" ? NaN : Number(value);
    const ev = data.evidence.find((x) => x.id === evidenceId);
    const check = value.trim() === "" ? { ok: false as const, code: "TEBOS_VALIDATION" as const, reason: "Enter a value, or clear the figure to mark it unknown." }
      : checkFigure({ key: k, value: n, basis, evidenceId: evidenceId || null }, ev ? { status: ev.status as EvidenceStatus } : null);
    void w.run(check, () => savePropertyFigure(org.db, existing, {
      org_id: data.case.org_id, case_id: data.case.id, key: k, value: n, basis, evidence_id: evidenceId || null, as_of: asOf, note: null,
    }));
  };
  return (
    <form className="pra-figure" aria-label={spec.label} onSubmit={save}>
      <label className="pra-field">{spec.label}{spec.money ? (k === "one_off_capex" || k === "implementation_cost" ? " (R, once-off)" : k === "arrears_balance" ? " (R, total)" : " (R / month)") : ""}
        <input type="number" min="0" step={spec.money ? "0.01" : "1"} inputMode="decimal" value={value} placeholder="Unknown" disabled={!canWork} onChange={(e) => setValue(e.target.value)} />
      </label>
      <label className="pra-field">Basis
        <select value={basis} disabled={!canWork || spec.forecast} onChange={(e) => setBasis(e.target.value as Basis)}>
          {(Object.keys(BASES) as Basis[]).filter((b) => !spec.forecast || b === "estimated").map((b) => <option key={b} value={b}>{BASES[b]}</option>)}
        </select>
      </label>
      {basis === "verified" && (
        <label className="pra-field">Checked evidence
          <select value={evidenceId} disabled={!canWork} onChange={(e) => setEvidenceId(e.target.value)}>
            <option value="">{checked.length ? "Choose…" : "No checked evidence yet"}</option>
            {checked.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
          </select>
        </label>
      )}
      <label className="pra-field">As of<input type="date" value={asOf} disabled={!canWork} onChange={(e) => setAsOf(e.target.value)} /></label>
      {canWork && (
        <div className="pra-row">
          <button className="pra-btn" disabled={w.busy}>Save</button>
          {existing && <button type="button" className="pra-btn ghost" disabled={w.busy} onClick={() => {
            if (window.confirm(`Mark "${spec.label}" unknown again? Its history stays in the case record.`)) void w.run(null, () => clearPropertyFigure(org.db, existing.id));
          }}>Clear</button>}
        </div>
      )}
      {existing && <span className="pra-note pra-full">Recorded: {spec.money ? money(Number(existing.value)) : Number(existing.value)} · {BASES[existing.basis as Basis]} · as of {existing.as_of}</span>}
      <div className="pra-full"><ErrorNote error={w.error} title={`${spec.label} wasn't saved`} /></div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Pathways
// ---------------------------------------------------------------------------

function Pathways({ data, onChanged }: { data: CaseData; onChanged: () => void }) {
  const canWork = useCanWork();
  const [open, setOpen] = useState<PathwayKey | null>(null);
  const recommended = data.pathways.find((p) => p.status === "recommended");
  return (
    <>
      <section className="pra-card" aria-label="Pathway register">
        <div className="pra-head"><div><h2>Opportunity and pathway register</h2><p>The route comes from the evidence and constraints, not from a bias toward development, refinancing or selling. One pathway at most is recommended, and it must say why it beats the others and what would change it.</p></div>
          {recommended ? <Tag tone="green">Recommended: {PATHWAYS[recommended.pathway as PathwayKey].label}</Tag> : <Tag tone="amber">No recommendation yet</Tag>}</div>
        <div className="pra-table-wrap">
          <table className="pra-table">
            <thead><tr><th>Pathway</th><th>Use when</th><th>Key tests</th><th>Status</th><th /></tr></thead>
            <tbody>
              {(Object.keys(PATHWAYS) as PathwayKey[]).map((k) => {
                const p = data.pathways.find((x) => x.pathway === k);
                const status = (p?.status ?? "not assessed") as PathwayStatus | "not assessed";
                return (
                  <tr key={k} data-testid={`pathway-${k}`}>
                    <td><strong>{PATHWAYS[k].label}</strong>{p?.rationale ? <><br /><span className="pra-note">{p.rationale}</span></> : null}</td>
                    <td>{PATHWAYS[k].useWhen}</td>
                    <td>{PATHWAYS[k].tests}</td>
                    <td><Tag tone={status === "recommended" ? "green" : status === "rejected" ? "red" : ""}>{status}</Tag></td>
                    <td>{canWork && <button type="button" className="pra-link" onClick={() => setOpen(open === k ? null : k)}>{open === k ? "Close" : p ? "Edit" : "Assess"}</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      {open && <PathwayForm key={open} k={open} data={data} existing={data.pathways.find((p) => p.pathway === open)} onSaved={() => { setOpen(null); onChanged(); }} />}
    </>
  );
}

function PathwayForm({ k, data, existing, onSaved }: { k: PathwayKey; data: CaseData; existing?: PropertyPathway; onSaved: () => void }) {
  const org = useOrg();
  const [f, setF] = useState({
    status: (existing?.status ?? "considered") as PathwayStatus, rationale: existing?.rationale ?? "", why_preferred: existing?.why_preferred ?? "",
    evidence_summary: existing?.evidence_summary ?? "", cost_once_off: existing?.cost_once_off === null || existing?.cost_once_off === undefined ? "" : String(existing.cost_once_off),
    timeline: existing?.timeline ?? "", risks: existing?.risks ?? "", downside: existing?.downside ?? "", disqualifiers: existing?.disqualifiers ?? "",
    decision_owner: existing?.decision_owner ?? "", would_change: existing?.would_change ?? "",
  });
  const [specialists, setSpecialists] = useState<Specialist[]>((existing?.specialists ?? []) as Specialist[]);
  const w = useWrite(onSaved);
  const set = (key: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [key]: e.target.value });
  const other = data.pathways.find((p) => p.status === "recommended" && p.pathway !== k);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const check = f.status === "recommended" && other
      ? { ok: false as const, code: "TEBOS_VALIDATION" as const, reason: `${PATHWAYS[other.pathway as PathwayKey].label} is already recommended. Move it back to considered first.` }
      : checkPathway({ pathway: k, status: f.status, rationale: blank(f.rationale), whyPreferred: blank(f.why_preferred), evidenceSummary: blank(f.evidence_summary), decisionOwner: blank(f.decision_owner), wouldChange: blank(f.would_change) });
    void w.run(check, () => savePropertyPathway(org.db, existing, {
      org_id: data.case.org_id, case_id: data.case.id, pathway: k, status: f.status, rationale: blank(f.rationale), why_preferred: blank(f.why_preferred),
      evidence_summary: blank(f.evidence_summary), cost_once_off: f.cost_once_off.trim() === "" ? null : Number(f.cost_once_off), timeline: blank(f.timeline),
      risks: blank(f.risks), specialists, downside: blank(f.downside), disqualifiers: blank(f.disqualifiers), decision_owner: blank(f.decision_owner), would_change: blank(f.would_change),
    }));
  };
  return (
    <form className="pra-card pra-editor" aria-label={`Assess ${PATHWAYS[k].label}`} onSubmit={submit}>
      <div className="pra-head"><div><h2>{PATHWAYS[k].label}</h2><p>{PATHWAYS[k].tests}</p></div></div>
      <div className="pra-fields">
        <label className="pra-field">Status<select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as PathwayStatus })}><option value="considered">Considered</option><option value="recommended">Recommended</option><option value="rejected">Rejected</option></select></label>
        <label className="pra-field">Decision owner<input value={f.decision_owner} onChange={set("decision_owner")} /></label>
        <label className="pra-field pra-full">Rationale<textarea rows={2} value={f.rationale} onChange={set("rationale")} /></label>
        <label className="pra-field pra-full">Why it is preferred over the alternatives<textarea rows={2} value={f.why_preferred} onChange={set("why_preferred")} /></label>
        <label className="pra-field pra-full">Evidence it rests on<textarea rows={2} value={f.evidence_summary} onChange={set("evidence_summary")} /></label>
        <label className="pra-field pra-full">What new evidence would change it<textarea rows={2} value={f.would_change} onChange={set("would_change")} /></label>
        <label className="pra-field">Estimated once-off cost (R)<input type="number" min="0" step="0.01" value={f.cost_once_off} onChange={set("cost_once_off")} placeholder="Unknown" /></label>
        <label className="pra-field">Timeline<input value={f.timeline} onChange={set("timeline")} placeholder="Planning window, not a promise" /></label>
        <label className="pra-field pra-full">Key risks<textarea rows={2} value={f.risks} onChange={set("risks")} /></label>
        <label className="pra-field pra-full">Downside case<textarea rows={2} value={f.downside} onChange={set("downside")} /></label>
        <label className="pra-field pra-full">Disqualifiers<textarea rows={2} value={f.disqualifiers} onChange={set("disqualifiers")} /></label>
        <fieldset className="pra-field pra-full"><legend>Specialist dependencies</legend>
          <div className="pra-chips">{(Object.keys(SPECIALISTS) as Specialist[]).map((s) => (
            <label key={s} className="pra-chip"><input type="checkbox" checked={specialists.includes(s)} onChange={(e) => setSpecialists(e.target.checked ? [...specialists, s] : specialists.filter((x) => x !== s))} /> {SPECIALISTS[s]}</label>
          ))}</div>
        </fieldset>
      </div>
      <ErrorNote error={w.error} title="The pathway wasn't saved" />
      <button className="pra-btn primary" disabled={w.busy}>Save pathway</button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Workstreams
// ---------------------------------------------------------------------------

const WS_TONE: Record<WorkstreamStatus, string> = { planned: "", in_progress: "amber", blocked: "red", done: "green", cancelled: "" };

function Workstreams({ data, onChanged }: { data: CaseData; onChanged: () => void }) {
  const canWork = useCanWork();
  const [editing, setEditing] = useState<PropertyWorkstream | "new" | null>(null);
  const list = data.workstreams.map(toWorkstream);
  const exceptions = workstreamExceptions(list, today());
  const titleOf = (id: string | null) => data.workstreams.find((w) => w.id === id)?.title ?? "";
  return (
    <>
      <section className="pra-card" aria-label="Workstreams">
        <div className="pra-head"><div><h2>Execution workstreams</h2><p>Each one has an accountable owner, a deadline and a status. It starts only once what it depends on is done, spends a budget only once approved, and is done only with evidence of completion.</p></div>
          {canWork && <button type="button" className="pra-btn" onClick={() => setEditing("new")}>+ Add workstream</button>}</div>
        {exceptions.length > 0 && <div className="pra-notice" role="alert">{exceptions.map((x, i) => <p key={`${x.id}-${i}`}>{x.title}: {x.reason}.</p>)}</div>}
        {data.workstreams.length === 0 ? <p className="pra-empty">No workstreams yet. Add them once a pathway is chosen and authorised.</p> : (
          <div className="pra-table-wrap">
            <table className="pra-table" data-testid="workstreams">
              <thead><tr><th>Task</th><th>Owner</th><th>Due</th><th>Status</th><th>Depends on</th><th>Budget</th><th>Completion</th><th /></tr></thead>
              <tbody>{data.workstreams.map((w) => (
                <tr key={w.id}>
                  <td><strong>{w.title}</strong>{w.note ? <><br /><span className="pra-note">{w.note}</span></> : null}</td>
                  <td>{w.owner}</td>
                  <td>{w.due_on}</td>
                  <td><Tag tone={WS_TONE[w.status as WorkstreamStatus]}>{w.status.replace("_", " ")}</Tag></td>
                  <td>{titleOf(w.depends_on) || "—"}</td>
                  <td>{w.budget === null ? "—" : money(Number(w.budget))}{w.budget !== null && Number(w.budget) > 0 ? <><br /><span className="pra-note">{APPROVALS[w.approval as ApprovalState]}{w.approved_by ? ` · ${w.approved_by}` : ""}</span></> : null}</td>
                  <td>{w.completion_evidence ? `${w.completion_evidence} (${w.completed_on})` : "—"}</td>
                  <td>{canWork && <button type="button" className="pra-link" onClick={() => setEditing(w)}>Edit</button>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
      {editing && <WorkstreamForm key={editing === "new" ? "new" : editing.id} data={data} existing={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChanged(); }} />}
    </>
  );
}

function WorkstreamForm({ data, existing, onClose, onSaved }: { data: CaseData; existing?: PropertyWorkstream; onClose: () => void; onSaved: () => void }) {
  const org = useOrg();
  const [f, setF] = useState({
    title: existing?.title ?? "", owner: existing?.owner ?? "", due_on: existing?.due_on ?? "", status: (existing?.status ?? "planned") as WorkstreamStatus,
    depends_on: existing?.depends_on ?? "", budget: existing?.budget === null || existing?.budget === undefined ? "" : String(existing.budget),
    approval: (existing?.approval ?? "not_needed") as ApprovalState, approved_by: existing?.approved_by ?? "", approved_on: existing?.approved_on ?? "",
    completion_evidence: existing?.completion_evidence ?? "", completed_on: existing?.completed_on ?? "", note: existing?.note ?? "",
  });
  const w = useWrite(onSaved);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const row = {
      org_id: data.case.org_id, case_id: data.case.id, title: f.title.trim(), owner: f.owner.trim(), due_on: f.due_on, status: f.status,
      depends_on: f.depends_on || null, budget: f.budget.trim() === "" ? null : Number(f.budget), approval: f.approval,
      approved_by: blank(f.approved_by), approved_on: blank(f.approved_on), completion_evidence: blank(f.completion_evidence),
      completed_on: blank(f.completed_on), note: blank(f.note),
    };
    const id = existing?.id ?? "new";
    const others = data.workstreams.filter((x) => x.id !== id).map(toWorkstream);
    const me = { id, title: row.title, owner: row.owner, dueOn: row.due_on, status: row.status, dependsOn: row.depends_on, budget: row.budget, approval: row.approval,
      approvedBy: row.approved_by, approvedOn: row.approved_on, completionEvidence: row.completion_evidence, completedOn: row.completed_on, note: row.note };
    void w.run(checkWorkstream(me, [...others, me]), () => savePropertyWorkstream(org.db, existing, row));
  };
  return (
    <form className="pra-card pra-editor" aria-label={existing ? `Edit ${existing.title}` : "Add workstream"} onSubmit={submit}>
      <div className="pra-head"><div><h2>{existing ? "Edit workstream" : "Add workstream"}</h2><p>Deadlines are planning windows, not promises.</p></div><button type="button" className="pra-btn ghost" onClick={onClose}>Close</button></div>
      <div className="pra-fields">
        <label className="pra-field pra-full">Task<input value={f.title} onChange={set("title")} placeholder="e.g. Reconcile the arrears ledger to bank receipts" /></label>
        <label className="pra-field">Accountable owner<input value={f.owner} onChange={set("owner")} /></label>
        <label className="pra-field">Deadline<input type="date" value={f.due_on} onChange={set("due_on")} /></label>
        <label className="pra-field">Status<select value={f.status} onChange={set("status")}>{WORKSTREAM_STATUSES.map((x) => <option key={x} value={x}>{x.replace("_", " ")}</option>)}</select></label>
        <label className="pra-field">Depends on<select value={f.depends_on} onChange={set("depends_on")}><option value="">Nothing</option>
          {data.workstreams.filter((x) => x.id !== existing?.id).map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</select></label>
        <label className="pra-field">Budget (R)<input type="number" min="0" step="0.01" value={f.budget} onChange={set("budget")} placeholder="None" /></label>
        <label className="pra-field">Budget approval<select value={f.approval} onChange={set("approval")}>{(Object.keys(APPROVALS) as ApprovalState[]).map((x) => <option key={x} value={x}>{APPROVALS[x]}</option>)}</select></label>
        <label className="pra-field">Approved by<input value={f.approved_by} onChange={set("approved_by")} /></label>
        <label className="pra-field">Approved on<input type="date" value={f.approved_on} onChange={set("approved_on")} /></label>
        <label className="pra-field pra-full">Evidence of completion<input value={f.completion_evidence} onChange={set("completion_evidence")} placeholder="What shows it is done" /></label>
        <label className="pra-field">Completed on<input type="date" value={f.completed_on} onChange={set("completed_on")} /></label>
        <label className="pra-field">Note / what blocks it<input value={f.note} onChange={set("note")} /></label>
      </div>
      <ErrorNote error={w.error} title="The workstream wasn't saved" />
      <button className="pra-btn primary" disabled={w.busy}>Save workstream</button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Outcome scorecard
// ---------------------------------------------------------------------------

const signed = (n: number | null, kind: "money" | "pp") =>
  n === null ? "Not established" : kind === "money" ? `${n > 0 ? "+" : ""}${money(n)}` : `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(1)} pp`;

function Outcomes({ data, onChanged }: { data: CaseData; onChanged: () => void }) {
  const org = useOrg();
  const canWork = useCanWork();
  const baseline = data.baseline ? toBaseline(data.baseline) : null;
  const score = scorecard(baseline, toReviews(data.reviews, data.actuals), new Date().toISOString(), data.case.next_review_on);
  const [target, setTarget] = useState(data.baseline?.target_cash_flow === null || data.baseline?.target_cash_flow === undefined ? "" : String(data.baseline.target_cash_flow));
  const [targetNote, setTargetNote] = useState(data.baseline?.target_note ?? "");
  const [nextReview, setNextReview] = useState(data.case.next_review_on ?? "");
  const [reviewOn, setReviewOn] = useState(today());
  const capture = useWrite(onChanged);
  const targetW = useWrite(onChanged);
  const nextW = useWrite(onChanged);
  const newReview = useWrite(onChanged);
  const targetValue = target.trim() === "" ? null : Number(target);
  const targetCheck = targetValue !== null && !Number.isFinite(targetValue) ? { ok: false as const, code: "TEBOS_VALIDATION" as const, reason: "Enter the target as a number." } : null;
  const b = score.baseline;
  return (
    <>
      <section className="pra-card" aria-label="Baseline">
        <div className="pra-head"><div><h2>Baseline</h2><p>The case's figures, frozen as they stand when captured. Results are measured against it; it can't be edited afterwards, only the target revised.</p></div>
          {b ? <Tag tone="green">Captured {b.capturedOn}</Tag> : <Tag tone="amber">Not captured</Tag>}</div>
        {b ? (
          <div className="pra-three">
            <div><div className="pra-label">Baseline cash flow</div><div className="pra-value" data-testid="baseline-cash">{fmtMetric(b.economics.cashFlow)}</div><div className="pra-note"><MetricNote m={b.economics.cashFlow} /></div></div>
            <div><div className="pra-label">Baseline collection rate</div><div className="pra-value">{fmtMetric(b.economics.collectionRate, "percent")}</div></div>
            <div><div className="pra-label">Target cash flow</div><div className="pra-value">{b.targetCashFlow === null ? "Not set" : money(b.targetCashFlow)}</div><div className="pra-note">{data.baseline?.target_note ?? "Set after the analysis"}</div></div>
          </div>
        ) : <p className="pra-empty">{data.figures.length ? "Capture the baseline once the figures reflect the property before any intervention." : "Record the case's figures on the Economics tab first."}</p>}
        {canWork && (
          <form className="pra-fields" aria-label={b ? "Revise target" : "Capture baseline"} onSubmit={(e) => {
            e.preventDefault();
            if (b) void targetW.run(targetCheck, () => setPropertyTarget(org.db, data.baseline!.id, targetValue, blank(targetNote)));
            else void capture.run(targetCheck ?? (data.figures.length ? null : { ok: false, code: "TEBOS_VALIDATION", reason: "Record the baseline figures before capturing the baseline." }),
              () => capturePropertyBaseline(org.db, { org_id: data.case.org_id, case_id: data.case.id, target_cash_flow: targetValue, target_note: blank(targetNote) }));
          }}>
            <label className="pra-field">Target monthly cash flow (R)<input type="number" step="0.01" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Set after analysis" /></label>
            <label className="pra-field">Target note<input value={targetNote} onChange={(e) => setTargetNote(e.target.value)} /></label>
            <div className="pra-full"><ErrorNote error={capture.error ?? targetW.error} title={b ? "The target wasn't saved" : "The baseline wasn't captured"} /></div>
            <button className={`pra-btn ${b ? "" : "primary"}`} disabled={capture.busy || targetW.busy}>{b ? "Save target" : "Capture baseline now"}</button>
          </form>
        )}
      </section>

      <section className="pra-card" aria-label="Scorecard">
        <div className="pra-head"><div><h2>Outcome scorecard</h2><p>Actual performance against the dated baseline. Actuals are measured or stated by the owner, never estimated; a change is shown only when both sides are known.</p></div></div>
        {score.flags.length > 0 && <div className="pra-notice" role="alert">{score.flags.map((x) => <p key={x}>{x}</p>)}</div>}
        {score.rows.length > 0 && (
          <div className="pra-table-wrap">
            <table className="pra-table" data-testid="scorecard">
              <thead><tr><th>Review</th><th className="num">Cash flow</th><th className="num">Change vs baseline</th><th className="num">vs target</th><th className="num">Collection</th><th className="num">Occupancy</th><th className="num">NOI change</th><th className="num">Arrears change</th><th className="num">Spent so far</th></tr></thead>
              <tbody>{score.rows.map((r) => (
                <tr key={r.reviewOn}>
                  <td>{r.reviewOn}</td>
                  <td className="num">{fmtMetric(r.actual.cashFlow)}</td>
                  <td className="num">{signed(r.cashFlowChange.value, "money")}</td>
                  <td className="num">{signed(r.vsTarget, "money")}</td>
                  <td className="num">{signed(r.collectionChange.value, "pp")}</td>
                  <td className="num">{signed(r.occupancyChange.value, "pp")}</td>
                  <td className="num">{signed(r.noiChange.value, "money")}</td>
                  <td className="num">{signed(r.arrears.change, "money")}</td>
                  <td className="num">{r.implementationSpent === null ? "—" : money(r.implementationSpent)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        {canWork && (
          <div className="pra-row">
            <form className="pra-row" aria-label="Next review date" onSubmit={(e) => { e.preventDefault(); void nextW.run(null, () => updatePropertyCase(org.db, data.case.id, { next_review_on: nextReview || null })); }}>
              <label className="pra-field">Next review due<input type="date" value={nextReview} onChange={(e) => setNextReview(e.target.value)} /></label>
              <button className="pra-btn ghost" disabled={nextW.busy}>Set</button>
            </form>
            {b && (
              <form className="pra-row" aria-label="Start a review" onSubmit={(e) => {
                e.preventDefault();
                const bad = reviewOn < b.capturedOn || reviewOn > today() ? { ok: false as const, code: "TEBOS_VALIDATION" as const, reason: `A review is dated between the baseline (${b.capturedOn}) and today.` } : null;
                void newReview.run(bad, () => createPropertyReview(org.db, { org_id: data.case.org_id, case_id: data.case.id, review_on: reviewOn, period_start: null, period_end: null, note: null }));
              }}>
                <label className="pra-field">Review date<input type="date" value={reviewOn} onChange={(e) => setReviewOn(e.target.value)} /></label>
                <button className="pra-btn" disabled={newReview.busy}>Start review</button>
              </form>
            )}
          </div>
        )}
        <ErrorNote error={nextW.error ?? newReview.error} title="That wasn't saved" />
      </section>

      {data.reviews.slice().reverse().map((r) => <ReviewCard key={r.id} data={data} reviewId={r.id} reviewOn={r.review_on} canWork={canWork} onChanged={onChanged} />)}
    </>
  );
}

function ReviewCard({ data, reviewId, reviewOn, canWork, onChanged }: { data: CaseData; reviewId: string; reviewOn: string; canWork: boolean; onChanged: () => void }) {
  return (
    <section className="pra-card" aria-label={`Review of ${reviewOn}`}>
      <div className="pra-head"><div><h2>Review of {reviewOn}</h2><p>Record what actually happened this period. Leave unknown actuals empty.</p></div></div>
      {OUTCOME_KEYS.map((k) => (
        <ActualRow key={k} k={k} data={data} reviewId={reviewId} existing={data.actuals.find((a) => a.review_id === reviewId && a.key === k)} canWork={canWork} onChanged={onChanged} />
      ))}
    </section>
  );
}

function ActualRow({ k, data, reviewId, existing, canWork, onChanged }: { k: OutcomeKey; data: CaseData; reviewId: string; existing?: PropertyActual; canWork: boolean; onChanged: () => void }) {
  const org = useOrg();
  const [value, setValue] = useState(existing ? String(Number(existing.value)) : "");
  const [basis, setBasis] = useState<ActualBasis>((existing?.basis as ActualBasis) ?? "owner_reported");
  const [evidenceId, setEvidenceId] = useState(existing?.evidence_id ?? "");
  const w = useWrite(onChanged);
  const checked = data.evidence.filter((e) => e.status === "checked");
  const isMoney = k !== "units" && k !== "vacant_units";
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const n = value.trim() === "" ? NaN : Number(value);
    const ev = data.evidence.find((x) => x.id === evidenceId);
    const check: Check = value.trim() === "" || !Number.isFinite(n) || n < 0 ? { ok: false, code: "TEBOS_VALIDATION", reason: "Enter the actual, zero or more." }
      : !isMoney && !Number.isInteger(n) ? { ok: false, code: "TEBOS_VALIDATION", reason: "Units are whole numbers." }
      : basis === "verified" && (!ev || ev.status !== "checked") ? { ok: false, code: "TEBOS_VALIDATION", reason: "A verified actual names evidence that was checked." }
      : { ok: true };
    void w.run(check, () => savePropertyActual(org.db, existing, { org_id: data.case.org_id, case_id: data.case.id, review_id: reviewId, key: k, value: n, basis, evidence_id: basis === "verified" ? evidenceId : null }));
  };
  return (
    <form className="pra-figure" aria-label={`Actual: ${OUTCOME_LABEL[k]}`} onSubmit={submit}>
      <label className="pra-field">{OUTCOME_LABEL[k]}{isMoney ? " (R)" : ""}
        <input type="number" min="0" step={isMoney ? "0.01" : "1"} value={value} placeholder="Unknown" disabled={!canWork} onChange={(e) => setValue(e.target.value)} /></label>
      <label className="pra-field">Basis<select value={basis} disabled={!canWork} onChange={(e) => setBasis(e.target.value as ActualBasis)}><option value="owner_reported">Owner-reported</option><option value="verified">Verified</option></select></label>
      {basis === "verified" ? (
        <label className="pra-field">Checked evidence<select value={evidenceId} disabled={!canWork} onChange={(e) => setEvidenceId(e.target.value)}>
          <option value="">{checked.length ? "Choose…" : "No checked evidence yet"}</option>{checked.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</select></label>
      ) : <span />}
      {canWork && <button className="pra-btn" disabled={w.busy}>Save</button>}
      {existing && <span className="pra-note pra-full">Recorded: {isMoney ? money(Number(existing.value)) : Number(existing.value)} · {BASES[existing.basis as Basis]}</span>}
      <div className="pra-full"><ErrorNote error={w.error} title={`${OUTCOME_LABEL[k]} wasn't saved`} /></div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Gates
// ---------------------------------------------------------------------------

function Gates({ data, onChanged }: { data: CaseData; onChanged: () => void }) {
  const canWork = useCanWork();
  return (
    <section className="pra-card" aria-label="Execution gates">
      <div className="pra-head"><div><h2>Execution gates</h2><p>Each gate passes in order, with an owner and the evidence for passing it. The evidence gate needs the owner's authority confirmed and no conflicting evidence.</p></div></div>
      {GATES.map((g, i) => <GateRow key={g.key} n={i + 1} gate={g.key} data={data} existing={data.gates.find((x) => x.gate === g.key)} canWork={canWork} onChanged={onChanged} />)}
    </section>
  );
}

function GateRow({ n, gate, data, existing, canWork, onChanged }: { n: number; gate: GateKey; data: CaseData; existing?: PropertyGate; canWork: boolean; onChanged: () => void }) {
  const org = useOrg();
  const spec = GATES.find((g) => g.key === gate)!;
  const [status, setStatus] = useState<GateStatus>((existing?.status as GateStatus) ?? "not_started");
  const [owner, setOwner] = useState(existing?.owner ?? "");
  const [note, setNote] = useState(existing?.note ?? "");
  const w = useWrite(onChanged);
  const conflicting = data.evidence.filter((e) => e.status === "conflicting").length;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const check = checkGate(data.gates.map(toGate), { gate, status, owner: blank(owner), note: blank(note) },
      { authority: data.case.authority as Authority, conflicting, hasBaseline: !!data.baseline, actuals: data.actuals.length });
    void w.run(check, () => savePropertyGate(org.db, existing, { org_id: data.case.org_id, case_id: data.case.id, gate, status, owner: blank(owner), note: blank(note) }));
  };
  const tone = existing?.status === "passed" ? "green" : existing?.status === "blocked" ? "red" : existing?.status === "in_progress" ? "amber" : "";
  return (
    <form className="pra-gate" aria-label={spec.title} onSubmit={submit} data-testid={`gate-${gate}`}>
      <div className="pra-gate-num">GATE {String(n).padStart(2, "0")}</div>
      <div>
        <h3 className="pra-h3">{spec.title} <Tag tone={tone}>{(existing?.status ?? "not_started").replace("_", " ")}</Tag></h3>
        <p className="pra-note">{spec.question}</p>
        {canWork ? (
          <div className="pra-fields">
            <label className="pra-field">Status<select value={status} onChange={(e) => setStatus(e.target.value as GateStatus)}>{GATE_STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}</select></label>
            <label className="pra-field">Owner<input value={owner} onChange={(e) => setOwner(e.target.value)} /></label>
            <label className="pra-field pra-full">Evidence / note<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What shows the gate is passed, or what blocks it" /></label>
          </div>
        ) : existing?.note ? <p className="pra-text">{existing.note}{existing.owner ? ` · ${existing.owner}` : ""}</p> : null}
        <ErrorNote error={w.error} title={`${spec.title} wasn't updated`} />
      </div>
      {canWork && <button className="pra-btn" disabled={w.busy}>Update</button>}
    </form>
  );
}

// ---------------------------------------------------------------------------
// History, from the audit trail
// ---------------------------------------------------------------------------

const HISTORY_FIELDS = ["due_on", "approval", "completion_evidence", "target_cash_flow", "next_review_on", "disposition", "disposition_reason", "authority", "value", "basis", "status", "evidence_id", "label", "problem", "objective", "suspected_cause", "owner", "note"];

function History({ data }: { data: CaseData }) {
  const org = useOrg();
  const ids = useMemo(() => [data.case.id, ...data.evidence.map((e) => e.id), ...data.figures.map((f) => f.id), ...data.pathways.map((p) => p.id), ...data.gates.map((g) => g.id),
    ...data.workstreams.map((w) => w.id), ...(data.baseline ? [data.baseline.id] : []), ...data.reviews.map((r) => r.id), ...data.actuals.map((a) => a.id)], [data]);
  const q = useQuery(() => propertyCaseHistory(org.db, org.organisation.id, ids), [ids.join(",")]);
  return (
    <section className="pra-card" aria-label="Case history">
      <div className="pra-head"><div><h2>History</h2><p>Every change to the case and its records, from the tamper-evident audit trail. Removed records keep their history here only while they are linked to the case.</p></div></div>
      {q.loading && !q.data && <Loading />}
      <ErrorNote error={q.error} title="Couldn't load the history" />
      {q.data && q.data.length === 0 && <p className="pra-empty">No changes recorded yet.</p>}
      {q.data && q.data.length > 0 && (
        <ul className="pra-history" data-testid="property-history">
          {q.data.map((ev) => {
            const before = (ev.before ?? {}) as Record<string, unknown>;
            const after = (ev.after ?? {}) as Record<string, unknown>;
            const changed = HISTORY_FIELDS.filter((k) => ev.before && JSON.stringify(before[k]) !== JSON.stringify(after[k]));
            const subject = (after.key ?? before.key ?? after.title ?? before.title ?? after.pathway ?? after.gate ?? after.ref ?? "") as string;
            return (
              <li key={ev.id}>
                <span className="pra-note">{when(ev.occurred_at)}</span>
                <span><strong>{ev.action.replace("property_", "").replace(".", " · ")}</strong>{subject ? ` · ${subject}` : ""}</span>
                {changed.map((k) => <span key={k} className="pra-note">{k}: {String(before[k] ?? "—")} → {String(after[k] ?? "—")}</span>)}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ===========================================================================
// Export helpers shared with the report page
// ===========================================================================

export function downloadJson(filename: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export { caseExport };
