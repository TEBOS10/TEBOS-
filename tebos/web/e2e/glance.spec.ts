import { expect, test } from "@playwright/test";
import { installFakeSupabase } from "./fake-supabase";
import { seedBoard } from "./board-seed";

// The home screen pictures each business from its own records: the 3D board,
// a gauge per objective and a trend line of its readings.

test("home shows each business as its 3D board with gauges from its measured readings", async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const fake = await installFakeSupabase(page);
  seedBoard(fake.tables as unknown as Record<string, unknown[]>);
  await page.goto("/?force3d");
  const card = page.getByTestId("business-glance").getByRole("article").first();
  // the same 3D chessboard as the board page, open on the first business
  await expect(card.getByTestId("board-3d").locator("canvas")).toHaveCount(1, { timeout: 20_000 });
  await expect(card.getByText("1 founder-only steps")).toBeVisible();
  // 26 of 40 measured: 65%, with a trend line through both readings
  await expect(card.getByRole("img", { name: "Orders a month: 65% of the way to the target" })).toBeVisible();
  await expect(card.getByTestId("glance-gauge").first()).toContainText("26 of 40");
  await expect(card.getByRole("img", { name: "2 readings" })).toBeVisible();
  // what the owner said doesn't fill a gauge
  await expect(card.getByRole("img", { name: "Founder hours a week: not measured yet" })).toBeVisible();
  await card.getByRole("button", { name: "Hide the board" }).click();
  await expect(card.getByTestId("board-3d")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("a business with nothing mapped or measured says so instead of drawing anything", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  fake.tables.objectives = [];
  fake.tables.board_components = [];
  fake.tables.board_flows = [];
  await page.goto("/");
  const glance = page.getByTestId("business-glance");
  await expect(glance.getByText("No board mapped yet.")).toBeVisible();
  await expect(glance.getByText("No objectives yet, so there's nothing to measure.")).toBeVisible();
  await expect(glance.getByTestId("glance-gauge")).toHaveCount(0);
  await expect(glance.getByText("no readings yet")).toBeVisible();
});
