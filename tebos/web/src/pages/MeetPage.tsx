// Meeting mode: what TEBOS's staff put in front of a prospect in a meeting.
// Show, don't talk: the film plays, then the prospect types their number and
// agrees to the call, and TEBOS's voice agent rings them on the spot for a
// short intake call. Full screen, with no staff navigation: the prospect
// sees nothing of any other client. The database decides who may start a
// call and checks the consent and the number.
import { BLUEPRINTS } from "@core/blueprints";
import { INTAKE_CONSENT_TEXT } from "@core/intake";
import { SIZE_BANDS } from "@core/selfcheck";
import { Phone, PhoneCall, ShieldCheck } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { ScenarioFilm } from "../components/ScenarioFilm";
import { ErrorNote, Field, Loading } from "../components/ui";
import { getIntakeCall, startMeetingCall, type IntakeCall } from "../lib/data";
import { useSignedIn } from "../lib/session";
import { scenarioByKey, SCENARIOS } from "../scenarios";
import { useStaff } from "../lib/staff";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
/** If the worker hasn't picked the call up by then, say so instead of waiting forever. */
const NOT_STARTED_AFTER_MS = 60_000;

type Step = "show" | "details" | "calling";

export function MeetPage() {
  const { access, loading } = useStaff();
  const [step, setStep] = useState<Step>("show");
  const [callId, setCallId] = useState<string | null>(null);

  if (loading) return <div className="auth"><Loading label="Opening meeting mode" /></div>;
  if (!access?.sales) {
    return (
      <div className="auth"><div className="auth-card"><h1 className="page-title">Meeting mode</h1><p className="muted">This is for TEBOS's own staff.</p></div></div>
    );
  }
  return (
    <div className="lp meet">
      <header className="lp-nav">
        <span className="lp-brand"><span className="brand-mark" aria-hidden><ShieldCheck size={18} /></span> TEBOS</span>
        {step !== "show" && <button className="lp-watch" onClick={() => { setStep("show"); setCallId(null); }}>Start again</button>}
      </header>
      <main className="blog-wrap">
        {step === "show" && <Show onNext={() => setStep("details")} />}
        {step === "details" && <Details onStarted={(id) => { setCallId(id); setStep("calling"); }} />}
        {step === "calling" && callId && <Calling id={callId} />}
      </main>
    </div>
  );
}

function Show({ onNext }: { onNext: () => void }) {
  const [which, setWhich] = useState<string>(SCENARIOS[0]!.key);
  const [ended, setEnded] = useState(false);
  const scenario = scenarioByKey(which);
  const pick = (k: string) => { setWhich(k); setEnded(false); };
  return (
    <>
      <p className="lp-kicker">See it, don't hear about it</p>
      <h1 className="lp-title">This is what TEBOS does for a business.</h1>
      <div className="meet-tabs" role="group" aria-label="Show">
        {SCENARIOS.map((sc) => (
          <button key={sc.key} className={`btn btn-sm ${which === sc.key ? "btn-lime" : ""}`} aria-pressed={which === sc.key} onClick={() => pick(sc.key)}>{sc.label}</button>
        ))}
        <button className={`btn btn-sm ${which === "film" ? "btn-lime" : ""}`} aria-pressed={which === "film"} onClick={() => pick("film")}>The TEBOS film</button>
      </div>
      {scenario ? (
        <ScenarioFilm scenario={scenario} onEnded={() => setEnded(true)} />
      ) : (
        <div className="lp-video-wrap">
          <video className="lp-video" src="/tebos-film.mp4" poster="/tebos-film.jpg" controls playsInline onEnded={() => setEnded(true)}
            aria-label="A one-minute film: how TEBOS helps a business" />
        </div>
      )}
      <div className="lp-ctas" style={{ marginTop: 20 }}>
        <button className={`btn btn-lime lp-cta ${ended ? "meet-pulse" : ""}`} onClick={onNext}>
          <PhoneCall size={18} aria-hidden /> Talk to TEBOS now
        </button>
        <span className="muted">TEBOS calls you on the spot: about five minutes, about your business.</span>
      </div>
    </>
  );
}

function Details({ onStarted }: { onStarted: (id: string) => void }) {
  const { db } = useSignedIn();
  const [form, setForm] = useState({ name: "", business: "", email: "", phone: "", industry: "", size: "" });
  const [agreed, setAgreed] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const missing = [
      !form.name.trim() && "your name",
      !form.business.trim() && "the business name",
      !EMAIL.test(form.email.trim()) && "a valid email address",
      form.phone.replace(/\D/g, "").length < 9 && "your phone number",
      !form.size && "the size of the team",
      !agreed && "your agreement to the call",
    ].filter(Boolean) as string[];
    setProblems(missing);
    if (missing.length) return;
    setBusy(true);
    setError(null);
    try {
      onStarted(await startMeetingCall(db, { ...form, consent: INTAKE_CONSENT_TEXT }));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <p className="lp-kicker">Talk to TEBOS</p>
      <h1 className="lp-title">Your phone rings in a few seconds.</h1>
      <p className="lp-sub">A short call about how your business runs and what takes your time. Tomorrow you get an outline of what TEBOS would build for you.</p>
      <form className="pr-form" onSubmit={submit} noValidate aria-label="Talk to TEBOS now" style={{ marginTop: 20 }}>
        <div className="pr-grid">
          <Field label="Your name"><input className="input" value={form.name} onChange={(e) => set("name")(e.target.value)} autoComplete="off" /></Field>
          <Field label="Business name"><input className="input" value={form.business} onChange={(e) => set("business")(e.target.value)} autoComplete="off" /></Field>
          <Field label="Mobile number"><input className="input" type="tel" value={form.phone} onChange={(e) => set("phone")(e.target.value)} placeholder="082 123 4567" autoComplete="off" /></Field>
          <Field label="Email"><input className="input" type="email" value={form.email} onChange={(e) => set("email")(e.target.value)} autoComplete="off" /></Field>
          <Field label="Kind of business">
            <select className="input" value={form.industry} onChange={(e) => set("industry")(e.target.value)}>
              <option value="">Something else</option>
              {BLUEPRINTS.map((b) => <option key={b.key} value={b.key}>{b.industry}</option>)}
            </select>
          </Field>
          <Field label="Team size">
            <select className="input" value={form.size} onChange={(e) => set("size")(e.target.value)}>
              <option value="">Choose…</option>
              {SIZE_BANDS.map((s) => <option key={s} value={s}>{s} people</option>)}
            </select>
          </Field>
        </div>
        <label className="row" style={{ gap: 10, alignItems: "flex-start" }}>
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ marginTop: 4 }} />
          <span>{INTAKE_CONSENT_TEXT}</span>
        </label>
        {problems.length > 0 && <div className="note note-warn" role="alert">Please add {problems.join(", ")}.</div>}
        <ErrorNote error={error} title="TEBOS couldn't start the call" />
        <p className="pr-small" style={{ margin: 0 }}>
          We use your details only to talk to you about TEBOS. See our <a href="/privacy">privacy policy</a>.
        </p>
        <button className="btn btn-lime lp-cta" disabled={busy}><Phone size={18} aria-hidden /> {busy ? "Starting…" : "Call me now"}</button>
      </form>
    </>
  );
}

function Calling({ id }: { id: string }) {
  const { db } = useSignedIn();
  const [call, setCall] = useState<IntakeCall | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let live = true;
    const poll = async () => {
      try {
        const c = await getIntakeCall(db, id);
        if (live) {
          setCall(c);
          setError(null);
        }
      } catch (err) {
        if (live) setError(err);
      }
      if (live) setNow(Date.now());
    };
    void poll();
    const t = setInterval(poll, 3000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [db, id]);

  const status = call?.status ?? "requested";
  const waitingTooLong = status === "requested" && now - startedAt > NOT_STARTED_AFTER_MS;
  const view: Record<string, { title: string; text: string }> = {
    requested: waitingTooLong
      ? { title: "The call hasn't started yet.", text: "TEBOS's calling service may not be switched on. Your details are saved, and you're on the waiting list." }
      : { title: "Calling you now…", text: "Keep your phone close. TEBOS is placing the call." },
    dialling: { title: "Your phone is ringing.", text: "Answer it: it's TEBOS." },
    in_progress: { title: "You're talking to TEBOS.", text: "Take your time. This page updates when the call ends." },
    completed: {
      title: "Thank you. That's everything for today.",
      text: call?.wants_to_proceed === false
        ? "You said now isn't the right time, and that's completely fine."
        : "Tomorrow morning you'll get an email with an outline of what TEBOS would build for your business. You're on the waiting list.",
    },
    no_answer: { title: "We couldn't reach you.", text: call?.failure_detail ?? "The call wasn't answered." },
    failed: { title: "The call didn't go through.", text: call?.failure_detail ?? "Something went wrong placing the call." },
  };
  const v = view[status] ?? view.requested!;
  return (
    <div className="system-card meet-status" role="status" aria-live="polite" data-status={status} style={{ marginTop: 24 }}>
      <h1 className="lp-title" style={{ fontSize: "clamp(28px, 5vw, 44px)" }}>{v.title}</h1>
      <p className="lp-sub">{v.text}</p>
      <ErrorNote error={error} title="Couldn't check the call" />
    </div>
  );
}
