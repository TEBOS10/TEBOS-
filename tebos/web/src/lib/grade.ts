// Grape Studios concept (ADR 0015): the editing a browser can honestly do on its own, on the visitor's own photos,
// without sending them anywhere. A colour grade ("day", "golden hour", "night") and matching a reference photo's
// colours (Reinhard colour transfer, per channel). The premium AI edits (a true relight from day to night, retouching,
// photo-to-video with generated motion) need an AI provider and are not claimed here.

export type Look = "original" | "day" | "golden" | "night";

export const LOOK_LABEL: Record<Look, string> = { original: "Original", day: "Bright day", golden: "Golden hour", night: "Night" };

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** Grades RGBA pixels in place. */
export function applyLook(px: Uint8ClampedArray, look: Look): Uint8ClampedArray {
  if (look === "original") return px;
  for (let i = 0; i < px.length; i += 4) {
    let r = px[i]!, g = px[i + 1]!, b = px[i + 2]!;
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    if (look === "day") {
      // lift and open up: brighter, a touch more colour, slightly cool highlights
      r = l + (r - l) * 1.15 + 14; g = l + (g - l) * 1.15 + 14; b = l + (b - l) * 1.15 + 20;
    } else if (look === "golden") {
      // warm, soft contrast
      r = r * 1.08 + 18; g = g * 1.0 + 6; b = b * 0.82;
    } else {
      // night: darker, desaturated, blue shadows, the brightest points kept as lights
      const lights = l > 238 ? (l - 238) / 17 : 0;
      const dark = 0.38 + 0.62 * lights;
      r = (l * 0.6 + r * 0.4) * dark * 0.85;
      g = (l * 0.6 + g * 0.4) * dark * 0.95;
      b = (l * 0.6 + b * 0.4) * dark * 1.25 + 10;
    }
    px[i] = clamp(r); px[i + 1] = clamp(g); px[i + 2] = clamp(b);
  }
  return px;
}

export interface ChannelStats { mean: [number, number, number]; sd: [number, number, number] }

/** Mean and spread of each colour channel, ignoring transparent pixels. */
export function channelStats(px: Uint8ClampedArray): ChannelStats {
  const sum = [0, 0, 0], sq = [0, 0, 0];
  let n = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue;
    for (let c = 0; c < 3; c++) { const v = px[i + c]!; sum[c]! += v; sq[c]! += v * v; }
    n++;
  }
  if (n === 0) return { mean: [0, 0, 0], sd: [0, 0, 0] };
  const mean = sum.map((s) => s / n) as [number, number, number];
  const sd = sq.map((s, c) => Math.sqrt(Math.max(0, s / n - mean[c]! ** 2))) as [number, number, number];
  return { mean, sd };
}

/** Moves a photo's colours toward a reference's: same average and spread per channel. `strength` 0..1. */
export function matchReference(px: Uint8ClampedArray, ref: ChannelStats, strength = 1): Uint8ClampedArray {
  const src = channelStats(px);
  const k = Math.min(1, Math.max(0, strength));
  for (let i = 0; i < px.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const v = px[i + c]!;
      const scale = src.sd[c]! > 1e-6 ? ref.sd[c]! / src.sd[c]! : 1;
      const moved = (v - src.mean[c]!) * scale + ref.mean[c]!;
      px[i + c] = clamp(v + (moved - v) * k);
    }
  }
  return px;
}
