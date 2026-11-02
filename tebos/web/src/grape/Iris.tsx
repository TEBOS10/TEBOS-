// Grape Studios' hero mark (founder and Teboho, 2 Nov 2026): a camera aperture, the most recognisable shape in
// photography, drawn as a six-blade iris. Grape's own photographs show through it; every few seconds the blades close
// and open again on the next one, like a shutter. At rest it is stopped down a little, so the blades frame the picture. Minimal, iconic, and about the work: no model, no 3D, no download.
//
// The geometry: the opening is a regular hexagon of circumradius r, twisted by an angle that follows how closed the
// iris is. Each blade's edge is one side of the hexagon, carried on until it meets the rim, which is how a real iris
// looks. Fully open, the hexagon is bigger than the rim, so no blade shows.
import { useEffect, useRef, useState } from "react";

const BLADES = 6;
const R = 100; // rim radius in SVG units
const OPEN = 1.18 * R; // circumradius when fully open: the hexagon clears the rim
const HOLD_MS = 4200;
const CLOSE_MS = 520;
const OPEN_MS = 720;
/** At rest the iris is stopped down a little, so its blades always frame the photograph: it reads as an aperture. */
const REST = 0.3;

/** The opening and blade edges for an iris closed by `t` (0 open, 1 shut). */
export function irisGeometry(t: number) {
  const k = Math.min(1, Math.max(0, t));
  const r = OPEN * (1 - k) + 0.0001;
  const twist = (-14 + 40 * k) * (Math.PI / 180);
  const vertex = (i: number) => {
    const a = twist + (i * 2 * Math.PI) / BLADES;
    return [r * Math.cos(a), r * Math.sin(a)] as const;
  };
  const hex = Array.from({ length: BLADES }, (_, i) => vertex(i));
  // each side, carried past its second vertex until it meets the rim
  const edges = hex.map((p, i) => {
    const q = hex[(i + 1) % BLADES]!;
    const dx = q[0] - p[0], dy = q[1] - p[1];
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    // solve |q + s·u| = R for s ≥ 0
    const b = q[0] * ux + q[1] * uy, c = q[0] ** 2 + q[1] ** 2 - R * R;
    const s = -b + Math.sqrt(Math.max(0, b * b - c));
    return { from: q, to: [q[0] + s * ux, q[1] + s * uy] as const };
  });
  return { r, hex, edges };
}

const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function Iris({ photos, label }: { photos: string[]; label: string }) {
  const [t, setT] = useState(REST);
  const [index, setIndex] = useState(0);
  const started = useRef(performance.now());
  useEffect(() => {
    if (photos.length < 2 || reducedMotion()) return;
    let raf = 0, last = 0;
    const cycle = HOLD_MS + CLOSE_MS + OPEN_MS;
    const frame = (now: number) => {
      const e = (now - started.current) % cycle;
      const n = Math.floor((now - started.current) / cycle);
      let closed = REST;
      if (e > HOLD_MS && e <= HOLD_MS + CLOSE_MS) closed = REST + (1 - REST) * ease((e - HOLD_MS) / CLOSE_MS);
      else if (e > HOLD_MS + CLOSE_MS) closed = 1 - (1 - REST) * ease((e - HOLD_MS - CLOSE_MS) / OPEN_MS);
      // the next photograph arrives while the blades are shut
      const shown = e > HOLD_MS + CLOSE_MS ? n + 1 : n;
      if (now - last > 30 || closed === REST) { setT(closed); last = now; }
      setIndex(shown % photos.length);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [photos.length]);

  const { hex, edges } = irisGeometry(t);
  const opening = `M${hex.map((p) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join("L")}Z`;
  const rim = `M${R} 0A${R} ${R} 0 1 0 ${-R} 0A${R} ${R} 0 1 0 ${R} 0Z`;
  return (
    <figure className="gs-iris" role="img" aria-label={label} data-testid="iris" data-photo={index}>
      <svg viewBox={`${-R - 14} ${-R - 14} ${2 * R + 28} ${2 * R + 28}`} aria-hidden>
        <defs>
          <clipPath id="gs-iris-rim"><circle r={R} /></clipPath>
          <radialGradient id="gs-iris-blade" cx="30%" cy="25%" r="90%">
            <stop offset="0%" className="gs-iris-blade-hi" />
            <stop offset="100%" className="gs-iris-blade-lo" />
          </radialGradient>
        </defs>
        <g clipPath="url(#gs-iris-rim)">
          {photos.map((p, i) => (
            <image key={p} href={p} x={-R} y={-R} width={2 * R} height={2 * R} preserveAspectRatio="xMidYMid slice"
              className={`gs-iris-photo ${i === index ? "on" : ""}`} />
          ))}
          {/* the blades: everything inside the rim but outside the opening */}
          <path d={`${rim}${opening}`} fillRule="evenodd" fill="url(#gs-iris-blade)" />
          {edges.map((e, i) => (
            <line key={i} x1={e.from[0]} y1={e.from[1]} x2={e.to[0]} y2={e.to[1]} className="gs-iris-edge" />
          ))}
        </g>
        <circle r={R + 6} className="gs-iris-ring" />
      </svg>
    </figure>
  );
}
