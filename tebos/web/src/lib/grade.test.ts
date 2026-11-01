import { describe, expect, it } from "vitest";
import { applyLook, channelStats, matchReference } from "./grade";

const img = (...rgb: Array<[number, number, number]>) => new Uint8ClampedArray(rgb.flatMap(([r, g, b]) => [r, g, b, 255]));
const lum = (px: Uint8ClampedArray) => { let s = 0; for (let i = 0; i < px.length; i += 4) s += 0.299 * px[i]! + 0.587 * px[i + 1]! + 0.114 * px[i + 2]!; return s / (px.length / 4); };

describe("the in-browser grade", () => {
  it("night is darker and bluer; day is brighter; original is untouched", () => {
    const base = img([120, 140, 110], [200, 180, 160], [40, 60, 50]);
    const night = applyLook(new Uint8ClampedArray(base), "night");
    expect(lum(night)).toBeLessThan(lum(base) * 0.6);
    expect(night[2]!).toBeGreaterThan(night[0]!);
    expect(lum(applyLook(new Uint8ClampedArray(base), "day"))).toBeGreaterThan(lum(base));
    expect([...applyLook(new Uint8ClampedArray(base), "original")]).toEqual([...base]);
  });

  it("night keeps the brightest points as lights", () => {
    const night = applyLook(img([255, 255, 255], [128, 128, 128]), "night");
    expect(night[0]!).toBeGreaterThan(200);
    expect(night[4]!).toBeLessThan(60);
  });

  it("matching a reference takes on its average colour and spread", () => {
    const ref = channelStats(img([200, 120, 60], [220, 140, 80], [180, 100, 40]));
    const out = matchReference(img([20, 40, 200], [60, 80, 240], [40, 60, 220]), ref);
    const got = channelStats(out);
    for (let c = 0; c < 3; c++) {
      expect(Math.abs(got.mean[c]! - ref.mean[c]!)).toBeLessThan(1.5);
      expect(Math.abs(got.sd[c]! - ref.sd[c]!)).toBeLessThan(1.5);
    }
  });

  it("strength 0 changes nothing, and transparent pixels don't count", () => {
    const base = img([10, 20, 30], [40, 50, 60]);
    expect([...matchReference(new Uint8ClampedArray(base), channelStats(img([200, 200, 200])), 0)]).toEqual([...base]);
    const withHole = new Uint8ClampedArray([...img([100, 100, 100]), 0, 0, 0, 0]);
    expect(channelStats(withHole).mean).toEqual([100, 100, 100]);
  });
});
