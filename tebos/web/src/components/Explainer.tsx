// A short animated explainer: what TEBOS does for a business, told through one
// fictional agency, without showing how it works inside. Plays like a video
// (timed scenes, captions, progress, pause and replay) and loops. With
// `recording`, controls are hidden and it plays once, for capturing a clip.
import { Check, FileSearch, Globe, Mic, Pause, Play, RotateCcw, ShieldCheck, Sparkles, Stamp, TrendingUp, Workflow } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

interface Scene {
  kicker: string;
  title: string;
  caption: string;
  seconds: number;
  icon: typeof Globe;
  render: () => ReactNode;
}

const SCENES: Scene[] = [
  {
    kicker: "Meet Brightline",
    title: "Busy agency, shrinking margin",
    caption: "14 clients and 11 people. More work every month, and less profit.",
    seconds: 6,
    icon: Sparkles,
    render: () => <Intro />,
  },
  {
    kicker: "Step 1 · Look",
    title: "TEBOS reads what the world sees",
    caption: "It reads the agency's public website and notes what it finds, and what it couldn't read.",
    seconds: 7,
    icon: Globe,
    render: () => <Website />,
  },
  {
    kicker: "Step 2 · Listen",
    title: "It interviews the owner",
    caption: "A 15-minute AI phone call, booked with consent, asks what a website can't show.",
    seconds: 8,
    icon: Mic,
    render: () => <Interview />,
  },
  {
    kicker: "Step 3 · Measure",
    title: "It reads the real numbers",
    caption: "With a read-only connection to the agency's own tools. No personal data, and nothing is changed.",
    seconds: 7,
    icon: Workflow,
    render: () => <Numbers />,
  },
  {
    kicker: "Step 4 · Find",
    title: "It finds what's costing money",
    caption: "Each finding shows the evidence behind it. What the owner said, matched against what the numbers show.",
    seconds: 8,
    icon: FileSearch,
    render: () => <Finding />,
  },
  {
    kicker: "Step 5 · Decide",
    title: "You approve the fix",
    caption: "TEBOS proposes the next step. Nothing important happens without a person saying yes.",
    seconds: 7,
    icon: Stamp,
    render: () => <Approve />,
  },
  {
    kicker: "Step 6 · Prove",
    title: "It checks the fix worked",
    caption: "A month later, TEBOS reads the numbers again and shows what changed.",
    seconds: 7,
    icon: TrendingUp,
    render: () => <Result />,
  },
  {
    kicker: "TEBOS",
    title: "Understand the business. Fix what matters. Prove it.",
    caption: "Every conclusion traceable to its evidence.",
    seconds: 6,
    icon: ShieldCheck,
    render: () => <Outro />,
  },
];

export const EXPLAINER_SECONDS = SCENES.reduce((a, s) => a + s.seconds, 0);

export function Explainer({ recording = false, cta }: { recording?: boolean; cta?: ReactNode }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [run, setRun] = useState(0); // remounts a scene so its animations restart
  const timer = useRef<number | null>(null);
  const scene = SCENES[index]!;

  const go = useCallback((i: number) => {
    setIndex(i);
    setRun((r) => r + 1);
  }, []);

  useEffect(() => {
    if (!playing) return;
    timer.current = window.setTimeout(() => {
      if (index + 1 < SCENES.length) go(index + 1);
      else if (recording) setPlaying(false);
      else go(0);
    }, scene.seconds * 1000);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [index, playing, run, recording, scene.seconds, go]);

  const Icon = scene.icon;
  return (
    <figure className={`xp ${playing ? "" : "xp-paused"} ${recording ? "xp-recording" : ""}`} aria-label="How TEBOS helps a business: a short animated tour">
      <div className="xp-stage" key={`${index}-${run}`}>
        <header className="xp-head">
          <span className="xp-kicker"><Icon size={14} aria-hidden /> {scene.kicker}</span>
          <h2 className="xp-title">{scene.title}</h2>
        </header>
        <div className="xp-body">{scene.render()}</div>
        <p className="xp-caption">{scene.caption}</p>
        <div className="xp-progress" style={{ animationDuration: `${scene.seconds}s` }} />
        <span className="xp-label">Illustrative example · fictional agency</span>
      </div>
      {!recording && (
        <figcaption className="xp-controls">
          <button className="xp-btn" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause" : "Play"}>
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button className="xp-btn" onClick={() => { go(0); setPlaying(true); }} aria-label="Replay from the start">
            <RotateCcw size={16} />
          </button>
          <div className="xp-dots" role="tablist" aria-label="Scenes">
            {SCENES.map((s, i) => (
              <button key={s.kicker} role="tab" aria-selected={i === index} aria-label={s.kicker} className={`xp-dot ${i === index ? "on" : ""} ${i < index ? "done" : ""}`} onClick={() => go(i)} />
            ))}
          </div>
          {cta}
        </figcaption>
      )}
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Scenes. Timing comes from CSS animation delays (--d, seconds into the scene).
// ---------------------------------------------------------------------------

const d = (s: number) => ({ "--d": `${s}s` }) as React.CSSProperties;

function Intro() {
  return (
    <div className="xp-intro">
      <div className="xp-card xp-in" style={d(0.2)}>
        <div className="xp-muted">Brightline Creative · Johannesburg</div>
        <div className="xp-big">Busier than ever</div>
        <div className="xp-chart">
          {[42, 55, 61, 70, 78, 86].map((h, i) => <span key={i} className="xp-bar xp-grow" style={{ ...d(0.4 + i * 0.15), height: `${h}%` }} />)}
        </div>
        <div className="xp-muted">Work delivered per month</div>
      </div>
      <div className="xp-card xp-in" style={d(1.6)}>
        <div className="xp-muted">…but</div>
        <div className="xp-big xp-bad">Margin keeps falling</div>
        <div className="xp-chart">
          {[34, 30, 27, 23, 19, 15].map((h, i) => <span key={i} className="xp-bar xp-bar-bad xp-grow" style={{ ...d(1.8 + i * 0.15), height: `${h * 2}%` }} />)}
        </div>
        <div className="xp-muted">Profit margin per month</div>
      </div>
      <div className="xp-quote xp-in" style={d(3.4)}>“I can't see where it goes.”</div>
    </div>
  );
}

function Website() {
  const notes = ["Services: brand, social, paid media, web", "Case studies for 6 clients", "Contact form, no reply time promised"];
  return (
    <div className="xp-split">
      <div className="xp-browser xp-in" style={d(0.1)}>
        <div className="xp-browser-bar"><span /><span /><span /><div className="xp-url xp-type">brightline.example</div></div>
        <div className="xp-page">
          <div className="xp-line w60 xp-scan" style={d(1.4)} />
          <div className="xp-line w90 xp-scan" style={d(1.7)} />
          <div className="xp-line w80 xp-scan" style={d(2.0)} />
          <div className="xp-blocks">
            <div className="xp-block xp-scan" style={d(2.4)} /><div className="xp-block xp-scan" style={d(2.7)} /><div className="xp-block xp-scan" style={d(3.0)} />
          </div>
          <div className="xp-line w70 xp-scan" style={d(3.3)} />
        </div>
      </div>
      <ul className="xp-notes">
        {notes.map((n, i) => (
          <li key={n} className="xp-chip xp-in" style={d(2.2 + i * 0.9)}><Check size={14} aria-hidden /> {n}</li>
        ))}
      </ul>
    </div>
  );
}

function Interview() {
  return (
    <div className="xp-split">
      <div className="xp-call xp-in" style={d(0.1)}>
        <div className="xp-avatar"><Mic size={22} aria-hidden /></div>
        <div className="xp-muted">AI interviewer · calling the owner</div>
        <div className="xp-wave">
          {Array.from({ length: 18 }, (_, i) => <span key={i} style={{ animationDelay: `${(i % 6) * 0.12}s` }} />)}
        </div>
        <div className="xp-muted xp-small">Recorded with consent</div>
      </div>
      <div className="xp-chat">
        <div className="xp-bubble xp-q xp-in" style={d(1.0)}>How often do clients ask for work that wasn't agreed?</div>
        <div className="xp-bubble xp-a xp-in" style={d(2.6)}>Almost every week. Most of the time we just do it.</div>
        <div className="xp-bubble xp-q xp-in" style={d(4.3)}>How quickly do clients pay?</div>
        <div className="xp-bubble xp-a xp-in" style={d(5.6)}>45 to 60 days. Our terms say 30.</div>
      </div>
    </div>
  );
}

function Numbers() {
  const tiles: Array<[string, number, string, string?]> = [
    ["Extra requests, last 30 days", 38, ""],
    ["Of those, billed", 5, "", "bad"],
    ["Invoices overdue", 186, "R", "k"],
    ["Work waiting on clients", 14, ""],
  ];
  return (
    <div className="xp-numbers">
      <div className="xp-readonly xp-in" style={d(0.2)}><ShieldCheck size={14} aria-hidden /> Read-only connection · no personal data</div>
      <div className="xp-tiles">
        {tiles.map(([label, n, pre, suf], i) => (
          <div key={label} className={`xp-tile xp-in ${suf === "bad" ? "xp-tile-bad" : ""}`} style={d(0.8 + i * 0.6)}>
            <div className="xp-count">{pre}<Counter to={n} delay={0.8 + i * 0.6} />{suf === "k" ? "k" : ""}</div>
            <div className="xp-muted">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Counter({ to, delay }: { to: number; delay: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now() + delay * 1000;
    const tick = (t: number) => {
      const p = Math.min(1, Math.max(0, (t - start) / 1000));
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, delay]);
  return <>{n}</>;
}

function Finding() {
  return (
    <div className="xp-finding">
      <div className="xp-evidence">
        <div className="xp-chip xp-chip-src xp-in" style={d(0.3)}><Mic size={14} aria-hidden /> “Most of the time we just do it.”</div>
        <div className="xp-chip xp-chip-src xp-in" style={d(0.9)}><Workflow size={14} aria-hidden /> 38 extra requests · 5 billed</div>
      </div>
      <svg className="xp-links" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden>
        <path className="xp-draw" pathLength={1} style={d(1.5)} d="M 22 1 C 22 22, 50 18, 50 39" />
        <path className="xp-draw" pathLength={1} style={d(1.7)} d="M 78 1 C 78 22, 50 18, 50 39" />
      </svg>
      <div className="xp-card xp-finding-card xp-pop" style={d(2.3)}>
        <div className="xp-muted">Finding</div>
        <div className="xp-big">Extra work is done but not billed</div>
        <div className="xp-conf">
          <span>Confidence</span>
          <div className="xp-meter"><span className="xp-fill" style={{ ...d(3.0), "--w": "81%" } as React.CSSProperties} /></div>
          <b className="xp-in" style={d(3.6)}>81%</b>
        </div>
        <div className="xp-muted xp-small xp-in" style={d(4.2)}>Backed by the owner's words and the agency's own numbers</div>
      </div>
    </div>
  );
}

function Approve() {
  const steps = ["Proposed", "Approved", "In place", "Checked"];
  return (
    <div className="xp-approve">
      <div className="xp-card xp-in" style={d(0.2)}>
        <div className="xp-muted">Proposed next step</div>
        <div className="xp-big">Quote every extra request before starting it</div>
        <div className="xp-row">
          <span className="xp-muted xp-small">Suggested by TEBOS · owner: ops lead</span>
          <span className="xp-approve-btn xp-press" style={d(2.4)}><Check size={16} aria-hidden /> Approve</span>
        </div>
      </div>
      <div className="xp-steps">
        {steps.map((s, i) => (
          <span key={s} className="xp-step xp-light" style={d(i === 0 ? 0.6 : 2.9 + (i - 1) * 1.1)}>{s}</span>
        ))}
      </div>
    </div>
  );
}

function Result() {
  return (
    <div className="xp-result">
      <div className="xp-compare">
        <div className="xp-col">
          <div className="xp-muted">Before</div>
          <div className="xp-ring xp-in" style={{ ...d(0.4), "--p": "13" } as React.CSSProperties}><span>5 of 38</span></div>
          <div className="xp-muted xp-small">extra requests billed</div>
        </div>
        <div className="xp-arrow xp-in" style={d(1.4)}>→</div>
        <div className="xp-col">
          <div className="xp-muted">One month later</div>
          <div className="xp-ring xp-ring-good xp-in" style={{ ...d(2.0), "--p": "77" } as React.CSSProperties}><span>27 of 35</span></div>
          <div className="xp-muted xp-small">extra requests billed</div>
        </div>
      </div>
      <div className="xp-verified xp-pop" style={d(3.6)}><ShieldCheck size={16} aria-hidden /> Checked against the agency's own numbers</div>
    </div>
  );
}

function Outro() {
  return (
    <div className="xp-outro">
      <div className="xp-logo xp-pop" style={d(0.2)}><ShieldCheck size={34} aria-hidden /></div>
      <div className="xp-cycle">
        {["Look", "Listen", "Measure", "Find", "Decide", "Prove"].map((w, i) => (
          <span key={w} className="xp-in" style={d(0.8 + i * 0.25)}>{w}</span>
        ))}
      </div>
    </div>
  );
}
