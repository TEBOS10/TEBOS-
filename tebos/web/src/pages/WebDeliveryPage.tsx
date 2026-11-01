// The Web Delivery dashboard (docs/web-delivery/): every website project, where it stands against its three-business-
// day clock, and what is holding it up; and each project's file. The design brief's rule for dashboards applies: the
// few numbers that matter, then the work. Every gate is the database's: a refusal shows its reason and nothing is
// claimed that didn't happen.
import { useState, type FormEvent } from "react";
import { MACHINES, type WebProjectStatus, type WebTaskStatus } from "@core/states";
import { BOARD_LIMITS, type Tier } from "@core/editions";
import {
  ASSET_KINDS, ASSET_SOURCES, ASSET_STATUSES, canStart, checkAsset, checkDeployment, checkScope, completion, deadlineState,
  PRIMARY_OBJECTIVES, READINESS_ITEMS, WAIVABLE, WEB_ROLES, WEB_STATUS_LABEL, WEB_TASK_STATUS_LABEL, WEBSITE_TYPES,
  type AssetSource, type AssetStatus, type DeadlineState, type ReadinessItem, type ReadinessStatus, type WebRole,
} from "@core/web-delivery";
import { saToday } from "@core/week";
import { Badge, Card, Empty, ErrorNote, Field, Loading, PageHeader } from "../components/ui";
import { Link } from "../lib/router";
import { useSignedIn } from "../lib/session";
import { useQuery } from "../lib/useQuery";
import {
  addAsset, addDeployment, addQaRun, addScope, addTask, claimTask, createProject, deliveryBoard, deliveryClients, lines, moveProject,
  moveTask, projectFile, rollBack, saveReadiness, updateAsset, type BoardRow, type ProjectFile, type WebTask,
} from "../lib/webDeliveryData";
import { StaffOnly } from "./PipelinePage";

const maintainer = (a: { maintainer?: boolean; admin?: boolean }) => Boolean(a.maintainer || a.admin);
const PLAN_NAME: Record<string, string> = { starter: "Small", growth: "Medium", company: "Company" };
const MAIN_PATH: WebProjectStatus[] = ["intake", "scope_review", "approval", "build", "qa", "client_review", "release", "handover", "closed"];
const WAITING_ON_CLIENT: WebProjectStatus[] = ["approval", "client_review", "blocked_client"];

const CLOCK: Record<DeadlineState, { label: string; tone: "good" | "warn" | "bad" | "info" | "neutral" }> = {
  not_started: { label: "Clock not started", tone: "neutral" },
  paused: { label: "Paused: waiting on the client", tone: "info" },
  overdue: { label: "Overdue", tone: "bad" },
  due_today: { label: "Due today", tone: "warn" },
  at_risk: { label: "Due tomorrow", tone: "warn" },
  on_track: { label: "On track", tone: "good" },
  finished: { label: "Delivered", tone: "good" },
};

function clockOf(p: { status: string; deadline_on: string | null; clock_paused_on: string | null }, today: string) {
  return deadlineState({ status: p.status as WebProjectStatus, deadlineOn: p.deadline_on, pausedOn: p.clock_paused_on }, today);
}

function ClockBadge({ p, today }: { p: { status: string; deadline_on: string | null; clock_paused_on: string | null }; today: string }) {
  const c = clockOf(p, today);
  const days = c.businessDaysLeft;
  const extra = c.state === "on_track" && days !== null ? ` · ${days} business days left` : c.state === "overdue" && days !== null ? ` · ${-days} business day${days === -1 ? "" : "s"} late` : "";
  return <Badge tone={CLOCK[c.state].tone}>{CLOCK[c.state].label}{extra}</Badge>;
}

// ---------------------------------------------------------------------------
// The board
// ---------------------------------------------------------------------------
export function WebDeliveryPage() {
  return <StaffOnly title="Web delivery" allow={maintainer}>{() => <Board />}</StaffOnly>;
}

function Board() {
  const { db } = useSignedIn();
  const today = saToday();
  const board = useQuery(() => deliveryBoard(db), []);
  const [opening, setOpening] = useState(false);
  const rows = board.data ?? [];
  const open = rows.filter((r) => r.status !== "closed" && r.status !== "cancelled");
  const atRisk = open.filter((r) => ["overdue", "due_today", "at_risk"].includes(clockOf(r, today).state));
  const waiting = open.filter((r) => WAITING_ON_CLIENT.includes(r.status as WebProjectStatus));
  const live = rows.filter((r) => r.live_url);
  return (
    <div className="stack web-page">
      <PageHeader eyebrow="TEBOS web delivery" title="Web delivery"
        actions={<button className="btn btn-primary" onClick={() => setOpening((o) => !o)}>{opening ? "Close" : "New project"}</button>}>
        Every website project, its stage and its clock. Three business days start when a project is ready to build and
        pause while the client holds it up. The database decides what is ready; this page shows why.
      </PageHeader>
      {opening && <NewProject onDone={() => { setOpening(false); board.reload(); }} />}
      {board.error ? <ErrorNote error={board.error} title="Couldn't load the projects" /> : !board.data ? <Loading /> : (
        <>
          <div className="grid grid-4 web-stats" data-testid="web-stats">
            <Stat value={open.length} label="Open projects" />
            <Stat value={atRisk.length} label="Due within a day or late" tone={atRisk.length ? "warn" : undefined} />
            <Stat value={waiting.length} label="Waiting on the client" />
            <Stat value={live.length} label="Live sites" />
          </div>
          {rows.length === 0 ? (
            <Card><Empty>No website projects yet. Open one with "New project" once a client's plan is active.</Empty></Card>
          ) : (
            <ol className="list web-list" data-testid="web-projects">
              {rows.map((r) => <ProjectRow key={r.id} r={r} today={today} />)}
            </ol>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ value, label, tone }: { value: number; label: string; tone?: "warn" }) {
  return (
    <div className={`card stat${tone ? ` stat-${tone}` : ""}`}>
      <span className="stat-value">{value}</span>
      <span className="stat-sub">{label}</span>
    </div>
  );
}

function nextHoldUp(r: BoardRow): string {
  if (r.status === "blocked_client") return r.status_note;
  if (r.readiness_gaps > 0) return `${r.readiness_gaps} thing${r.readiness_gaps === 1 ? "" : "s"} before the build can start`;
  if (r.tasks_blocked > 0) return `${r.tasks_blocked} task${r.tasks_blocked === 1 ? "" : "s"} blocked`;
  if (r.status === "qa" && r.last_qa_verdict === "fail") return "QA failed: fix and test again";
  if (r.status === "client_review") return "The client is reviewing the preview";
  if (r.status === "release") return "Release approved: deploy to production";
  return r.status_note;
}

function ProjectRow({ r, today }: { r: BoardRow; today: string }) {
  const pct = completion(r.tasks_total, r.tasks_done);
  return (
    <li className="card web-row" data-testid="web-project">
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <span className="mono muted">{r.ref}</span>{" "}
          <Link to={`/web-delivery/${r.id}`} className="card-title">{r.name}</Link>
          <div className="muted">{r.org_name} · {PLAN_NAME[r.plan] ?? r.plan} · {WEBSITE_TYPES[r.website_type as keyof typeof WEBSITE_TYPES] ?? r.website_type}</div>
        </div>
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          <Badge tone="info">{WEB_STATUS_LABEL[r.status as WebProjectStatus] ?? r.status}</Badge>
          <ClockBadge p={r} today={today} />
        </div>
      </div>
      <p className="muted" style={{ margin: "8px 0 0" }}>
        {pct === null ? "No tasks yet" : `${r.tasks_done} of ${r.tasks_total} tasks done (${pct}%)`} · {nextHoldUp(r)}
        {r.live_url && <> · <a href={r.live_url} target="_blank" rel="noreferrer">Live site</a></>}
      </p>
    </li>
  );
}

function NewProject({ onDone }: { onDone: () => void }) {
  const { db } = useSignedIn();
  const clients = useQuery(() => deliveryClients(db), []);
  const [f, setF] = useState({ org_id: "", name: "", website_type: "service_business", primary_objective: "leads", status_note: "" });
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const client = clients.data?.find((c) => c.org_id === f.org_id);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!client) return;
    setBusy(true);
    setError(null);
    try {
      await createProject(db, { ...f, plan: client.plan });
      onDone();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  if (clients.error) return <ErrorNote error={clients.error} title="Couldn't load the clients" />;
  if (!clients.data) return <Loading />;
  if (clients.data.length === 0) return <Card><Empty>No client has an active plan yet. A project opens for a client once their plan is active.</Empty></Card>;
  return (
    <Card title="New project">
      <form className="form" onSubmit={save} aria-label="New project">
        <Field label="Client" hint={client ? `Package: ${PLAN_NAME[client.plan]} (their active plan). Scope is held to it.` : undefined}>
          <select className="input" required value={f.org_id} onChange={set("org_id")}>
            <option value="">Choose a client</option>
            {clients.data.map((c) => <option key={c.org_id} value={c.org_id}>{c.org_name}</option>)}
          </select>
        </Field>
        <Field label="Project name"><input className="input" required minLength={2} value={f.name} onChange={set("name")} /></Field>
        <Field label="Website type">
          <select className="input" value={f.website_type} onChange={set("website_type")}>
            {Object.entries(WEBSITE_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Primary objective">
          <select className="input" value={f.primary_objective} onChange={set("primary_objective")}>
            {Object.entries(PRIMARY_OBJECTIVES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Where it starts" hint="E.g. what the intake has so far. No personal emails or numbers.">
          <textarea className="input" rows={2} required minLength={10} value={f.status_note} onChange={set("status_note")} />
        </Field>
        <ErrorNote error={error} title="Not opened" />
        <button className="btn btn-primary" disabled={busy || !client}>Open the project</button>
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// One project's file
// ---------------------------------------------------------------------------
export function WebProjectPage({ id }: { id: string }) {
  return <StaffOnly title="Web delivery" allow={maintainer}>{() => <ProjectView id={id} />}</StaffOnly>;
}

function ProjectView({ id }: { id: string }) {
  const { db } = useSignedIn();
  const today = saToday();
  const q = useQuery(() => projectFile(db, id), [id]);
  if (q.error) return <ErrorNote error={q.error} title="Couldn't open this project" />;
  if (!q.data) return <Loading />;
  const f = q.data;
  const p = f.project;
  const status = p.status as WebProjectStatus;
  return (
    <div className="stack web-page">
      <p><Link to="/web-delivery">← All projects</Link></p>
      <PageHeader eyebrow={`${p.ref} · ${f.clientName ?? "Client"} · ${PLAN_NAME[p.plan]} package`} title={p.name}>
        <span className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          <Badge tone="info">{WEB_STATUS_LABEL[status]}</Badge>
          <ClockBadge p={p} today={today} />
          {p.deadline_on && <span className="muted">Deadline {p.deadline_on}</span>}
        </span>
      </PageHeader>
      <StageTrack status={status} />
      <Card title="Where it stands">
        <p data-testid="status-note">{p.status_note}</p>
        <Move f={f} onDone={q.reload} />
      </Card>
      {f.gaps.length > 0 && ["intake", "scope_review", "approval", "blocked_client", "scope_change"].includes(status) && (
        <Card title="Before the build can start" subtitle="The database's own list. Each line clears when its record is in place.">
          <ul data-testid="readiness-gaps">{f.gaps.map((g) => <li key={g}>{g}</li>)}</ul>
        </Card>
      )}
      <div className="grid grid-main web-columns">
        <div className="stack">
          <Tasks f={f} onDone={q.reload} />
          <Scope f={f} onDone={q.reload} />
          <Qa f={f} onDone={q.reload} />
          <Deployments f={f} onDone={q.reload} />
        </div>
        <div className="stack">
          <Approvals f={f} />
          <Readiness f={f} onDone={q.reload} />
          <Assets f={f} onDone={q.reload} />
        </div>
      </div>
    </div>
  );
}

function StageTrack({ status }: { status: WebProjectStatus }) {
  const at = MAIN_PATH.indexOf(status);
  return (
    <ol className="stage-track" aria-label="Stages" data-testid="stage-track">
      {MAIN_PATH.map((s, i) => (
        <li key={s} className={i < at ? "done" : i === at ? "current" : ""} aria-current={i === at ? "step" : undefined}>{WEB_STATUS_LABEL[s]}</li>
      ))}
      {at === -1 && <li className="current" aria-current="step">{WEB_STATUS_LABEL[status]}</li>}
    </ol>
  );
}

function useAction(onDone: () => void) {
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onDone();
      return true;
    } catch (err) {
      setError(err);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { error, busy, run, setError };
}

function Move({ f, onDone }: { f: ProjectFile; onDone: () => void }) {
  const { db } = useSignedIn();
  const status = f.project.status as WebProjectStatus;
  const next = ((MACHINES.web_project.transitions as Record<string, readonly string[]>)[status] ?? []) as WebProjectStatus[];
  const [to, setTo] = useState<WebProjectStatus | "">("");
  const [note, setNote] = useState("");
  const a = useAction(onDone);
  if (next.length === 0) return <p className="muted">This project is {WEB_STATUS_LABEL[status].toLowerCase()}. Nothing moves from here.</p>;
  return (
    <form className="form" aria-label="Move the project" onSubmit={async (e) => { e.preventDefault(); if (to && (await a.run(() => moveProject(db, f.project.id, to, note)))) { setTo(""); setNote(""); } }}>
      <Field label="Move to">
        <select className="input" required value={to} onChange={(e) => setTo(e.target.value as WebProjectStatus)}>
          <option value="">Choose the next stage</option>
          {next.map((s) => <option key={s} value={s}>{WEB_STATUS_LABEL[s]}</option>)}
        </select>
      </Field>
      <Field label="Why" hint="Every change of stage says why. It goes on the record.">
        <textarea className="input" rows={2} required minLength={10} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <ErrorNote error={a.error} title="Not moved" />
      <button className="btn btn-primary" disabled={a.busy || !to}>Move</button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------
const TASK_ORDER: WebTaskStatus[] = ["blocked", "in_progress", "review", "todo", "done", "cancelled"];

function Tasks({ f, onDone }: { f: ProjectFile; onDone: () => void }) {
  const [adding, setAdding] = useState(false);
  const lite = f.tasks.map((t) => ({ id: t.id, status: t.status as WebTaskStatus, dependsOn: f.dependencies.filter((d) => d.task_id === t.id).map((d) => d.depends_on) }));
  const sorted = [...f.tasks].sort((a, b) => TASK_ORDER.indexOf(a.status as WebTaskStatus) - TASK_ORDER.indexOf(b.status as WebTaskStatus));
  const pct = completion(f.tasks.filter((t) => t.status !== "cancelled").length, f.tasks.filter((t) => t.status === "done").length);
  return (
    <Card title="Tasks" subtitle={pct === null ? "Nothing on the ledger yet." : `${pct}% done, counted from tasks someone else accepted.`}
      actions={<button className="btn btn-sm" onClick={() => setAdding((x) => !x)}>{adding ? "Close" : "Add a task"}</button>}>
      {adding && <AddTask f={f} onDone={() => { setAdding(false); onDone(); }} />}
      {sorted.length === 0 ? <Empty>No tasks yet.</Empty> : (
        <ol className="list web-list" data-testid="web-tasks">
          {sorted.map((t) => <TaskItem key={t.id} t={t} f={f} startable={canStart(lite.find((x) => x.id === t.id)!, lite)} onDone={onDone} />)}
        </ol>
      )}
    </Card>
  );
}

function TaskItem({ t, f, startable, onDone }: { t: WebTask; f: ProjectFile; startable: boolean; onDone: () => void }) {
  const { db, userId } = useSignedIn();
  const a = useAction(onDone);
  const [ask, setAsk] = useState<"done" | "blocked" | null>(null);
  const [text, setText] = useState("");
  const status = t.status as WebTaskStatus;
  const deps = f.dependencies.filter((d) => d.task_id === t.id).map((d) => f.tasks.find((x) => x.id === d.depends_on)?.title).filter(Boolean);
  const mine = t.assigned_to === userId;
  return (
    <li className="web-task" data-testid="web-task">
      <div className="row" style={{ justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <strong>{t.title}</strong>
        <span className="row" style={{ gap: 6 }}>
          <Badge tone="neutral">{WEB_ROLES[t.role as WebRole] ?? t.role}</Badge>
          <Badge tone={status === "done" ? "good" : status === "blocked" ? "bad" : status === "review" ? "warn" : "info"}>{WEB_TASK_STATUS_LABEL[status]}</Badge>
        </span>
      </div>
      <p className="muted" style={{ margin: "4px 0" }}>
        Done when: {t.done_when}{t.due_on ? ` · due ${t.due_on}` : ""}{deps.length ? ` · after: ${deps.join(", ")}` : ""}{mine ? " · yours" : t.assigned_to ? "" : " · unassigned"}
      </p>
      {t.blocked_reason && <p><strong>Blocked:</strong> {t.blocked_reason}</p>}
      {t.evidence && status === "done" && <p className="muted"><strong>Evidence:</strong> {t.evidence}</p>}
      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        {!t.assigned_to && status !== "done" && status !== "cancelled" && <button className="btn btn-sm" disabled={a.busy} onClick={() => a.run(() => claimTask(db, t.id, userId))}>Take it</button>}
        {(status === "todo" || status === "blocked") && (
          <button className="btn btn-sm" disabled={a.busy || !startable} title={startable ? undefined : "Waits on a task that isn't done"} onClick={() => a.run(() => moveTask(db, t.id, "in_progress"))}>
            {startable ? "Start" : "Waiting on another task"}
          </button>
        )}
        {status === "in_progress" && <button className="btn btn-sm" disabled={a.busy} onClick={() => a.run(() => moveTask(db, t.id, "review"))}>Send to review</button>}
        {status === "review" && (mine
          ? <span className="muted">Someone else reviews this.</span>
          : <button className="btn btn-sm btn-primary" onClick={() => { setAsk("done"); setText(""); }}>Accept as done</button>)}
        {status === "review" && <button className="btn btn-sm" disabled={a.busy} onClick={() => a.run(() => moveTask(db, t.id, "in_progress"))}>Send back</button>}
        {(status === "todo" || status === "in_progress") && <button className="btn btn-sm" onClick={() => { setAsk("blocked"); setText(""); }}>Blocked</button>}
      </div>
      {ask && (
        <form className="form" aria-label={ask === "done" ? "Accept as done" : "Mark as blocked"} onSubmit={async (e) => {
          e.preventDefault();
          const ok = await a.run(() => moveTask(db, t.id, ask, ask === "done" ? { evidence: text.trim() } : { blocked_reason: text.trim() }));
          if (ok) setAsk(null);
        }}>
          <Field label={ask === "done" ? "Evidence it's done" : "What is it waiting for?"} hint={ask === "done" ? "What you checked against the task's \"done when\"." : undefined}>
            <textarea className="input" rows={2} required minLength={10} value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
          <button className="btn btn-sm btn-primary" disabled={a.busy}>Save</button>
        </form>
      )}
      <ErrorNote error={a.error} title="Not saved" />
    </li>
  );
}

function AddTask({ f, onDone }: { f: ProjectFile; onDone: () => void }) {
  const { db } = useSignedIn();
  const a = useAction(onDone);
  const [t, setT] = useState({ role: "frontend" as WebRole, title: "", done_when: "", due_on: "", depends_on: "" });
  const set = (k: keyof typeof t) => (e: { target: { value: string } }) => setT({ ...t, [k]: e.target.value });
  return (
    <form className="form" aria-label="Add a task" onSubmit={(e) => { e.preventDefault(); void a.run(() => addTask(db, f.project, { ...t, due_on: t.due_on || null, depends_on: t.depends_on || null })); }}>
      <Field label="Role">
        <select className="input" value={t.role} onChange={set("role")}>
          {Object.entries(WEB_ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Field>
      <Field label="Task"><input className="input" required minLength={3} value={t.title} onChange={set("title")} /></Field>
      <Field label="Done when" hint="How anyone can tell it's finished."><input className="input" required minLength={5} value={t.done_when} onChange={set("done_when")} /></Field>
      <Field label="Due"><input className="input" type="date" value={t.due_on} onChange={set("due_on")} /></Field>
      {f.tasks.length > 0 && (
        <Field label="Waits on">
          <select className="input" value={t.depends_on} onChange={set("depends_on")}>
            <option value="">Nothing</option>
            {f.tasks.filter((x) => x.status !== "cancelled").map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
          </select>
        </Field>
      )}
      <ErrorNote error={a.error} title="Not added" />
      <button className="btn btn-primary" disabled={a.busy}>Add</button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Scope, approvals, readiness
// ---------------------------------------------------------------------------
function Scope({ f, onDone }: { f: ProjectFile; onDone: () => void }) {
  const latest = f.scopes[0];
  const open = ["intake", "scope_review", "scope_change"].includes(f.project.status);
  const [writing, setWriting] = useState(false);
  return (
    <Card title={latest ? `Scope, revision ${latest.revision}` : "Scope"}
      subtitle={`The ${PLAN_NAME[f.project.plan]} package holds ${BOARD_LIMITS[f.project.plan as Tier].flows} workflows and ${BOARD_LIMITS[f.project.plan as Tier].pieces} parts (pages and features).`}
      actions={open ? <button className="btn btn-sm" onClick={() => setWriting((w) => !w)}>{writing ? "Close" : latest ? "Write a new revision" : "Write the scope"}</button> : undefined}>
      {writing && <ScopeForm f={f} onDone={() => { setWriting(false); onDone(); }} />}
      {!latest ? <Empty>No scope yet. It's written during intake, scope review or a scope change.</Empty> : (
        <dl className="web-scope" data-testid="web-scope">
          <dt>Pages</dt><dd>{latest.pages.join(", ")}</dd>
          <dt>Features</dt><dd>{latest.features.join(", ") || "None"}</dd>
          <dt>Workflows</dt><dd>{latest.workflows.join(", ") || "None"}</dd>
          <dt>First action for visitors</dt><dd>{latest.primary_conversion}</dd>
          <dt>Not included</dt><dd>{latest.exclusions}</dd>
          <dt>Recurring costs</dt><dd>{latest.recurring_costs}</dd>
          <dt>Accepted when</dt><dd><ul>{latest.acceptance_criteria.map((c) => <li key={c}>{c}</li>)}</ul></dd>
        </dl>
      )}
    </Card>
  );
}

function ScopeForm({ f, onDone }: { f: ProjectFile; onDone: () => void }) {
  const { db } = useSignedIn();
  const a = useAction(onDone);
  const prev = f.scopes[0];
  const [s, setS] = useState({
    pages: prev?.pages.join("\n") ?? "", features: prev?.features.join("\n") ?? "", workflows: prev?.workflows.join("\n") ?? "",
    exclusions: prev?.exclusions ?? "", primary_conversion: prev?.primary_conversion ?? "", acceptance_criteria: prev?.acceptance_criteria.join("\n") ?? "",
    recurring_costs: prev?.recurring_costs ?? "",
  });
  const set = (k: keyof typeof s) => (e: { target: { value: string } }) => setS({ ...s, [k]: e.target.value });
  const draft = { pages: lines(s.pages), features: lines(s.features), workflows: lines(s.workflows), exclusions: s.exclusions, primaryConversion: s.primary_conversion, acceptanceCriteria: lines(s.acceptance_criteria), recurringCosts: s.recurring_costs };
  const check = checkScope(f.project.plan as Tier, draft);
  return (
    <form className="form" aria-label="Write the scope" onSubmit={(e) => {
      e.preventDefault();
      if (!check.ok) { a.setError({ message: check.reason, hint: check.code }); return; }
      void a.run(() => addScope(db, f.project, { pages: draft.pages, features: draft.features, workflows: draft.workflows, exclusions: s.exclusions.trim(), primary_conversion: s.primary_conversion.trim(), acceptance_criteria: draft.acceptanceCriteria, recurring_costs: s.recurring_costs.trim() }));
    }}>
      <Field label="Pages" hint="One per line."><textarea className="input" rows={3} value={s.pages} onChange={set("pages")} /></Field>
      <Field label="Features" hint="One per line, e.g. Enquiry form."><textarea className="input" rows={2} value={s.features} onChange={set("features")} /></Field>
      <Field label="Workflows" hint="One per line, e.g. Enquiry to follow-up."><textarea className="input" rows={2} value={s.workflows} onChange={set("workflows")} /></Field>
      <Field label="What visitors should do first"><input className="input" value={s.primary_conversion} onChange={set("primary_conversion")} /></Field>
      <Field label="Not included"><textarea className="input" rows={2} value={s.exclusions} onChange={set("exclusions")} /></Field>
      <Field label="Recurring costs" hint='Hosting and services the client pays for, or "None".'><input className="input" value={s.recurring_costs} onChange={set("recurring_costs")} /></Field>
      <Field label="Accepted when" hint="One testable criterion per line."><textarea className="input" rows={3} value={s.acceptance_criteria} onChange={set("acceptance_criteria")} /></Field>
      <p className="muted">{draft.workflows.length} workflows · {draft.pages.length + draft.features.length} parts</p>
      <ErrorNote error={a.error} title="Not saved" />
      <button className="btn btn-primary" disabled={a.busy}>Save as a new revision</button>
    </form>
  );
}

function Approvals({ f }: { f: ProjectFile }) {
  const latest = f.scopes[0];
  const kinds: Array<["scope" | "design" | "release", string]> = [["scope", "Scope and costs"], ["design", "Design direction"], ["release", "Production release"]];
  return (
    <Card title="The client's approvals" subtitle="Only the client's own admin approves. TEBOS can't approve for them.">
      {!latest ? <Empty>Approvals follow the first scope revision.</Empty> : (
        <ul className="web-approvals" data-testid="web-approvals">
          {kinds.map(([k, label]) => {
            const ap = f.approvals.find((x) => x.revision_id === latest.id && x.kind === k);
            return <li key={k}>{label}: {ap ? <Badge tone="good">Approved {ap.created_at.slice(0, 10)}</Badge> : <Badge tone="neutral">Not yet</Badge>}</li>;
          })}
        </ul>
      )}
    </Card>
  );
}

function Readiness({ f, onDone }: { f: ProjectFile; onDone: () => void }) {
  return (
    <Card title="Readiness" subtitle="Each item needs written evidence. Only missing assets can be knowingly waived.">
      <ul className="list web-list web-readiness" data-testid="web-readiness">
        {(Object.keys(READINESS_ITEMS) as ReadinessItem[]).map((item) => <ReadinessLine key={item} item={item} f={f} onDone={onDone} />)}
      </ul>
    </Card>
  );
}

function ReadinessLine({ item, f, onDone }: { item: ReadinessItem; f: ProjectFile; onDone: () => void }) {
  const { db } = useSignedIn();
  const row = f.readiness.find((r) => r.item === item);
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<ReadinessStatus>((row?.status as ReadinessStatus) ?? "met");
  const [evidence, setEvidence] = useState(row?.evidence ?? "");
  const a = useAction(() => { setEditing(false); onDone(); });
  const s = (row?.status as ReadinessStatus) ?? "missing";
  return (
    <li>
      <div className="row" style={{ justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <span>{READINESS_ITEMS[item]}</span>
        <button className="btn btn-sm" onClick={() => setEditing((x) => !x)} aria-label={`Update: ${READINESS_ITEMS[item]}`}>
          <Badge tone={s === "met" ? "good" : s === "waived" ? "warn" : "neutral"}>{s === "met" ? "Met" : s === "waived" ? "Waived" : "Missing"}</Badge>
        </button>
      </div>
      {row?.evidence && !editing && <p className="muted" style={{ margin: "4px 0 0" }}>{row.evidence}</p>}
      {editing && (
        <form className="form" aria-label={READINESS_ITEMS[item]} onSubmit={(e) => { e.preventDefault(); void a.run(() => saveReadiness(db, f.project, row, item, status, evidence)); }}>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as ReadinessStatus)} aria-label="Status">
            <option value="met">Met</option>
            {WAIVABLE.has(item) && <option value="waived">Absence accepted</option>}
            <option value="missing">Missing</option>
          </select>
          <textarea className="input" rows={2} placeholder="Evidence" aria-label="Evidence" required={status !== "missing"} minLength={status !== "missing" ? 10 : undefined} value={evidence} onChange={(e) => setEvidence(e.target.value)} />
          <ErrorNote error={a.error} title="Not saved" />
          <button className="btn btn-sm btn-primary" disabled={a.busy}>Save</button>
        </form>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Assets, QA, deployments
// ---------------------------------------------------------------------------
function Assets({ f, onDone }: { f: ProjectFile; onDone: () => void }) {
  const { db } = useSignedIn();
  const a = useAction(onDone);
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState("photo");
  return (
    <Card title="Assets" subtitle="Received only with its source and licence written down.">
      {f.assets.length === 0 ? <Empty>No assets listed yet.</Empty> : (
        <ul className="list web-list" data-testid="web-assets">{f.assets.map((x) => <AssetLine key={x.id} asset={x} onDone={onDone} />)}</ul>
      )}
      <form className="form" aria-label="Add an asset" onSubmit={async (e) => { e.preventDefault(); if (await a.run(() => addAsset(db, f.project, { label, kind }))) setLabel(""); }}>
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          <input className="input" required minLength={2} placeholder="e.g. Logo (SVG)" aria-label="Asset" value={label} onChange={(e) => setLabel(e.target.value)} style={{ flex: "1 1 160px" }} />
          <select className="input" aria-label="Kind" value={kind} onChange={(e) => setKind(e.target.value)} style={{ flex: "0 1 140px" }}>
            {Object.entries(ASSET_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className="btn btn-sm" disabled={a.busy}>Add</button>
        </div>
        <ErrorNote error={a.error} title="Not added" />
      </form>
    </Card>
  );
}

function AssetLine({ asset, onDone }: { asset: ProjectFile["assets"][number]; onDone: () => void }) {
  const { db } = useSignedIn();
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState({ status: asset.status, source: asset.source, licence_note: asset.licence_note ?? "", location: asset.location ?? "" });
  const a = useAction(() => { setEditing(false); onDone(); });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });
  return (
    <li>
      <div className="row" style={{ justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <span>{asset.label} <span className="muted">· {ASSET_KINDS[asset.kind as keyof typeof ASSET_KINDS]}</span></span>
        <button className="btn btn-sm" onClick={() => setEditing((x) => !x)} aria-label={`Update ${asset.label}`}>
          <Badge tone={asset.status === "received" ? "good" : asset.status === "missing" ? "warn" : "neutral"}>{ASSET_STATUSES[asset.status as AssetStatus]}</Badge>
        </button>
      </div>
      {!editing && asset.licence_note && <p className="muted" style={{ margin: "4px 0 0" }}>{ASSET_SOURCES[asset.source as AssetSource]}: {asset.licence_note}</p>}
      {editing && (
        <form className="form" aria-label={`Update ${asset.label}`} onSubmit={(e) => {
          e.preventDefault();
          const c = checkAsset({ status: v.status as AssetStatus, source: v.source as AssetSource, licenceNote: v.licence_note });
          if (!c.ok) { a.setError({ message: c.reason, hint: c.code }); return; }
          void a.run(() => updateAsset(db, asset.id, v));
        }}>
          <select className="input" aria-label="Status" value={v.status} onChange={set("status")}>{Object.entries(ASSET_STATUSES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <select className="input" aria-label="Source" value={v.source} onChange={set("source")}>{Object.entries(ASSET_SOURCES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <input className="input" aria-label="Licence or permission" placeholder="Licence or permission" value={v.licence_note} onChange={set("licence_note")} />
          <input className="input" aria-label="Where it's kept" placeholder="Where it's kept" value={v.location} onChange={set("location")} />
          <ErrorNote error={a.error} title="Not saved" />
          <button className="btn btn-sm btn-primary" disabled={a.busy}>Save</button>
        </form>
      )}
    </li>
  );
}

function Qa({ f, onDone }: { f: ProjectFile; onDone: () => void }) {
  const { db } = useSignedIn();
  const a = useAction(onDone);
  const can = ["qa", "client_review", "release"].includes(f.project.status) && f.scopes[0];
  const [r, setR] = useState({ verdict: "pass", critical_open: "0", checked: "", evidence: "", tested_url: "" });
  const set = (k: keyof typeof r) => (e: { target: { value: string } }) => setR({ ...r, [k]: e.target.value });
  return (
    <Card title="QA verdicts" subtitle="Independent checks against the acceptance criteria. A verdict is never edited: run QA again.">
      {f.qa.length === 0 ? <Empty>No QA run yet.</Empty> : (
        <ul className="list web-list" data-testid="web-qa">
          {f.qa.map((x) => (
            <li key={x.id}>
              <Badge tone={x.verdict === "fail" ? "bad" : x.verdict === "pass" ? "good" : "warn"}>{x.verdict === "conditional_pass" ? "Conditional pass" : x.verdict === "pass" ? "Pass" : "Fail"}</Badge>{" "}
              <span className="muted">{x.created_at.slice(0, 10)} · {x.critical_open} critical open · checked {x.checked.join(", ")}</span>
              <p style={{ margin: "4px 0 0" }}>{x.evidence}</p>
            </li>
          ))}
        </ul>
      )}
      {can && (
        <form className="form" aria-label="Record a QA verdict" onSubmit={(e) => {
          e.preventDefault();
          void a.run(() => addQaRun(db, f.project, f.scopes[0]!.id, { ...r, critical_open: Number(r.critical_open), checked: lines(r.checked.replace(/,/g, "\n")) }));
        }}>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            <select className="input" aria-label="Verdict" value={r.verdict} onChange={set("verdict")} style={{ flex: "1 1 140px" }}>
              <option value="pass">Pass</option><option value="conditional_pass">Conditional pass</option><option value="fail">Fail</option>
            </select>
            <input className="input" type="number" min={0} aria-label="Critical defects open" value={r.critical_open} onChange={set("critical_open")} style={{ flex: "0 1 100px" }} />
          </div>
          <Field label="What was checked" hint="Comma-separated, e.g. pages, forms, mobile, keyboard."><input className="input" required value={r.checked} onChange={set("checked")} /></Field>
          <Field label="Evidence"><textarea className="input" rows={2} required minLength={20} value={r.evidence} onChange={set("evidence")} /></Field>
          <Field label="Address tested"><input className="input" type="url" placeholder="https://" value={r.tested_url} onChange={set("tested_url")} /></Field>
          <ErrorNote error={a.error} title="Not recorded" />
          <button className="btn btn-primary" disabled={a.busy}>Record the verdict</button>
        </form>
      )}
    </Card>
  );
}

function Deployments({ f, onDone }: { f: ProjectFile; onDone: () => void }) {
  const { db } = useSignedIn();
  const a = useAction(onDone);
  const [d, setD] = useState({ environment: "preview" as "preview" | "production", url: "", commit_ref: "", outcome: "live" as "live" | "failed", checked: "" });
  const set = (k: keyof typeof d) => (e: { target: { value: string } }) => setD({ ...d, [k]: e.target.value } as typeof d);
  const releaseApproved = Boolean(f.scopes[0] && f.approvals.some((x) => x.revision_id === f.scopes[0]!.id && x.kind === "release"));
  const closed = ["closed", "cancelled"].includes(f.project.status);
  return (
    <Card title="Deployments" subtitle="Where it went, from which commit, and what was checked there. Production needs the client's release approval.">
      {f.deployments.length === 0 ? <Empty>Nothing deployed yet.</Empty> : (
        <ul className="list web-list" data-testid="web-deployments">{f.deployments.map((x) => <DeploymentLine key={x.id} d={x} onDone={onDone} />)}</ul>
      )}
      {!closed && (
        <form className="form" aria-label="Record a deployment" onSubmit={(e) => {
          e.preventDefault();
          const c = checkDeployment({ environment: d.environment, url: d.url.trim(), commitRef: d.commit_ref.trim(), checked: d.checked }, { status: f.project.status as WebProjectStatus, releaseApproved });
          if (!c.ok) { a.setError({ message: c.reason, hint: c.code }); return; }
          void a.run(() => addDeployment(db, f.project, d));
        }}>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            <select className="input" aria-label="Environment" value={d.environment} onChange={set("environment")} style={{ flex: "1 1 120px" }}>
              <option value="preview">Preview</option><option value="production">Production</option>
            </select>
            <select className="input" aria-label="Outcome" value={d.outcome} onChange={set("outcome")} style={{ flex: "1 1 120px" }}>
              <option value="live">Live</option><option value="failed">Failed</option>
            </select>
          </div>
          <Field label="Address"><input className="input" type="url" required placeholder="https://" value={d.url} onChange={set("url")} /></Field>
          <Field label="Commit"><input className="input mono" required pattern="[0-9a-f]{7,40}" value={d.commit_ref} onChange={set("commit_ref")} /></Field>
          <Field label="What you checked there"><textarea className="input" rows={2} required minLength={10} value={d.checked} onChange={set("checked")} /></Field>
          <ErrorNote error={a.error} title="Not recorded" />
          <button className="btn btn-primary" disabled={a.busy}>Record the deployment</button>
        </form>
      )}
    </Card>
  );
}

function DeploymentLine({ d, onDone }: { d: ProjectFile["deployments"][number]; onDone: () => void }) {
  const { db } = useSignedIn();
  const [note, setNote] = useState("");
  const [asking, setAsking] = useState(false);
  const a = useAction(onDone);
  const tone = d.outcome === "live" ? "good" : d.outcome === "failed" ? "bad" : "neutral";
  return (
    <li>
      <Badge tone="info">{d.environment === "production" ? "Production" : "Preview"}</Badge> <Badge tone={tone}>{d.outcome === "rolled_back" ? "Rolled back" : d.outcome === "live" ? "Live" : "Failed"}</Badge>{" "}
      <a href={d.url} target="_blank" rel="noreferrer">{d.url}</a> <span className="mono muted">{d.commit_ref.slice(0, 7)}</span>
      <p className="muted" style={{ margin: "4px 0 0" }}>Checked: {d.checked}{d.rollback_note ? ` · Rolled back: ${d.rollback_note}` : ""}</p>
      {d.outcome === "live" && !asking && <button className="btn btn-sm" onClick={() => setAsking(true)}>Record a rollback</button>}
      {asking && (
        <form className="form" aria-label="Record a rollback" onSubmit={(e) => { e.preventDefault(); void a.run(() => rollBack(db, d.id, note)); }}>
          <textarea className="input" rows={2} required minLength={10} placeholder="Why it was rolled back" aria-label="Why it was rolled back" value={note} onChange={(e) => setNote(e.target.value)} />
          <ErrorNote error={a.error} title="Not recorded" />
          <button className="btn btn-sm btn-primary" disabled={a.busy}>Save</button>
        </form>
      )}
    </li>
  );
}
