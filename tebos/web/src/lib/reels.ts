// Listing reels: property photos into short vertical videos, ready to post (Grape Studios, ADR 0019).
// Everything here is planning and geometry; the rendering happens on a canvas in the browser, so the photos never
// leave the device and nothing is paid for. The camera moves are 2D (a push in, a pull out, a pan across, a rise),
// not generated depth: that would need an AI video provider, which is the founder's decision (ADR 0015).

export const REEL = { width: 1080, height: 1920, fps: 30 } as const;
export const SHOT_MS = 2500;
export const FADE_MS = 400;
export const MAX_REELS = 6;
export const SHOTS_PER_REEL = 4;

export type Move = "push_in" | "pull_out" | "pan_left" | "pan_right" | "rise";
export const MOVES: Move[] = ["push_in", "pan_right", "pull_out", "pan_left", "rise"];

export interface Shot { photo: number; move: Move }
export interface ReelPlan { shots: Shot[]; label: string }

/** Up to `count` reels from `photos` photos: each reel opens on a different photo and moves differently, so the
 *  set doesn't repeat itself. With fewer photos than shots, photos repeat within a reel but never back to back. */
export function planReels(photos: number, count = MAX_REELS, shotsPerReel = SHOTS_PER_REEL): ReelPlan[] {
  if (photos < 1) return [];
  const n = Math.max(1, Math.min(count, MAX_REELS));
  const reels: ReelPlan[] = [];
  for (let r = 0; r < n; r++) {
    const shots: Shot[] = [];
    // walk the photos from a different start each reel, stepping by a stride that changes with the reel
    const stride = photos > 2 ? 1 + (r % (photos - 1)) : 1;
    for (let s = 0; s < shotsPerReel; s++) {
      let photo = (r + s * stride) % photos;
      if (photos > 1 && shots.length && shots[shots.length - 1]!.photo === photo) photo = (photo + 1) % photos;
      shots.push({ photo, move: MOVES[(r + s) % MOVES.length]! });
    }
    reels.push({ shots, label: shots.map((x) => x.photo + 1).join(",") });
  }
  return reels;
}

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/** Where the camera is at `t` (0 to 1) through a shot: a zoom and an offset, as fractions of the frame. */
export function cameraAt(move: Move, t: number): { zoom: number; dx: number; dy: number } {
  const k = ease(Math.min(1, Math.max(0, t)));
  switch (move) {
    case "push_in": return { zoom: 1.08 + 0.14 * k, dx: 0, dy: 0 };
    case "pull_out": return { zoom: 1.22 - 0.14 * k, dx: 0, dy: 0 };
    case "pan_left": return { zoom: 1.18, dx: 0.06 - 0.12 * k, dy: 0 };
    case "pan_right": return { zoom: 1.18, dx: -0.06 + 0.12 * k, dy: 0 };
    case "rise": return { zoom: 1.16, dx: 0, dy: 0.05 - 0.1 * k };
  }
}

/** The rectangle to draw a photo into so it covers the frame, zoomed and shifted, never showing an edge. */
export function coverRect(imgW: number, imgH: number, frameW: number, frameH: number, cam: { zoom: number; dx: number; dy: number }) {
  const s = Math.max(frameW / imgW, frameH / imgH) * cam.zoom;
  const w = imgW * s, h = imgH * s;
  // the most the photo can move before an edge shows
  const maxX = (w - frameW) / 2, maxY = (h - frameH) / 2;
  const x = (frameW - w) / 2 + Math.max(-maxX, Math.min(maxX, cam.dx * frameW));
  const y = (frameH - h) / 2 + Math.max(-maxY, Math.min(maxY, cam.dy * frameH));
  return { x, y, w, h };
}

/** The video format the browser can record, preferring MP4 (what Instagram takes) over WebM. */
export function recordingType(supported: (t: string) => boolean): { mime: string; ext: "mp4" | "webm" } | null {
  for (const mime of ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"]) {
    if (supported(mime)) return { mime, ext: mime.startsWith("video/mp4") ? "mp4" : "webm" };
  }
  return null;
}
