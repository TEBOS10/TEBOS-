import { expect, test } from "@playwright/test";
import { installFakeSupabase } from "./fake-supabase";
import { ORG, USER_ID } from "./fixtures";

// REEDS from a phone: ask TEBOS, watch it work, read the checked report. The
// fake backend stands in for the worker; the rules that only verified work
// completes are tested against real Postgres (core: 99zb, reeds-pg).

test.use({ viewport: { width: 390, height: 844 } });

const now = () => new Date().toISOString();

test("ask from a phone, follow the request, and read a report built from checked figures", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  await page.goto("/reeds");
  await expect(page.getByRole("heading", { name: "Ask TEBOS" })).toBeVisible();
  await page.getByLabel(/What needs my attention today\?/).check();
  await page.getByLabel("Note (optional)").fill("before the Monday meeting");
  await page.getByRole("button", { name: "Ask TEBOS" }).click();

  await expect.poll(() => fake.writes.find((w) => w.table === "work_requests" && w.method === "POST")?.body)
    .toEqual({ org_id: ORG, kind: "attention_today", note: "before the Monday meeting", status: "received" });
  await expect(page).toHaveURL(/\/reeds\/[0-9a-f-]+$/);
  await expect(page.getByTestId("reeds-working")).toBeVisible();
  // no page width lost to sideways scrolling on a phone
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  // the worker plans, runs and verifies; the page picks it up by itself
  const req = fake.tables.work_requests!.at(-1)!;
  fake.tables.work_tasks = [
    { id: "t1", request_id: req.id, org_id: ORG, position: 1, key: "approvals.pending", title: "Approvals waiting for a decision", executor: "count.approvals_pending",
      acceptance: "Count this organisation's pending approvals. The verifier recounts independently.", input: {}, status: "verified", attempts: 1, max_attempts: 3,
      result: { available: true, count: 2, ids: ["a", "b"] }, verification: { ok: true, recount: 2, detail: "Recounted 2; all 2 listed records still match." },
      error: null, started_at: now(), finished_at: now(), created_at: now(), updated_at: now() },
    { id: "t2", request_id: req.id, org_id: ORG, position: 2, key: "maintainer.open", title: "Open items in the maintainer's queue", executor: "count.maintainer_open",
      acceptance: "Count this organisation's open maintainer items. The verifier recounts independently.", input: {}, status: "verified", attempts: 2, max_attempts: 3,
      result: { available: true, count: 0, ids: [] }, verification: { ok: true, recount: 0, detail: "Recounted 0; all 0 listed records still match." },
      error: null, started_at: now(), finished_at: now(), created_at: now(), updated_at: now() },
  ];
  Object.assign(req, {
    status: "completed", finished_at: now(), report: {
      title: "What needs my attention today?", summary: "1 thing needs your attention.",
      lines: [
        { key: "approvals.pending", title: "Approvals waiting for a decision", text: "2 approvals are waiting for a decision.", attention: true, checked: true },
        { key: "maintainer.open", title: "Open items in the maintainer's queue", text: "The maintainer's queue is clear.", attention: false, checked: true },
      ],
    },
  });
  const report = page.getByTestId("reeds-report");
  await expect(report).toContainText("2 approvals are waiting for a decision.");
  await expect(page.getByText("1 thing needs your attention.")).toBeVisible();
  await expect(page.getByTestId("reeds-stages").locator('[data-reached="true"]')).toHaveCount(4);
  await expect(page.getByTestId("reeds-tasks")).toContainText("Check: Recounted 2; all 2 listed records still match.");
  await expect(page.getByTestId("reeds-tasks")).toContainText("2 attempts");
  await expect(page.getByTestId("reeds-working")).toHaveCount(0);

  await page.getByRole("link", { name: "REEDS" }).click();
  await expect(page.getByTestId("reeds-requests")).toContainText("1 thing needs your attention.");
});

test("a request that couldn't be fully checked says so, and reports nothing", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  fake.tables.work_requests = [{
    id: "r-failed", org_id: ORG, kind: "attention_today", note: null, status: "failed", requested_by: USER_ID, max_tasks: 12, report: null,
    failure_detail: `"Open items in the maintainer's queue" didn't pass its check: Result said 6, recount found 1.`,
    planned_at: now(), finished_at: now(), created_at: now(), updated_at: now(),
  }];
  await page.goto("/reeds/r-failed");
  await expect(page.getByTestId("reeds-failed")).toContainText("TEBOS couldn't complete this request.");
  await expect(page.getByTestId("reeds-failed")).toContainText("Result said 6, recount found 1.");
  await expect(page.getByTestId("reeds-report")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Cancel request" })).toHaveCount(0);
});

test("only admins and operators can ask; everyone in the organisation can read", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  fake.tables.memberships!.find((m) => m.user_id === USER_ID && m.org_id === ORG)!.role = "viewer";
  await page.goto("/reeds");
  await expect(page.getByText(/can ask TEBOS for work/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Ask TEBOS" })).toHaveCount(0);
});

test("on a phone the menu folds away, opens from the Menu button, and folds after choosing a page", async ({ page }) => {
  await installFakeSupabase(page);
  await page.goto("/approvals");
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav).toBeHidden();
  await page.getByRole("button", { name: "Menu" }).click();
  await expect(nav).toBeVisible();
  await nav.getByRole("link", { name: "Ask TEBOS" }).click();
  await expect(page).toHaveURL(/\/reeds$/);
  await expect(nav).toBeHidden();
  // the page itself starts on the first screen
  const top = await page.getByRole("heading", { name: "Ask TEBOS" }).boundingBox();
  expect(top!.y).toBeLessThan(300);
});
