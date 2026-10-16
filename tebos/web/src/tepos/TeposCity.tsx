// The TEPOS city: each portal is a building in its own earthy shade, at dusk. Built portals are lit; the ones not
// built yet stand under scaffolding, which says plainly that there is nothing inside yet. Every building opens its
// portal, by click or keyboard; the tiles below the city are the same portals for anyone who prefers a list.
import { type KeyboardEvent, type ReactNode } from "react";
import type { PortalOrigin } from "../components/Portal";
import { PORTALS, type Portal } from "./portals";

const GROUND = 392;
const byKey = (k: string) => PORTALS.find((p) => p.key === k)!;

function Windows({ x, y, cols, rows, w, h, gapX, gapY, fill, lit }: { x: number; y: number; cols: number; rows: number; w: number; h: number; gapX: number; gapY: number; fill: string; lit: boolean }) {
  const out: ReactNode[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    // a few windows stay dark, so the city looks lived in rather than painted
    const on = lit && (r * 7 + c * 3) % 5 !== 0;
    out.push(<rect key={`${r}-${c}`} x={x + c * (w + gapX)} y={y + r * (h + gapY)} width={w} height={h} rx={1.5} fill={fill} opacity={on ? 0.9 : 0.18} />);
  }
  return <g>{out}</g>;
}

function Scaffold({ x, y, w, h, colour }: { x: number; y: number; w: number; h: number; colour: string }) {
  const lines: ReactNode[] = [];
  for (let i = 0; i <= 4; i++) lines.push(<line key={`v${i}`} x1={x + (w * i) / 4} y1={y} x2={x + (w * i) / 4} y2={GROUND} />);
  for (let j = 1; j <= 5; j++) lines.push(<line key={`h${j}`} x1={x - 6} y1={y + ((GROUND - y) * j) / 6} x2={x + w + 6} y2={y + ((GROUND - y) * j) / 6} />);
  for (let i = 0; i < 4; i++) lines.push(<line key={`d${i}`} x1={x + (w * i) / 4} y1={GROUND - ((GROUND - y) * (i % 2 ? 0.5 : 0.2))} x2={x + (w * (i + 1)) / 4} y2={GROUND - ((GROUND - y) * (i % 2 ? 0.2 : 0.5))} />);
  return <g stroke={colour} strokeWidth={1.6} opacity={0.75} strokeDasharray="5 3">{lines}</g>;
}

function Building({ portal, label, allowed, onOpen, children, labelX }: {
  portal: Portal; label: string; allowed: boolean; labelX: number; onOpen: (p: Portal, e: PortalOrigin) => void; children: ReactNode;
}) {
  const go = (e: PortalOrigin) => allowed && onOpen(portal, e);
  const key = (e: KeyboardEvent<SVGGElement>) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(e); } };
  const status = !allowed ? "no access" : portal.built ? "open" : "not built yet";
  return (
    <g className={`city-building ${portal.built ? "built" : "unbuilt"}`} role="button" tabIndex={allowed ? 0 : -1} aria-label={`${portal.name}: ${status}`}
      data-testid={`building-${portal.key}`} onClick={go} onKeyDown={key}>
      {children}
      <text x={labelX} y={GROUND + 26} textAnchor="middle" className="city-label">{label}</text>
      {!portal.built && <text x={labelX} y={GROUND + 42} textAnchor="middle" className="city-sublabel">under construction</text>}
    </g>
  );
}

export function TeposCity({ onOpen, allowed }: { onOpen: (p: Portal, e: PortalOrigin) => void; allowed: (p: Portal) => boolean }) {
  const irekun = byKey("irekun"), enterprise = byKey("enterprise"), capital = byKey("capital");
  const forex = byKey("forex"), academics = byKey("academics"), agent = byKey("agent");
  const b = (p: Portal) => ({ portal: p, allowed: allowed(p), onOpen });
  return (
    <figure className="tepos-city" aria-label="The TEPOS city: one building per portal">
      <svg viewBox="0 0 1200 450" role="group" aria-label="Portals as buildings">
        <defs>
          <linearGradient id="city-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1a120c" />
            <stop offset="0.62" stopColor="#4a2f1d" />
            <stop offset="1" stopColor="#c27a45" />
          </linearGradient>
          <radialGradient id="city-sun" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#f6d8a6" stopOpacity="0.95" />
            <stop offset="1" stopColor="#f6d8a6" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="1200" height="450" fill="url(#city-sky)" />
        <circle cx="905" cy="300" r="170" fill="url(#city-sun)" />
        {/* distant skyline */}
        <path d="M0 330 h60 v-40 h40 v25 h50 v-55 h30 v70 h70 v-30 h45 v-20 h40 v50 h80 v-45 h35 v60 h90 v-35 h50 v-25 h40 v55 h70 v-40 h60 v30 h80 v-50 h45 v65 h75 v-30 h60 v-25 h40 v55 h90 V392 H0 Z" fill="#2a1c12" opacity="0.6" />

        <rect y={GROUND} width="1200" height="58" fill="#140d08" />

        {/* IREKUN: a fortress tower */}
        <Building {...b(irekun)} label="IREKUN" labelX={115}>
          <rect x="45" y="190" width="140" height={GROUND - 190} rx="3" fill={irekun.shade} stroke={irekun.accent} strokeOpacity="0.5" />
          {[0, 1, 2, 3, 4].map((i) => <rect key={i} x={45 + i * 30} y="172" width="20" height="20" fill={irekun.shade} stroke={irekun.accent} strokeOpacity="0.5" />)}
          {[0, 1, 2].map((i) => <rect key={i} x={75 + i * 32} y="230" width="8" height="34" rx="4" fill={irekun.accent} opacity="0.85" />)}
          <path d="M100 392 v-46 a15 15 0 0 1 30 0 v46 Z" fill="#120c08" />
          <line x1="115" y1="172" x2="115" y2="128" stroke={irekun.accent} strokeWidth="2" />
          <path d="M115 128 l26 8 l-26 8 Z" fill={irekun.accent} />
        </Building>

        {/* Tidy Enterprise: an office tower */}
        <Building {...b(enterprise)} label="Tidy Enterprise" labelX={290}>
          <rect x="220" y="100" width="140" height={GROUND - 100} rx="3" fill={enterprise.shade} stroke={enterprise.accent} strokeOpacity="0.4" />
          <rect x="250" y="80" width="80" height="22" fill={enterprise.shade} stroke={enterprise.accent} strokeOpacity="0.4" />
          <Windows x={234} y={118} cols={5} rows={10} w={16} h={14} gapX={8} gapY={12} fill={enterprise.accent} lit />
          <rect x="272" y="356" width="36" height="36" fill="#1b120c" />
        </Building>

        {/* Tidy Capital: the bank, the reserve at the centre */}
        <Building {...b(capital)} label="Tidy Capital" labelX={505}>
          <rect x="385" y="372" width="240" height="20" fill={capital.shade} stroke={capital.accent} strokeOpacity="0.5" />
          <rect x="400" y="356" width="210" height="16" fill={capital.shade} stroke={capital.accent} strokeOpacity="0.5" />
          <rect x="410" y="205" width="190" height="151" fill={capital.shade} />
          {[0, 1, 2, 3, 4, 5].map((i) => <rect key={i} x={418 + i * 33} y="215" width="14" height="141" rx="2" fill={capital.accent} opacity="0.9" />)}
          <path d="M395 205 L505 140 L615 205 Z" fill={capital.shade} stroke={capital.accent} strokeWidth="2" />
          <text x="505" y="190" textAnchor="middle" className="city-monogram" fill={capital.accent}>TC</text>
        </Building>

        {/* Forex: a slim trading tower, under scaffolding */}
        <Building {...b(forex)} label="Forex" labelX={690}>
          <rect x="650" y="90" width="80" height={GROUND - 90} rx="2" fill={forex.shade} opacity="0.32" stroke={forex.shade} strokeDasharray="6 4" />
          <polyline points="656,300 672,280 686,292 700,250 714,262 726,220" fill="none" stroke={forex.accent} strokeWidth="2.5" opacity="0.6" />
          <Scaffold x={650} y={90} w={80} h={GROUND - 90} colour={forex.shade} />
          {/* a crane */}
          <line x1="742" y1={GROUND} x2="742" y2="58" stroke={forex.shade} strokeWidth="4" />
          <line x1="690" y1="62" x2="812" y2="62" stroke={forex.shade} strokeWidth="4" />
          <line x1="800" y1="62" x2="800" y2="104" stroke={forex.shade} strokeWidth="1.5" />
          <rect x="792" y="104" width="16" height="12" fill={forex.shade} />
        </Building>

        {/* Academics: a library with a dome, under scaffolding */}
        <Building {...b(academics)} label="Academics" labelX={895}>
          <rect x="820" y="260" width="150" height={GROUND - 260} fill={academics.shade} opacity="0.32" stroke={academics.shade} strokeDasharray="6 4" />
          <path d="M835 260 a60 60 0 0 1 120 0 Z" fill={academics.shade} opacity="0.3" stroke={academics.shade} strokeDasharray="6 4" />
          <Scaffold x={820} y={230} w={150} h={GROUND - 230} colour={academics.shade} />
        </Building>

        {/* Real Estate Job: a row of houses, under scaffolding */}
        <Building {...b(agent)} label="Real Estate Job" labelX={1095}>
          {[0, 1, 2].map((i) => (
            <g key={i} opacity="0.4">
              <rect x={1005 + i * 62} y="320" width="54" height="72" fill={agent.shade} stroke={agent.shade} strokeDasharray="5 3" />
              <path d={`M${1000 + i * 62} 322 L${1032 + i * 62} 290 L${1064 + i * 62} 322 Z`} fill={agent.shade} />
            </g>
          ))}
          <Scaffold x={1005} y={286} w={178} h={GROUND - 286} colour={agent.shade} />
        </Building>

      </svg>
    </figure>
  );
}
