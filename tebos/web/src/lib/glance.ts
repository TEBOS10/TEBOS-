// The home screen's picture of each business: a gauge per objective and a
// trend line of its readings. Pure, so it can be tested. Only measured
// readings (read from a connected system) fill a gauge or draw a line; what
// the owner said is shown as words, never as progress. Nothing is drawn that
// isn't recorded: no reading, no gauge fill and no line.
import { objectiveProgress, type Direction, type MeasurementState } from "@core/board";

export interface GlanceObjective {
  id: string;
  title: string;
  status: string;
  direction: string;
  target_value: number | string;
  unit: string;
}

export interface GlanceMeasurement {
  id: string;
  objective_id: string;
  basis: string;
  value: number | string;
  measured_at: string;
}

export interface Gauge {
  /** how far the latest measured reading is toward the target, 0..1; null when nothing is measured */
  fraction: number | null;
  met: boolean | null;
  latest: { value: number; measuredAt: string } | null;
  /** measured readings, oldest first */
  readings: Array<{ value: number; measuredAt: string }>;
}

const toState = (m: GlanceMeasurement): MeasurementState => ({
  id: m.id, objectiveId: m.objective_id, basis: m.basis as MeasurementState["basis"], value: Number(m.value), measuredAt: m.measured_at,
});

export function gauge(o: GlanceObjective, measurements: GlanceMeasurement[]): Gauge {
  const target = Number(o.target_value);
  const direction = o.direction as Direction;
  const p = objectiveProgress({ id: o.id, direction, targetValue: target }, measurements.map(toState));
  const readings = measurements
    .filter((m) => m.objective_id === o.id && m.basis === "measured")
    .map((m) => ({ value: Number(m.value), measuredAt: m.measured_at }))
    .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
  if (!p.measured) return { fraction: null, met: null, latest: null, readings };
  const v = p.measured.value;
  let fraction: number;
  if (p.met) fraction = 1;
  else if (direction === "at_least") fraction = target > 0 ? Math.max(0, v / target) : 0;
  // at most: on or under the target is met; over it, the further over the emptier the gauge
  else fraction = v > 0 ? Math.max(0, target / v) : 0;
  return { fraction: Math.min(1, fraction), met: p.met, latest: { value: v, measuredAt: p.measured.measuredAt }, readings };
}

/** An SVG polyline for the readings in a width x height box; null with fewer than two readings. */
export function trendPoints(readings: Array<{ value: number; measuredAt: string }>, width: number, height: number, pad = 3): string | null {
  if (readings.length < 2) return null;
  const xs = readings.map((r) => Date.parse(r.measuredAt));
  const ys = readings.map((r) => r.value);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const sx = (x: number) => (x1 === x0 ? width / 2 : pad + ((x - x0) / (x1 - x0)) * (width - 2 * pad));
  // a flat series sits in the middle rather than on an edge
  const sy = (y: number) => (y1 === y0 ? height / 2 : height - pad - ((y - y0) / (y1 - y0)) * (height - 2 * pad));
  return readings.map((r, i) => `${sx(xs[i]!).toFixed(1)},${sy(r.value).toFixed(1)}`).join(" ");
}
