import { expect, test } from "@playwright/test";
import { installFakeSupabase } from "./fake-supabase";

// The home page's 3D board. Headless Chromium only offers WebGL through its
// software renderer, so it is switched on for this file.
test.use({
  launchOptions: {
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  },
});
// Two software-rendered 3D scenes at once starve each other's CPU; run this file's tests one after the other.
test.describe.configure({ mode: "serial" });

test("the home page tells the seven stages on a live 3D board, and as plain cards with reduced motion", async ({ page, browser }) => {
  test.setTimeout(60_000);
  await installFakeSupabase(page, { signedIn: false });
  await page.goto("/?force3d");
  // the 3D scene is a lazily loaded chunk: under a busy test run it can take longer than the default 5s to appear
  await expect(page.locator(".bw-canvas canvas")).toHaveCount(1, { timeout: 30_000 });
  await expect(page.getByText("Illustrative board · fictional business")).toBeAttached();
  for (const stage of ["Assess", "Map", "Architect", "Integrate", "Automate", "Govern", "Optimise"]) {
    await expect(page.getByTestId(`stage-${stage}`).getByRole("heading", { name: stage })).toBeAttached();
  }
  await page.getByTestId("stage-Govern").scrollIntoViewIfNeeded();
  await expect(page.getByTestId("stage-Govern")).toHaveClass(/is-active/);

  const calm = await browser.newPage({ reducedMotion: "reduce" });
  await installFakeSupabase(calm, { signedIn: false });
  await calm.goto("/?force3d");
  await expect(calm.getByRole("heading", { name: /A business that runs on structure/ })).toBeVisible();
  await expect(calm.locator("canvas")).toHaveCount(0);
  await expect(calm.getByRole("heading", { name: "From diagnosis to an operating system, in seven stages" })).toBeVisible();
  await calm.close();
});

test("a client's board is drawn in 3D from its own records, one flow at a time", async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await page.goto("/demo");
  await expect(page.getByRole("note", { name: "Demo" })).toBeVisible();
  await page.goto("/businesses/d2000000-0000-4000-8000-000000000001/board?force3d");
  const card = page.locator(".cb-card");
  await expect(card.getByRole("heading", { name: "The board in 3D" })).toBeVisible();
  await expect(card.getByTestId("board-3d").locator("canvas")).toHaveCount(1, { timeout: 20_000 });
  // labels come from the records: pieces, the founder, and objectives with their measured values
  await expect(card.getByText("Studio North (web studio)", { exact: false })).toBeAttached();
  await expect(card.getByText("Founder", { exact: true })).toBeAttached();
  await expect(card.getByText("61% of 70%")).toBeAttached();
  await expect(card.getByText("not measured yet")).toBeAttached();
  // follow one flow
  const lead = card.getByRole("button", { name: /Lead to onboarded client · 4 founder-only/ });
  await lead.click();
  await expect(lead).toHaveAttribute("aria-pressed", "true");
  await card.getByRole("button", { name: "All flows" }).click();
  await expect(card.getByRole("button", { name: "All flows" })).toHaveAttribute("aria-pressed", "true");
  // and it can be put away
  await card.getByRole("button", { name: "Hide" }).click();
  await expect(card.getByTestId("board-3d")).toHaveCount(0);
  expect(errors).toEqual([]);
});
