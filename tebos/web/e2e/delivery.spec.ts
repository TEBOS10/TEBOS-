import { expect, test } from "@playwright/test";
import { installFakeSupabase } from "./fake-supabase";
import { ORG, USER_ID } from "./fixtures";

// Client delivery: the maintainer's queue, and the client's view of their plan.
const now = Date.now();
const iso = (days: number) => new Date(now + days * 864e5).toISOString();
const step = (id: string, over: Record<string, unknown>) => ({
  id, opportunity_id: "o1", org_id: ORG, key: id, position: 1, title: "Kick-off call", done_means: "Met the owner and agreed the flows.",
  due_at: iso(2), status: "open", note: null, closed_by: null, closed_at: null, created_at: iso(-3), ...over,
});

test("a maintainer sees overdue steps first and closes one with a note of what was done", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  const t = fake.tables as Record<string, unknown[]>;
  t.memberships = [];
  t.platform_admins = [];
  t.platform_staff = [{ user_id: USER_ID, role: "maintainer", added_by: null, created_at: iso(-10) }];
  t.opportunities = [{ id: "o1", business: "Northwind Studio", plan: "starter", maintainer_id: USER_ID }];
  t.delivery_tasks = [
    step("board", { title: "Operating board mapped", due_at: iso(-1), position: 3 }),
    step("kickoff", { title: "Kick-off call", due_at: iso(2) }),
  ];
  await page.goto("/");
  await page.getByRole("link", { name: "Delivery queue" }).click();
  await expect(page.getByRole("heading", { name: "Delivery queue" })).toBeVisible();
  const overdue = page.locator("section", { has: page.getByRole("heading", { name: /^Overdue/ }) });
  await expect(overdue).toContainText("Northwind Studio · Operating board mapped");
  await expect(overdue).toContainText("overdue");

  await overdue.getByRole("button", { name: "Close step" }).click();
  await overdue.getByRole("button", { name: "Mark done" }).click();
  await expect(overdue.getByText("Say what was done")).toBeVisible(); // a note is required
  await overdue.getByLabel("What was done (or why it was skipped)").fill("Mapped sales and delivery flows with Thandi");
  await overdue.getByRole("button", { name: "Mark done" }).click();
  await expect.poll(() => fake.writes.find((w) => w.table === "delivery_tasks" && w.method === "PATCH")?.body)
    .toEqual({ status: "done", note: "Mapped sales and delivery flows with Thandi" });
});

test("a client sees the plan TEBOS owes them, read-only, on their home page", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  (fake.tables as Record<string, unknown[]>).delivery_tasks = [
    step("kickoff", { status: "done", note: "Kick-off held", closed_at: iso(-2), due_at: iso(-1) }),
    step("diagnostic", { title: "Diagnostic interview", due_at: iso(4), position: 2 }),
  ];
  await page.goto("/");
  const plan = page.getByTestId("client-delivery");
  await expect(page.getByText("1 of 2 steps done.", { exact: false })).toBeVisible();
  await expect(plan).toContainText("Done");
  await expect(plan).toContainText("Kick-off held");
  await expect(plan).toContainText("done on time");
  await expect(plan.getByRole("button", { name: "Close step" })).toHaveCount(0);
});
