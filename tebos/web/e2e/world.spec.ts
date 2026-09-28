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

test("the home page tells the seven stages on a live 3D board, and as plain cards with reduced motion", async ({ page, browser }) => {
  test.setTimeout(60_000);
  await installFakeSupabase(page, { signedIn: false });
  await page.goto("/");
  await expect(page.locator(".bw-canvas canvas")).toHaveCount(1);
  await expect(page.getByText("Illustrative board · fictional business")).toBeAttached();
  for (const stage of ["Assess", "Map", "Architect", "Integrate", "Automate", "Govern", "Optimise"]) {
    await expect(page.getByTestId(`stage-${stage}`).getByRole("heading", { name: stage })).toBeAttached();
  }
  await page.getByTestId("stage-Govern").scrollIntoViewIfNeeded();
  await expect(page.getByTestId("stage-Govern")).toHaveClass(/is-active/);

  const calm = await browser.newPage({ reducedMotion: "reduce" });
  await installFakeSupabase(calm, { signedIn: false });
  await calm.goto("/");
  await expect(calm.getByRole("heading", { name: /A business that runs on structure/ })).toBeVisible();
  await expect(calm.locator("canvas")).toHaveCount(0);
  await expect(calm.getByRole("heading", { name: "From diagnosis to an operating system, in seven stages" })).toBeVisible();
  await calm.close();
});
