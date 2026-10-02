// The waiting list. Public, no account. A person at TEBOS accepts each business;
// from then on TEBOS takes it from payment to a draft operating system on the
// business's board without being asked, starting from the blueprint for the
// kind of business they name here.
import { BLUEPRINTS } from "@core/blueprints";
import { planForSize, SIZE_BANDS, type SizeBand } from "@core/selfcheck";
import { useState, type FormEvent } from "react";
import { ErrorNote, Field } from "../components/ui";
import { submitEnquiry } from "../lib/data";
import { supabase } from "../lib/supabase";
import { SiteFrame } from "./BlogPage";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function WaitlistPage() {
  const [form, setForm] = useState({ name: "", business: "", email: "", phone: "", website: "", industry: "", size: "", message: "" });
  const [problems, setProblems] = useState<string[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const missing = [
      !form.name.trim() && "your name",
      !form.business.trim() && "the business name",
      !EMAIL.test(form.email.trim()) && "a valid email address",
      !form.size && "the size of the team",
    ].filter(Boolean) as string[];
    setProblems(missing);
    if (missing.length || !supabase) return;
    setBusy(true);
    setError(null);
    try {
      const { size, industry, ...rest } = form;
      await submitEnquiry(supabase, { ...rest, plan: planForSize(size as SizeBand), waitlist: true, industry,
        message: [`Team size: ${size}`, rest.message.trim()].filter(Boolean).join("\n") });
      setSent(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SiteFrame>
      <p className="lp-kicker">Waiting list</p>
      <h1 className="lp-title">Get your operating system in 3 days</h1>
      <p className="lp-sub">
        TEBOS takes on a limited number of businesses at a time. Join the list. When we accept your business, TEBOS starts
        straight away: your draft operating system is on your board on day 1, and confirmed with you by day 3.
      </p>
      {sent ? (
        <div className="system-card" role="status" style={{ marginTop: 24 }}>
          <h2 className="blog-card-title">You're on the list.</h2>
          <p>We'll be in touch at {form.email.trim()} when a place opens for {form.business.trim()}.</p>
        </div>
      ) : (
        <form className="pr-form" onSubmit={submit} noValidate aria-label="Join the waiting list" style={{ marginTop: 24 }}>
          <div className="pr-grid">
            <Field label="Your name"><input className="input" value={form.name} onChange={(e) => set("name")(e.target.value)} autoComplete="name" /></Field>
            <Field label="Business name"><input className="input" value={form.business} onChange={(e) => set("business")(e.target.value)} autoComplete="organization" /></Field>
            <Field label="Email"><input className="input" type="email" value={form.email} onChange={(e) => set("email")(e.target.value)} autoComplete="email" /></Field>
            <Field label="Phone (optional)"><input className="input" type="tel" value={form.phone} onChange={(e) => set("phone")(e.target.value)} autoComplete="tel" /></Field>
            <Field label="Website (optional)"><input className="input" value={form.website} onChange={(e) => set("website")(e.target.value)} placeholder="yourbusiness.co.za" /></Field>
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
          <Field label="What would you most like to stop depending on you for? (optional)">
            <textarea className="input" rows={3} value={form.message} onChange={(e) => set("message")(e.target.value)} />
          </Field>
          {problems.length > 0 && <div className="note note-warn" role="alert">Please add {problems.join(", ")}.</div>}
          {!supabase && <div className="note note-warn">The waiting list can't be joined from this build.</div>}
          <ErrorNote error={error} title="Couldn't add you to the list" />
          <p className="pr-small" style={{ margin: 0 }}>
            We use your details only to contact you about TEBOS. See our <a href="/privacy">privacy policy</a>.
          </p>
          <button className="btn btn-lime lp-cta" disabled={busy || !supabase}>{busy ? "Joining…" : "Join the waiting list"}</button>
        </form>
      )}
    </SiteFrame>
  );
}
