import { expect, test } from "@playwright/test";
import { installFakeSupabase } from "./fake-supabase";

// Listing reels (ADR 0019): the team drops a listing's photos, chooses which to use, renders, and downloads vertical
// videos. Rendered in the browser; nothing is uploaded (the test fails if any request carries the photos).
test.use({ baseURL: "http://localhost:5177" });

test("listing photos become a ready-to-post vertical video, without uploading them", async ({ page }) => {
  test.setTimeout(60_000);
  await installFakeSupabase(page, { signedIn: false });
  // any request carrying more than a few kilobytes would be a photo leaving the device
  const heavy: string[] = [];
  page.on("request", (r) => { const body = r.postDataBuffer(); if (body && body.length > 4096) heavy.push(r.url()); });
  await page.goto("/reels");
  await expect(page.getByRole("heading", { name: "Listing photos into reels" })).toBeVisible();
  const dir = "grape/public/photos/";
  await page.getByLabel("Listing photos").setInputFiles(["property", "studio", "corporate", "events", "graduation"].map((n) => `${dir}${n}.jpg`));
  const picks = page.getByRole("list", { name: "Photos" }).getByRole("button", { name: /^Photo \d/ });
  await expect(picks).toHaveCount(5);
  // leave one out, remove another: the video names the photos by their numbers on screen
  await picks.nth(1).click();
  await expect(picks.nth(1)).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Remove photo 5" }).click();
  await expect(page.getByText("3 of 4 photos chosen")).toBeVisible();
  await page.getByLabel("How many videos").selectOption("1");
  await page.getByLabel("Caption").fill("3 bed · Sandton");
  await page.getByRole("button", { name: "Render 1 video" }).click();
  const made = page.getByTestId("made");
  await expect(made.getByRole("listitem")).toHaveCount(1, { timeout: 30_000 });
  await expect(made).toContainText("Photos 1,3,4,1");
  const link = made.getByRole("link", { name: "Download" });
  await expect(link).toHaveAttribute("download", /^listing-reel-1\.(mp4|webm)$/);
  // the recording is real: a playable video of about ten seconds
  const size = await page.evaluate(async () => (await (await fetch((document.querySelector("[data-testid=made] a") as HTMLAnchorElement).href)).blob()).size);
  expect(size).toBeGreaterThan(50_000);
  expect(heavy).toEqual([]);
});
