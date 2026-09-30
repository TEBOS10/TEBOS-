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
  await page.getByRole("link", { name: "Maintainer queue" }).click();
  await expect(page.getByRole("heading", { name: "Maintainer queue" })).toBeVisible();
  const overdue = page.locator("section", { has: page.getByRole("heading", { name: /^Delivery overdue/ }) });
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

test("the queue shows what TEBOS noticed on each client, high first, and closing one needs a note", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  const t = fake.tables as Record<string, unknown[]>;
  t.memberships = [];
  t.platform_admins = [];
  t.platform_staff = [{ user_id: USER_ID, role: "maintainer", added_by: null, created_at: iso(-10) }];
  t.organisations = [{ id: ORG, name: "Northwind Studio", slug: "northwind", created_at: iso(-30) }];
  const item = (id: string, over: Record<string, unknown>) => ({
    id, org_id: ORG, opportunity_id: "o1", kind: "findings_waiting", subject_id: null, severity: "medium", title: "2 findings waiting for review",
    detail: "The oldest has waited 4 days.", status: "open", note: null, raised_at: iso(-1), last_seen_at: iso(0), closed_by: null, closed_at: null, ...over,
  });
  t.maintainer_items = [
    item("m1", {}),
    item("m2", { kind: "connection_broken", subject_id: "c1", severity: "high", title: "CRM is disconnected", detail: "Status: authentication required.", raised_at: iso(-0.5) }),
  ];
  await page.goto("/pipeline/queue");
  const signals = page.getByTestId("signal");
  await expect(signals).toHaveCount(2);
  await expect(signals.first()).toContainText("Northwind Studio · CRM is disconnected");
  await expect(signals.first()).toContainText("high");

  const crm = signals.first();
  await crm.getByRole("button", { name: "Close" }).click();
  await crm.getByRole("button", { name: "Done" }).click();
  await expect(crm.getByText("Say what you did")).toBeVisible();
  await crm.getByLabel("What you did, or why it doesn't need action").fill("Reconnected the CRM with the client on a call");
  await crm.getByRole("button", { name: "Done" }).click();
  await expect.poll(() => fake.writes.find((w) => w.table === "maintainer_items" && w.method === "PATCH")?.body)
    .toEqual({ status: "done", note: "Reconnected the CRM with the client on a call" });
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
