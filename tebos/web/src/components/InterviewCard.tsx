import { CALL_CONSENT_TEXT, checkBookingTime, normalisePhone } from "@core/interview";
import { marketingAgencyPlaybook } from "@core/playbooks";
import { Phone, PenLine } from "lucide-react";
import { useState, type FormEvent } from "react";
import { bookInterviewCall, listInterviews, startWrittenInterview, type Business } from "../lib/data";
import { when } from "../lib/format";
import { Link, navigate } from "../lib/router";
import { useOrg } from "../lib/session";
import { useQuery } from "../lib/useQuery";
import { Card, Empty, ErrorNote, Field, StatusBadge } from "./ui";

const PLAYBOOK = marketingAgencyPlaybook;

/** Local date-time input value (yyyy-MM-ddTHH:mm) for a Date. */
const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

/**
 * Diagnostic interviews for a business: book a call from TEBOS's AI
 * interviewer, or answer the same questions in writing. Answers become the
 * owner's statements in the evidence, never verified fact.
 */
export function InterviewCard({ business }: { business: Business }) {
  const org = useOrg();
  const q = useQuery(() => listInterviews(org.db, business.id), [business.id]);
  const canBook = org.can("scan.run");
  const [mode, setMode] = useState<"none" | "call">("none");
  const [phone, setPhone] = useState("");
  const [at, setAt] = useState(() => localInput(new Date(Date.now() + 60 * 60 * 1000)));
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [problem, setProblem] = useState<string | null>(null);

  async function book(e: FormEvent) {
    e.preventDefault();
    setProblem(null);
    const number = normalisePhone(phone);
    if (!number) return setProblem("Enter a valid phone number, for example 082 123 4567 or +44 20 7946 0958.");
    const when_ = new Date(at);
    const time = checkBookingTime(when_);
    if (!time.ok) return setProblem(time.reason);
    if (!consent) return setProblem("Tick the consent box. The call can't be booked without it.");
    setBusy(true);
    setError(null);
    try {
      const session = await bookInterviewCall(org.db, business, {
        playbookKey: PLAYBOOK.key, playbookVersion: PLAYBOOK.version, phone: number, at: when_, consentText: CALL_CONSENT_TEXT, userId: org.userId,
      });
      navigate(`/interviews/${session.id}`);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  async function writeAnswers() {
    setBusy(true);
    setError(null);
    try {
      const session = await startWrittenInterview(org.db, business, PLAYBOOK.key, PLAYBOOK.version);
      navigate(`/interviews/${session.id}`);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <Card title="Diagnostic interview" subtitle={`${PLAYBOOK.name}: what the public website can't show`}>
      <p className="muted">
        TEBOS asks the owner or a manager {PLAYBOOK.sections.reduce((n, s) => n + s.questions.length, 0)} questions about clients, sales, delivery, capacity, results and cash.
        Answers are kept as the owner&apos;s own statements and weighed against documents and connected systems.
      </p>
      {q.data && q.data.length > 0 ? (
        <ul className="list" style={{ marginTop: 10 }}>
          {q.data.map((s) => (
            <li key={s.id}>
              <div className="list-main">
                <Link to={`/interviews/${s.id}`} className="list-title">
                  {s.channel === "voice" ? "Call" : "Written answers"}
                </Link>
                <span className="list-meta">{s.channel === "voice" ? `booked for ${when(s.scheduled_for)}` : `started ${when(s.created_at)}`}</span>
              </div>
              <StatusBadge status={s.status} />
            </li>
          ))}
        </ul>
      ) : (
        !q.loading && <Empty>No interview yet.</Empty>
      )}
      <ErrorNote error={q.error} title="Couldn't load interviews" />
      {canBook && mode === "none" && (
        <div className="row" style={{ marginTop: 12, flexWrap: "wrap" }}>
          <button className="btn btn-primary btn-sm" onClick={() => setMode("call")}>
            <Phone size={14} aria-hidden /> Book a call
          </button>
          <button className="btn btn-sm" onClick={writeAnswers} disabled={busy}>
            <PenLine size={14} aria-hidden /> Answer in writing
          </button>
        </div>
      )}
      {canBook && mode === "call" && (
        <form className="form" onSubmit={book} noValidate style={{ marginTop: 12 }} aria-label="Book a call">
          <Field label="Phone number to call" hint="South African numbers can be written as 082 123 4567.">
            <input className="input" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="082 123 4567" />
          </Field>
          <Field label="When" hint="Your local time. Allow about 25 minutes.">
            <input className="input" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
          </Field>
          <label className="consent">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>{CALL_CONSENT_TEXT}</span>
          </label>
          {problem && <div className="note note-warn" role="alert">{problem}</div>}
          <ErrorNote error={error} title="The call wasn't booked" />
          <div className="row">
            <button className="btn btn-primary btn-sm" disabled={busy}>{busy ? "Booking…" : "Book the call"}</button>
            <button type="button" className="btn btn-sm" onClick={() => setMode("none")}>Cancel</button>
          </div>
        </form>
      )}
    </Card>
  );
}
