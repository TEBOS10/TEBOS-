import { contrast, inkFor } from "@core/brand";
import { describe, expect, it } from "vitest";
import { COMING, isTeposPath, PORTALS } from "./portals";

describe("TEPOS portals", () => {
  it("are the founder's six, each in its own shade", () => {
    expect(PORTALS.map((p) => p.name)).toEqual(["Tidy Capital", "Tidy Enterprise", "IREKUN", "Academics", "Real Estate Job", "Forex"]);
    expect(new Set(PORTALS.map((p) => p.shade)).size).toBe(PORTALS.length);
  });

  it("every tile reads clearly: name on the shade, monogram on its accent", () => {
    for (const p of PORTALS) {
      expect(contrast(p.shade, inkFor(p.shade)), p.name).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.shade, p.accent), `${p.name} monogram`).toBeGreaterThanOrEqual(3);
    }
  });

  it("a portal not built yet says what it will hold", () => {
    for (const p of PORTALS.filter((x) => !x.built)) expect(COMING[p.key]?.holds.length, p.name).toBeGreaterThan(0);
  });

  it("knows which pages are TEPOS", () => {
    expect(isTeposPath("/tepos")).toBe(true);
    expect(isTeposPath("/tepos/capital")).toBe(true);
    expect(isTeposPath("/property/abc")).toBe(true);
    expect(isTeposPath("/")).toBe(false);
    expect(isTeposPath("/businesses")).toBe(false);
  });
});
