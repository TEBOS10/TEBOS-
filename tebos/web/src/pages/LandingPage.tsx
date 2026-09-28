// The public home page: what TEBOS does for a business, told by the film,
// with the way in (the demo) and the way back (sign in). Shows no data.
import { Check, FileSearch, Mic, Play, ShieldCheck, Stamp, Volume2, Workflow } from "lucide-react";
import { useRef, useState } from "react";

const STEPS = [
  { icon: FileSearch, title: "It looks", text: "TEBOS reads your business the way your customers see it, and notes what's missing." },
  { icon: Mic, title: "It listens", text: "A short AI phone interview with you or your team about how the work really gets done." },
  { icon: Workflow, title: "It measures", text: "Read-only connections to the tools you already use. The real numbers, nothing changed." },
  { icon: ShieldCheck, title: "It finds", text: "Where money, time and effort are leaking, with the proof behind every finding." },
  { icon: Stamp, title: "You decide", text: "TEBOS proposes the fix. Nothing happens until you say yes." },
  { icon: Check, title: "It proves", text: "A month later it checks the numbers again, so you know the fix worked." },
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
          <p className="lp-kicker">Business intelligence you can check</p>
          <h1 className="lp-title">Find what's holding your business back. Then fix it.</h1>
          <p className="lp-sub">
            Lost money, wasted time, stalled momentum. TEBOS looks at your business from the outside, listens to the people running it
            and reads your real numbers. It shows you what's costing you, with the proof, and checks that each fix actually worked.
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

      <section className="lp-steps" aria-label="How it works">
        {STEPS.map(({ icon: Icon, title, text }) => (
          <div key={title} className="lp-step">
            <span className="lp-step-icon" aria-hidden><Icon size={18} /></span>
            <h2>{title}</h2>
            <p>{text}</p>
          </div>
        ))}
      </section>

      <section className="lp-band">
        <div>
          <h2>See it on a real-looking business</h2>
          <p>Click through a fictional marketing agency: its findings, the evidence behind them, and a fix waiting for approval. No account needed.</p>
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
