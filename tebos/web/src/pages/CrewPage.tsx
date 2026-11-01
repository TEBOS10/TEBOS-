// The AI crew (ADR 0020): agents in teams, on day and night shifts, drafting the business's routine work. People
// decide: an admin approves or rejects each draft, then a person sends it and records how. TEBOS sends nothing.
import { Bot, Moon, Sun } from "lucide-react";
import { useState, type FormEvent } from "react";
import { AI_SHIFTS, AI_TASK_LABEL, AI_TEAMS, AI_WORK, rosterGaps, type AiShift, type AiTeam, type AiWork, type CrewAgent } from "@core/aiCrew";
import type { AiTaskStatus } from "@core/states";
import { Badge, Card, Empty, ErrorNote, Field, Loading, PageHeader } from "../components/ui";
import { addAgent, agents as loadAgents, onDuty, openTasks, setAgentStatus, updateTask, type Task } from "../lib/crewData";
import { useOrg } from "../lib/session";
import { useQuery } from "../lib/useQuery";

export function CrewPage() {
  const org = useOrg();
  const roster = useQuery(() => loadAgents(org.db, org.organisation.id), [org.organisation.id]);
  const duty = useQuery(() => onDuty(org.db, org.organisation.id), [org.organisation.id]);
  const team = org.role === "org_admin" || org.role === "operator";
  const tasks = useQuery(() => (team ? openTasks(org.db, org.organisation.id) : Promise.resolve([])), [org.organisation.id, team]);
  const reload = () => { roster.reload(); duty.reload(); tasks.reload(); };
  const admin = org.role === "org_admin";
  const onIds = new Set((duty.data ?? []).map((d) => d.id));
  const gaps = roster.data ? rosterGaps(roster.data as CrewAgent[]) : [];
  return (
    <div className="stack">
      <PageHeader eyebrow="AI agents in teams, on day and night shifts. They draft; you decide and send." title="Crew" />
      <Card title="Roster" subtitle="Day is 06:00 to 18:00, night 18:00 to 06:00, South African time.">
        {roster.error ? <ErrorNote error={roster.error} title="Couldn't load the crew" /> : !roster.data ? <Loading /> : (
          <div className="crew-grid" data-testid="roster">
            {(Object.keys(AI_TEAMS) as AiTeam[]).map((t) => (
              <section key={t} className="crew-team" aria-label={`${AI_TEAMS[t]} team`}>
                <h3>{AI_TEAMS[t]}</h3>
                {(Object.keys(AI_SHIFTS) as AiShift[]).map((s) => {
                  const people = roster.data!.filter((a) => a.team === t && a.shift === s);
                  return (
                    <div key={s} className="crew-shift">
                      <p className="muted">{s === "day" ? <Sun size={13} aria-hidden /> : <Moon size={13} aria-hidden />} {s === "day" ? "Day" : "Night"}</p>
                      {people.length === 0 ? <p className="crew-gap">Nobody on this shift</p> : people.map((a) => (
                        <p key={a.id} className="crew-agent">
                          <Bot size={14} aria-hidden /> {a.name}
                          {onIds.has(a.id) && <Badge tone="good">On duty</Badge>}
                          {a.status === "paused" && <Badge tone="neutral">Paused</Badge>}
                          {admin && <button className="btn btn-ghost btn-sm" onClick={async () => { await setAgentStatus(org.db, a.id, a.status === "active" ? "paused" : "active"); reload(); }}>
                            {a.status === "active" ? "Pause" : "Resume"}</button>}
                        </p>
                      ))}
                    </div>
                  );
                })}
              </section>
            ))}
          </div>
        )}
        {gaps.length > 0 && roster.data && roster.data.length > 0 && <p className="muted" data-testid="gaps">Gaps: {gaps.map((g) => `${AI_TEAMS[g.team]} ${g.shift}`).join(", ")}.</p>}
      </Card>
      {admin && <AddAgent onDone={reload} />}
      {team && (
        <Card title="Work" subtitle="Drafts by the crew, waiting on a person. Nothing is sent until someone sends it.">
          {tasks.error ? <ErrorNote error={tasks.error} title="Couldn't load the work" /> : !tasks.data ? <Loading /> :
            tasks.data.length === 0 ? <Empty>Nothing waiting.</Empty> : (
              <ul className="crew-work" data-testid="work">
                {tasks.data.map((t) => <WorkItem key={t.id} t={t} admin={admin} agentName={roster.data?.find((a) => a.id === t.agent_id)?.name} onDone={reload} />)}
              </ul>
            )}
        </Card>
      )}
    </div>
  );
}

function WorkItem({ t, admin, agentName, onDone }: { t: Task; admin: boolean; agentName?: string; onDone: () => void }) {
  const org = useOrg();
  const [draft, setDraft] = useState(t.draft ?? "");
  const [note, setNote] = useState("");
  const [error, setError] = useState<unknown>(null);
  async function run(e: FormEvent | React.MouseEvent, patch: Parameters<typeof updateTask>[2]) {
    e.preventDefault(); setError(null);
    try { await updateTask(org.db, t.id, patch); onDone(); } catch (err) { setError(err); }
  }
  const status = t.status as AiTaskStatus;
  return (
    <li className="crew-item" aria-label={AI_WORK[t.kind as AiWork]?.label ?? t.kind}>
      <p><strong>{AI_WORK[t.kind as AiWork]?.label ?? t.kind}</strong> · <Badge tone={status === "drafted" ? "warn" : status === "approved" ? "good" : "neutral"}>{AI_TASK_LABEL[status]}</Badge>
        {agentName && <span className="muted"> · by {agentName}</span>}</p>
      <p className="muted">{t.brief}</p>
      {status === "drafted" && (
        <form className="form" onSubmit={(e) => run(e, { draft: draft.trim() })}>
          <Field label="Draft (edit before deciding)"><textarea className="input" rows={5} value={draft} onChange={(e) => setDraft(e.target.value)} /></Field>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <button className="btn" disabled={draft.trim() === (t.draft ?? "")}>Save edits</button>
            {admin ? <>
              <button type="button" className="btn btn-primary" onClick={(e) => run(e, { status: "approved" })}>Approve</button>
              <button type="button" className="btn" onClick={(e) => run(e, { status: "queued" })}>Ask for a new draft</button>
              <button type="button" className="btn btn-danger" onClick={(e) => run(e, { status: "rejected" })}>Reject</button>
            </> : <span className="muted">An admin approves.</span>}
          </div>
        </form>
      )}
      {status === "approved" && (
        <form className="form" aria-label="Mark as sent" onSubmit={(e) => run(e, { status: "sent", sent_note: note.trim() })}>
          <blockquote className="crew-draft">{t.draft}</blockquote>
          <Field label="After you've sent it: how, and to whom"><input className="input" required minLength={5} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Emailed from bookings@ to the customer" /></Field>
          <button className="btn btn-primary">Mark as sent</button>
        </form>
      )}
      <ErrorNote error={error} title="Not saved" />
    </li>
  );
}

function AddAgent({ onDone }: { onDone: () => void }) {
  const org = useOrg();
  const [f, setF] = useState({ name: "", team: "bookings" as AiTeam, shift: "day" as AiShift, instructions: "" });
  const [error, setError] = useState<unknown>(null);
  return (
    <Card title="Add an agent" subtitle="Each agent belongs to one team and one shift. It drafts that team's work.">
      <form className="form" aria-label="Add an agent" onSubmit={async (e) => {
        e.preventDefault(); setError(null);
        try {
          await addAgent(org.db, { org_id: org.organisation.id, name: f.name.trim(), team: f.team, shift: f.shift, instructions: f.instructions.trim() || null });
          setF({ ...f, name: "", instructions: "" }); onDone();
        } catch (err) { setError(err); }
      }}>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <Field label="Name"><input className="input" required minLength={2} maxLength={60} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Bookings · night" /></Field>
          <Field label="Team"><select className="input" value={f.team} onChange={(e) => setF({ ...f, team: e.target.value as AiTeam })}>
            {(Object.keys(AI_TEAMS) as AiTeam[]).map((t) => <option key={t} value={t}>{AI_TEAMS[t]}</option>)}</select></Field>
          <Field label="Shift"><select className="input" value={f.shift} onChange={(e) => setF({ ...f, shift: e.target.value as AiShift })}>
            {(Object.keys(AI_SHIFTS) as AiShift[]).map((s) => <option key={s} value={s}>{AI_SHIFTS[s]}</option>)}</select></Field>
        </div>
        <Field label="Standing instructions (optional)" hint="Tone, sign-off, what to always mention. Never passwords or keys."><textarea className="input" rows={2} maxLength={2000} value={f.instructions} onChange={(e) => setF({ ...f, instructions: e.target.value })} /></Field>
        <button className="btn btn-primary">Add to the crew</button>
        <ErrorNote error={error} title="Not added" />
      </form>
    </Card>
  );
}
