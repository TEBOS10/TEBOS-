// Public pricing: the Diagnostic, Architecture & Operations, and an equity
// partnership for businesses that can't pay upfront. The form records an enquiry; nothing is bought or
// agreed online.
import { Check, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { ErrorNote, Field } from "../components/ui";
import { submitEnquiry } from "../lib/data";
import { EQUITY_SHARE, PLANS, type PlanKey } from "../lib/pricing";
import { supabase } from "../lib/supabase";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function PricingPage() {
  const initial = new URLSearchParams(window.location.search).get("plan") as PlanKey | null;
  const [plan, setPlan] = useState<PlanKey>(PLANS.some((p) => p.key === initial) ? initial! : "starter");
  const [form, setForm] = useState({ name: "", business: "", email: "", phone: "", website: "", message: "" });
  const [problems, setProblems] = useState<string[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  function choose(key: PlanKey) {
    setPlan(key);
    document.getElementById("start")?.scrollIntoView({ behavior: "smooth" });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const missing = [
      !form.name.trim() && "your name",
      !form.business.trim() && "the business name",
      !EMAIL.test(form.email.trim()) && "a valid email address",
    ].filter(Boolean) as string[];
    setProblems(missing);
    if (missing.length || !supabase) return;
    setBusy(true);
    setError(null);
    try {
      await submitEnquiry(supabase, { plan, ...form });
      setSent(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const chosen = PLANS.find((p) => p.key === plan)!;
  return (
    <div className="lp">
      <header className="lp-nav">
        <a className="lp-brand" href="/"><span className="brand-mark" aria-hidden><ShieldCheck size={18} /></span> TEBOS</a>
        <nav className="lp-links" aria-label="Site">
          <a href="/demo">Demo</a>
          <a href="/pricing" aria-current="page">Pricing</a>
          <a className="lp-signin" href="/sign-in">Sign in</a>
        </nav>
      </header>

      <section className="pr-head">
        <p className="lp-kicker">Pricing</p>
        <h1 className="lp-title">Pay monthly, or grow together.</h1>
        <p className="lp-sub">Small businesses start with a diagnostic of how the business runs, and move to architecture and operations when they're ready. Established companies start with a Company Diagnostic and a proposal scoped to them. Or, if you can't pay upfront yet, grow together through an equity partnership.</p>
      </section>

      <section className="pr-plans" aria-label="Plans">
        {PLANS.map((p) => (
          <article key={p.key} className={`pr-plan ${p.key === "equity" ? "pr-plan-equity" : ""} ${p.key === "growth" ? "pr-plan-featured" : ""}`}>
            {p.key === "growth" && <span className="pr-badge">Full lifecycle</span>}
            <h2>{p.name}</h2>
            <p className="pr-pitch">{p.pitch}</p>
            <div className="pr-price"><strong>{p.price}</strong> <span>{p.cadence}</span></div>
            <ul>
              {p.features.map((f) => <li key={f}><Check size={16} aria-hidden /> {f}</li>)}
            </ul>
            <button className={`btn ${p.key === "equity" ? "btn-lime" : "pr-btn"}`} onClick={() => choose(p.key)}>{p.cta}</button>
          </article>
        ))}
      </section>
      <p className="pr-small" data-testid="international">
        Outside South Africa? Every plan is available. You pay by card on a secure Paystack page, in Rand; Company proposals can be quoted in US dollars, euros or pounds.
      </p>
      <p className="pr-small">Prices exclude VAT. The equity partnership is subject to a fit assessment, a valuation and a signed shareholder agreement; nothing on this page is an offer or a commitment by either side.</p>

      <section className="pr-form-wrap" id="start">
        {sent ? (
          <div className="pr-sent" role="status">
            <h2>Thank you. We've got it.</h2>
            <p>We'll be in touch at {form.email.trim()} about the {chosen.name} {plan === "equity" ? "application" : "plan"}. In the meantime, <a href="/demo">try the demo</a>.</p>
          </div>
        ) : (
          <form className="pr-form" onSubmit={submit} noValidate aria-label="Get started with TEBOS">
            <h2>{plan === "equity" ? `Apply for an equity partnership (${EQUITY_SHARE})` : `Get started with ${chosen.name}`}</h2>
            <div className="pr-choose" role="radiogroup" aria-label="Plan">
              {PLANS.map((p) => (
                <button type="button" role="radio" aria-checked={p.key === plan} key={p.key} className={`pr-chip ${p.key === plan ? "on" : ""}`} onClick={() => setPlan(p.key)}>{p.name}</button>
              ))}
            </div>
            <div className="pr-grid">
              <Field label="Your name"><input className="input" value={form.name} onChange={(e) => set("name")(e.target.value)} autoComplete="name" /></Field>
              <Field label="Business name"><input className="input" value={form.business} onChange={(e) => set("business")(e.target.value)} autoComplete="organization" /></Field>
              <Field label="Email"><input className="input" type="email" value={form.email} onChange={(e) => set("email")(e.target.value)} autoComplete="email" /></Field>
              <Field label="Phone (optional)"><input className="input" type="tel" value={form.phone} onChange={(e) => set("phone")(e.target.value)} autoComplete="tel" /></Field>
              <Field label="Website (optional)"><input className="input" value={form.website} onChange={(e) => set("website")(e.target.value)} placeholder="yourbusiness.co.za" /></Field>
            </div>
            <Field label={plan === "equity" ? "Tell us about the business and why equity suits you" : "Anything we should know? (optional)"}>
              <textarea className="input" rows={4} value={form.message} onChange={(e) => set("message")(e.target.value)} />
            </Field>
            {problems.length > 0 && <div className="note note-warn" role="alert">Please add {problems.join(", ")}.</div>}
            {!supabase && <div className="note note-warn">Enquiries can't be sent from this build.</div>}
            <ErrorNote error={error} title="Couldn't send your enquiry" />
            <button className="btn btn-lime lp-cta" disabled={busy || !supabase}>{busy ? "Sending…" : plan === "equity" ? "Send application" : "Send"}</button>
          </form>
        )}
      </section>

      <footer className="lp-foot">
        <span>TEBOS · Evidence before assertion</span>
        <a href="/" className="tour-link">Home</a>
      </footer>
    </div>
  );
}
