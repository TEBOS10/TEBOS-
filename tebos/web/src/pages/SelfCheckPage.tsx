// The free self-check: "How much does your business run through you?"
// Public. Answers are sent without a name and the database computes the
// score. A shared link carries only the score. Leaving contact details is a
// separate, optional step that becomes an enquiry.
import { Download, Share2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { bandOf, firstFixes, planForSize, QUESTIONS, REGIONS, SIZE_BANDS, type Question, type Region, type SizeBand } from "@core/selfcheck";
import { ErrorNote, Field } from "../components/ui";
import { submitEnquiry, submitSelfCheck } from "../lib/data";
import { supabase } from "../lib/supabase";
import { SiteFrame } from "./BlogPage";

const ANSWERS = [
  { value: 0, label: "No" },
  { value: 1, label: "Sometimes" },
  { value: 2, label: "Yes" },
] as const;
const REGION_LABEL: Record<Region, string> = { ZA: "South Africa", NG: "Nigeria", KE: "Kenya", africa_other: "Elsewhere in Africa", other: "Outside Africa" };

function useTitle(title: string) {
  useEffect(() => {
    const before = document.title;
    document.title = title;
    return () => {
      document.title = before;
    };
  }, [title]);
}

const shareUrl = (score: number) => `${window.location.origin}/self-check/result?s=${score}`;
const shareText = (score: number) => `My business runs through me ${score}% of the time, according to TEBOS's 2-minute self-check. How about yours?`;

export function SelfCheckPage() {
  useTitle("How much does your business run through you? · TEBOS");
  const [answers, setAnswers] = useState<Array<number | null>>(QUESTIONS.map(() => null));
  const [size, setSize] = useState<SizeBand | "">("");
  const [region, setRegion] = useState<Region | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [result, setResult] = useState<{ score: number; answers: number[] } | null>(null);
  const answered = answers.filter((a) => a !== null).length;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (answered < QUESTIONS.length || !supabase) return;
    setBusy(true);
    setError(null);
    try {
      const final = answers as number[];
      const score = await submitSelfCheck(supabase, final, size || null, region || null);
      setResult({ score, answers: final });
      window.scrollTo({ top: 0 });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  if (result) return <Result score={result.score} answers={result.answers} size={size || null} />;

  return (
    <SiteFrame>
      <p className="lp-kicker">Free self-check · 2 minutes</p>
      <h1 className="lp-title">How much does your business run through you?</h1>
      <p className="lp-sub">Ten questions. Answer honestly: nobody sees your answers, and we don't ask for your name.</p>
      <form className="sc-form" onSubmit={submit} aria-label="Self-check">
        {QUESTIONS.map((q, i) => (
          <fieldset key={q.key} className="sc-q" data-testid="sc-question">
            <legend><span className="sc-num">{i + 1}</span> {q.text}</legend>
            <div className="sc-options" role="radiogroup" aria-label={q.text}>
              {ANSWERS.map((a) => (
                <button type="button" key={a.value} role="radio" aria-checked={answers[i] === a.value}
                  className={`pr-chip ${answers[i] === a.value ? "on" : ""}`}
                  onClick={() => setAnswers(answers.map((x, j) => (j === i ? a.value : x)))}>{a.label}</button>
              ))}
            </div>
          </fieldset>
        ))}
        <div className="pr-grid">
          <Field label="People in the business (optional)">
            <select className="input" value={size} onChange={(e) => setSize(e.target.value as SizeBand)}>
              <option value="">Prefer not to say</option>
              {SIZE_BANDS.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </Field>
          <Field label="Where you're based (optional)">
            <select className="input" value={region} onChange={(e) => setRegion(e.target.value as Region)}>
              <option value="">Prefer not to say</option>
              {REGIONS.map((r) => <option key={r} value={r}>{REGION_LABEL[r]}</option>)}
            </select>
          </Field>
        </div>
        <p className="pr-small" style={{ margin: 0 }}>Your answers are stored without your name, only to publish anonymous totals. See our <a href="/privacy">privacy policy</a>.</p>
        <ErrorNote error={error} title="Couldn't score your answers" />
        <button className="btn btn-lime lp-cta" disabled={busy || answered < QUESTIONS.length || !supabase}>
          {busy ? "Scoring…" : answered < QUESTIONS.length ? `Answer all ten (${answered} of 10)` : "See my score"}
        </button>
      </form>
    </SiteFrame>
  );
}

function ScoreCard({ score }: { score: number }) {
  const band = bandOf(score);
  return (
    <div className={`sc-card sc-${band.key}`} data-testid="sc-card">
      <span className="sc-card-label">Runs through the founder</span>
      <strong className="sc-score">{score}%</strong>
      <span className="sc-band">{band.title}</span>
      <p>{band.summary}</p>
    </div>
  );
}

function Share({ score }: { score: number }) {
  const url = shareUrl(score);
  const text = shareText(score);
  const [copied, setCopied] = useState(false);
  return (
    <div className="sc-share" aria-label="Share your score">
      <a className="btn btn-sm" target="_blank" rel="noreferrer noopener" href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`}><Share2 size={14} aria-hidden /> LinkedIn</a>
      <a className="btn btn-sm" target="_blank" rel="noreferrer noopener" href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`}>X</a>
      <a className="btn btn-sm" target="_blank" rel="noreferrer noopener" href={`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`}>WhatsApp</a>
      <button className="btn btn-sm" onClick={() => { void navigator.clipboard?.writeText(`${text} ${url}`); setCopied(true); }}>{copied ? "Copied" : "Copy link"}</button>
      <button className="btn btn-sm" onClick={() => downloadCard(score)}><Download size={14} aria-hidden /> Image for Instagram</button>
    </div>
  );
}

/** A square image of the score, drawn in the browser, for stories and posts. */
function downloadCard(score: number) {
  const band = bandOf(score);
  const c = document.createElement("canvas");
  c.width = 1080;
  c.height = 1080;
  const g = c.getContext("2d");
  if (!g) return;
  const grad = g.createLinearGradient(0, 0, 1080, 1080);
  grad.addColorStop(0, "#0b111b");
  grad.addColorStop(1, "#13233a");
  g.fillStyle = grad;
  g.fillRect(0, 0, 1080, 1080);
  g.fillStyle = "#7fb2ff";
  g.font = "600 40px Manrope, sans-serif";
  g.fillText("My business runs through me", 90, 250);
  g.fillStyle = "#ffffff";
  g.font = "800 300px Manrope, sans-serif";
  g.fillText(`${score}%`, 80, 560);
  g.font = "700 56px Manrope, sans-serif";
  g.fillText(band.title, 90, 680);
  g.fillStyle = "#9aa3b0";
  g.font = "500 36px Manrope, sans-serif";
  g.fillText("Take the free 2-minute self-check:", 90, 900);
  g.fillStyle = "#ffffff";
  g.fillText(`${window.location.host}/self-check`, 90, 960);
  g.fillStyle = "#7fb2ff";
  g.font = "800 44px Manrope, sans-serif";
  g.fillText("TEBOS", 860, 120);
  const a = document.createElement("a");
  a.href = c.toDataURL("image/png");
  a.download = `tebos-self-check-${score}.png`;
  a.click();
}

function Result({ score, answers, size }: { score: number; answers: number[]; size: SizeBand | null }) {
  useTitle(`My score: ${score}% · TEBOS self-check`);
  const fixes = firstFixes(answers);
  return (
    <SiteFrame>
      <p className="lp-kicker">Your result</p>
      <ScoreCard score={score} />
      {fixes.length > 0 && (
        <section className="sc-fixes" aria-label="Where to start">
          <h2>Where to start</h2>
          <ol>
            {fixes.map((q: Question) => <li key={q.key}><strong>{q.area}.</strong> {q.fix}</li>)}
          </ol>
          <p className="pr-small">More on each of these in <a href="/blog/the-founder-is-the-middleware">The founder is the middleware</a>.</p>
        </section>
      )}
      <h2 className="sc-h2">Share your score</h2>
      <p className="pr-small">The link shares only your score, never your answers.</p>
      <Share score={score} />
      <TalkToUs score={score} fixes={fixes} size={size} />
    </SiteFrame>
  );
}

function TalkToUs({ score, fixes, size }: { score: number; fixes: Question[]; size: SizeBand | null }) {
  const [form, setForm] = useState({ name: "", business: "", email: "" });
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<unknown>(null);
  async function send(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    try {
      await submitEnquiry(supabase, {
        plan: planForSize(size), name: form.name, business: form.business, email: form.email,
        message: `From the self-check: ${score}% (${bandOf(score).title}).${fixes.length ? ` Areas to start with: ${fixes.map((f) => f.area).join(", ")}.` : ""}${size ? ` Size: ${size} people.` : ""}`,
      });
      setSent(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  if (sent) return <div className="note note-info" role="status" style={{ marginTop: 24 }}>Thank you. We'll be in touch at {form.email.trim()}. In the meantime, <a href="/demo">see a mapped business in the demo</a>.</div>;
  return (
    <form className="sc-talk" onSubmit={send} aria-label="Talk to TEBOS">
      <h2>Want the structure out of your head?</h2>
      <p className="pr-small">TEBOS maps how your business really runs and builds the structure so it doesn't depend on you. Leave your details and we'll be in touch; your score and the areas above are included.</p>
      <div className="pr-grid">
        <Field label="Your name"><input className="input" required maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Business name"><input className="input" required maxLength={160} value={form.business} onChange={(e) => setForm({ ...form, business: e.target.value })} /></Field>
        <Field label="Email"><input className="input" type="email" required maxLength={254} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
      </div>
      <p className="pr-small" style={{ margin: 0 }}>We use your details only to reply about TEBOS. See our <a href="/privacy">privacy policy</a>.</p>
      <ErrorNote error={error} title="Couldn't send" />
      <button className="btn btn-lime lp-cta" disabled={busy || !supabase}>{busy ? "Sending…" : "Talk to TEBOS"}</button>
    </form>
  );
}

/** A shared result: the score only, and an invitation to take the check. */
export function SelfCheckShared() {
  const raw = Number(new URLSearchParams(window.location.search).get("s"));
  const score = Number.isInteger(raw) && raw >= 0 && raw <= 100 ? raw : null;
  useTitle(score === null ? "TEBOS self-check" : `Runs through the founder: ${score}% · TEBOS self-check`);
  return (
    <SiteFrame>
      <p className="lp-kicker">TEBOS self-check</p>
      {score !== null && <ScoreCard score={score} />}
      <h2 className="sc-h2">How much does your business run through you?</h2>
      <p className="lp-sub">Ten questions, two minutes, no name needed.</p>
      <a className="btn btn-lime lp-cta" href="/self-check">Take the self-check</a>
    </SiteFrame>
  );
}
