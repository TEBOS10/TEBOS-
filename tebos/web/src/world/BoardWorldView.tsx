// Hosts the 3D board world behind the landing page's story. The canvas stays
// fixed on screen while the stage panels scroll past; scroll position drives
// the camera and what happens on the board.
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { createBoardWorld, STAGE_COUNT, type BoardWorld } from "./boardWorld";

interface Stage { icon: ComponentType<{ size?: number }>; title: string; text: string }

export default function BoardWorldView({ hero, stages }: { hero: ReactNode; stages: Stage[] }) {
  const root = useRef<HTMLElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const world = useRef<BoardWorld | null>(null);
  const [active, setActive] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!host.current) return;
    try {
      world.current = createBoardWorld(host.current, {
        reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        // for recordings and screenshots on slow (software) renderers: the camera keeps up with the scroll exactly
        snap: new URLSearchParams(window.location.search).has("still"),
      });
    } catch {
      setFailed(true);
      return;
    }
    const onScroll = () => {
      const el = root.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const span = r.height - window.innerHeight;
      const p = span > 0 ? (-r.top / span) * (STAGE_COUNT - 1) : 0;
      world.current?.setProgress(p);
      setActive(Math.round(Math.max(0, Math.min(STAGE_COUNT - 1, p))));
    };
    const onResize = () => { world.current?.resize(); onScroll(); };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      world.current?.dispose();
      world.current = null;
    };
  }, []);

  const panels: Array<{ key: string; node: ReactNode }> = [
    { key: "hero", node: hero },
    ...stages.map(({ icon: Icon, title, text }, i) => ({
      key: title,
      node: (
        <>
          <p className="bw-step"><span className="bw-step-icon" aria-hidden><Icon size={16} /></span> {String(i + 1).padStart(2, "0")} / {String(stages.length).padStart(2, "0")}</p>
          <h2 className="bw-title">{title}</h2>
          <p className="bw-text">{text}</p>
        </>
      ),
    })),
    {
      key: "outro",
      node: (
        <>
          <p className="bw-step">The board</p>
          <h2 className="bw-title">Every piece in its place.</h2>
          <p className="bw-text">That's the business TEBOS builds with you: one you'd be glad to hand over for a week. See it on a fictional agency.</p>
          <div className="lp-ctas"><a className="btn btn-lime lp-cta" href="/demo">Open the demo</a></div>
        </>
      ),
    },
  ];

  return (
    <section ref={root} className={`bw ${failed ? "bw-failed" : ""}`} style={{ height: `${STAGE_COUNT * 100}vh` }} aria-label="How TEBOS works, in seven stages">
      <div className="bw-sticky">
        <div className="bw-canvas" ref={host} />
        <div className="bw-vignette" aria-hidden />
        <p className="bw-caption" aria-hidden>Illustrative board · fictional business</p>
        <ol className="bw-dots" aria-hidden>
          {panels.map((p, i) => <li key={p.key} className={i === active ? "on" : ""} />)}
        </ol>
      </div>
      <div className="bw-panels">
        {panels.map((p, i) => (
          <div key={p.key} className={`bw-slot ${i === 0 ? "bw-slot-hero" : i % 2 ? "bw-slot-right" : "bw-slot-left"}`}>
            <div className={`bw-panel ${i === 0 ? "bw-panel-hero" : ""} ${i === active ? "is-active" : ""}`} data-testid={`stage-${p.key}`}>{p.node}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
