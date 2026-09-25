import { CALL_CONSENT_TEXT, checkBookingTime } from "@core/interview";
import { allQuestions, playbook as findPlaybook } from "@core/playbooks";
import { useState, type FormEvent } from "react";
import { Card, Empty, ErrorNote, Field, Loading, PageHeader, StatusBadge } from "../components/ui";
import { cancelInterview, getInterview, rescheduleInterview, submitInterviewAnswers } from "../lib/data";
import { when } from "../lib/format";
import { usePeople } from "../lib/people";
import { Link } from "../lib/router";
import { useOrg } from "../lib/session";
import { useQuery } from "../lib/useQuery";

const mmss = (s: number | null | undefined) => (s === null || s === undefined ? "" : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`);
const masked = (n: string | null) => (n ? `${n.slice(0, 4)} ••• ${n.slice(-3)}` : "");

const STATUS_TEXT: Record<string, string> = {
  scheduled: "Booked. TEBOS's AI interviewer will call at the time below.",
  dialling: "Calling now.",
  in_progress: "The call is in progress.",
  completed: "Done.",
  no_answer: "The call wasn't answered. Book a new time.",
  failed: "The call didn't go through. Book a new time.",
  cancelled: "Cancelled.",
  open: "Waiting for written answers.",
};

export function InterviewPage({ id }: { id: string }) {
  const org = useOrg();
  const people = usePeople();
  const q = useQuery(() => getInterview(org.db, id), [id]);
  const [error, setError] = useState<unknown>(null);
  if (q.loading && !q.data) return <Loading />;
  if (q.error) return <ErrorNote error={q.error} title="Couldn't load this interview" />;
  if (!q.data) return <PageHeader title="Interview not found">It doesn't exist, or it belongs to another organisation.</PageHeader>;
  const { interview: s, business, answers } = q.data;
  const book = findPlaybook(s.playbook_key, s.playbook_version);
  const canAct = org.can("scan.run");
  const overdue = s.status === "scheduled" && s.scheduled_for && Date.now() - new Date(s.scheduled_for).getTime() > 5 * 60 * 1000;
  const answered = new Set(answers.map((a) => a.questionKey));
  const open = book ? allQuestions(book).filter((x) => !answered.has(x.key)) : [];
  const transcript = (Array.isArray(s.transcript) ? s.transcript : []) as Array<{ role: string; message: string; time_in_call_secs: number | null }>;

  async function act(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      q.reload();
    } catch (err) {
      setError(err);
    }
  }

  return (
    <div className="stack">
      <PageHeader
        eyebrow={<><Link to={`/businesses/${business.id}`}>{business.name}</Link> · Diagnostic interview</>}
        title={s.channel === "voice" ? "Interview call" : "Written interview"}
      >
        <StatusBadge status={s.status} />
        <span>{book?.name ?? `${s.playbook_key} v${s.playbook_version}`}</span>
      </PageHeader>
      <ErrorNote error={error} title="That wasn't done" />

      <div className="grid grid-main">
        <div className="stack">
          <Card title="Status">
            <p>{STATUS_TEXT[s.status] ?? s.status}</p>
            {overdue && (
              <div className="note note-warn" style={{ marginTop: 8 }}>
                The booked time has passed and TEBOS hasn't placed this call. Calls start once TEBOS's phone line is connected. You can answer in writing meanwhile.
              </div>
            )}
            {s.failure_detail && <p className="list-meta" style={{ marginTop: 6 }}>{s.failure_detail}</p>}
            {s.channel === "voice" && (
              <dl className="confidence-parts" style={{ marginTop: 10 }}>
                <div><dt>Booked for</dt><dd>{when(s.scheduled_for)}</dd></div>
                <div><dt>Number</dt><dd className="mono">{masked(s.phone_number)}</dd></div>
                {s.duration_seconds !== null && <div><dt>Length</dt><dd>{mmss(s.duration_seconds)}</dd></div>}
                <div><dt>Consent</dt><dd>given by {people.nameOf(s.consent_given_by)} {when(s.consent_given_at)}</dd></div>
              </dl>
            )}
            {s.channel === "voice" && s.consent_text && <p className="list-meta" style={{ marginTop: 8 }}>“{s.consent_text}”</p>}
            {canAct && s.status === "scheduled" && <Reschedule onSave={(d) => act(() => rescheduleInterview(org.db, s.id, d))} current={s.scheduled_for} />}
            {canAct && (s.status === "scheduled" || s.status === "open") && (
              <button className="btn btn-sm btn-danger" style={{ marginTop: 10 }} onClick={() => act(() => cancelInterview(org.db, s.id))}>
                Cancel interview
              </button>
            )}
          </Card>

          {s.channel === "form" && s.status === "open" && book && canAct && (
            <WrittenAnswers questions={book.sections} onSubmit={(a) => act(() => submitInterviewAnswers(org.db, s.id, a))} />
          )}

          {answers.length > 0 && (
            <Card title="What the owner said" subtitle="Their own statements, kept as evidence and never treated as verified fact">
              <ul className="list">
                {answers.map((a) => (
                  <li key={a.evidenceId}>
                    <div className="list-main">
                      <span className="list-meta">{a.question}</span>
                      <span>{a.summary}</span>
                      {a.quote && <span className="list-meta">“{a.quote}” · {a.location}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {transcript.length > 0 && (
            <Card title="Transcript" subtitle="Recorded exactly as said. It can't be edited.">
              <ol className="transcript">
                {transcript.map((t, i) => (
                  <li key={i} className={t.role === "user" ? "from-user" : "from-agent"}>
                    <span className="list-meta">{t.role === "user" ? "Owner" : "Interviewer (AI)"} {mmss(t.time_in_call_secs)}</span>
                    <p>{t.message}</p>
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </div>
        <div className="stack">
          {(s.status === "completed" || answers.length > 0) && (
            <Card title="Coverage">
              {s.extraction_status === "not_available" || s.extraction_status === "failed" ? (
                <div className="note note-warn">{s.extraction_detail}</div>
              ) : s.extraction_status === "pending" ? (
                <p className="muted">TEBOS is reading the call for answers.</p>
              ) : (
                <p className="muted">{s.extraction_detail ?? `${answers.length} answers recorded.`}</p>
              )}
              {open.length > 0 && s.status === "completed" && (
                <>
                  <h3 className="card-title" style={{ margin: "12px 0 6px" }}>Not covered</h3>
                  <ul className="list">
                    {open.map((x) => (
                      <li key={x.key}>
                        <div className="list-main">
                          <span>{x.text}</span>
                          <span className="list-meta">Would show: {x.diagnoses}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Card>
          )}
          {book && s.status !== "completed" && (
            <Card title="What will be asked">
              {book.sections.map((sec) => (
                <div key={sec.key} style={{ marginBottom: 10 }}>
                  <strong>{sec.title}</strong>
                  <ul className="plain-list">{sec.questions.map((x) => <li key={x.key}>{x.text}</li>)}</ul>
                </div>
              ))}
            </Card>
          )}
          {s.channel === "voice" && s.status === "scheduled" && (
            <Card title="On the call">
              <p className="muted">The interviewer says it's an AI assistant and that the call is recorded, then asks whether it's still a good time. You can end the call at any time.</p>
              <p className="list-meta" style={{ marginTop: 6 }}>{CALL_CONSENT_TEXT}</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Reschedule({ current, onSave }: { current: string | null; onSave: (d: Date) => void }) {
  const [value, setValue] = useState(current ? new Date(new Date(current).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <form
      className="row"
      style={{ marginTop: 10, flexWrap: "wrap" }}
      onSubmit={(e) => {
        e.preventDefault();
        const d = new Date(value);
        const c = checkBookingTime(d);
        if (!c.ok) return setProblem(c.reason);
        setProblem(null);
        onSave(d);
      }}
    >
      <input className="input" style={{ maxWidth: 240 }} type="datetime-local" aria-label="New time" value={value} onChange={(e) => setValue(e.target.value)} />
      <button className="btn btn-sm">Reschedule</button>
      {problem && <span className="why-not">{problem}</span>}
    </form>
  );
}

function WrittenAnswers({
  questions,
  onSubmit,
}: {
  questions: Array<{ key: string; title: string; questions: Array<{ key: string; text: string; diagnoses: string }> }>;
  onSubmit: (answers: Array<{ question_key: string; question: string; answer: string }>) => Promise<void>;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const filled = Object.values(values).filter((v) => v.trim()).length;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    await onSubmit(questions.flatMap((s) => s.questions.map((x) => ({ question_key: x.key, question: x.text, answer: values[x.key] ?? "" }))));
    setBusy(false);
  }

  return (
    <Card title="Your answers" subtitle="Answer what you can; skip what you don't know. Plain, honest answers help most.">
      <form className="form" onSubmit={submit} aria-label="Written interview">
        {questions.map((sec) => (
          <fieldset className="fieldset" key={sec.key}>
            <legend>{sec.title}</legend>
            {sec.questions.map((x) => (
              <Field key={x.key} label={x.text}>
                <textarea className="input" rows={3} value={values[x.key] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [x.key]: e.target.value }))} />
              </Field>
            ))}
          </fieldset>
        ))}
        <button className="btn btn-primary" disabled={busy || filled === 0}>
          {busy ? "Saving…" : `Submit ${filled} answer${filled === 1 ? "" : "s"}`}
        </button>
      </form>
    </Card>
  );
}
