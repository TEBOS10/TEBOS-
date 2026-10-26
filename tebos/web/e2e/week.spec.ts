import { expect, test } from "@playwright/test";
import { installFakeSupabase, verifiedFactor } from "./fake-supabase";
import { USER_ID } from "./fixtures";

// The week board is TEPOS's first view: today's scene, the next action, the checklist with what "done" means, the
// seven scenes and the three lenses. Nothing is ticked for the founder; reasons and dates go with blocked work.

const TEPOS = "http://localhost:5175";
const IREKUN = "f1000000-0000-4000-8000-000000000003";
const now = () => new Date().toISOString();

test.use({ reducedMotion: "reduce" });

async function founder(page: import("@playwright/test").Page, at = "2026-10-26T12:30:00+02:00") {
  await page.clock.setFixedTime(new Date(at));
  const fake = await installFakeSupabase(page, { aal: "aal2", factors: [verifiedFactor()] });
  const t = fake.tables as unknown as Record<string, Record<string, unknown>[]>;
  t.organisations!.push({ id: IREKUN, name: "IREKUN", slug: "irekun", private: true, created_at: now() });
  t.memberships!.push({ org_id: IREKUN, user_id: USER_ID, role: "org_admin", created_at: now() });
  t.res_money_items = [];
  t.agent_contacts = [];
  return fake;
}

test("opens on Monday 26 October 2026: the week starts now, nothing earlier is marked done", async ({ page }) => {
  const fake = await founder(page);
  await page.goto(`${TEPOS}/`);
  await expect(page.getByTestId("week-today")).toHaveText("Monday, 26 October 2026");
  await expect(page.getByTestId("week-starts-now")).toBeVisible();
  await expect(page.getByText("Scene 1:")).toContainText("Build the pipeline");
  await expect(page.getByTestId("next-action")).toContainText("Review what's left today");
  // Monday's Start-now queue, none of it done
  const tasks = page.getByTestId("week-task");
  await expect(tasks).toHaveCount(5);
  await expect(page.getByTestId("week-tasks").getByRole("button", { name: "Done", pressed: true })).toHaveCount(0);
  // seven scenes
  await expect(page.getByTestId("week-scenes").getByRole("button")).toHaveCount(7);
  await expect(page.getByTestId("scene-7")).toContainText("Reset and prepare");
  // the plan was laid down once and the week opened once, however often it is asked
  expect(fake.writes.filter((w) => w.method === "RPC" && w.table === "tepos_open_week").length).toBeGreaterThan(0);
  const t = fake.tables as unknown as Record<string, unknown[]>;
  expect(t.tepos_plan_days).toHaveLength(7);
  expect(t.tepos_weeks).toHaveLength(1);
  expect(t.tepos_week_tasks).toHaveLength(24);

  // reloading doesn't seed or open a second copy
  await page.reload();
  await expect(page.getByTestId("week-task")).toHaveCount(5);
  expect(t.tepos_plan_days).toHaveLength(7);
  expect(t.tepos_week_tasks).toHaveLength(24);
  expect(t.tepos_weeks).toHaveLength(1);
});

test("marking done, and blocking with a reason and a new date", async ({ page }) => {
  const fake = await founder(page);
  await page.goto(`${TEPOS}/`);
  const first = page.getByTestId("week-task").first();
  await first.getByRole("button", { name: "Done" }).click();
  await expect(first.getByRole("button", { name: "Done" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("next-action")).toContainText("Pick the two highest-value next actions");

  const second = page.getByTestId("week-task").nth(1);
  await second.getByRole("button", { name: "Blocked" }).click();
  await second.getByLabel("Why is it blocked?").fill("Waiting for the principal's go-ahead");
  await second.getByLabel("New date (optional)").fill("2026-10-27");
  await second.getByLabel("Who unblocks it (optional)").fill("Principal");
  await second.getByRole("button", { name: "Save" }).click();
  await expect(second.getByTestId("task-reason")).toContainText("Blocked: Waiting for the principal's go-ahead");
  const patch = fake.writes.filter((w) => w.method === "PATCH" && w.table === "tepos_week_tasks").at(-1)!.body as Record<string, unknown>;
  expect(patch).toMatchObject({ status: "blocked", status_reason: "Waiting for the principal's go-ahead", defer_until: "2026-10-27", owner_label: "Principal" });
  // the blocked task isn't the next action
  await expect(page.getByTestId("next-action")).toContainText("Advance the live leads");

  // it persists: the page reads it back after a reload
  await page.reload();
  await expect(page.getByTestId("week-task").nth(1).getByTestId("task-reason")).toContainText("Waiting for the principal's go-ahead");
});

test("on Tuesday, Monday's unfinished work is still there; the day closes; the lenses keep commission apart from cash", async ({ page }) => {
  const fake = await founder(page);
  await page.goto(`${TEPOS}/`);
  await expect(page.getByTestId("week-task")).toHaveCount(5);
  // a day later
  await page.clock.setFixedTime(new Date("2026-10-27T09:00:00+02:00"));
  await page.reload();
  await expect(page.getByTestId("week-today")).toHaveText("Tuesday, 27 October 2026");
  await expect(page.getByTestId("week-task")).toHaveCount(3 + 5);
  await expect(page.getByTestId("week-task").nth(0)).toContainText("Prospect and follow up");
  await expect(page.getByTestId("week-task").nth(3)).toContainText("From Monday: still open until you say what happened");

  await page.getByTestId("day-close").getByLabel("Outcomes").fill("Two viewings booked");
  await page.getByTestId("day-close").getByRole("button", { name: "Save the day's close" }).click();
  await expect(page.getByTestId("day-close").getByRole("status")).toHaveText("Saved.");
  expect(fake.writes.some((w) => w.method === "PATCH" && w.table === "tepos_week_days")).toBe(true);

  await expect(page.getByTestId("lens-income")).toContainText("Expected commission entries (not cash)");
  await expect(page.getByTestId("lens-income")).toContainText("Cash received this week");
  await expect(page.getByTestId("lens-income")).toContainText("not tracked here");
});

test("on a phone, the board fits the screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await founder(page);
  await page.goto(`${TEPOS}/`);
  await expect(page.getByTestId("week-board")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(page.getByTestId("week-task").first().getByRole("button", { name: "In progress" })).toBeVisible();
});
