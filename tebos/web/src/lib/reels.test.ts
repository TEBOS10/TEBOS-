import { describe, expect, it } from "vitest";
import { cameraAt, coverRect, MAX_REELS, planReels, recordingType, REEL } from "./reels";

describe("listing reels", () => {
  it("plans up to six reels, each opening on a different photo, never the same photo twice in a row", () => {
    const plans = planReels(8);
    expect(plans).toHaveLength(MAX_REELS);
    expect(new Set(plans.map((p) => p.shots[0]!.photo)).size).toBe(6);
    for (const p of plans) {
      expect(p.shots).toHaveLength(4);
      p.shots.forEach((s, i) => { if (i) expect(s.photo).not.toBe(p.shots[i - 1]!.photo); });
    }
    expect(plans[0]!.label).toBe("1,2,3,4");
  });

  it("works with one or two photos, and with none plans nothing", () => {
    expect(planReels(0)).toEqual([]);
    expect(planReels(1, 2).every((p) => p.shots.every((s) => s.photo === 0))).toBe(true);
    const two = planReels(2, 1)[0]!.shots.map((s) => s.photo);
    two.forEach((p, i) => { if (i) expect(p).not.toBe(two[i - 1]); });
    expect(planReels(5, 20)).toHaveLength(MAX_REELS);
  });

  it("moves the camera smoothly and never shows the photo's edge", () => {
    expect(cameraAt("push_in", 0).zoom).toBeLessThan(cameraAt("push_in", 1).zoom);
    expect(cameraAt("pan_left", 0).dx).toBeGreaterThan(cameraAt("pan_left", 1).dx);
    for (const move of ["push_in", "pull_out", "pan_left", "pan_right", "rise"] as const) {
      for (const t of [0, 0.3, 0.7, 1]) {
        // a landscape listing photo in a portrait frame
        const r = coverRect(6000, 4000, REEL.width, REEL.height, cameraAt(move, t));
        expect(r.x).toBeLessThanOrEqual(0.001);
        expect(r.y).toBeLessThanOrEqual(0.001);
        expect(r.x + r.w).toBeGreaterThanOrEqual(REEL.width - 0.001);
        expect(r.y + r.h).toBeGreaterThanOrEqual(REEL.height - 0.001);
      }
    }
  });

  it("records MP4 when the browser can, else WebM, else says it can't", () => {
    expect(recordingType((t) => t.startsWith("video/mp4"))).toEqual({ mime: "video/mp4;codecs=avc1", ext: "mp4" });
    expect(recordingType((t) => t === "video/webm")).toEqual({ mime: "video/webm", ext: "webm" });
    expect(recordingType(() => false)).toBeNull();
  });
});
