// What TEBOS does, shown rather than told: a row per category, a card per
// play. Opening a card plays it: the problem, then each step lighting up with
// who or what does it, then what changes. Every play is labelled as an
// illustration and says honestly whether TEBOS runs it today.
import { Bot, Building2, Crown, Pause, Play as PlayIcon, RotateCcw, Truck, User, Users, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ACTOR_LABEL, CATEGORIES, STATUS_LABEL, type Actor, type Play } from "../showcase";
import { SiteFrame } from "./BlogPage";
import "../showcase.css";

const ACTOR_ICON: Record<Actor, typeof Bot> = { automatic: Bot, team: Users, owner: Crown, customer: User, supplier: Truck };
const STEP_MS = 2600;

export function ShowcasePage() {
  const [open, setOpen] = useState<Play | null>(null);
  useEffect(() => {
    const before = document.title;
    document.title = "TEBOS · What TEBOS does";
    return () => {
      document.title = before;
    };
  }, []);
  return (
    <SiteFrame>
      <p className="lp-kicker">What TEBOS does</p>
      <h1 className="lp-title">See it working, one problem at a time</h1>
      <p className="lp-sub">
        Pick a card to watch how TEBOS takes a piece of work off a business: what sets it off, the written rule, who or what
        does each step, and what changes. These are illustrations with invented names, not client case studies, and each says
        honestly whether TEBOS runs it today.
      </p>
      {CATEGORIES.map((c) => (
        <section key={c.key} className="sx-row" aria-labelledby={`sx-${c.key}`} data-testid="showcase-row">
          <div className="sx-row-head">
            <h2 id={`sx-${c.key}`} className="sx-row-title">{c.title}</h2>
            <p className="sx-row-blurb">{c.blurb}</p>
          </div>
          <ul className="sx-cards">
            {c.plays.map((p) => (
              <li key={p.key}>
                <button type="button" className={`sx-card sx-${p.status}`} onClick={() => setOpen(p)} data-testid="showcase-card">
                  <span className="sx-card-business"><Building2 size={14} aria-hidden /> {p.business}</span>
                  <span className="sx-card-title">{p.title}</span>
                  <span className="sx-card-flow" aria-hidden>
                    {p.steps.map((s, i) => {
                      const Icon = ACTOR_ICON[s.by];
                      return <span key={i} className={`sx-dot sx-by-${s.by}`}><Icon size={13} /></span>;
                    })}
                  </span>
                  <span className={`sx-status sx-status-${p.status}`}>{STATUS_LABEL[p.status]}</span>
                  <span className="sx-card-play"><PlayIcon size={14} aria-hidden /> Watch</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="lp-sub">
        Want to see which of these your business needs first? <a href="/self-check">Take the free self-check</a> or{" "}
        <a href="/pricing">see the plans</a>.
      </p>
      {open && <Player play={open} onClose={() => setOpen(null)} />}
    </SiteFrame>
  );
}

/** Plays one card: the problem, each step in turn, then the result. */
function Player({ play, onClose }: { play: Play; onClose: () => void }) {
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  // -1: the problem; 0..n-1: the steps; n: the result
  const last = play.steps.length;
  const [at, setAt] = useState(reduced ? last : -1);
  const [playing, setPlaying] = useState(!reduced);
  const close = useRef<HTMLButtonElement>(null);

  useEffect(() => close.current?.focus(), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  useEffect(() => {
    if (!playing || at >= last) {
      if (at >= last) setPlaying(false);
      return;
    }
    const t = setTimeout(() => setAt(at + 1), STEP_MS);
    return () => clearTimeout(t);
  }, [at, playing, last]);

  return (
    <div className="sx-overlay" role="dialog" aria-modal="true" aria-label={play.title} onClick={onClose}>
      <div className="sx-player" onClick={(e) => e.stopPropagation()}>
        <div className="sx-player-head">
          <div>
            <p className="sx-card-business"><Building2 size={14} aria-hidden /> {play.business} · <em>Illustration</em></p>
            <h2 className="sx-player-title">{play.title}</h2>
          </div>
          <button ref={close} type="button" className="sx-icon-btn" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        <p className="sx-before"><strong>Today:</strong> {play.before}</p>
        <ol className="sx-steps" data-testid="showcase-steps">
          {play.steps.map((s, i) => {
            const Icon = ACTOR_ICON[s.by];
            const state = i < at ? "done" : i === at ? "now" : "next";
            return (
              <li key={i} className={`sx-step sx-step-${state}`} data-state={state}>
                <span className={`sx-step-icon sx-by-${s.by}`}><Icon size={18} aria-hidden /></span>
                <span className="sx-step-by">{ACTOR_LABEL[s.by]}</span>
                <span className="sx-step-text">{s.text}</span>
              </li>
            );
          })}
        </ol>
        <p className={`sx-after ${at >= last ? "sx-after-on" : ""}`} data-testid="showcase-after" aria-hidden={at < last}>
          <strong>With TEBOS:</strong> {play.after}
        </p>
        <div className="sx-player-foot">
          <span className={`sx-status sx-status-${play.status}`}>{STATUS_LABEL[play.status]}</span>
          <div className="sx-controls">
            {at >= last ? (
              <button type="button" className="btn btn-sm" onClick={() => { setAt(-1); setPlaying(true); }}><RotateCcw size={14} aria-hidden /> Replay</button>
            ) : (
              <button type="button" className="btn btn-sm" onClick={() => setPlaying(!playing)}>
                {playing ? <><Pause size={14} aria-hidden /> Pause</> : <><PlayIcon size={14} aria-hidden /> Play</>}
              </button>
            )}
            {play.see && <a className="btn btn-sm btn-lime" href={play.see.href}>{play.see.label}</a>}
          </div>
        </div>
      </div>
    </div>
  );
}
