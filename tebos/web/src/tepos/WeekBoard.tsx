// The week board: TEPOS's first view. Today's scene, the one next action, today's checklist with what "done" means,
// the week as seven scenes, and the Income · Impact · Intelligence scoreboard. Opening it opens this week (once);
// nothing is ever ticked for the founder, and work left from earlier days stays open until the founder says what
// happened.
import { useEffect, useMemo, useState } from "react";
import {
  LENS_LABEL,
  LENSES,
  WEEK_TASK_STATUS_LABEL,
  addDays,
  isoWeekday,
  lensProgress,
  nextBestAction,
  saToday,
  todaysQueue,
  weekStartOf,
  type Lens,
} from "@core/week";
import type { WeekTaskStatus } from "@core/states";
import { ErrorNote, Loading } from "../components/ui";
import { Link } from "../lib/router";
import { useOrg } from "../lib/session";
import { useQuery } from "../lib/useQuery";
import { dailyBrief, OWNER_LABEL, SOURCE_LABEL, type SourceType } from "@core/reeds-intake";
import { asCommitment } from "./IntakePage";
import { loadIntake, loadWorkerStatus } from "./intakeData";
import { workerSummary } from "@core/worker-health";
import { closeDay, ensurePlan, loadSignals, openWeek, updateTask, type Signals, type WeekDayRow, type WeekTaskRow } from "./weekData";

const STATUSES: WeekTaskStatus[] = ["not_started", "in_progress", "done", "blocked", "deferred", "skipped"];
const NEEDS_REASON: WeekTaskStatus[] = ["blocked", "deferred", "skipped"];
const WEEKDAY = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const longDate = (iso: string) =>
  new Intl.DateTimeFormat("en-ZA", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
const shortDate = (iso: string) =>
  new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

const asTask = (t: WeekTaskRow) => ({ ...t, localDate: t.local_date, lens: t.lens as Lens, status: t.status as WeekTaskStatus, estMinutes: t.est_minutes, deferUntil: t.defer_until });

export function WeekBoard() {
  const org = useOrg();
  // the board lives in the founder's own private organisation (IREKUN), beside the Real Estate Job and Tidy Capital
  const home = org.organisations.find((o) => o.organisation.private && o.organisation.slug === "irekun") ?? org.organisations.find((o) => o.organisation.private);
  const orgId = home?.organisation.id;
  const today = saToday();
  const weekStart = weekStartOf(today);

  const week = useQuery(async () => {
    if (!orgId) return null;
    await ensurePlan(org.db, orgId);
    return openWeek(org.db, orgId, weekStart);
  }, [orgId, weekStart]);
  const signals = useQuery(async () => (orgId ? loadSignals(org.db, orgId, weekStart) : null), [orgId, weekStart]);
  const intake = useQuery(async () => (orgId ? loadIntake(org.db, orgId) : null), [orgId]);
  const worker = useQuery(async () => loadWorkerStatus(org.db), []);

  const [tasks, setTasks] = useState<WeekTaskRow[]>([]);
  const [days, setDays] = useState<WeekDayRow[]>([]);
  useEffect(() => { if (week.data) { setTasks(week.data.tasks); setDays(week.data.days); } }, [week.data]);
  const [viewDate, setViewDate] = useState(today);

  if (!orgId) return <div className="tepos"><h1>This week</h1><p className="tepos-muted">The week board needs your private organisation (IREKUN).</p></div>;
  if (week.loading && !week.data) return <div className="tepos"><Loading label="Opening this week" /></div>;
  if (week.error) return <div className="tepos"><ErrorNote error={week.error} title="Couldn't open this week" /></div>;

  const replace = (row: WeekTaskRow) => setTasks((ts) => ts.map((t) => (t.id === row.id ? row : t)));
  const view = tasks.map(asTask);
  const queue = todaysQueue(view, today);
  const next = nextBestAction(view, today);
  // today: all of today's tasks, finished ones included, then earlier days' tasks still open
  const todayList = [...view.filter((t) => t.localDate === today), ...queue.filter((t) => t.localDate < today)];
  const todayDay = days.find((d) => d.local_date === today);
  const viewDay = days.find((d) => d.local_date === viewDate);
  const firstDay = today === weekStart || !tasks.some((t) => t.status !== "not_started");

  return (
    <div className="tepos week" data-testid="week-board">
      <header className="tepos-head">
        <div className="tepos-eyebrow">TEPOS · This week</div>
        <h1 data-testid="week-today">{longDate(today)}</h1>
        {todayDay && <p className="week-scene-line"><span className={`lens lens-${todayDay.lens}`}>{LENS_LABEL[todayDay.lens as Lens]}</span> Scene {todayDay.weekday}: <strong>{todayDay.scene}</strong>. {todayDay.focus}</p>}
        {firstDay && <p className="tepos-muted" data-testid="week-starts-now">The weekly plan starts now. Nothing earlier today is marked done: you say what happened.</p>}
        <p className="tepos-muted">Time estimates are planning blocks, not the agency's hours. Pelser's appointments come first.</p>
      </header>

      {worker.data && (
        <p className={`worker-strip worker-${worker.data.state}`} data-testid="worker-status" role={worker.data.state === "running" ? undefined : "status"}>
          <strong>Worker</strong> {workerSummary(worker.data)}
          {worker.data.state !== "running" && worker.data.state !== "never" && worker.data.lastError ? <span className="tepos-muted"> Last error: {worker.data.lastError}</span> : null}
        </p>
      )}
      {worker.error ? <p className="worker-strip worker-unknown tepos-muted" data-testid="worker-status">Worker: couldn't check its status.</p> : null}

      <section className="week-next" aria-label="Next best action" data-testid="next-action">
        <div className="tepos-eyebrow">Next best action</div>
        {next ? (
          <>
            <h2>{next.title}</h2>
            <p>{next.action}</p>
            <p className="tepos-muted"><strong>Done means:</strong> {next.definition_of_done}{next.est_minutes ? ` · about ${next.est_minutes} min` : ""}</p>
          </>
        ) : <p>Nothing open for today. Close the day, or look ahead below.</p>}
      </section>

      {intake.data && <ReedsBrief data={intake.data} today={today} />}

      <section aria-label="Start now" className="week-today">
        <div className="week-section-head">
          <h2>{viewDate === today ? "Start now" : `${WEEKDAY[isoWeekday(viewDate)]} ${shortDate(viewDate)}`}</h2>
          {viewDate !== today && <button type="button" className="btn btn-ghost-dark" onClick={() => setViewDate(today)}>Back to today</button>}
        </div>
        <ol className="week-tasks" data-testid="week-tasks">
          {(viewDate === today ? todayList : view.filter((t) => t.localDate === viewDate))
            .map((t) => <TaskRow key={t.id} task={tasks.find((x) => x.id === t.id)!} today={today} carried={t.localDate < today} onSaved={replace} />)}
        </ol>
        {viewDate === today && queue.length === 0 && <p className="tepos-muted">Nothing left open today.</p>}
        {viewDay && viewDay.local_date <= today && <DayClose day={viewDay} onSaved={(d) => setDays((ds) => ds.map((x) => (x.id === d.id ? d : x)))} />}
      </section>

      <section aria-label="The week" className="week-glance">
        <h2>The week, scene by scene</h2>
        <ol className="week-scenes" data-testid="week-scenes">
          {days.map((d) => {
            const own = view.filter((t) => t.localDate === d.local_date);
            const done = own.filter((t) => t.status === "done").length;
            const state = d.local_date < today ? "past" : d.local_date === today ? "today" : "ahead";
            return (
              <li key={d.id}>
                <button type="button" className={`week-scene scene-${state} ${d.local_date === viewDate ? "selected" : ""}`} onClick={() => setViewDate(d.local_date)}
                  aria-pressed={d.local_date === viewDate} data-testid={`scene-${d.weekday}`}>
                  <span className="scene-day">{WEEKDAY[d.weekday]} {shortDate(d.local_date)}{state === "today" ? " · today" : ""}</span>
                  <span className="scene-title">{d.scene}</span>
                  <span className={`lens lens-${d.lens}`}>{LENS_LABEL[d.lens as Lens]}</span>
                  <span className="scene-focus">{d.focus}</span>
                  <span className="scene-out"><strong>Output:</strong> {d.deliverable}</span>
                  <span className="scene-out"><strong>Saved in:</strong> {d.saved_to}</span>
                  <span className="scene-progress" aria-label={`${done} of ${own.length} done`}>
                    <span style={{ width: own.length ? `${(100 * done) / own.length}%` : "0%" }} />
                  </span>
                  <span className="scene-count">{done}/{own.length} done{d.closed_at ? " · closed" : ""}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      <Scoreboard tasks={view} signals={signals.data ?? null} />

      <section aria-label="Records and proof" className="tepos-card">
        <h2>Records and proof</h2>
        <ul className="week-records">
          <li><Link to="/agent">Real Estate Job</Link>: the agency pipeline and daily activity (references only, no client details).</li>
          <li><Link to="/property">Tidy Enterprise</Link>: property case dossiers, specialist handovers and outstanding dependencies.</li>
          <li><Link to="/capital">Tidy Capital</Link>: money received, spent and expected, kept apart.</li>
          <li><Link to="/reeds">Ask REEDS</Link>: requests and the weekly signal brief.</li>
          <li>TEBOS template catalogue and factory log: the property workflows built on Saturdays (TEBOS staff area).</li>
          <li>BAME commercial diagnostic and 14-day experiment: <code>tebos/docs/clients/bame/commercial-diagnostic.md</code> (Sunday review only).</li>
        </ul>
      </section>
    </div>
  );
}

function TaskRow({ task, today, carried, onSaved }: { task: WeekTaskRow; today: string; carried: boolean; onSaved: (t: WeekTaskRow) => void }) {
  const org = useOrg();
  const [pending, setPending] = useState<WeekTaskStatus | null>(null);
  const [reason, setReason] = useState(task.status_reason ?? "");
  const [until, setUntil] = useState(task.defer_until ?? addDays(today, 1));
  const [owner, setOwner] = useState(task.owner_label ?? "");
  const [evidence, setEvidence] = useState(task.evidence_note ?? "");
  const [link, setLink] = useState(task.output_link ?? "");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function save(patch: Parameters<typeof updateTask>[2]) {
    setBusy(true);
    setError(null);
    try {
      onSaved(await updateTask(org.db, task.id, patch));
      setPending(null);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  function choose(s: WeekTaskStatus) {
    if (s === task.status) return;
    if (NEEDS_REASON.includes(s)) { setPending(s); return; }
    void save({ status: s });
  }
  const status = task.status as WeekTaskStatus;
  return (
    <li className={`week-task status-${status}`} data-testid="week-task">
      <div className="task-top">
        <span className={`lens lens-${task.lens}`}>{LENS_LABEL[task.lens as Lens]}</span>
        <h3>{task.title}</h3>
        {task.est_minutes && <span className="task-min">{task.est_minutes} min</span>}
      </div>
      {carried && <p className="task-carried">From {WEEKDAY[isoWeekday(task.local_date)]}: still open until you say what happened.</p>}
      {task.action && <p className="task-action">{task.action}</p>}
      <p className="task-done"><strong>Done means:</strong> {task.definition_of_done}</p>
      {task.status_reason && status !== "done" && <p className="task-reason" data-testid="task-reason">{WEEK_TASK_STATUS_LABEL[status]}: {task.status_reason}{task.defer_until ? ` · new date ${shortDate(task.defer_until)}` : ""}{task.owner_label ? ` · ${task.owner_label}` : ""}</p>}
      <div className="task-status" role="group" aria-label={`Status of ${task.title}`}>
        {STATUSES.map((s) => (
          <button key={s} type="button" disabled={busy} aria-pressed={status === s} className={`chip ${status === s ? "on" : ""}`} onClick={() => choose(s)}>
            {WEEK_TASK_STATUS_LABEL[s]}
          </button>
        ))}
      </div>
      {pending && (
        <form className="task-why" onSubmit={(e) => { e.preventDefault(); void save({ status: pending, status_reason: reason, defer_until: pending === "skipped" ? null : until || null, owner_label: owner || null }); }}>
          <label>Why is it {WEEK_TASK_STATUS_LABEL[pending].toLowerCase()}?
            <input value={reason} onChange={(e) => setReason(e.target.value)} required maxLength={500} />
          </label>
          {pending !== "skipped" && (
            <label>{pending === "deferred" ? "New date" : "New date (optional)"}
              <input type="date" value={until} min={today} onChange={(e) => setUntil(e.target.value)} required={pending === "deferred"} />
            </label>
          )}
          {pending === "blocked" && (
            <label>Who unblocks it (optional)
              <input value={owner} onChange={(e) => setOwner(e.target.value)} maxLength={80} placeholder="e.g. Principal, Wealth Assist" />
            </label>
          )}
          <div className="task-why-actions">
            <button className="btn" disabled={busy}>Save</button>
            <button type="button" className="btn btn-ghost-dark" onClick={() => setPending(null)}>Cancel</button>
          </div>
        </form>
      )}
      <details className="task-evidence">
        <summary>Evidence or link{task.evidence_note || task.output_link ? " ✓" : ""}</summary>
        <form onSubmit={(e) => { e.preventDefault(); void save({ evidence_note: evidence || null, output_link: link || null }); }}>
          <label>What it produced
            <input value={evidence} onChange={(e) => setEvidence(e.target.value)} maxLength={1000} />
          </label>
          <label>Link (a TEPOS page like /agent, or https://)
            <input value={link} onChange={(e) => setLink(e.target.value)} maxLength={400} pattern="(https://|/)\S*" />
          </label>
          <button className="btn" disabled={busy}>Save evidence</button>
        </form>
      </details>
      <ErrorNote error={error} title="Not saved" />
    </li>
  );
}

function DayClose({ day, onSaved }: { day: WeekDayRow; onSaved: (d: WeekDayRow) => void }) {
  const org = useOrg();
  const [f, setF] = useState({ outcomes: day.outcomes ?? "", blockers: day.blockers ?? "", learning: day.learning ?? "", carried_forward: day.carried_forward ?? "" });
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const field = (k: keyof typeof f, label: string, hint: string) => (
    <label>{label}
      <textarea rows={2} value={f[k]} placeholder={hint} onChange={(e) => { setSaved(false); setF({ ...f, [k]: e.target.value }); }} maxLength={k === "outcomes" ? 1500 : 1000} />
    </label>
  );
  return (
    <form className="tepos-card week-close" data-testid="day-close" onSubmit={async (e) => {
      e.preventDefault();
      setError(null);
      try {
        onSaved(await closeDay(org.db, day.id, { outcomes: f.outcomes || null, blockers: f.blockers || null, learning: f.learning || null, carried_forward: f.carried_forward || null }));
        setSaved(true);
      } catch (err) { setError(err); }
    }}>
      <h2>Close {WEEKDAY[day.weekday]}{day.closed_at ? " · closed" : ""}</h2>
      {field("outcomes", "Outcomes", "What actually happened")}
      {field("blockers", "Blockers", "What held things up")}
      {field("learning", "Learning", "One thing worth keeping")}
      {field("carried_forward", "Carried forward", "What moves to tomorrow")}
      <button className="btn">Save the day's close</button>
      {saved && <span className="tepos-muted" role="status"> Saved.</span>}
      <ErrorNote error={error} title="Not saved" />
    </form>
  );
}

function Scoreboard({ tasks, signals }: { tasks: ReturnType<typeof asTask>[]; signals: Signals | null }) {
  const p = useMemo(() => lensProgress(tasks), [tasks]);
  const n = (v: number | null | undefined) => (v === null || v === undefined ? "unknown" : String(v));
  const lines: Record<Lens, Array<[string, string]>> = {
    income: [
      ["Open agency leads with a next step", n(signals?.openLeads)],
      ["Income recorded as verified (Tidy Capital)", n(signals?.verifiedIncomeItems)],
      ["Expected commission entries (not cash)", n(signals?.expectedCommissionItems)],
      ["Cash received this week", "not tracked here: record it in Tidy Capital"],
    ],
    impact: [
      ["Property cases updated this week", n(signals?.propertyCasesTouched)],
      ["Client outcomes documented", "only from case outcome reviews"],
    ],
    intelligence: [
      ["Factory runs logged this week", n(signals?.factoryRuns)],
      ["Lessons recorded", "in each day's close"],
    ],
  };
  return (
    <section aria-label="Income, Impact, Intelligence" className="week-score" data-testid="scoreboard">
      <h2>Income · Impact · Intelligence</h2>
      <p className="tepos-muted">Counts from the records themselves. Expected commission is never cash; nothing here is an estimate of value.</p>
      <div className="week-lenses">
        {LENSES.map((l) => (
          <div key={l} className={`tepos-card lens-card lens-${l}`} data-testid={`lens-${l}`}>
            <h3>{LENS_LABEL[l]}</h3>
            <p className="lens-tasks"><strong>{p[l].done}</strong> of {p[l].total} tasks done this week</p>
            <dl>
              {lines[l].map(([k, v]) => (<div key={k}><dt>{k}</dt><dd>{v}</dd></div>))}
            </dl>
          </div>
        ))}
      </div>
    </section>
  );
}

/** REEDS's part of the morning brief: at most three priorities, what is late, what waits on you, and the truth about each source. */
function ReedsBrief({ data, today }: { data: NonNullable<Awaited<ReturnType<typeof loadIntake>>>; today: string }) {
  const brief = dailyBrief(data.commitments.map(asCommitment), today);
  const openDecisions = data.decisions.filter((d) => d.status === "open" || d.status === "deferred");
  const sourceOf = (id: string) => data.events.find((e) => e.id === id);
  const notConnected = data.sources.filter((s) => s.source_type !== "manual" && s.state !== "connected");
  return (
    <section aria-label="REEDS brief" className="tepos-card reeds-brief" data-testid="reeds-brief">
      <div className="week-section-head"><h2>REEDS brief</h2><Link to="/intake">Open intake</Link></div>
      {brief.priorities.length === 0 && openDecisions.length === 0 && brief.blocked.length === 0
        ? <p className="tepos-muted">Nothing from intake needs you today.</p>
        : (
          <ol className="reeds-priorities">
            {brief.priorities.map((c) => {
              const src = sourceOf(c.source_event_id);
              return (
                <li key={c.id} data-testid="reeds-priority">
                  <Link to="/intake">{c.title}</Link>
                  <span className="tepos-muted"> · {c.due_on ? (c.due_on < today ? `late, due ${c.due_on}` : "due today") : "high priority, no date"} · {OWNER_LABEL[c.owner]}</span>
                  {src && <div className="intake-source">From {SOURCE_LABEL[src.source_type as SourceType].toLowerCase()}: {src.summary}{src.source_link && <> · <a href={src.source_link} target="_blank" rel="noreferrer">source</a></>}</div>}
                </li>
              );
            })}
          </ol>
        )}
      <p className="reeds-counts">
        <span data-testid="reeds-decisions">{openDecisions.length} decision{openDecisions.length === 1 ? "" : "s"} waiting</span> ·{" "}
        {brief.awaitingApproval.length} awaiting your approval · {brief.blocked.length} blocked · {brief.overdue.length} late · {data.conflicts.length} conflict{data.conflicts.length === 1 ? "" : "s"}
      </p>
      {notConnected.length > 0 && (
        <p className="tepos-muted" data-testid="reeds-sources">
          Not read automatically yet: {notConnected.map((s) => `${SOURCE_LABEL[s.source_type as SourceType]} (${s.state === "failing" ? "failing" : "not connected"})`).join(", ")}. Paste anything important into intake.
        </p>
      )}
    </section>
  );
}
