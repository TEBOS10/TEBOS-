# ADR 0019: Listing reels for Grape Studios

Date: 2026-11-01 · Status: built.

## Context

The founder shared a short video of a tool for property photographers: drop the listing's photos, tick the ones to
use, click render, and get six vertical videos ready to post, each moving through the rooms. They asked to "add this
feature into Grape Studios". Property listing is one of Grape's six categories.

## Decision

1. **A page on Grape's own site, `/reels`, for the team.**
   - Drop up to 30 photos.
   - Choose which to use (tick or remove), set how many videos (1 to 6) and an optional caption.
   - Render.
   - Each video is 9:16 at 1080 by 1920 and 10 seconds long: four photos, a different camera move on each (a push in,
     a pull out, a pan across, a rise), with cross-fades.
   - The caption and "GRAPE STUDIOS" sit at the foot.
   - The six videos open on different photos and don't repeat a photo back to back.
   - Each can be watched and downloaded. The download is MP4 (H.264) where the browser can record it, otherwise WebM.
2. **In the browser, never uploaded.** The videos are drawn on a canvas and recorded with the browser's own recorder.
   The photos never leave the device, and nothing is paid for. The end-to-end test fails if any request carries more
   than a few kilobytes.
3. **Honest about the motion.** The moves are pans and zooms across the stills. The tool in the founder's video
   appears to generate depth (the camera moving through the room). That needs an AI video provider, which is the
   founder's decision on spend and data (ADR 0015, decision 34), and the page says so.

Code: `web/src/lib/reels.ts` (planning and geometry, with unit tests) and `web/src/grape/Reels.tsx` (the page).
Tests: `e2e/reels.spec.ts` (a real render in Chromium, checking that a video comes out), and the site check covers
the page.

## Not done

- Music. Instagram adds it when posting; licensed tracks are a cost and a rights question.
- Generated depth motion (see 3).
- Linking `/reels` from the public menu. It's a team tool, reached by its address.
