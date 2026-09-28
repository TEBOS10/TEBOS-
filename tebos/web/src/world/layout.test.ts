import { describe, expect, it } from "vitest";
import { FOUNDER_KEY, layoutBoard, placeAround, type LayoutInput } from "./layout";

const fmt = (v: number, unit: string) => (unit === "percent" ? `${v}%` : `R${v}`);

const input: LayoutInput = {
  components: [
    { id: "site", name: "Website", kind: "provider", basis: "stated", supplier: "Studio North" },
    { id: "pm", name: "Project platform", kind: "software", basis: "observed", supplier: null },
    { id: "mail", name: "Inbox", kind: "channel", basis: "stated", supplier: null },
  ],
  flows: [{ id: "f1", name: "Lead to client" }, { id: "f2", name: "Empty flow" }],
  steps: [
    { flow_id: "f1", position: 2, name: "Price it", performer: "founder", component_id: null, documented: false },
    { flow_id: "f1", position: 1, name: "Enquiry arrives", performer: "client", component_id: "site", documented: true },
    { flow_id: "f1", position: 3, name: "Send proposal", performer: "founder", component_id: "mail", documented: true },
    { flow_id: "f1", position: 4, name: "Set up project", performer: "staff", component_id: null, documented: true },
  ],
  objectives: [
    { id: "o1", title: "Billable 70%", status: "active", direction: "at_least", target_value: 70, unit: "percent" },
    { id: "o2", title: "R9m revenue", status: "active", direction: "at_least", target_value: 9000000, unit: "ZAR" },
    { id: "o3", title: "Retired one", status: "retired", direction: "at_least", target_value: 1, unit: "count" },
  ],
  measurements: [
    { id: "m1", objective_id: "o1", basis: "measured", value: 61, measured_at: "2026-09-01T00:00:00Z" },
    { id: "m2", objective_id: "o2", basis: "stated", value: 9500000, measured_at: "2026-09-02T00:00:00Z" },
  ],
};

describe("3D board layout", () => {
  it("places every piece on its own tile, never on the founder's", () => {
    for (const n of [0, 1, 5, 12, 20, 40]) {
      const tiles = placeAround(n);
      expect(tiles).toHaveLength(n);
      const keys = tiles.map((t) => t.join(","));
      expect(new Set(keys).size).toBe(n);
      expect(keys).not.toContain("3,3");
      for (const [x, z] of tiles) expect(x >= 0 && x < 8 && z >= 0 && z < 8).toBe(true);
    }
  });

  it("shows only recorded pieces, plus the performers the steps imply", () => {
    const l = layoutBoard(input, fmt);
    expect(l.pieces.map((p) => p.key).sort()).toEqual([FOUNDER_KEY, "@team", "mail", "pm", "site"].sort());
    expect(l.pieces.find((p) => p.key === "pm")!.basis).toBe("observed");
    expect(l.pieces.find((p) => p.key === "site")!).toMatchObject({ basis: "stated", shape: "bishop", sub: "Studio North" });
    expect(l.pieces.find((p) => p.key === "@team")!.basis).toBe("anchor");
  });

  it("routes each flow in step order, and marks what exists only in the founder's head", () => {
    const f = layoutBoard(input, fmt).flows[0]!;
    expect(f.nodes.map((n) => n.pieceKey)).toEqual(["site", FOUNDER_KEY, FOUNDER_KEY, "@team"]);
    expect(f.nodes.map((n) => n.founderOnly)).toEqual([false, true, false, false]);
    expect(f.founderOnly).toBe(1);
    expect(layoutBoard(input, fmt).flows[1]!.nodes).toEqual([]);
  });

  it("fills objective columns from measured values only", () => {
    const o = layoutBoard(input, fmt).objectives;
    expect(o.map((x) => x.id)).toEqual(["o1", "o2"]);
    expect(o[0]).toMatchObject({ level: 61 / 70, met: false, label: "Billable 70% · 61% of 70%" });
    // the owner's stated R9.5m doesn't fill the column
    expect(o[1]).toMatchObject({ level: null, met: null, label: "R9m revenue · not measured yet" });
  });
});
