import { describe, expect, it } from "vitest";
import { BLUEPRINTS, checkBlueprint } from "../src/domain/blueprints";
import { BOARD_LIMITS, edition, editionFor, TIERS, tierOf, VARIANTS } from "../src/domain/editions";

describe("operating-system editions", () => {
  it("every industry, every kind of business, at every plan: a valid system that fits inside its plan", () => {
    for (const b of BLUEPRINTS) {
      const kinds = [undefined, ...(VARIANTS[b.key] ?? []).map((v) => v.key)];
      for (const tier of TIERS) {
        for (const kind of kinds) {
          const e = edition(b, tier, kind);
          expect(checkBlueprint(e), `${b.key}/${kind}/${tier}`).toEqual([]);
          expect(e.flows.length, `${b.key}/${kind}/${tier} flows`).toBeLessThanOrEqual(BOARD_LIMITS[tier].flows);
          expect(e.pieces.length, `${b.key}/${kind}/${tier} pieces`).toBeLessThanOrEqual(BOARD_LIMITS[tier].pieces);
        }
      }
    }
  });

  it("every industry has kinds of business to choose from, each with its own pieces", () => {
    for (const b of BLUEPRINTS) {
      const kinds = VARIANTS[b.key];
      expect(kinds?.length, b.key).toBeGreaterThanOrEqual(2);
      for (const v of kinds!) expect(v.pieces.length, `${b.key}/${v.key}`).toBeGreaterThan(0);
    }
  });

  it("each plan adds to the one below it, and never takes anything away", () => {
    const small = editionFor("education-centre", "starter", "music")!;
    const medium = editionFor("education-centre", "growth", "music")!;
    const company = editionFor("education-centre", "company", "music")!;
    expect(small.name).toBe("Education centre operating system · Music academy · Small");
    expect(small.pieces.map((x) => x.name)).toContain("Instrument and room schedule");
    expect(small.flows.map((f) => f.name)).not.toContain("Weekly numbers to decisions");
    expect(medium.flows.map((f) => f.name)).toContain("Weekly numbers to decisions");
    expect(medium.flows.map((f) => f.name)).not.toContain("Monthly leadership review");
    expect(company.flows.map((f) => f.name)).toContain("Monthly leadership review");
    for (const f of small.flows) expect(medium.flows).toContainEqual(f);
    for (const f of medium.flows) expect(company.flows).toContainEqual(f);
  });

  it("no plan, or an unknown one, gets the Small ceiling", () => {
    expect(tierOf(null)).toBe("starter");
    expect(tierOf("equity")).toBe("starter");
    expect(tierOf("growth")).toBe("growth");
    expect(editionFor("no-such-industry", "company")).toBeUndefined();
  });
});
