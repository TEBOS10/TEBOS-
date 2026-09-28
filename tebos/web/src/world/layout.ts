// Lays out a client's recorded operating board for the 3D view. Pure: no
// rendering, so it can be tested. Everything here comes from the board's own
// records; nothing is added except the anchors that record's performers
// imply (the founder, the team, the client, an outside provider).
import { objectiveProgress, type Direction, type MeasurementState } from "@core/board";

export type PieceShape = "king" | "rook" | "bishop" | "pawn";
export type Tile = [number, number];

export interface LayoutPiece {
  key: string;
  label: string;
  sub: string | null;
  shape: PieceShape;
  tile: Tile;
  /** observed: confirmed by evidence; stated: what the business said; anchor: a performer, not a recorded piece */
  basis: "observed" | "stated" | "anchor";
}

export interface LayoutNode {
  pieceKey: string;
  step: string;
  position: number;
  founderOnly: boolean;
}

export interface LayoutFlow {
  id: string;
  name: string;
  nodes: LayoutNode[];
  founderOnly: number;
}

export interface LayoutObjective {
  id: string;
  title: string;
  /** measured value relative to the target (1 = on the target line); null when not measured */
  level: number | null;
  met: boolean | null;
  label: string;
}

export interface BoardLayout {
  pieces: LayoutPiece[];
  flows: LayoutFlow[];
  objectives: LayoutObjective[];
  founderOnly: number;
}

export interface LayoutInput {
  components: Array<{ id: string; name: string; kind: string; basis: string; supplier: string | null }>;
  flows: Array<{ id: string; name: string }>;
  steps: Array<{ flow_id: string; position: number; name: string; performer: string; component_id: string | null; documented: boolean }>;
  objectives: Array<{ id: string; title: string; status: string; direction: string; target_value: number | string; unit: string }>;
  measurements: Array<{ id: string; objective_id: string; basis: string; value: number | string; measured_at: string }>;
}

const SHAPE: Record<string, PieceShape> = {
  software: "rook", data_store: "rook", provider: "bishop", channel: "pawn", team: "pawn", role: "pawn", document: "pawn", other: "pawn",
};

const ANCHORS: Record<string, { key: string; label: string; shape: PieceShape }> = {
  staff: { key: "@team", label: "Team", shape: "pawn" },
  client: { key: "@client", label: "Client", shape: "bishop" },
  provider: { key: "@provider", label: "Outside provider", shape: "bishop" },
};

export const FOUNDER_KEY = "@founder";
const FOUNDER_TILE: Tile = [3, 3];
const CENTRE = 3.5;

/** Spreads n pieces around the founder, on the free tile nearest each ideal spot. */
export function placeAround(n: number): Tile[] {
  const taken = new Set<string>([FOUNDER_TILE.join(",")]);
  const tiles: Tile[] = [];
  for (let i = 0; i < n; i++) {
    const angle = (i / Math.max(1, n)) * Math.PI * 2 - Math.PI / 2;
    const r = n > 12 ? (i % 2 ? 2.2 : 3.4) : 3;
    const ix = CENTRE + r * Math.cos(angle) - 0.5, iz = CENTRE + r * Math.sin(angle) - 0.5;
    let best: Tile | null = null;
    let bestD = Infinity;
    for (let x = 0; x < 8; x++) {
      for (let z = 0; z < 8; z++) {
        if (taken.has(`${x},${z}`)) continue;
        const d = (x - ix) ** 2 + (z - iz) ** 2;
        if (d < bestD) { bestD = d; best = [x, z]; }
      }
    }
    if (!best) break; // the board is full
    taken.add(best.join(","));
    tiles.push(best);
  }
  return tiles;
}

export function layoutBoard(input: LayoutInput, format: (value: number, unit: string) => string): BoardLayout {
  const liveComponents = [...input.components].sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
  const performers = new Set(input.steps.filter((s) => !s.component_id).map((s) => s.performer));
  const anchors = (["staff", "client", "provider"] as const).filter((p) => performers.has(p)).map((p) => ANCHORS[p]!);
  const tiles = placeAround(liveComponents.length + anchors.length);

  const pieces: LayoutPiece[] = [{ key: FOUNDER_KEY, label: "Founder", sub: null, shape: "king", tile: FOUNDER_TILE, basis: "anchor" }];
  liveComponents.forEach((c, i) => {
    if (!tiles[i]) return;
    pieces.push({ key: c.id, label: c.name, sub: c.supplier, shape: SHAPE[c.kind] ?? "pawn", tile: tiles[i]!, basis: c.basis === "observed" ? "observed" : "stated" });
  });
  anchors.forEach((a, i) => {
    const t = tiles[liveComponents.length + i];
    if (t) pieces.push({ key: a.key, label: a.label, sub: null, shape: a.shape, tile: t, basis: "anchor" });
  });
  const placed = new Set(pieces.map((p) => p.key));

  const pieceFor = (s: LayoutInput["steps"][number]) => {
    if (s.component_id && placed.has(s.component_id)) return s.component_id;
    if (s.performer === "founder") return FOUNDER_KEY;
    return ANCHORS[s.performer]?.key ?? FOUNDER_KEY;
  };

  const flows: LayoutFlow[] = input.flows.map((f) => {
    const nodes = input.steps
      .filter((s) => s.flow_id === f.id)
      .sort((a, b) => a.position - b.position)
      .map((s) => ({
        // a step the founder performs happens at the founder, whatever tool it touches
        pieceKey: s.performer === "founder" ? FOUNDER_KEY : pieceFor(s),
        step: s.name,
        position: s.position,
        founderOnly: s.performer === "founder" && !s.documented,
      }));
    return { id: f.id, name: f.name, nodes, founderOnly: nodes.filter((n) => n.founderOnly).length };
  });

  const measurements: MeasurementState[] = input.measurements.map((m) => ({
    id: m.id, objectiveId: m.objective_id, basis: m.basis as MeasurementState["basis"], value: Number(m.value), measuredAt: m.measured_at,
  }));
  const objectives: LayoutObjective[] = input.objectives
    .filter((o) => o.status === "active" || o.status === "achieved")
    .map((o) => {
      const target = Number(o.target_value);
      const p = objectiveProgress({ id: o.id, direction: o.direction as Direction, targetValue: target }, measurements);
      const level = p.measured ? (target > 0 ? p.measured.value / target : p.met ? 1 : 0) : null;
      return {
        id: o.id,
        title: o.title,
        level,
        met: p.met,
        label: p.measured ? `${o.title} · ${format(p.measured.value, o.unit)} of ${format(target, o.unit)}` : `${o.title} · not measured yet`,
      };
    });

  return { pieces, flows, objectives, founderOnly: flows.reduce((n, f) => n + f.founderOnly, 0) };
}
