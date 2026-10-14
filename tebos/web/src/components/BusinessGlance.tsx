// The home screen's picture of the organisation's businesses: each one's
// operating board as the 3D chessboard (the same view as its board page,
// unchanged), a gauge per objective and a trend line of its readings. Every
// mark comes from a record: an unmeasured objective shows an empty gauge, a
// business with no board mapped says so, and nothing is filled in to look busy.
import { founderDependency, type Performer } from "@core/board";
import { lazy, Suspense, useMemo, useState } from "react";
import { businessGlance } from "../lib/data";
import { ago } from "../lib/format";
import { gauge, trendPoints, type Gauge } from "../lib/glance";
import { Link } from "../lib/router";
import { useOrg } from "../lib/session";
import { useQuery } from "../lib/useQuery";
import { formatValue } from "../pages/BoardPage";
import { layoutBoard } from "../world/layout";
import { use3d } from "../world/support";

const ClientBoardView = lazy(() => import("../world/ClientBoardView"));

/** At most this many businesses get a picture; the rest are a link away. */
const SHOWN = 3;

type Glance = Awaited<ReturnType<typeof businessGlance>>[number];

export function BusinessGlance({ businesses, total }: { businesses: Array<{ id: string; name: string }>; total: number }) {
  const { db } = useOrg();
  const shown = businesses.slice(0, SHOWN);
  const ids = shown.map((b) => b.id);
  // new readings arrive hourly; a minute is fresh enough, and the 3D board only redraws when its records change
  const q = useQuery(() => businessGlance(db, ids), [ids.join(",")], { pollMs: 60_000, keepPolling: () => true });
  const [three] = useState(() => use3d({ allowReducedMotion: true }));
  if (shown.length === 0 || !q.data) return null;
  return (
    <section className="glance" aria-label="Your businesses at a glance" data-testid="business-glance">
      <header className="glance-head">
        <p className="eyebrow">Your businesses at a glance</p>
        <p className="glance-note">Drawn only from what's recorded: the board from its mapped pieces and flows, the gauges from readings of connected systems.</p>
      </header>
      {shown.map((b, i) => {
        const g = q.data!.find((x) => x.businessId === b.id);
        return g ? <GlanceCard key={b.id} name={b.name} id={b.id} glance={g} three={three} openAtStart={i === 0} /> : null;
      })}
      {total > shown.length && (
        <Link to="/businesses" className="glance-more">See all {total} businesses</Link>
      )}
    </section>
  );
}

function GlanceCard({ id, name, glance, three, openAtStart }: { id: string; name: string; glance: Glance; three: boolean; openAtStart: boolean }) {
  const [open, setOpen] = useState(openAtStart);
  const layout = useMemo(() => layoutBoard(glance, formatValue), [glance]);
  const mapped = glance.components.length > 0 || glance.flows.length > 0;
  const dep = founderDependency(glance.steps.map((s) => ({ performer: s.performer as Performer, documented: s.documented, componentId: s.component_id })));
  const latest = glance.measurements[0]?.measured_at ?? null;
  return (
    <article className="glance-card" aria-label={name}>
      <div className="glance-title">
        <h2>{name}</h2>
        <Link to={`/businesses/${id}/board`} className="glance-link">Open its board</Link>
      </div>
      <ul className="glance-facts">
        <li><strong>{glance.components.length}</strong> pieces</li>
        <li><strong>{glance.flows.length}</strong> flows</li>
        <li className={dep.middleware ? "warn" : ""}><strong>{dep.middleware}</strong> founder-only steps</li>
        <li>{latest ? <>last reading <strong>{ago(latest)}</strong></> : "no readings yet"}</li>
      </ul>

      {mapped && three && (
        <div className="glance-board">
          <button type="button" className="glance-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? "Hide the board" : "Show the board in 3D"}
          </button>
          {open && (
            <Suspense fallback={<div className="cb-stage cb-loading" />}>
              <ClientBoardView layout={layout} />
            </Suspense>
          )}
        </div>
      )}
      {!mapped && <p className="glance-empty">No board mapped yet. <Link to={`/businesses/${id}/board`}>Map its pieces and flows</Link> and it appears here.</p>}

      {glance.objectives.length === 0 ? (
        <p className="glance-empty">No objectives yet, so there's nothing to measure. <Link to={`/businesses/${id}/board`}>Set one</Link>.</p>
      ) : (
        <ul className="glance-gauges">
          {glance.objectives.map((o) => (
            <GaugeTile key={o.id} title={o.title} unit={o.unit} target={Number(o.target_value)} direction={o.direction} g={gauge(o, glance.measurements)} />
          ))}
        </ul>
      )}
    </article>
  );
}

const R = 26;
const C = 2 * Math.PI * R;

function GaugeTile({ title, unit, target, direction, g }: { title: string; unit: string; target: number; direction: string; g: Gauge }) {
  const line = trendPoints(g.readings, 120, 32);
  const tone = g.met ? "met" : g.fraction === null ? "none" : "open";
  return (
    <li className={`gauge gauge-${tone}`} data-testid="glance-gauge">
      <svg viewBox="0 0 64 64" className="gauge-ring" role="img"
        aria-label={g.fraction === null ? `${title}: not measured yet` : `${title}: ${Math.round(g.fraction * 100)}% of the way to the target`}>
        <circle cx="32" cy="32" r={R} className="gauge-track" />
        {g.fraction !== null && (
          <circle cx="32" cy="32" r={R} className="gauge-fill" strokeDasharray={`${(g.fraction * C).toFixed(1)} ${C.toFixed(1)}`} transform="rotate(-90 32 32)" />
        )}
        <text x="32" y="36" textAnchor="middle" className="gauge-pct">{g.fraction === null ? "–" : `${Math.round(g.fraction * 100)}%`}</text>
      </svg>
      <div className="gauge-body">
        <span className="gauge-title">{title}</span>
        <span className="gauge-meta">
          {g.latest ? `${formatValue(g.latest.value, unit)} of ${direction === "at_most" ? "at most " : ""}${formatValue(target, unit)}${g.met ? " · met" : ""}` : "Not measured yet"}
        </span>
        {line ? (
          <svg viewBox="0 0 120 32" className="gauge-trend" role="img" aria-label={`${g.readings.length} readings`}>
            <polyline points={line} />
          </svg>
        ) : g.readings.length === 1 ? (
          <span className="gauge-meta faint">One reading so far; the line starts with the second</span>
        ) : null}
      </div>
    </li>
  );
}
