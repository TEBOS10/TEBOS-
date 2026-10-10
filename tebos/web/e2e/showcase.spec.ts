import { expect, test } from "@playwright/test";
import { installFakeSupabase } from "./fake-supabase";

// What TEBOS does: category rows of plays, each one played step by step, and
// each honest about whether TEBOS runs it today.

test("the showcase plays a card from the problem to the result", async ({ page }) => {
  await installFakeSupabase(page);
  await page.clock.install();
  await page.goto("/showcase");
  await expect(page.getByRole("heading", { name: "See it working, one problem at a time" })).toBeVisible();
  await expect(page.getByTestId("showcase-row")).toHaveCount(8);
  await expect(page.getByRole("heading", { name: "Money in and out" })).toBeVisible();

  await page.getByTestId("showcase-card").filter({ hasText: "Monthly invoices that send themselves" }).click();
  const player = page.getByRole("dialog", { name: "Monthly invoices that send themselves" });
  await expect(player).toContainText("Illustration");
  await expect(player).toContainText("TEBOS designs it; your team runs it");
  const steps = player.getByTestId("showcase-steps").locator("li");
  const n = await steps.count();
  expect(n).toBeGreaterThanOrEqual(3);
  // the problem first: every step still to come
  await expect(steps.first()).toHaveAttribute("data-state", "next");
  await page.clock.runFor(2700);
  await expect(steps.first()).toHaveAttribute("data-state", "now");
  // then each step in turn, all the way to the result
  for (let i = 1; i <= n; i++) {
    await page.clock.runFor(2700);
    await expect(steps.nth(i - 1)).toHaveAttribute("data-state", "done");
  }
  await expect(steps.last()).toHaveAttribute("data-state", "done");
  await expect(player.getByTestId("showcase-after")).toHaveClass(/sx-after-on/);
  await expect(player.getByRole("button", { name: "Replay" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(player).toHaveCount(0);
});

test("a card that runs today links to where it can be tried", async ({ page }) => {
  await installFakeSupabase(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/pricing");
  await page.getByRole("navigation", { name: "Site" }).getByRole("link", { name: "What TEBOS does" }).click();
  await expect(page).toHaveURL(/\/showcase$/);
  await page.getByTestId("showcase-card").filter({ hasText: "Runs in TEBOS today" }).first().click();
  const player = page.getByRole("dialog");
  // reduced motion: the whole play shows at once
  await expect(player.getByTestId("showcase-after")).toHaveClass(/sx-after-on/);
  await expect(player).toContainText("Runs in TEBOS today");
  await expect(player.getByRole("link")).toHaveAttribute("href", /^\/(systems|demo)?$/);
});
