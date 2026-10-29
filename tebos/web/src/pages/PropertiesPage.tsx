// The Property Revenue Architect Platform, Release 1 (docs/pra-platform/release-1.md): a landlord's properties and
// each one's command centre. It answers four questions at all times: where the property stands, what is holding it
// back, what should happen next and who is responsible, and what evidence will show it worked. Everything shown is
// read from records under the owner's own session; stage, milestones and next actions are computed (@core/journey),
// and the database refuses whatever these forms don't catch first.
import { useMemo, useState, type FormEvent } from "react";
import { ArrowRight, Download, Plus } from "lucide-react";
import {
  ACTIVE_PROBLEM, checkAction, checkProblem, checkProblemStatus, EVIDENCE_STATE_LABEL, milestones, nextActions, PROBLEM_CATEGORIES,
  PROBLEM_STATUS_LABEL, problemEvidence, problemStage, propertyStage, propertySummary, STAGES,
  type EvidenceState, type NextAction, type ProblemCategory, type ProblemStatus, type StageKey,
} from "@core/journey";
import { EVIDENCE_CATEGORIES, OBJECTIVES, PROBLEMS, PROPERTY_TYPE_LABEL, PROPERTY_TYPES, type EvidenceStatus, type PropertyType } from "@core/property";
import { canTransition } from "@core/states";
import { saToday } from "@core/week";
import { Badge, Card, Empty, ErrorNote, Field, Loading, PageHeader } from "../components/ui";
import { propertyCaseHistory, type PropertyEvidence, type PropertyWorkstream } from "../lib/data";
import { day, when, type Tone } from "../lib/format";
import {
  addAction, addEvidence, addProblem, createProperty, getPropertyJourney, journeyExport, journeyInput, listProperties, updateAction,
  updateEvidence, updateProblem, updateProperty, type NewProperty, type PropertyJourney, type PropertyProblem,
} from "../lib/journeyData";
import { Link, navigate } from "../lib/router";
import { useOrg } from "../lib/session";
import { useQuery } from "../lib/useQuery";
import { downloadJson } from "./PropertyPage";

const STAGE_TONE: Record<StageKey, Tone> = { discover: "neutral", assess: "warn", strategise: "info", execute: "info", optimise: "good" };
const EVIDENCE_TONE: Record<EvidenceState, Tone> = { none: "warn", missing: "warn", received: "info", verified: "good", conflicting: "bad" };
const STATUS_TONE: Record<ProblemStatus, Tone> = { open: "warn", investigating: "info", planned: "info", resolved: "good", not_resolved: "bad", parked: "neutral" };
const stageLabel = (s: StageKey) => STAGES.find((x) => x.key === s)!.label;
const blank = (s: string) => (s.trim() ? s.trim() : null);

/** busy and error state for one form; a pre-check refusal shows the same way as the database's */
function useSave() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  async function run(check: { ok: true } | { ok: false; reason: string }, work: () => Promise<unknown>, done?: () => void) {
    setError(null);
    if (!check.ok) { setError(new Error(check.reason)); return; }
    setBusy(true);
    try { await work(); done?.(); } catch (err) { setError(err); } finally { setBusy(false); }
  }
  return { busy, error, run };
}
const OK = { ok: true } as const;

// ===========================================================================
// The portfolio
// ===========================================================================

export function PropertiesPage() {
  const org = useOrg();
  const canWork = org.can("evidence.record");
  const today = saToday();
  const q = useQuery(() => listProperties(org.db, org.organisation.id), [org.organisation.id]);
  const [adding, setAdding] = useState(false);
  const rows = useMemo(() => (q.data ?? []).map((d) => ({ d, s: propertySummary(journeyInput(d, today)) })), [q.data, today]);
  return (
    <div className="stack">
      <PageHeader eyebrow="Property journey" title="Your properties"
        actions={canWork ? <button className="btn btn-primary" onClick={() => setAdding((a) => !a)}><Plus size={15} aria-hidden /> {adding ? "Close" : "Add a property"}</button> : undefined}>
        Where each property stands, what is holding it back, what happens next and who is responsible, and the evidence
        that shows whether it worked. Nothing here is estimated or scored: it all comes from your records.
      </PageHeader>
      {adding && <NewPropertyForm />}
      {q.error ? <ErrorNote error={q.error} title="Couldn't load your properties" /> : !q.data ? <Loading /> : rows.length === 0 ? (
        <Card><Empty>No properties yet.{canWork ? " Add the first one to start its journey." : ""}</Empty></Card>
      ) : (
        <>
          {rows.length > 1 && (
            <p className="muted" data-testid="portfolio-totals">
              {rows.length} properties · {rows.reduce((n, r) => n + r.s.openProblems, 0)} open problems · {rows.reduce((n, r) => n + r.s.overdueActions, 0)} overdue actions
            </p>
          )}
          <ul className="journey-portfolio" aria-label="Properties">
            {rows.map(({ d, s }) => (
              <li key={d.case.id} className="card journey-property">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <h2 className="card-title"><Link to={`/properties/${d.case.id}`}>{d.case.label}</Link></h2>
                  <Badge tone={STAGE_TONE[s.stage.stage]}>{stageLabel(s.stage.stage)}</Badge>
                </div>
                <p className="muted">{[d.case.area, d.case.property_type ? PROPERTY_TYPE_LABEL[d.case.property_type as PropertyType] : null].filter(Boolean).join(" · ") || "Profile incomplete"}</p>
                <p>{s.openProblems} open problem{s.openProblems === 1 ? "" : "s"}{s.overdueActions ? ` · ${s.overdueActions} overdue` : ""}</p>
                {s.next && <p className="journey-next"><ArrowRight size={14} aria-hidden /> {s.next.title}</p>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function NewPropertyForm() {
  const org = useOrg();
  const save = useSave();
  const [f, setF] = useState({ label: "", property_type: "", area: "", current_use: "", problem: "underperforming_income", objective: "improve_cash_flow", desired_outcome: "" });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  function submit(e: FormEvent) {
    e.preventDefault();
    const check = f.label.trim() ? OK : { ok: false as const, reason: "Give the property a name you'll recognise." };
    const row: NewProperty = {
      label: f.label.trim(), property_type: f.property_type || null, area: blank(f.area), current_use: blank(f.current_use),
      problem: f.problem, objective: f.objective, desired_outcome: blank(f.desired_outcome),
    };
    void save.run(check, async () => {
      const created = await createProperty(org.db, org.organisation.id, row);
      navigate(`/properties/${created.id}`);
    });
  }
  return (
    <Card title="Add a property" subtitle="Answer what you know. Anything you leave out is recorded as not known yet, never assumed.">
      <form className="form" onSubmit={submit} aria-label="Add a property">
        <Field label="Property name" hint="E.g. “Duplex in Soshanguve”. No tenant names."><input className="input" value={f.label} onChange={set("label")} /></Field>
        <Field label="Type of property">
          <select className="input" value={f.property_type} onChange={set("property_type")}>
            <option value="">Not recorded yet</option>
            {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{PROPERTY_TYPE_LABEL[t]}</option>)}
          </select>
        </Field>
        <Field label="Area" hint="Suburb and town. A street address isn't needed."><input className="input" value={f.area} onChange={set("area")} /></Field>
        <Field label="How it is used today"><textarea className="input" rows={2} value={f.current_use} onChange={set("current_use")} placeholder="E.g. two units rented, one vacant" /></Field>
        <Field label="The main issue, as you see it">
          <select className="input" value={f.problem} onChange={set("problem")}>{Object.entries(PROBLEMS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </Field>
        <Field label="What you want from it">
          <select className="input" value={f.objective} onChange={set("objective")}>{Object.entries(OBJECTIVES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </Field>
        <Field label="What success looks like"><textarea className="input" rows={2} value={f.desired_outcome} onChange={set("desired_outcome")} /></Field>
        <ErrorNote error={save.error} title="Not added" />
        <button className="btn btn-primary" disabled={save.busy}>Add property</button>
      </form>
    </Card>
  );
}

// ===========================================================================
// One property's command centre
// ===========================================================================

export function PropertyJourneyPage({ id }: { id: string }) {
  const org = useOrg();
  const q = useQuery(() => getPropertyJourney(org.db, id), [id]);
  if (q.error) return <ErrorNote error={q.error} title="Couldn't load this property" />;
  if (!q.data) return q.loading ? <Loading /> : <Card><Empty>This property doesn't exist, or you don't have access to it.</Empty></Card>;
  return <CommandCentre d={q.data} reload={q.reload} />;
}

function CommandCentre({ d, reload }: { d: PropertyJourney; reload: () => void }) {
  const org = useOrg();
  const canWork = org.can("evidence.record");
  const today = saToday();
  const input = useMemo(() => journeyInput(d, today), [d, today]);
  const stage = propertyStage(input);
  const next = nextActions(input);
  const reached = milestones(input);
  const active = d.problems.filter((p) => ACTIVE_PROBLEM.includes(p.status as ProblemStatus));
  const closed = d.problems.filter((p) => !ACTIVE_PROBLEM.includes(p.status as ProblemStatus));
  const [addingProblem, setAddingProblem] = useState(false);
  const historyIds = useMemo(() => [d.case.id, ...d.problems.map((p) => p.id), ...d.evidence.map((e) => e.id), ...d.actions.map((a) => a.id)], [d]);
  const history = useQuery(() => propertyCaseHistory(org.db, org.organisation.id, historyIds), [historyIds.join(",")]);

  function exportRecords() {
    const at = new Date().toISOString();
    const events = (history.data ?? []).map((e) => ({ occurred_at: e.occurred_at, action: e.action, entity_type: e.entity_type, entity_id: e.entity_id, before: e.before, after: e.after }));
    downloadJson(`${d.case.ref}-property-journey.json`, journeyExport(d, { stage, nextActions: next, milestones: reached }, events, at));
  }

  return (
    <div className="stack journey">
      <PageHeader eyebrow={<Link to="/properties">Your properties</Link>} title={d.case.label}
        actions={<button className="btn" onClick={exportRecords} disabled={!history.data}><Download size={15} aria-hidden /> Export my records</button>}>
        {[d.case.area, d.case.property_type ? PROPERTY_TYPE_LABEL[d.case.property_type as PropertyType] : "Type not recorded", d.case.current_use].filter(Boolean).join(" · ")}
      </PageHeader>

      <section className="card" aria-label="Where it stands">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 className="card-title">Where it stands</h2>
          <Badge tone={STAGE_TONE[stage.stage]}>{stageLabel(stage.stage)}</Badge>
        </div>
        <p data-testid="stage-reason">{stage.reason}</p>
        <ol className="journey-track" aria-label="Journey stages">
          {STAGES.map((s) => (
            <li key={s.key} className={s.key === stage.stage ? "current" : ""} aria-current={s.key === stage.stage ? "step" : undefined}>
              <strong>{s.label}</strong><span>{s.moves}</span>
            </li>
          ))}
        </ol>
        <p className="muted">{active.length} open problem{active.length === 1 ? "" : "s"} · {closed.filter((p) => p.status === "resolved").length} resolved · {reached.length} milestones reached</p>
      </section>

      <Card title="What needs attention" subtitle="From your records, by rules. Each says what triggered it and what isn't known yet.">
        {next.length === 0 ? <Empty>Nothing needs attention right now: every open problem has work under way.</Empty> : (
          <ol className="journey-next-list" data-testid="next-actions">
            {next.slice(0, 6).map((n) => <NextItem key={n.key} n={n} />)}
          </ol>
        )}
      </Card>

      <Card title="Problems" subtitle="What is holding the property back, with the evidence for each."
        actions={canWork ? <button className="btn" onClick={() => setAddingProblem((a) => !a)}>{addingProblem ? "Close" : "Record a problem"}</button> : undefined}>
        {addingProblem && <ProblemForm caseId={d.case.id} onDone={() => { setAddingProblem(false); reload(); }} />}
        {d.problems.length === 0 ? <Empty>No problems recorded yet.</Empty> : (
          <ul className="list" aria-label="Problem register">
            {[...active, ...closed].map((p) => <ProblemItem key={p.id} p={p} d={d} canWork={canWork} reload={reload} />)}
          </ul>
        )}
      </Card>

      <Card title="Milestones" subtitle="Reached only when the record exists, and dated from it.">
        <ol className="journey-timeline" data-testid="milestones">
          {reached.map((m) => (
            <li key={m.key}><span className="muted">{m.approximate ? `by ${day(m.on)}` : day(m.on)}</span> <strong>{m.label}</strong> <span>{m.detail}</span></li>
          ))}
        </ol>
      </Card>

      {canWork && <ProfileCard d={d} reload={reload} />}

      <Card title="History" subtitle="Every change to this property's records, from the tamper-evident audit trail.">
        <ErrorNote error={history.error} title="Couldn't load the history" />
        {!history.data ? <Loading /> : history.data.length === 0 ? <Empty>No changes recorded yet.</Empty> : (
          <ul className="list" data-testid="journey-history">
            {history.data.slice(0, 50).map((e) => {
              const after = (e.after ?? e.before ?? {}) as Record<string, unknown>;
              const before = (e.before ?? {}) as Record<string, unknown>;
              const subject = String(after.title ?? after.label ?? "");
              const moved = e.before && before.status !== after.status ? ` · ${String(before.status)} → ${String(after.status)}` : "";
              return <li key={e.id}><span className="list-main"><span className="list-title">{describe(e.action)}{subject ? `: ${subject}` : ""}{moved}</span><span className="list-meta">{when(e.occurred_at)}</span></span></li>;
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

const ENTITY: Record<string, string> = {
  property_cases: "Property", property_problems: "Problem", property_evidence: "Evidence", property_workstreams: "Action",
};
function describe(action: string): string {
  const [entity, verb] = action.split(".");
  const what = ENTITY[entity ?? ""] ?? entity ?? "Record";
  return `${what} ${verb === "insert" ? "recorded" : verb === "update" ? "changed" : verb === "delete" ? "removed" : verb ?? ""}`;
}

function NextItem({ n }: { n: NextAction }) {
  return (
    <li className="journey-next-item">
      <strong>{n.title}</strong>
      <dl className="journey-why">
        <dt>Why</dt><dd>{n.trigger}</dd>
        <dt>Based on</dt><dd>{n.evidence}</dd>
        <dt>Not known yet</dt><dd>{n.uncertain}</dd>
        <dt>Next</dt><dd>{n.next}</dd>
      </dl>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Problems
// ---------------------------------------------------------------------------

function ProblemForm({ caseId, onDone }: { caseId: string; onDone: () => void }) {
  const org = useOrg();
  const save = useSave();
  const [f, setF] = useState({ category: "arrears", title: "", experienced: "", consequence: "", workaround: "", intervention: "", specialist: "", expected_result: "", measure: "" });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  function submit(e: FormEvent) {
    e.preventDefault();
    const row = {
      category: f.category, title: f.title.trim(), experienced: f.experienced.trim(), consequence: blank(f.consequence), workaround: blank(f.workaround),
      intervention: blank(f.intervention), specialist: blank(f.specialist), expected_result: blank(f.expected_result), measure: blank(f.measure),
    };
    void save.run(checkProblem({ ...row, category: row.category as ProblemCategory }), () => addProblem(org.db, org.organisation.id, caseId, row), onDone);
  }
  return (
    <form className="form journey-form" onSubmit={submit} aria-label="Record a problem">
      <Field label="Kind of problem">
        <select className="input" value={f.category} onChange={set("category")}>{Object.entries(PROBLEM_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </Field>
      <Field label="Short name"><input className="input" value={f.title} onChange={set("title")} placeholder="E.g. Unit 2 rent paid late" /></Field>
      <Field label="What is happening" hint="What you've seen, not what you suspect. No tenant phone numbers, emails or ID numbers.">
        <textarea className="input" rows={3} value={f.experienced} onChange={set("experienced")} />
      </Field>
      <Field label="What it costs you" hint="Money, time or risk. Leave empty if not known yet."><textarea className="input" rows={2} value={f.consequence} onChange={set("consequence")} /></Field>
      <Field label="What you do about it today"><input className="input" value={f.workaround} onChange={set("workaround")} /></Field>
      <details>
        <summary>If you already have a plan</summary>
        <Field label="Proposed intervention"><textarea className="input" rows={2} value={f.intervention} onChange={set("intervention")} /></Field>
        <Field label="Specialist needed, if any" hint="The kind of specialist, e.g. electrician, attorney, accountant."><input className="input" value={f.specialist} onChange={set("specialist")} /></Field>
        <Field label="Expected result"><input className="input" value={f.expected_result} onChange={set("expected_result")} /></Field>
        <Field label="How it will be measured"><input className="input" value={f.measure} onChange={set("measure")} placeholder="E.g. date rent reaches the bank, next three months" /></Field>
      </details>
      <ErrorNote error={save.error} title="Not recorded" />
      <button className="btn btn-primary" disabled={save.busy}>Record problem</button>
    </form>
  );
}

function ProblemItem({ p, d, canWork, reload }: { p: PropertyProblem; d: PropertyJourney; canWork: boolean; reload: () => void }) {
  const evidence = d.evidence.filter((e) => e.problem_id === p.id);
  const actions = d.actions.filter((a) => a.problem_id === p.id);
  const input = journeyInput(d, saToday());
  const ev = problemEvidence(p.id, input.evidence);
  const stage = problemStage(input.problems.find((x) => x.id === p.id)!, input.evidence, input.actions);
  const [open, setOpen] = useState(ACTIVE_PROBLEM.includes(p.status as ProblemStatus));
  return (
    <li className="journey-problem" aria-label={p.title}>
      <div className="list-main" style={{ width: "100%" }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <button className="journey-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}><span className="list-title">{p.title}</span></button>
          <span className="row">
            <Badge tone={STATUS_TONE[p.status as ProblemStatus]}>{PROBLEM_STATUS_LABEL[p.status as ProblemStatus]}</Badge>
            <Badge tone={EVIDENCE_TONE[ev.state]}>{EVIDENCE_STATE_LABEL[ev.state]}</Badge>
          </span>
        </div>
        <span className="list-meta">{PROBLEM_CATEGORIES[p.category as ProblemCategory]}{stage ? ` · ${stageLabel(stage)}` : ""}</span>
        {open && (
          <div className="stack journey-detail">
            <Facts rows={[
              ["What is happening", p.experienced], ["What it costs", p.consequence], ["Today's workaround", p.workaround],
              ["Intervention", p.intervention], ["Specialist", p.specialist], ["Expected result", p.expected_result], ["Measured by", p.measure],
              ["Result", p.result_note ? `${p.result_note}${p.closed_on ? ` (${day(p.closed_on)})` : ""}` : null],
            ]} />
            <section aria-label={`Evidence for ${p.title}`}>
              <h3 className="journey-sub">Evidence</h3>
              {evidence.length === 0 ? <p className="muted">None recorded.</p> : (
                <ul className="list">{evidence.map((e) => <EvidenceItem key={e.id} e={e} canWork={canWork} reload={reload} />)}</ul>
              )}
              {canWork && <EvidenceForm caseId={d.case.id} problemId={p.id} onDone={reload} />}
            </section>
            <section aria-label={`Actions for ${p.title}`}>
              <h3 className="journey-sub">Actions</h3>
              {actions.length === 0 ? <p className="muted">No action agreed yet.</p> : (
                <ul className="list">{actions.map((a) => <ActionItem key={a.id} a={a} evidence={evidence} canWork={canWork} reload={reload} />)}</ul>
              )}
              {canWork && ACTIVE_PROBLEM.includes(p.status as ProblemStatus) && <ActionForm caseId={d.case.id} problemId={p.id} onDone={reload} />}
            </section>
            {canWork && <ProblemStatusForm p={p} doneActions={actions.filter((a) => a.status === "done").length} checkedEvidence={ev.checked} onDone={reload} />}
          </div>
        )}
      </div>
    </li>
  );
}

function Facts({ rows }: { rows: Array<[string, string | null]> }) {
  return (
    <dl className="journey-facts">
      {rows.map(([k, v]) => (
        <div key={k}><dt>{k}</dt><dd className={v ? "" : "muted"}>{v ?? "Not recorded"}</dd></div>
      ))}
    </dl>
  );
}

const NEXT_STATUS: Record<ProblemStatus, ProblemStatus[]> = {
  open: ["investigating", "planned", "parked"], investigating: ["planned", "parked"], planned: ["resolved", "not_resolved", "investigating", "parked"],
  not_resolved: ["investigating", "planned"], parked: ["open"], resolved: ["open"],
};

function ProblemStatusForm({ p, doneActions, checkedEvidence, onDone }: { p: PropertyProblem; doneActions: number; checkedEvidence: number; onDone: () => void }) {
  const org = useOrg();
  const save = useSave();
  const current = p.status as ProblemStatus;
  const options = NEXT_STATUS[current].filter((s) => canTransition("property_problem", current, s));
  const [next, setNext] = useState<ProblemStatus>(options[0]!);
  const [note, setNote] = useState("");
  const [intervention, setIntervention] = useState(p.intervention ?? "");
  const closing = next === "resolved" || next === "not_resolved" || next === "parked";
  function submit(e: FormEvent) {
    e.preventDefault();
    const fields = { intervention: blank(intervention), resultNote: closing ? blank(note) : null };
    const check = checkProblemStatus(next, fields, { doneActions, checkedEvidence });
    void save.run(check, () => updateProblem(org.db, p.id, {
      status: next,
      ...(next === "planned" ? { intervention: fields.intervention } : {}),
      ...(closing ? { result_note: fields.resultNote, closed_on: saToday() } : {}),
    }), () => { setNote(""); onDone(); });
  }
  return (
    <form className="form journey-form" onSubmit={submit} aria-label={`Move ${p.title}`}>
      <Field label="Move this problem to">
        <select className="input" value={next} onChange={(e) => setNext(e.target.value as ProblemStatus)}>
          {options.map((s) => <option key={s} value={s}>{PROBLEM_STATUS_LABEL[s]}</option>)}
        </select>
      </Field>
      {next === "planned" && <Field label="The intervention"><textarea className="input" rows={2} value={intervention} onChange={(e) => setIntervention(e.target.value)} /></Field>}
      {closing && (
        <Field label={next === "parked" ? "Why it is parked" : "What happened: the result"} hint={next === "resolved" ? "Resolved needs a completed action and checked evidence that it worked." : undefined}>
          <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      )}
      <ErrorNote error={save.error} title="Not moved" />
      <button className="btn" disabled={save.busy}>Save</button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

const EVIDENCE_STATUS_LABEL: Record<EvidenceStatus, string> = {
  missing: "Missing", requested: "Requested", received: "Received, not checked", checked: "Checked", conflicting: "Conflicts with another record",
};
const EVIDENCE_STATUS_TONE: Record<EvidenceStatus, Tone> = { missing: "warn", requested: "warn", received: "info", checked: "good", conflicting: "bad" };

function EvidenceForm({ caseId, problemId, onDone }: { caseId: string; problemId: string; onDone: () => void }) {
  const org = useOrg();
  const save = useSave();
  const [show, setShow] = useState(false);
  const [f, setF] = useState({ title: "", category: "income", status: "received", source: "", document_ref: "", notes: "" });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  if (!show) return <button className="btn btn-sm" onClick={() => setShow(true)}>Add evidence</button>;
  function submit(e: FormEvent) {
    e.preventDefault();
    const has = f.status !== "missing" && f.status !== "requested";
    const check = !f.title.trim() ? { ok: false as const, reason: "Say what the evidence is." }
      : f.status === "conflicting" && !f.notes.trim() ? { ok: false as const, reason: "Say what it conflicts with." }
      : has && !f.source.trim() ? { ok: false as const, reason: "Say where it came from." } : OK;
    void save.run(check, () => addEvidence(org.db, org.organisation.id, caseId, {
      problem_id: problemId, category: f.category, title: f.title.trim(), source: blank(f.source), document_ref: blank(f.document_ref),
      status: f.status, received_on: has ? saToday() : null, confidence: null, notes: blank(f.notes),
    }), () => { setShow(false); onDone(); });
  }
  return (
    <form className="form journey-form" onSubmit={submit} aria-label="Add evidence">
      <Field label="What it is"><input className="input" value={f.title} onChange={set("title")} placeholder="E.g. Bank statements, July to October" /></Field>
      <Field label="Area">
        <select className="input" value={f.category} onChange={set("category")}>{Object.entries(EVIDENCE_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </Field>
      <Field label="Do you have it?" hint="Check it afterwards, once you've looked through it.">
        <select className="input" value={f.status} onChange={set("status")}>
          <option value="received">Yes, I have it</option>
          <option value="requested">Requested, waiting</option>
          <option value="missing">No, it's missing</option>
          <option value="conflicting">It conflicts with another record</option>
        </select>
      </Field>
      <Field label="Where it came from"><input className="input" value={f.source} onChange={set("source")} placeholder="E.g. bank app, municipality, contractor" /></Field>
      <Field label="Where it is kept" hint="A folder, a link, or where the paper copy is. Uploads come later."><input className="input" value={f.document_ref} onChange={set("document_ref")} /></Field>
      <Field label="Notes"><input className="input" value={f.notes} onChange={set("notes")} /></Field>
      <ErrorNote error={save.error} title="Not added" />
      <div className="row"><button className="btn btn-primary" disabled={save.busy}>Add</button><button type="button" className="btn" onClick={() => setShow(false)}>Cancel</button></div>
    </form>
  );
}

function EvidenceItem({ e, canWork, reload }: { e: PropertyEvidence; canWork: boolean; reload: () => void }) {
  const org = useOrg();
  const save = useSave();
  const status = e.status as EvidenceStatus;
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState(e.notes ?? "");
  const [confidence, setConfidence] = useState("medium");
  function check(ev: FormEvent) {
    ev.preventDefault();
    void save.run(e.source ? OK : { ok: false, reason: "Say where it came from before marking it checked." },
      () => updateEvidence(org.db, e.id, { status: "checked", confidence, notes: blank(note), received_on: e.received_on ?? saToday() }),
      () => { setChecking(false); reload(); });
  }
  function received() {
    void save.run(e.source ? OK : { ok: false, reason: "Say where it came from." }, () => updateEvidence(org.db, e.id, { status: "received", received_on: saToday() }), reload);
  }
  return (
    <li aria-label={e.title}>
      <span className="list-main">
        <span className="list-title">{e.title}</span>
        <span className="list-meta">{[e.source, e.document_ref ? `kept: ${e.document_ref}` : null, e.received_on ? `received ${day(e.received_on)}` : null, e.notes].filter(Boolean).join(" · ") || "No details yet"}</span>
        {checking && (
          <form className="form journey-form" onSubmit={check} aria-label={`Check ${e.title}`}>
            <Field label="What you checked"><input className="input" value={note} onChange={(x) => setNote(x.target.value)} placeholder="E.g. November rent received on the 2nd" /></Field>
            <Field label="How sure are you">
              <select className="input" value={confidence} onChange={(x) => setConfidence(x.target.value)}><option value="high">Sure</option><option value="medium">Fairly sure</option><option value="low">Not very sure</option></select>
            </Field>
            <button className="btn btn-primary" disabled={save.busy}>Mark checked</button>
          </form>
        )}
        <ErrorNote error={save.error} title="Not changed" />
      </span>
      <span className="row">
        <Badge tone={EVIDENCE_STATUS_TONE[status]}>{EVIDENCE_STATUS_LABEL[status]}</Badge>
        {canWork && (status === "missing" || status === "requested") && <button className="btn btn-sm" onClick={received} disabled={save.busy}>Received</button>}
        {canWork && (status === "received" || status === "conflicting") && !checking && <button className="btn btn-sm" onClick={() => setChecking(true)}>Check it</button>}
      </span>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function ActionForm({ caseId, problemId, onDone }: { caseId: string; problemId: string; onDone: () => void }) {
  const org = useOrg();
  const save = useSave();
  const [show, setShow] = useState(false);
  const [f, setF] = useState({ title: "", owner: "", due_on: "", reason: "", done_when: "" });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  if (!show) return <button className="btn btn-sm" onClick={() => setShow(true)}>Agree an action</button>;
  function submit(e: FormEvent) {
    e.preventDefault();
    const basic = !f.title.trim() || !f.owner.trim() || !f.due_on ? { ok: false as const, reason: "An action needs what is to be done, who is responsible and a deadline." } : OK;
    const check = basic.ok ? checkAction({ problemId, reason: f.reason, doneWhen: f.done_when, status: "planned", proofStatus: null }) : basic;
    void save.run(check, () => addAction(org.db, org.organisation.id, caseId, {
      problem_id: problemId, title: f.title.trim(), owner: f.owner.trim(), due_on: f.due_on, reason: f.reason.trim(), done_when: f.done_when.trim(),
    }), () => { setShow(false); onDone(); });
  }
  return (
    <form className="form journey-form" onSubmit={submit} aria-label="Agree an action">
      <Field label="What is to be done"><input className="input" value={f.title} onChange={set("title")} /></Field>
      <Field label="Who is responsible" hint="A person or a role, e.g. Owner, Caretaker, Electrician."><input className="input" value={f.owner} onChange={set("owner")} /></Field>
      <Field label="Deadline"><input className="input" type="date" value={f.due_on} onChange={set("due_on")} /></Field>
      <Field label="Why it is needed"><textarea className="input" rows={2} value={f.reason} onChange={set("reason")} /></Field>
      <Field label="Done when" hint="What will show it's finished, e.g. “Signed addendum on file”."><input className="input" value={f.done_when} onChange={set("done_when")} /></Field>
      <ErrorNote error={save.error} title="Not agreed" />
      <div className="row"><button className="btn btn-primary" disabled={save.busy}>Agree action</button><button type="button" className="btn" onClick={() => setShow(false)}>Cancel</button></div>
    </form>
  );
}

const ACTION_LABEL: Record<string, string> = { planned: "Planned", in_progress: "In progress", blocked: "Blocked", done: "Done", cancelled: "Cancelled" };
const ACTION_TONE: Record<string, Tone> = { planned: "neutral", in_progress: "info", blocked: "bad", done: "good", cancelled: "neutral" };

function ActionItem({ a, evidence, canWork, reload }: { a: PropertyWorkstream; evidence: PropertyEvidence[]; canWork: boolean; reload: () => void }) {
  const org = useOrg();
  const save = useSave();
  const today = saToday();
  const [mode, setMode] = useState<"none" | "done" | "blocked">("none");
  const [proof, setProof] = useState("");
  const [summary, setSummary] = useState("");
  const [note, setNote] = useState("");
  const usable = evidence.filter((e) => e.status === "received" || e.status === "checked");
  const overdue = (a.status === "planned" || a.status === "in_progress") && a.due_on < today;
  const live = a.status !== "done" && a.status !== "cancelled";
  function complete(e: FormEvent) {
    e.preventDefault();
    const proofRow = usable.find((x) => x.id === proof) ?? null;
    const base = summary.trim() ? checkAction({ problemId: a.problem_id, reason: a.reason, doneWhen: a.done_when, status: "done", proofStatus: (proofRow?.status as EvidenceStatus) ?? null })
      : { ok: false as const, reason: "Say what was done." };
    void save.run(base, () => updateAction(org.db, a.id, { status: "done", completion_evidence: summary.trim(), completed_on: today, completion_evidence_id: proofRow?.id ?? null }),
      () => { setMode("none"); reload(); });
  }
  function block(e: FormEvent) {
    e.preventDefault();
    void save.run(note.trim() ? OK : { ok: false, reason: "Say what is blocking it." }, () => updateAction(org.db, a.id, { status: "blocked", note: note.trim() }), () => { setMode("none"); reload(); });
  }
  const move = (status: string) => void save.run(OK, () => updateAction(org.db, a.id, { status }), reload);
  return (
    <li aria-label={a.title}>
      <span className="list-main">
        <span className="list-title">{a.title}</span>
        <span className="list-meta">{a.owner} · due {day(a.due_on)}{overdue ? " · overdue" : ""}{a.done_when ? ` · done when: ${a.done_when}` : ""}</span>
        {a.reason && <span className="list-meta">Why: {a.reason}</span>}
        {a.status === "blocked" && a.note && <span className="list-meta">Blocked: {a.note}</span>}
        {a.status === "done" && <span className="list-meta">Completed {day(a.completed_on)}: {a.completion_evidence}</span>}
        {mode === "done" && (
          <form className="form journey-form" onSubmit={complete} aria-label={`Complete ${a.title}`}>
            <Field label="What was done"><input className="input" value={summary} onChange={(e) => setSummary(e.target.value)} /></Field>
            <Field label="Proof" hint={usable.length ? "Evidence you've received for this problem." : "Add the evidence first: a receipt, a signed document, a photo or a report."}>
              <select className="input" value={proof} onChange={(e) => setProof(e.target.value)}>
                <option value="">Choose the evidence</option>
                {usable.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
              </select>
            </Field>
            <div className="row"><button className="btn btn-primary" disabled={save.busy}>Mark done</button><button type="button" className="btn" onClick={() => setMode("none")}>Cancel</button></div>
          </form>
        )}
        {mode === "blocked" && (
          <form className="form journey-form" onSubmit={block} aria-label={`Block ${a.title}`}>
            <Field label="What is blocking it"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
            <div className="row"><button className="btn btn-primary" disabled={save.busy}>Mark blocked</button><button type="button" className="btn" onClick={() => setMode("none")}>Cancel</button></div>
          </form>
        )}
        <ErrorNote error={save.error} title="Not changed" />
      </span>
      <span className="row">
        <Badge tone={overdue ? "bad" : ACTION_TONE[a.status] ?? "neutral"}>{overdue ? "Overdue" : ACTION_LABEL[a.status] ?? a.status}</Badge>
        {canWork && live && mode === "none" && (
          <>
            {a.status === "planned" && <button className="btn btn-sm" onClick={() => move("in_progress")}>Start</button>}
            {a.status === "blocked" && <button className="btn btn-sm" onClick={() => move("in_progress")}>Unblocked</button>}
            {a.status !== "blocked" && <button className="btn btn-sm" onClick={() => setMode("blocked")}>Blocked</button>}
            <button className="btn btn-sm" onClick={() => setMode("done")}>Done</button>
          </>
        )}
      </span>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

function ProfileCard({ d, reload }: { d: PropertyJourney; reload: () => void }) {
  const org = useOrg();
  const save = useSave();
  const [type, setType] = useState(d.case.property_type ?? "");
  const [area, setArea] = useState(d.case.area ?? "");
  const [review, setReview] = useState(d.case.next_review_on ?? "");
  function submit(e: FormEvent) {
    e.preventDefault();
    void save.run(OK, () => updateProperty(org.db, d.case.id, { property_type: type || null, area: blank(area), next_review_on: review || null }), reload);
  }
  return (
    <Card title="Profile and review" subtitle="Empty means not recorded yet.">
      <form className="form" onSubmit={submit} aria-label="Property profile">
        <Field label="Type of property">
          <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Not recorded yet</option>
            {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{PROPERTY_TYPE_LABEL[t]}</option>)}
          </select>
        </Field>
        <Field label="Area"><input className="input" value={area} onChange={(e) => setArea(e.target.value)} /></Field>
        <Field label="Next review" hint="When to look at the property's position again."><input className="input" type="date" value={review} onChange={(e) => setReview(e.target.value)} /></Field>
        <ErrorNote error={save.error} title="Not saved" />
        <button className="btn" disabled={save.busy}>Save profile</button>
      </form>
    </Card>
  );
}

