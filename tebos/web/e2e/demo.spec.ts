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

test("the operating board shows objectives, pieces and flows, and measures only from a connected system", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/demo");
  await expect(page.getByRole("note", { name: "Demo" })).toBeVisible();
  await page.goto("/businesses/d2000000-0000-4000-8000-000000000001");
  await page.getByRole("link", { name: "Operating board", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Operating board" })).toBeVisible();

  const summary = page.getByTestId("board-summary");
  await expect(summary).toContainText("3Active objectives");
  await expect(summary).toContainText("Founder-only steps");

  const billable = page.getByTestId("objective").filter({ hasText: "At least 70% of hours billable" });
  await expect(billable.getByTestId("objective-progress")).toContainText("Measured: 61%");
  await expect(billable.getByTestId("objective-progress")).toContainText("9% to go");
  await expect(billable.getByRole("button", { name: "Mark achieved" })).toBeDisabled();

  const concentration = page.getByTestId("objective").filter({ hasText: "No client above 30% of revenue" });
  await expect(concentration.getByTestId("objective-progress")).toContainText("Owner says 45%, which doesn't count toward the target");

  const revenue = page.getByTestId("objective").filter({ hasText: "R9m revenue this year" });
  await expect(revenue.getByTestId("objective-progress")).toContainText("Not measured yet");

  const lead = page.locator(".card").filter({ has: page.getByRole("heading", { name: "Lead to onboarded client" }) });
  await expect(lead.getByTestId("flow-dependency")).toContainText("4 of 6 steps need the founder · 4 exist only in the founder's head");
  await expect(lead.getByTestId("flow-step")).toHaveCount(6);
  await expect(page.getByTestId("pieces")).toContainText("Studio North (web studio)");
  await snap(page, "demo-6-board");

  // writing down a founder step moves it out of the founder's head
  await lead.getByRole("checkbox", { name: "Scope and price the work is written down" }).click();
  await expect(lead.getByTestId("flow-dependency")).toContainText("3 exist only in the founder's head");

  // add a step: an automation needs a tool
  await lead.getByLabel("Step 7").fill("Send the welcome pack");
  await lead.getByLabel("Who does it").selectOption("automation");
  await expect(lead.getByRole("button", { name: "Add step" })).toBeDisabled();
  await lead.getByLabel("Tool").selectOption({ label: "Email inbox" });
  await lead.getByRole("button", { name: "Add step" }).click();
  await expect(lead.getByTestId("flow-step")).toHaveCount(7);

  // a measurement is read from the platform's evidence, never typed
  await billable.getByRole("button", { name: "Measure from a connected system" }).click();
  await expect(billable.getByLabel("Reading")).toContainText("billable_pct = 61");
  await expect(billable.locator("input[type=number]")).toHaveCount(0);

  expect(errors).toEqual([]);
});

test("the tour plays without an account, can be paused and jumped, and leads to the demo", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/tour");
  await expect(page.getByRole("heading", { name: /See how TEBOS helps a business/ })).toBeVisible();
  await expect(page.getByText("Busy agency, shrinking margin")).toBeVisible();
  await expect(page.getByText("Illustrative example · fictional agency")).toBeVisible();

  await page.getByRole("tab", { name: "Step 4 · Find" }).click();
  await expect(page.getByText("Extra work is done but not billed")).toBeVisible();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.waitForTimeout(8500);
  await expect(page.getByText("Extra work is done but not billed")).toBeVisible(); // paused: still on this scene
  await page.getByRole("button", { name: "Play", exact: true }).click();

  await page.getByRole("link", { name: "Try the demo" }).click();
  await expect(page.getByRole("note", { name: "Demo" })).toBeVisible();
  expect(errors).toEqual([]);
});
