// Tidy Enterprise's public website (ADR 0022), in the founder's own words (2 Nov 2026): what it does, the problems it
// works on, the six stages of Property Revenue Architecture, what it is not, and an enquiry form that asks for consent.
// No clients, figures or reviews appear that the founder hasn't given. Its own build (vite.tidy.config.ts).
// Look (founder, 2 Nov: "compared to BAME it's horrible"): cinematic and dark like BAME, in Tidy's brown and sand.
import { ArrowRight, Banknote, Building2, Hammer, KeyRound, Landmark, Mail, Scale, TrendingDown, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { checkEnquiry, ENQUIRY_LIMITS, ENQUIRY_RELATIONSHIPS, ENQUIRY_SITUATIONS, type EnquiryDraft } from "@core/propertyEnquiry";
import { Building } from "./Building";
import { CONTACT_EMAIL, formOpen, sendEnquiry } from "./data";

const STAGES = [
  { name: "Discover", text: "Identify the property, ownership circumstances, financial position and underlying problems." },
  { name: "Assess", text: "Analyse the property's income, expenses, debts, market position and development potential." },
  { name: "Underwrite", text: "Test the commercial viability, risks, projected returns and financing readiness." },
  { name: "Strategise", text: "Develop practical pathways to improve the property's economic performance." },
  { name: "Execute", text: "Coordinate the relevant specialists, service providers, investors and implementation process." },
  { name: "Optimise", text: "Monitor performance and identify further opportunities to improve cash flow and asset value." },
] as const;

const PROBLEMS = [
  { icon: Landmark, text: "Properties with bond arrears, municipal debt or levy debt." },
  { icon: TrendingDown, text: "Buildings generating insufficient rental income." },
  { icon: Building2, text: "Underutilised residential and commercial properties." },
  { icon: Hammer, text: "Properties with redevelopment or rental-conversion potential." },
  { icon: Scale, text: "Owners facing estate, divorce or financial-distress circumstances." },
  { icon: Banknote, text: "Property owners who need to improve their financing position." },
  { icon: KeyRound, text: "Landlords struggling with rental operations and administration." },
] as const;

const NOT = ["An estate agency", "A construction company", "A property management company", "A lender", "A law firm"] as const;

export function TidyApp() {
  return (
    <div className="te">
      <header className="te-nav te-wrap">
        <a href="#top" className="te-brand"><span className="te-mark" aria-hidden>TE</span> Tidy Enterprise</a>
        <nav aria-label="Site">
          <a href="#where">Where we help</a>
          <a href="#how">How we work</a>
          <a href="#enquire" className="te-pill"><span className="te-long">Tell us about a property</span><span className="te-short">Enquire</span></a>
        </nav>
      </header>

      <main id="top">
        <section className="te-hero">
          <div className="te-wrap te-hero-grid">
            <div className="te-hero-copy">
              <p className="te-eyebrow">Property revenue architecture</p>
              <h1>Transforming property potential into <em>structured economic opportunity.</em></h1>
              <p className="te-lede">
                We turn underperforming, underutilised and financially distressed properties into more productive, cash-flowing and
                financeable assets. Property, approached as a business asset rather than simply a building.
              </p>
              <p className="te-actions">
                <a href="#enquire" className="te-btn te-btn-primary">Tell us about a property <ArrowRight size={16} aria-hidden /></a>
                <a href="#how" className="te-btn te-btn-ghost">How we work</a>
              </p>
            </div>
            <div className="te-hero-art"><Building /></div>
          </div>
          <ol className="te-rail te-wrap" aria-label="The six stages">
            {STAGES.map((s, i) => <li key={s.name}><span>{String(i + 1).padStart(2, "0")}</span>{s.name}</li>)}
          </ol>
        </section>

        <section className="te-what">
          <div className="te-wrap te-split">
            <div>
              <p className="te-eyebrow">What we do</p>
              <h2>Find where a property can perform better. Then make it happen.</h2>
            </div>
            <div>
              <p className="te-big">
                Tidy Enterprise identifies opportunities where a property's financial or operational performance can be improved, then
                develops and coordinates a strategy to unlock that potential.
              </p>
              <p className="te-muted">
                Our method is Property Revenue Architecture: diagnose the asset, test whether improving it pays, then plan, coordinate and
                keep improving.
              </p>
            </div>
          </div>
        </section>

        <section id="where" className="te-wrap te-section">
          <p className="te-eyebrow">Where we help</p>
          <h2>The problems we are designed to address.</h2>
          <ul className="te-problems">
            {PROBLEMS.map(({ icon: Icon, text }, i) => (
              <li key={text} className="te-float">
                <span className="te-problem-n">{String(i + 1).padStart(2, "0")}</span>
                <Icon size={26} strokeWidth={1.5} aria-hidden />
                <p>{text}</p>
              </li>
            ))}
            <li className="te-float te-problems-cta">
              <p>Something else holding a property back?</p>
              <a href="#enquire">Tell us about it <ArrowRight size={15} aria-hidden /></a>
            </li>
          </ul>
        </section>

        <section id="how" className="te-how">
          <div className="te-wrap">
            <p className="te-eyebrow">How we work</p>
            <h2>Six stages, in order.</h2>
            <ol className="te-stages">
              {STAGES.map((s, i) => (
                <li key={s.name} className="te-float">
                  <span className="te-num" aria-hidden>{String(i + 1).padStart(2, "0")}</span>
                  <h3>{s.name}</h3>
                  <p>{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="te-quote">
          <blockquote className="te-wrap">
            <p>
              Tidy Enterprise transforms property potential into structured economic opportunity. Through Property Revenue Architecture, we
              diagnose underperforming assets, develop revenue and value-enhancement strategies, and coordinate the expertise and systems
              required to improve property performance.
            </p>
          </blockquote>
        </section>

        <section className="te-wrap te-section te-split te-not">
          <div>
            <p className="te-eyebrow">What we are not</p>
            <h2>We work across the disciplines. We don't replace them.</h2>
          </div>
          <div>
            <ul className="te-not-list" aria-label="Tidy Enterprise is not simply">
              {NOT.map((n) => <li key={n}><X size={15} aria-hidden /> {n}</li>)}
            </ul>
            <p>
              Tidy Enterprise is not simply an estate agency, a construction company, a property management company, a lender or a law firm.
              It works across these disciplines by identifying the economic problem, developing the strategy and coordinating the appropriate
              specialists.
            </p>
            <p className="te-muted">Regulated services remain with appropriately qualified professionals.</p>
          </div>
        </section>

        <section id="enquire" className="te-enquire">
          <div className="te-wrap te-split">
            <div>
              <p className="te-eyebrow">Enquire</p>
              <h2>Tell us about a property.</h2>
              <p className="te-muted">
                Describe what is happening and we will reply by email. Owners, co-owners, family members, executors and advisers are welcome
                to write.
              </p>
              <p className="te-muted te-mail">
                <Mail size={15} aria-hidden /> Or email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
              </p>
            </div>
            <EnquiryForm />
          </div>
        </section>
      </main>

      <footer className="te-foot te-wrap">
        <a href="#top" className="te-brand"><span className="te-mark" aria-hidden>TE</span> Tidy Enterprise</a>
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        <span>Regulated services remain with appropriately qualified professionals.</span>
        <span>© {new Date().getFullYear()} Tidy Enterprise</span>
      </footer>
    </div>
  );
}

const EMPTY: EnquiryDraft = { situation: "", relationship: "", area: "", message: "", name: "", email: "", phone: "", consent: false };

function EnquiryForm() {
  const [open, setOpen] = useState<boolean | null>(null);
  const [d, setD] = useState<EnquiryDraft>(EMPTY);
  const [problem, setProblem] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [ref, setRef] = useState<string | null>(null);
  useEffect(() => { void formOpen().then(setOpen); }, []);
  const set = <K extends keyof EnquiryDraft>(k: K, v: EnquiryDraft[K]) => setD({ ...d, [k]: v });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const why = checkEnquiry(d);
    setProblem(why);
    if (why) return;
    setSending(true);
    try { setRef(await sendEnquiry(d)); } catch (x) { setProblem((x as Error).message); } finally { setSending(false); }
  };

  if (open === null) return <div className="te-card" aria-busy="true"><p className="te-muted">Loading…</p></div>;
  if (!open) {
    return (
      <div className="te-card" data-testid="enquiry-closed">
        <h3>Write to us</h3>
        <p>The online form opens soon. Until then, email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> with what is happening
          with the property, roughly where it is, and how you are connected to it.</p>
      </div>
    );
  }
  if (ref) {
    return (
      <div className="te-card" role="status" data-testid="enquiry-sent">
        <h3>Thank you. We have your enquiry.</h3>
        <p>Your reference is <strong>{ref}</strong>. We will reply to {d.email.trim()}.</p>
      </div>
    );
  }
  return (
    <form className="te-card te-form" onSubmit={(e) => void submit(e)} noValidate data-testid="enquiry-form">
      <label>
        <span>What is happening with the property?</span>
        <select required value={d.situation} onChange={(e) => set("situation", e.target.value)}>
          <option value="">Choose one</option>
          {ENQUIRY_SITUATIONS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </label>
      <label>
        <span>How are you connected to it?</span>
        <select required value={d.relationship} onChange={(e) => set("relationship", e.target.value)}>
          <option value="">Choose one</option>
          {ENQUIRY_RELATIONSHIPS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
      </label>
      <label>
        <span>Roughly where is it?</span>
        <input required maxLength={ENQUIRY_LIMITS.areaMax} placeholder="Suburb and town" value={d.area} onChange={(e) => set("area", e.target.value)} />
      </label>
      <label>
        <span>What is going on, in your words</span>
        <textarea required rows={5} maxLength={ENQUIRY_LIMITS.messageMax} value={d.message} onChange={(e) => set("message", e.target.value)}
          placeholder="For example: what the property is, what isn't working, and since when." />
        <small>Please leave ID numbers, phone numbers and email addresses out of this box.</small>
      </label>
      <div className="te-row">
        <label><span>Your name</span><input required autoComplete="name" maxLength={ENQUIRY_LIMITS.nameMax} value={d.name} onChange={(e) => set("name", e.target.value)} /></label>
        <label><span>Email</span><input required type="email" autoComplete="email" value={d.email} onChange={(e) => set("email", e.target.value)} /></label>
      </div>
      <label>
        <span>Phone <em>(optional)</em></span>
        <input type="tel" autoComplete="tel" maxLength={ENQUIRY_LIMITS.phoneMax} value={d.phone} onChange={(e) => set("phone", e.target.value)} />
      </label>
      <label className="te-consent">
        <input type="checkbox" checked={d.consent} onChange={(e) => set("consent", e.target.checked)} />
        <span>I agree that Tidy Enterprise may use these details to reply to me about this enquiry. I can ask for them to be deleted at any time.</span>
      </label>
      {problem && <p className="te-problem" role="alert">{problem}</p>}
      <button type="submit" className="te-btn te-btn-primary" disabled={sending}>{sending ? "Sending…" : "Send enquiry"}</button>
    </form>
  );
}
