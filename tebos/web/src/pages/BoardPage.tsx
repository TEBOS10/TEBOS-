// The operating board (ADR 0003): what the business is trying to achieve, the
// pieces it runs on, and the flows its work moves through — with where the
// founder is still the middleware.
import {
  checkObjectiveTransition,
  checkStep,
  COMPONENT_KINDS,
  founderDependency,
  isoDate,
  measurablePaths,
  OBJECTIVE_METRICS,
  OBJECTIVE_PERIODS,
  OBJECTIVE_UNITS,
  objectiveProgress,
  PERFORMERS,
  type Direction,
  type MeasurementState,
  type ObjectiveMetric,
  type Performer,
} from "@core/board";
import type { ObjectiveStatus } from "@core/states";
import { lazy, Suspense, useMemo, useState, type FormEvent } from "react";
import { layoutBoard } from "../world/layout";
import { use3d } from "../world/support";
import { Badge, Card, Empty, ErrorNote, Field, Loading, PageHeader, StatusBadge } from "../components/ui";
import {
  achieveObjective,
  activateObjective,
  addComponent,
  addFlow,
  addStep,
  closeObjective,
  createObjective,
  measureAutomatically,
  getBoard,
  recordMeasured,
  recordStated,
  retireStep,
  updateStep,
  type BoardComponent,
  type BoardFlow,
  type BoardStep,
  type MeasurableEvidence,
  type Objective,
  type ObjectiveMeasurement,
  type Statement,
} from "../lib/data";
import { ago, statusLabel } from "../lib/format";
import { usePeople } from "../lib/people";
import { Link } from "../lib/router";
import { useOrg } from "../lib/session";
import { useQuery } from "../lib/useQuery";

const ClientBoardView = lazy(() => import("../world/ClientBoardView"));

const UNIT_LABEL: Record<string, string> = { ZAR: "R", percent: "%", hours_per_week: "h/week", hours: "hours", days: "days", count: "" };
const PERFORMER_LABEL: Record<Performer, string> = { founder: "Founder", staff: "Team", automation: "Automation", provider: "Provider", client: "Client" };

export function formatValue(value: number | string, unit: string): string {
  const n = Number(value);
  if (unit === "ZAR") return `R${n.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}`;
  if (unit === "percent") return `${n.toLocaleString("en-ZA", { maximumFractionDigits: 1 })}%`;
  return `${n.toLocaleString("en-ZA", { maximumFractionDigits: 1 })} ${UNIT_LABEL[unit] ?? unit}`.trim();
}

const toState = (m: ObjectiveMeasurement): MeasurementState => ({
  id: m.id, objectiveId: m.objective_id, basis: m.basis as MeasurementState["basis"], value: Number(m.value), measuredAt: m.measured_at,
});

export function BoardPage({ id }: { id: string }) {
  const org = useOrg();
  const q = useQuery(() => getBoard(org.db, id), [id]);
  const layout = useMemo(() => (q.data ? layoutBoard(q.data, formatValue) : null), [q.data]);
  if (q.loading && !q.data) return <Loading />;
  if (q.error) return <ErrorNote error={q.error} title="Couldn't load the operating board" />;
  if (!q.data) return <PageHeader title="Business not found">It doesn't exist, or it belongs to another organisation.</PageHeader>;
  const { business, objectives, measurements, components, flows, steps, measurable, statements } = q.data;
  const canEdit = org.can("business.write");
  const allSteps = founderDependency(steps.map((s) => ({ performer: s.performer as Performer, documented: s.documented, componentId: s.component_id })));

  return (
    <div className="stack">
      <PageHeader eyebrow={<Link to={`/businesses/${business.id}`}>{business.name}</Link>} title="Operating board">
        What the business is trying to achieve, the pieces it runs on, and how work moves between them. It shows what a
        person has said until evidence confirms it.
      </PageHeader>

      <div className="grid grid-4" data-testid="board-summary">
        <Stat value={objectives.filter((o) => o.status === "active").length} label="Active objectives" sub={`${objectives.filter((o) => o.status === "achieved").length} achieved`} />
        <Stat value={components.length} label="Pieces" sub="tools, providers, channels, people" />
        <Stat value={flows.length} label="Flows" sub={`${allSteps.steps} steps mapped`} />
        <Stat
          value={allSteps.middleware}
          label="Founder-only steps"
          sub={allSteps.steps ? `done by the founder and written down nowhere · ${allSteps.founder} of ${allSteps.steps} steps need the founder` : "map a flow to see this"}
        />
      </div>

      {layout && (layout.flows.length > 0 || components.length > 0) && <Board3d layout={layout} />}

      <Card title="Objectives" subtitle="Targets with an owner and a date. Only a value read from a connected system can show one was achieved.">
        {objectives.length === 0 ? (
          <Empty>No objectives yet. Start with the number that matters most, e.g. revenue for the year or the founder's hours.</Empty>
        ) : (
          <ul className="list">
            {objectives.map((o) => (
              <ObjectiveItem key={o.id} objective={o} measurements={measurements.filter((m) => m.objective_id === o.id)}
                measurable={measurable} statements={statements} canEdit={canEdit} onChanged={q.reload} />
            ))}
          </ul>
        )}
        {canEdit && <NewObjective businessId={business.id} onCreated={q.reload} />}
      </Card>

      <div className="grid grid-main">
        <div className="stack">
          {flows.length === 0 && (
            <Card title="Flows">
              <Empty>No flows mapped yet. A flow is how one kind of work moves, e.g. from a new lead to an onboarded client.</Empty>
            </Card>
          )}
          {flows.map((f) => (
            <FlowCard key={f.id} flow={f} steps={steps.filter((s) => s.flow_id === f.id)} components={components}
              objective={objectives.find((o) => o.id === f.objective_id) ?? null} canEdit={canEdit} onChanged={q.reload} />
          ))}
          {canEdit && <NewFlow businessId={business.id} objectives={objectives.filter((o) => o.status === "active" || o.status === "draft")} onCreated={q.reload} />}
        </div>
        <div className="stack">
          <PiecesCard businessId={business.id} components={components} canEdit={canEdit} onChanged={q.reload} />
        </div>
      </div>
    </div>
  );
}

function Board3d({ layout }: { layout: ReturnType<typeof layoutBoard> }) {
  const [three] = useState(() => use3d({ allowReducedMotion: true }));
  const [open, setOpen] = useState(() => !window.matchMedia("(max-width: 760px)").matches);
  if (!three) return null;
  return (
    <Card
      title="The board in 3D"
      subtitle="Drawn only from what's recorded below. Drag to turn it; pick a flow to follow it."
      actions={<button className="btn btn-sm" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "Hide" : "Show"}</button>}
      className="cb-card"
    >
      {open && (
        <Suspense fallback={<div className="cb-stage cb-loading" />}>
          <ClientBoardView layout={layout} />
        </Suspense>
      )}
    </Card>
  );
}

function Stat({ value, label, sub }: { value: number | string; label: string; sub: string }) {
  return (
    <section className="card stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
      <span className="stat-sub">{sub}</span>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Objectives
// ---------------------------------------------------------------------------

function ObjectiveItem({ objective: o, measurements, measurable, statements, canEdit, onChanged }: {
  objective: Objective; measurements: ObjectiveMeasurement[]; measurable: MeasurableEvidence[]; statements: Statement[]; canEdit: boolean; onChanged: () => void;
}) {
  const org = useOrg();
  const { nameOf } = usePeople();
  const [mode, setMode] = useState<"none" | "measure" | "state" | "retire">("none");
  const [error, setError] = useState<unknown>(null);
  const target = { id: o.id, status: o.status as ObjectiveStatus, direction: o.direction as Direction, targetValue: Number(o.target_value), dueOn: o.due_on };
  const progress = objectiveProgress(target, measurements.map(toState));
  const canAchieve = progress.proof && checkObjectiveTransition(target, "achieved", { measurement: progress.proof }).ok;
  const canMiss = checkObjectiveTransition(target, "missed").ok;
  const open = o.status === "active" || o.status === "draft";

  async function run(f: () => Promise<unknown>) {
    setError(null);
    try {
      await f();
      setMode("none");
      onChanged();
    } catch (e) {
      setError(e);
    }
  }

  return (
    <li style={{ flexDirection: "column", alignItems: "stretch" }} data-testid="objective">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div className="list-main">
          <span className="list-title">{o.title}</span>
          <span className="list-meta">
            {o.direction === "at_least" ? "At least" : "At most"} {formatValue(o.target_value, o.unit)}
            {o.period !== "point_in_time" ? ` per ${o.period}` : ""} by {o.due_on} · owner {nameOf(o.owner_id)}
          </span>
          <span className="list-meta" data-testid="objective-progress">
            {progress.measured
              ? `Measured: ${formatValue(progress.measured.value, o.unit)} (${ago(progress.measured.measuredAt)})${progress.met ? " · target met" : ` · ${formatValue(progress.gap ?? 0, o.unit)} to go`}`
              : "Not measured yet: connect a system that reports it."}
            {progress.stated ? ` · Owner says ${formatValue(progress.stated.value, o.unit)}, which doesn't count toward the target` : ""}
          </span>
          {o.measure_metric && (
            <span className="list-meta" data-testid="objective-auto">
              Measured automatically from each new reading of {o.measure_metric} · {(o.measure_path ?? []).join(".")}{o.status === "draft" ? " (once active)" : ""}
            </span>
          )}
          {o.status_reason && <span className="list-meta">Reason: {o.status_reason}</span>}
        </div>
        <StatusBadge status={o.status} />
      </div>
      {canEdit && open && (
        <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          {o.status === "draft" && <button className="btn btn-sm btn-primary" onClick={() => run(() => activateObjective(org.db, o.id))}>Activate</button>}
          <button className="btn btn-sm" onClick={() => setMode(mode === "measure" ? "none" : "measure")}>Measure from a connected system</button>
          <button className="btn btn-sm" onClick={() => setMode(mode === "state" ? "none" : "state")}>Add the owner's figure</button>
          {o.status === "active" && (
            <button className="btn btn-sm" disabled={!canAchieve} title={canAchieve ? undefined : "Needs a measured value that meets the target"}
              onClick={() => progress.proof && run(() => achieveObjective(org.db, o.id, progress.proof!.id))}>
              Mark achieved
            </button>
          )}
          {o.status === "active" && canMiss && <button className="btn btn-sm" onClick={() => run(() => closeObjective(org.db, o.id, "missed", null))}>Mark missed</button>}
          <button className="btn btn-sm" onClick={() => setMode(mode === "retire" ? "none" : "retire")}>{o.status === "draft" ? "Cancel" : "Retire"}</button>
        </div>
      )}
      {mode === "measure" && (
        <MeasureForm measurable={measurable} canBind={!o.measure_metric}
          onSubmit={(ev, path, bind) => run(async () => {
            if (bind) await measureAutomatically(org.db, o.id, bind, path);
            await recordMeasured(org.db, o, ev, path);
          })} />
      )}
      {mode === "state" && <StatedForm statements={statements} onSubmit={(ev, v) => run(() => recordStated(org.db, o, ev, v))} />}
      {mode === "retire" && (
        <ReasonForm label={o.status === "draft" ? "Why cancel it?" : "Why retire it?"}
          onSubmit={(reason) => run(() => closeObjective(org.db, o.id, o.status === "draft" ? "cancelled" : "retired", reason))} />
      )}
      <ErrorNote error={error} title="Not saved" />
    </li>
  );
}

function MeasureForm({ measurable, canBind, onSubmit }: {
  measurable: MeasurableEvidence[]; canBind: boolean; onSubmit: (evidenceId: string, path: string[], bindMetric: string | null) => void;
}) {
  const options = measurable.flatMap((m) => measurablePaths(m.structuredValue).filter((p) => p.path.join(".") !== "snapshot_hash").map((p) => ({ m, p })));
  const [choice, setChoice] = useState(0);
  const [auto, setAuto] = useState(true);
  if (options.length === 0) {
    return <p className="muted" style={{ marginTop: 8 }}>No connected system has reported a number yet. Connect one on the Connections page; TEBOS never takes a typed number as a measurement.</p>;
  }
  const picked = options[choice]!;
  const metric = ((picked.m.structuredValue ?? {}) as { metric?: unknown }).metric;
  const bindable = canBind && typeof metric === "string";
  return (
    <form className="form" style={{ marginTop: 8 }} onSubmit={(e) => { e.preventDefault(); onSubmit(picked.m.evidenceId, picked.p.path, bindable && auto ? (metric as string) : null); }}>
      <Field label="Reading" hint="TEBOS reads the value from the evidence itself.">
        <select className="input" value={choice} onChange={(e) => setChoice(Number(e.target.value))}>
          {options.map(({ m, p }, i) => (
            <option key={i} value={i}>
              {m.fact} · {p.path.join(".")} = {p.value} · {m.sourceLabel ?? "connected system"}, read {ago(m.retrievedAt)}
            </option>
          ))}
        </select>
      </Field>
      {bindable && (
        <label className="row" style={{ gap: 8 }}>
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          <span>Measure this automatically from now on</span>
        </label>
      )}
      <div><button className="btn btn-primary btn-sm">Record measurement</button></div>
    </form>
  );
}

function StatedForm({ statements, onSubmit }: { statements: Statement[]; onSubmit: (evidenceId: string, value: number) => void }) {
  const [ev, setEv] = useState(statements[0]?.evidenceId ?? "");
  const [value, setValue] = useState("");
  if (statements.length === 0) {
    return <p className="muted" style={{ marginTop: 8 }}>There's no statement from the owner to cite yet. Run a diagnostic interview first.</p>;
  }
  return (
    <form className="form" style={{ marginTop: 8 }} onSubmit={(e) => { e.preventDefault(); onSubmit(ev, Number(value)); }}>
      <div className="form-row">
        <Field label="Owner's statement">
          <select className="input" value={ev} onChange={(e) => setEv(e.target.value)}>
            {statements.map((s) => <option key={s.evidenceId} value={s.evidenceId}>{s.fact.slice(0, 120)}</option>)}
          </select>
        </Field>
        <Field label="The figure they gave" hint="Shown as the owner's figure. It never counts toward achieving the objective.">
          <input className="input" type="number" step="any" required value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
      </div>
      <div><button className="btn btn-sm" disabled={value.trim() === ""}>Add the owner's figure</button></div>
    </form>
  );
}

function ReasonForm({ label, onSubmit }: { label: string; onSubmit: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <form className="form" style={{ marginTop: 8 }} onSubmit={(e) => { e.preventDefault(); onSubmit(reason.trim()); }}>
      <Field label={label}><input className="input" required value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      <div><button className="btn btn-sm" disabled={!reason.trim()}>Confirm</button></div>
    </form>
  );
}

function NewObjective({ businessId, onCreated }: { businessId: string; onCreated: () => void }) {
  const org = useOrg();
  const { members } = usePeople();
  const [open, setOpen] = useState(false);
  const [metric, setMetric] = useState<ObjectiveMetric>("revenue");
  const [form, setForm] = useState({
    title: "", unit: "ZAR", direction: "at_least" as Direction, target: "", period: "year", dueOn: isoDate(new Date(Date.now() + 365 * 86_400_000)), ownerId: org.userId,
  });
  const [error, setError] = useState<unknown>(null);

  function pickMetric(m: ObjectiveMetric) {
    setMetric(m);
    setForm({ ...form, unit: OBJECTIVE_METRICS[m].unit, direction: OBJECTIVE_METRICS[m].direction });
  }

  async function save(e: FormEvent, activate: boolean) {
    e.preventDefault();
    setError(null);
    try {
      await createObjective(org.db, org.organisation.id, businessId, {
        title: form.title.trim() || OBJECTIVE_METRICS[metric].label, metric, unit: form.unit, direction: form.direction, targetValue: Number(form.target),
        period: form.period, dueOn: form.dueOn, ownerId: form.ownerId, activate,
      });
      setOpen(false);
      setForm({ ...form, title: "", target: "" });
      onCreated();
    } catch (err) {
      setError(err);
    }
  }

  if (!open) return <div style={{ marginTop: 12 }}><button className="btn" onClick={() => setOpen(true)}>Set an objective</button></div>;
  return (
    <form className="form" style={{ marginTop: 12 }} onSubmit={(e) => save(e, true)} aria-label="New objective">
      <div className="form-row">
        <Field label="Measure">
          <select className="input" value={metric} onChange={(e) => pickMetric(e.target.value as ObjectiveMetric)}>
            {Object.entries(OBJECTIVE_METRICS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </Field>
        <Field label="Name"><input className="input" value={form.title} placeholder={OBJECTIVE_METRICS[metric].label} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
        <Field label="Direction">
          <select className="input" value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value as Direction })}>
            <option value="at_least">At least</option>
            <option value="at_most">At most</option>
          </select>
        </Field>
        <Field label="Target">
          <input className="input" type="number" min={0} step="any" required value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} />
        </Field>
        <Field label="Unit">
          <select className="input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
            {OBJECTIVE_UNITS.map((u) => <option key={u} value={u}>{statusLabel(u)}</option>)}
          </select>
        </Field>
        <Field label="Per">
          <select className="input" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })}>
            {OBJECTIVE_PERIODS.map((p) => <option key={p} value={p}>{statusLabel(p)}</option>)}
          </select>
        </Field>
        <Field label="Due by"><input className="input" type="date" required value={form.dueOn} onChange={(e) => setForm({ ...form, dueOn: e.target.value })} /></Field>
        <Field label="Owner">
          <select className="input" value={form.ownerId} onChange={(e) => setForm({ ...form, ownerId: e.target.value })}>
            {members.length === 0 && <option value={org.userId}>You</option>}
            {members.map((m) => <option key={m.membership.user_id} value={m.membership.user_id}>{m.membership.user_id === org.userId ? "You" : m.profile?.display_name ?? "A member without a name yet"}</option>)}
          </select>
        </Field>
      </div>
      <p className="list-meta">Once active, the target and date are fixed. To change them, retire the objective and set a new one.</p>
      <ErrorNote error={error} title="Objective not saved" />
      <div className="row">
        <button className="btn btn-primary" disabled={form.target === ""}>Save and activate</button>
        <button type="button" className="btn" disabled={form.target === ""} onClick={(e) => save(e, false)}>Save as draft</button>
        <button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function PiecesCard({ businessId, components, canEdit, onChanged }: { businessId: string; components: BoardComponent[]; canEdit: boolean; onChanged: () => void }) {
  const org = useOrg();
  const [form, setForm] = useState({ name: "", kind: "software", supplier: "", ownerRole: "" });
  const [error, setError] = useState<unknown>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await addComponent(org.db, org.organisation.id, businessId, form);
      setForm({ name: "", kind: form.kind, supplier: "", ownerRole: "" });
      onChanged();
    } catch (err) {
      setError(err);
    }
  }

  return (
    <Card title="Pieces" subtitle="The tools, providers, channels and people the business runs on. Existing providers stay: they become pieces on the board.">
      {components.length === 0 ? (
        <Empty>Nothing on the board yet.</Empty>
      ) : (
        <ul className="list" data-testid="pieces">
          {components.map((c) => (
            <li key={c.id}>
              <div className="list-main">
                <span className="list-title">{c.name}</span>
                <span className="list-meta">
                  {statusLabel(c.kind)}{c.supplier ? ` · by ${c.supplier}` : ""}{c.owner_role ? ` · owned by ${c.owner_role}` : ""}
                </span>
              </div>
              <Badge tone={c.basis === "observed" ? "good" : "neutral"} title={c.basis === "observed" ? "Confirmed by evidence" : "What the business told TEBOS"}>{c.basis}</Badge>
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <form className="form" style={{ marginTop: 12 }} onSubmit={add} aria-label="New piece">
          <div className="form-row">
            <Field label="Name"><input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Website" /></Field>
            <Field label="Kind">
              <select className="input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                {COMPONENT_KINDS.map((k) => <option key={k} value={k}>{statusLabel(k)}</option>)}
              </select>
            </Field>
            <Field label="Supplied by"><input className="input" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} placeholder="e.g. the web studio" /></Field>
            <Field label="Owner"><input className="input" value={form.ownerRole} onChange={(e) => setForm({ ...form, ownerRole: e.target.value })} placeholder="e.g. Founder" /></Field>
          </div>
          <ErrorNote error={error} title="Not added" />
          <div><button className="btn" disabled={!form.name.trim()}>Add piece</button></div>
        </form>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Flows
// ---------------------------------------------------------------------------

function FlowCard({ flow, steps, components, objective, canEdit, onChanged }: {
  flow: BoardFlow; steps: BoardStep[]; components: BoardComponent[]; objective: Objective | null; canEdit: boolean; onChanged: () => void;
}) {
  const org = useOrg();
  const [error, setError] = useState<unknown>(null);
  const dep = founderDependency(steps.map((s) => ({ performer: s.performer as Performer, documented: s.documented, componentId: s.component_id })));
  const toolName = (id: string | null) => components.find((c) => c.id === id)?.name ?? null;

  async function run(f: () => Promise<unknown>) {
    setError(null);
    try {
      await f();
      onChanged();
    } catch (e) {
      setError(e);
    }
  }

  return (
    <Card
      title={flow.name}
      subtitle={<>Starts when {flow.starts_when.replace(/^./, (c) => c.toLowerCase())} · done when {flow.done_when.replace(/^./, (c) => c.toLowerCase())}{objective ? <> · serves “{objective.title}”</> : null}</>}
    >
      {steps.length === 0 ? (
        <Empty>No steps yet. Add them in order, starting with what sets the flow off.</Empty>
      ) : (
        <>
          <p className="list-meta" data-testid="flow-dependency">
            {dep.founder} of {dep.steps} steps need the founder · {dep.middleware} exist only in the founder's head · {dep.automated} automated · {dep.undocumented} not written down
          </p>
          <table className="table" style={{ marginTop: 8 }}>
            <thead>
              <tr><th>#</th><th>Step</th><th>Who</th><th>Tool</th><th>Written down</th>{canEdit && <th />}</tr>
            </thead>
            <tbody>
              {steps.map((s) => (
                <tr key={s.id} data-testid="flow-step">
                  <td>{s.position}</td>
                  <td className="wrap">
                    {s.name}
                    {s.decision_rule && <div className="list-meta">Rule: {s.decision_rule}</div>}
                  </td>
                  <td>
                    {s.performer === "founder" && !s.documented ? <Badge tone="warn" title="Done by the founder and written down nowhere">Founder only</Badge> : PERFORMER_LABEL[s.performer as Performer]}
                    {s.performer_role && <div className="list-meta">{s.performer_role}</div>}
                  </td>
                  <td>{toolName(s.component_id) ?? <span className="faint">—</span>}</td>
                  <td>
                    {canEdit ? (
                      <input type="checkbox" aria-label={`${s.name} is written down`} checked={s.documented}
                        onChange={(e) => run(() => updateStep(org.db, s.id, { documented: e.target.checked }))} />
                    ) : s.documented ? "Yes" : "No"}
                  </td>
                  {canEdit && <td><button className="btn btn-sm" onClick={() => run(() => retireStep(org.db, s.id))}>Remove</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <ErrorNote error={error} title="Not saved" />
      {canEdit && <NewStep flow={flow} nextPosition={(steps.at(-1)?.position ?? 0) + 1} components={components} onAdded={onChanged} />}
    </Card>
  );
}

function NewStep({ flow, nextPosition, components, onAdded }: { flow: BoardFlow; nextPosition: number; components: BoardComponent[]; onAdded: () => void }) {
  const org = useOrg();
  const [form, setForm] = useState({ name: "", performer: "founder" as Performer, performerRole: "", componentId: "", decisionRule: "", documented: false });
  const [error, setError] = useState<unknown>(null);
  const check = checkStep({ performer: form.performer, documented: form.documented, componentId: form.componentId || null });

  async function add(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await addStep(org.db, flow, nextPosition, form);
      setForm({ ...form, name: "", decisionRule: "", performerRole: "" });
      onAdded();
    } catch (err) {
      setError(err);
    }
  }

  return (
    <form className="form" style={{ marginTop: 12 }} onSubmit={add} aria-label={`New step for ${flow.name}`}>
      <div className="form-row">
        <Field label={`Step ${nextPosition}`}><input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Qualify and price the lead" /></Field>
        <Field label="Who does it">
          <select className="input" value={form.performer} onChange={(e) => setForm({ ...form, performer: e.target.value as Performer })}>
            {PERFORMERS.map((p) => <option key={p} value={p}>{PERFORMER_LABEL[p]}</option>)}
          </select>
        </Field>
        <Field label="Tool">
          <select className="input" value={form.componentId} onChange={(e) => setForm({ ...form, componentId: e.target.value })}>
            <option value="">None</option>
            {components.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Rule or decision" hint="How it's decided, if it is.">
          <input className="input" value={form.decisionRule} onChange={(e) => setForm({ ...form, decisionRule: e.target.value })} placeholder="e.g. Founder prices from experience" />
        </Field>
      </div>
      <label className="row" style={{ gap: 8 }}>
        <input type="checkbox" checked={form.documented} onChange={(e) => setForm({ ...form, documented: e.target.checked })} /> Written down somewhere other than someone's memory
      </label>
      {!check.ok && form.name && <p className="list-meta">{check.reason}</p>}
      <ErrorNote error={error} title="Step not added" />
      <div><button className="btn btn-sm" disabled={!form.name.trim() || !check.ok}>Add step</button></div>
    </form>
  );
}

function NewFlow({ businessId, objectives, onCreated }: { businessId: string; objectives: Objective[]; onCreated: () => void }) {
  const org = useOrg();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", startsWhen: "", doneWhen: "", objectiveId: "" });
  const [error, setError] = useState<unknown>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await addFlow(org.db, org.organisation.id, businessId, form);
      setForm({ name: "", startsWhen: "", doneWhen: "", objectiveId: "" });
      setOpen(false);
      onCreated();
    } catch (err) {
      setError(err);
    }
  }

  if (!open) return <div><button className="btn" onClick={() => setOpen(true)}>Map a flow</button></div>;
  return (
    <Card title="Map a flow">
      <form className="form" onSubmit={add} aria-label="New flow">
        <div className="form-row">
          <Field label="Name"><input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Lead to onboarding" /></Field>
          <Field label="Serves objective">
            <select className="input" value={form.objectiveId} onChange={(e) => setForm({ ...form, objectiveId: e.target.value })}>
              <option value="">None</option>
              {objectives.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
            </select>
          </Field>
          <Field label="Starts when"><input className="input" required value={form.startsWhen} onChange={(e) => setForm({ ...form, startsWhen: e.target.value })} placeholder="e.g. An enquiry arrives" /></Field>
          <Field label="Done when"><input className="input" required value={form.doneWhen} onChange={(e) => setForm({ ...form, doneWhen: e.target.value })} placeholder="e.g. The client is onboarded and invoiced" /></Field>
        </div>
        <ErrorNote error={error} title="Flow not added" />
        <div className="row">
          <button className="btn btn-primary" disabled={!form.name.trim() || !form.startsWhen.trim() || !form.doneWhen.trim()}>Add flow</button>
          <button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button>
        </div>
      </form>
    </Card>
  );
}
