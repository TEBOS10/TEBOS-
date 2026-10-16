import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkBrand, contrast, DARK_INK, inkFor, LIGHT_INK, RELATIONSHIPS } from "../src/domain/brand";

describe("brand colours", () => {
  it("accepts lower-case hex and refuses anything else", () => {
    expect(checkBrand({ primary: "#111111", accent: "#c9a227" }).ok).toBe(true);
    expect(checkBrand({ primary: "#FFF" }).ok).toBe(false);
    expect(checkBrand({ accent: "gold" }).ok).toBe(false);
    expect(checkBrand({ surface: "#C9A227" }).ok).toBe(false);
  });

  it("contrast follows WCAG", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#777777", "#777777")).toBe(1);
  });

  it("picks the readable ink for every tile", () => {
    expect(inkFor("#111111")).toBe(LIGHT_INK);
    expect(inkFor("#ffffff")).toBe(DARK_INK);
    expect(inkFor("#f6efe4")).toBe(DARK_INK);
    for (const bg of ["#111111", "#a4522d", "#ffffff", "#0f1410", "#f6efe4", "#f2665e", "#3b2a1e", "#8a6a4f", "#d9c4a5"]) {
      expect(contrast(bg, inkFor(bg)), bg).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("relationships match the migration", () => {
    const sql = readFileSync(join(__dirname, "../supabase/migrations/20261017140000_business_brand.sql"), "utf8");
    const m = sql.match(/relationship in \(([^)]*)\)/);
    expect(m![1]!.split(",").map((s) => s.trim().replace(/'/g, "")).sort()).toEqual(Object.keys(RELATIONSHIPS).sort());
  });
});
