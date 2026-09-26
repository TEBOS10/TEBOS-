import { expect, test, type Page } from "@playwright/test";

// The public demo: the real interface on a fictional agency, answered in the
// browser. It must work with no backend at all, and say it is a demo.
const shots = process.env.SCREENSHOT_DIR;
const snap = async (page: Page, name: string) => {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
};

test.beforeEach(async ({ page }) => {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  // Nothing in the demo may reach a real service.
  await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
});

test("the demo opens without an account, says it is fictional, and walks through evidence to approval", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/demo");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("note", { name: "Demo" })).toContainText("Brightline Creative is a fictional agency");
  await snap(page, "demo-1-home");

  await page.getByRole("link", { name: "See what TEBOS knows about the agency" }).click();
  await expect(page.getByRole("heading", { name: "Brightline Creative" })).toBeVisible();
  await expect(page.getByText("Live operations")).toBeVisible();
  await expect(page.getByText("38 change requests were logged in the last 30 days; 5 of them were billed.")).toBeVisible();
  await snap(page, "demo-2-business");

  await page.getByRole("link", { name: "Open a finding and check its evidence" }).click();
  await page.getByRole("link", { name: /Out-of-scope work is delivered but mostly not billed/ }).first().click();
  await expect(page.getByText("38 change requests were logged in the last 30 days; 5 of them were billed.")).toBeVisible();
  await expect(page.getByText(/Most of the time we just do it/).first()).toBeVisible();
  await snap(page, "demo-3-finding");

  await page.getByRole("link", { name: "Approve the change your ops lead proposed" }).click();
  await page.getByRole("link", { name: /Quote every change request/ }).first().click();
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Approved", { exact: false }).first()).toBeVisible();
  await snap(page, "demo-4-approved");

  await page.goto("/interviews/d4000000-0000-4000-8000-000000000001");
  await expect(page.getByText("Interviewer (AI)").first()).toBeVisible();
  await snap(page, "demo-5-interview");

  expect(errors).toEqual([]);

  await page.getByRole("button", { name: "Leave demo" }).first().click();
  await expect(page.getByRole("link", { name: "Try the demo" })).toBeVisible({ timeout: 10_000 });
});
