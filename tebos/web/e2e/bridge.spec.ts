import { expect, test } from "@playwright/test";
import { installFakeSupabase, verifiedFactor } from "./fake-supabase";
import { ORG } from "./fixtures";

// The Model Bridge from the person's side: give an AI client access (two-step
// session only; the token is shown once), ask it for a piece of work with an
// acceptance test, and review what it hands in. The rules behind each step are
// tested against real Postgres (core: 99zk, bridge-pg).

const now = () => new Date().toISOString();

test("an admin without two-step sign-in is told to turn it on, and can't issue a token", async ({ page }) => {
  await installFakeSupabase(page);
  await page.goto("/ai-clients");
  await expect(page.getByRole("heading", { name: "AI clients" })).toBeVisible();
  await expect(page.getByTestId("ai-two-step")).toBeVisible();
  await expect(page.getByRole("button", { name: "Issue a token" })).toHaveCount(0);
});

test("issue a token once, see the client listed by its hint, and revoke it", async ({ page }) => {
  const fake = await installFakeSupabase(page, { aal: "aal2", factors: [verifiedFactor()] });
  await page.goto("/ai-clients");
  await page.getByLabel("Name").fill("coding assistant on the laptop");
  await page.getByLabel(/See the tasks written for it/).uncheck();
  await page.getByRole("button", { name: "Issue a token" }).click();

  await expect.poll(() => fake.writes.find((w) => w.table === "issue_bridge_client")?.body).toEqual({
    p_org: ORG, p_name: "coding assistant on the laptop", p_kind: "coding_agent",
    p_scopes: ["context.read", "tasks.claim", "results.submit"], p_days: 30,
  });
  await expect(page.getByTestId("ai-token")).toContainText(`tbk_${"0".repeat(64)}`);
  await page.getByRole("button", { name: "I've stored it" }).click();
  await expect(page.getByTestId("ai-token")).toHaveCount(0);
  await expect(page.getByTestId("ai-clients")).toContainText("tbk_00000000…");
  await expect(page.getByTestId("ai-clients")).not.toContainText("0".repeat(20));

  await page.getByRole("button", { name: "Revoke" }).click();
  await expect.poll(() => fake.writes.some((w) => w.table === "revoke_bridge_client")).toBe(true);
  await expect(page.getByTestId("ai-clients")).toContainText("revoked");
});

test("ask an AI client for work, then accept what it hands in", async ({ page }) => {
  const fake = await installFakeSupabase(page, { aal: "aal2", factors: [verifiedFactor()] });
  await page.goto("/reeds");
  await page.getByLabel(/Work for an AI client/).check();
  await page.getByLabel("What should be done", { exact: true }).fill("Write the guide to issuing tokens");
  await page.getByRole("textbox", { name: /^Acceptance test/ }).fill("The guide covers issuing, revoking and connecting a client.");
  await page.getByRole("button", { name: "Ask TEBOS" }).click();

  await expect.poll(() => fake.writes.find((w) => w.table === "work_requests" && w.method === "POST")?.body).toEqual({
    org_id: ORG, kind: "external_task", status: "received", note: null,
    task_title: "Write the guide to issuing tokens", task_acceptance: "The guide covers issuing, revoking and connecting a client.",
    task_executor: "external.coding_agent",
  });
  await expect(page).toHaveURL(/\/reeds\/[0-9a-f-]+$/);

  // REEDS planned it and the AI client handed in a result through the bridge
  const req = fake.tables.work_requests!.at(-1)!;
  Object.assign(req, { status: "running", planned_at: now() });
  fake.tables.work_tasks = [{
    id: "x1", request_id: req.id, org_id: ORG, position: 1, key: "external.work", title: "Write the guide to issuing tokens",
    executor: "external.coding_agent", acceptance: "The guide covers issuing, revoking and connecting a client.", input: {},
    status: "done", attempts: 1, max_attempts: 3, claimed_by: "c1", lease_until: null,
    result: { summary: "Wrote docs/bridge.md.", evidence: ["commit abc123"], submitted_by: "coding assistant on the laptop" },
    verification: null, error: null, started_at: now(), finished_at: now(), created_at: now(), updated_at: now(),
  }];
  await expect(page.getByTestId("external-result")).toContainText("Wrote docs/bridge.md.");
  await expect(page.getByRole("button", { name: "Reject" })).toBeDisabled();
  await page.getByRole("button", { name: "Accept: it meets the test" }).click();
  await expect.poll(() => fake.writes.find((w) => w.table === "review_work_task")?.body).toEqual({ p_task: "x1", p_ok: true, p_note: null });
});
