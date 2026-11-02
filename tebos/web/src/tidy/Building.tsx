// Tidy Enterprise's hero mark: a building drawn in fine sand lines whose windows light up, floor by floor, and a line
// that climbs behind it. A property switched on as a productive asset. Drawn, not photographed: no stock imagery, nothing
// downloaded, and no figures. With reduced motion it shows the building fully lit.

const FLOORS = 9;
const COLS = 5;
const X0 = 92, Y0 = 118, W = 34, H = 30, GX = 16, GY = 14; // the main block's window grid

// a fixed, even spread of start times, so the windows come on in a natural-looking order (not row by row)
const order = Array.from({ length: FLOORS * COLS }, (_, i) => i).sort((a, b) => ((a * 37) % 45) - ((b * 37) % 45));
const delayOf = new Map(order.map((w, k) => [w, k * 0.16]));

export function Building() {
  return (
    <svg className="te-building" viewBox="0 0 480 600" role="img" aria-label="A building whose windows light up one by one">
      <defs>
        <linearGradient id="te-glow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe3b0" />
          <stop offset="1" stopColor="#e3a85e" />
        </linearGradient>
        <linearGradient id="te-rise" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#ecd3ab" stopOpacity="0" />
          <stop offset="1" stopColor="#ecd3ab" stopOpacity="0.9" />
        </linearGradient>
      </defs>

      {/* the line that climbs behind the building */}
      <path className="te-rise" d="M10 520 C 90 505, 130 470, 180 455 S 280 380, 330 300 S 420 140, 470 70" fill="none" stroke="url(#te-rise)" strokeWidth="2" />

      {/* main block */}
      <g className="te-lines">
        <rect x="74" y="96" width="282" height="458" rx="2" />
        <line x1="74" y1="96" x2="356" y2="96" />
        <rect x="64" y="84" width="302" height="12" rx="2" />
        <rect x="190" y="500" width="50" height="54" />
        <line x1="215" y1="500" x2="215" y2="554" />
        {/* annex */}
        <rect x="356" y="330" width="88" height="224" rx="2" />
        {[0, 1, 2, 3].map((r) => [0, 1].map((c) => (
          <rect key={`a${r}${c}`} className="te-win te-win-annex" x={372 + c * 32} y={352 + r * 46} width="22" height="28" rx="1.5"
            style={{ animationDelay: `${1.2 + (r * 2 + c) * 0.55}s` }} />
        )))}
        <line x1="20" y1="554" x2="470" y2="554" />
      </g>

      {/* the windows of the main block */}
      {Array.from({ length: FLOORS }, (_, r) => Array.from({ length: COLS }, (_, c) => {
        const i = r * COLS + c;
        return (
          <rect key={i} className="te-win" x={X0 + c * (W + GX)} y={Y0 + r * (H + GY)} width={W} height={H} rx="1.5"
            style={{ animationDelay: `${delayOf.get(i)}s` }} />
        );
      }))}
    </svg>
  );
}
