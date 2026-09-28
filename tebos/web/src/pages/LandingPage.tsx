// The public home page: TEBOS as business operating architecture (ADR 0003),
// told by the film, with the way in (the demo) and the way back (sign in).
// Shows no data, and promises structure, not results.
import { Cable, Compass, FileSearch, LayoutGrid, LineChart, Play, ShieldCheck, Stamp, Volume2, Workflow } from "lucide-react";
import { useRef, useState } from "react";

const STAGES = [
  { icon: FileSearch, title: "Assess", text: "TEBOS reads the business from the outside, interviews the people running it and reads the real numbers." },
  { icon: LayoutGrid, title: "Map", text: "The board: your objectives, the tools, providers and people you run on, and how work moves between them." },
  { icon: Compass, title: "Architect", text: "How the business should run: rules, owners and handovers, so work stops waiting on one person's memory." },
  { icon: Cable, title: "Integrate", text: "Connect what you already use. Your web studio, accounting package and CRM stay: they become pieces on the board." },
  { icon: Workflow, title: "Automate", text: "Only the steps that have a rule and a tool. Nothing is automated because it sounds impressive." },
  { icon: Stamp, title: "Govern", text: "Every change is proposed with its evidence, approved by a person, and kept on the record." },
  { icon: LineChart, title: "Optimise", text: "Progress is measured against your objectives on real numbers, never on a figure someone typed in." },
];

export function LandingPage() {
  const video = useRef<HTMLVideoElement>(null);
  const [withSound, setWithSound] = useState(false);

  function playWithSound() {
    const v = video.current;
    if (!v) return;
    v.muted = false;
    v.loop = false;
    v.currentTime = 0;
    void v.play();
    setWithSound(true);
  }

  return (
    <div className="lp">
      <header className="lp-nav">
        <a className="lp-brand" href="/">
          <span className="brand-mark" aria-hidden><ShieldCheck size={18} /></span> TEBOS
        </a>
        <nav className="lp-links" aria-label="Site">
          <a href="/demo">Demo</a>
          <a href="/pricing">Pricing</a>
          <a className="lp-signin" href="/sign-in">Sign in</a>
        </nav>
      </header>

      <section className="lp-hero">
        <div className="lp-copy">
          <p className="lp-kicker">Business operating architecture</p>
          <h1 className="lp-title">A business that runs on structure, not on you.</h1>
          <p className="lp-sub">
            In most growing businesses the founder is the middleware: every lead, price and handover passes through one person's
            memory. TEBOS maps how your business really runs, finds where it depends on memory, improvisation and you, and builds
            the structure around the systems you already have, so the business can produce its intended outcomes with far less of it.
          </p>
          <div className="lp-ctas">
            <a className="btn btn-lime lp-cta" href="/demo">Try the demo</a>
            <button className="lp-watch" onClick={playWithSound}><Play size={16} aria-hidden /> Watch with sound · 1 min</button>
          </div>
        </div>
        <div className="lp-video-wrap">
          <video
            ref={video}
            className="lp-video"
            src="/tebos-film.mp4"
            poster="/tebos-film.jpg"
            autoPlay
            muted
            loop
            playsInline
            controls={withSound}
            aria-label="A one-minute film: how TEBOS helps a business"
          />
          {!withSound && (
            <button className="lp-sound" onClick={playWithSound}>
              <Volume2 size={16} aria-hidden /> Play with sound
            </button>
          )}
        </div>
      </section>

      <section className="lp-section" aria-labelledby="lp-stages">
        <h2 id="lp-stages" className="lp-section-title">From diagnosis to an operating system, in seven stages</h2>
        <div className="lp-steps lp-steps-4">
          {STAGES.map(({ icon: Icon, title, text }, i) => (
            <div key={title} className="lp-step">
              <span className="lp-step-icon" aria-hidden><Icon size={18} /></span>
              <h3><span className="lp-step-n">{i + 1}</span> {title}</h3>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-compare" aria-label="Before and after">
        <div className="lp-compare-col">
          <h2>Today</h2>
          <ul>
            <li>A lead arrives and waits for the founder to reply.</li>
            <li>Pricing lives in one person's head.</li>
            <li>Handovers happen on WhatsApp, if someone remembers.</li>
            <li>The numbers arrive at month end, if at all.</li>
          </ul>
        </div>
        <div className="lp-compare-col lp-compare-after">
          <h2>On the TEBOS board</h2>
          <ul>
            <li>Every flow has a trigger, an owner and a finish line.</li>
            <li>Decisions follow written rules; the founder handles the exceptions.</li>
            <li>Your existing tools and providers do the work, connected.</li>
            <li>Each objective is tracked on real numbers from connected systems.</li>
          </ul>
        </div>
      </section>

      <section className="lp-section lp-not" aria-label="What TEBOS is">
        <p>
          <strong>TEBOS is not an AI agency, and it doesn't replace your systems.</strong> It's the architecture that sits across them.
          AI, automation, integrations and analytics are tools inside it, used where they earn their place and always under your approval.
        </p>
      </section>

      <section className="lp-band">
        <div>
          <h2>See it on a real-looking business</h2>
          <p>Click through a fictional marketing agency: its operating board, the findings and evidence behind them, and a change waiting for approval. No account needed.</p>
        </div>
        <a className="btn btn-lime lp-cta" href="/demo">Open the demo</a>
      </section>

      <footer className="lp-foot">
        <span>TEBOS · Evidence before assertion</span>
        <a href="/pricing" className="tour-link">Pricing</a>
        <span>The business in the film and the demo is fictional.</span>
      </footer>
    </div>
  );
}
