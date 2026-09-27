// The TEBOS explainer film: narrated scenes with 3D motion graphics, rendered
// in the browser and captured as the home page's video (scripts/record-film).
// Each scene lasts as long as its narration line plus a breath, so picture
// and voice stay in step. It says what TEBOS does for a business, not how.
import { Check, FileText, Lock, Mic, Phone, ShieldCheck, Stamp } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import "../film.css";

export interface FilmScene {
  line: string;
  /** Seconds from scene start until the narration begins. */
  voiceAt: number;
  seconds: number;
  render: () => ReactNode;
}

export const FILM_SCENES: FilmScene[] = [
  { line: "You're busier than ever. More clients, more work, longer days. So why is there less to show for it?", voiceAt: 0.5, seconds: 7.8, render: () => <Hook /> },
  { line: "Meet TEBOS. It finds what's holding your business back, whether it's money, time or momentum, and helps you fix it.", voiceAt: 0.3, seconds: 7.9, render: () => <Meet /> },
  { line: "First, it looks at your business the way your customers do.", voiceAt: 0.3, seconds: 4.6, render: () => <Look /> },
  { line: "Then it listens. A short AI phone call with you or your team, about how the work really gets done.", voiceAt: 0.3, seconds: 7.0, render: () => <Listen /> },
  { line: "It connects to the tools you already use, read-only, and reads the real numbers.", voiceAt: 0.3, seconds: 6.1, render: () => <Measure /> },
  { line: "Now it puts it all together, and shows you exactly where money, time and effort are leaking. Every finding comes with its proof.", voiceAt: 0.3, seconds: 9.2, render: () => <Find /> },
  { line: "TEBOS suggests the fix. Nothing changes until you say yes.", voiceAt: 0.3, seconds: 5.4, render: () => <Decide /> },
  { line: "A month later, it checks the numbers again, so you know the fix actually worked.", voiceAt: 0.3, seconds: 5.3, render: () => <Prove /> },
  { line: "TEBOS. Understand your business. Fix what matters. Prove it.", voiceAt: 0.3, seconds: 6.0, render: () => <Outro /> },
];

export const FILM_SECONDS = FILM_SCENES.reduce((a, s) => a + s.seconds, 0);
/** Where each scene starts, in seconds from the start of the film. */
export const FILM_STARTS = FILM_SCENES.map((_, i) => FILM_SCENES.slice(0, i).reduce((a, s) => a + s.seconds, 0));

declare global {
  interface Window {
    __filmStartedAt?: number;
    __filmEnded?: boolean;
  }
}

export function Film() {
  const [index, setIndex] = useState(0);
  const start = useRef(0);

  useEffect(() => {
    start.current = performance.now();
    window.__filmStartedAt = Date.now();
    let raf = 0;
    const tick = () => {
      const t = (performance.now() - start.current) / 1000;
      let i = FILM_STARTS.findIndex((s, k) => t >= s && t < s + FILM_SCENES[k]!.seconds);
      if (i === -1) {
        i = FILM_SCENES.length - 1;
        window.__filmEnded = true;
      }
      setIndex(i);
      if (!window.__filmEnded) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const scene = FILM_SCENES[index]!;
  return (
    <div className="fm" aria-label="TEBOS explainer film">
      <div className="fm-stage">
        <div className="fm-floor" aria-hidden />
        <div className="fm-glow" aria-hidden />
        <div className="fm-scene" key={index}>{scene.render()}</div>
        <p className="fm-sub" key={`s${index}`} style={d(scene.voiceAt)}>{scene.line}</p>
        <img className="fm-watermark" src="/brand/tebos-mark-clear.png" alt="" aria-hidden />
        <span className="fm-label">Illustrative example</span>
      </div>
    </div>
  );
}

const d = (s: number, extra: Record<string, string | number> = {}) => ({ "--d": `${s}s`, ...extra }) as CSSProperties;

/** A solid 3D bar: front, side and top faces. Sizes in stage units. */
function Prism({ w, h, dp, color, grow, delay = 0, shrinkTo }: { w: number; h: number; dp: number; color: string; grow?: boolean; delay?: number; shrinkTo?: number }) {
  return (
    <div
      className={`pr ${grow ? "pr-grow" : ""} ${shrinkTo !== undefined ? "pr-shrink" : ""}`}
      style={{ "--w": w, "--h": h, "--dp": dp, "--c": color, "--d": `${delay}s`, "--to": shrinkTo ?? 1 } as CSSProperties}
    >
      <div className="pr-front" />
      <div className="pr-side" />
      <div className="pr-top" />
    </div>
  );
}

function Cube({ size = 16, spin = true }: { size?: number; spin?: boolean }) {
  return (
    <div className={`cube ${spin ? "cube-spin" : ""}`} style={{ "--s": size } as CSSProperties}>
      {["front", "back", "right", "left", "top", "bottom"].map((f) => (
        <div key={f} className={`cube-face cube-${f}`}>
          {(f === "front" || f === "back" || f === "right" || f === "left") && <img src="/brand/tebos-mark-clear.png" alt="" aria-hidden />}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scenes
// ---------------------------------------------------------------------------

function Hook() {
  const work = [9, 13, 17, 22, 27];
  const profit = [20, 17, 14, 11, 8];
  return (
    <div className="fm-hook">
      <div className="iso">
        <div className="iso-group">
          {work.map((h, i) => <Prism key={i} w={5} h={h} dp={5} color="#d8ff67" grow delay={0.3 + i * 0.25} />)}
        </div>
        <div className="iso-caption fm-in" style={d(1.2)}>Work</div>
      </div>
      <div className="fm-pills">
        {["More clients", "More work", "Longer days"].map((p, i) => (
          <span key={p} className="fm-pill fm-zoom" style={d(1.4 + i * 0.95)}>{p}</span>
        ))}
      </div>
      <div className="iso">
        <div className="iso-group">
          {profit.map((h, i) => <Prism key={i} w={5} h={h} dp={5} color="#ff8a7a" grow delay={0.3 + i * 0.25} shrinkTo={0.35} />)}
        </div>
        <div className="iso-caption fm-in" style={d(1.2)}>Profit</div>
      </div>
      <div className="fm-question fm-slam" style={d(4.9)}>?</div>
    </div>
  );
}

function Meet() {
  return (
    <div className="fm-meet">
      <div className="fm-rays" aria-hidden />
      <div className="fm-logo fm-drop" style={d(0.1)}>
        <img src="/brand/tebos-logo.png" alt="TEBOS · Business Operating Systems" />
        <span className="fm-sheen" style={d(1.0)} />
      </div>
      <div className="fm-meet-lines">
        <span className="fm-chip ghost fm-zoom" style={d(3.2)}>Money</span>
        <span className="fm-chip ghost fm-zoom" style={d(3.8)}>Time</span>
        <span className="fm-chip ghost fm-zoom" style={d(4.4)}>Momentum</span>
        <span className="fm-chip fm-zoom" style={d(5.6)}><Check aria-hidden /> Helps you fix it</span>
      </div>
    </div>
  );
}

function Look() {
  return (
    <div className="fm-look">
      <div className="fm-browser fm-fly-left" style={d(0)}>
        <div className="fm-browser-bar"><i /><i /><i /><span>yourbusiness.com</span></div>
        <div className="fm-browser-body">
          <div className="fm-hero-block" />
          <div className="fm-row"><b /><b /><b /></div>
          <div className="fm-line" /><div className="fm-line short" />
          <div className="fm-beam" style={d(0.5)} />
        </div>
      </div>
      <div className="fm-notes">
        {["What you offer", "How customers reach you", "What's missing"].map((n, i) => (
          <span key={n} className="fm-note fm-pop-z" style={d(1.4 + i * 0.7)}><Check aria-hidden /> {n}</span>
        ))}
      </div>
    </div>
  );
}

function Listen() {
  return (
    <div className="fm-listen">
      <div className="fm-phone fm-fly-left" style={d(0)}>
        <div className="fm-phone-screen">
          <div className="fm-avatar"><Mic aria-hidden /></div>
          <div className="fm-phone-label">AI interviewer</div>
          <div className="fm-eq">{Array.from({ length: 12 }, (_, i) => <span key={i} style={{ animationDelay: `${(i % 5) * 0.11}s` }} />)}</div>
          <div className="fm-phone-foot"><Phone aria-hidden /> with consent</div>
        </div>
        {[0, 1, 2].map((r) => <div key={r} className="fm-ring" style={{ animationDelay: `${r * 0.6}s` }} />)}
      </div>
      <div className="fm-talk">
        <div className="fm-bubble q fm-pop-z" style={d(1.6)}>Where does work get stuck?</div>
        <div className="fm-bubble a fm-pop-z" style={d(2.8)}>Waiting for client sign-off.</div>
        <div className="fm-bubble q fm-pop-z" style={d(4.0)}>Do you bill for extra requests?</div>
        <div className="fm-bubble a fm-pop-z" style={d(5.1)}>Honestly… not always.</div>
      </div>
    </div>
  );
}

function Measure() {
  const tools = [
    { name: "Invoices", n: "R186k overdue" },
    { name: "Projects", n: "38 extra requests" },
    { name: "Time", n: "61% billable" },
    { name: "Clients", n: "5 extras billed" },
  ];
  return (
    <div className="fm-measure">
      <div className="fm-orbit">
        <div className="fm-cube-wrap small fm-in" style={d(0.1)}><Cube size={12} /></div>
        {tools.map((t, i) => (
          <div key={t.name} className={`fm-tool fm-tool-${i} fm-pop-z`} style={d(0.6 + i * 0.35)}>
            <div className="fm-tool-name">{t.name}</div>
            <div className="fm-tool-lock"><Lock aria-hidden /> read-only</div>
            <div className="fm-tool-num fm-in" style={d(2.4 + i * 0.4)}>{t.n}</div>
          </div>
        ))}
        <svg className="fm-wires" viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden>
          {[["18", "14"], ["82", "14"], ["18", "46"], ["82", "46"]].map(([x, y], i) => (
            <line key={i} x1={x} y1={y} x2="50" y2="30" className="fm-wire" style={d(1.4 + i * 0.25)} />
          ))}
        </svg>
      </div>
    </div>
  );
}

function Find() {
  return (
    <div className="fm-find">
      <div className="fm-ev left fm-fly-left" style={d(0.3)}><Mic aria-hidden /> “Honestly… not always.”</div>
      <div className="fm-ev right fm-fly-right" style={d(0.9)}><FileText aria-hidden /> 38 extra requests · 5 billed</div>
      <div className="fm-finding fm-merge" style={d(2.2)}>
        <div className="fm-finding-kicker">Leak found</div>
        <div className="fm-finding-title">Extra work is done but not billed</div>
        <div className="fm-costs">
          <span className="fm-cost fm-zoom" style={d(3.6)}>≈ R40k a month unbilled</span>
          <span className="fm-cost fm-zoom" style={d(4.2)}>≈ 12 hours a week of unpaid work</span>
        </div>
        <div className="fm-meter"><span className="fm-fill" style={d(5.0, { "--w": "81%" })} /></div>
        <div className="fm-finding-foot fm-in" style={d(5.4)}>81% confidence · backed by 2 pieces of evidence</div>
        <div className="fm-stamp fm-slam" style={d(7.2)}><Stamp aria-hidden /> Proof attached</div>
      </div>
    </div>
  );
}

function Decide() {
  return (
    <div className="fm-decide">
      <div className="fm-flip fm-in" style={d(0)}>
        <div className="fm-flip-inner" style={d(3.4)}>
          <div className="fm-card front">
            <div className="fm-card-kicker">Suggested fix</div>
            <div className="fm-card-title">Quote every extra request before starting</div>
            <div className="fm-approve fm-press" style={d(3.0)}><Check aria-hidden /> Approve</div>
          </div>
          <div className="fm-card back">
            <div className="fm-big-check"><Check aria-hidden /></div>
            <div className="fm-card-title">Approved by you</div>
          </div>
        </div>
      </div>
      <div className="fm-cursor" style={d(1.6)} aria-hidden />
    </div>
  );
}

function Prove() {
  return (
    <div className="fm-prove">
      <div className="fm-month fm-in" style={d(0.1)}>1 month later</div>
      <div className="iso iso-prove">
        <div className="iso-group">
          <div className="iso-bar"><Prism w={7} h={5} dp={7} color="#ff8a7a" grow delay={0.8} /><span className="fm-in" style={d(1.2)}>Before · 5 of 38</span></div>
          <div className="iso-bar"><Prism w={7} h={22} dp={7} color="#d8ff67" grow delay={1.6} /><span className="fm-in" style={d(2.4)}>After · 27 of 35</span></div>
        </div>
      </div>
      <div className="fm-seal fm-slam" style={d(3.4)}><ShieldCheck aria-hidden /> Checked against your numbers</div>
    </div>
  );
}

function Outro() {
  return (
    <div className="fm-outro">
      <div className="fm-logo small fm-in" style={d(0)}>
        <img src="/brand/tebos-logo.png" alt="TEBOS · Business Operating Systems" />
        <span className="fm-sheen" style={d(0.5)} />
      </div>
      <div className="fm-tag">
        <span className="fm-in" style={d(1.1)}>Understand your business.</span>
        <span className="fm-in" style={d(2.2)}>Fix what matters.</span>
        <span className="fm-in lime" style={d(3.3)}>Prove it.</span>
      </div>
      <div className="fm-cta fm-pop-z" style={d(4.2)}>Try the demo · tebos-demo.vercel.app</div>
    </div>
  );
}
