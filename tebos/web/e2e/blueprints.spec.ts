import { expect, test } from "@playwright/test";
import { installFakeSupabase } from "./fake-supabase";
import { BIZ } from "./fixtures";

// Operating-system blueprints: a whole draft operating system in one step,
// every piece proposed until the owner confirms it.

test("an empty board starts from a blueprint, and the owner confirms what's right", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  const t = fake.tables as Record<string, unknown[]>;
  t.board_components = [];
  t.board_flows = [];
  t.board_steps = [];
  await page.goto(`/businesses/${BIZ}/board`);
  const card = page.locator(".card", { has: page.getByRole("heading", { name: "Start from an operating-system blueprint" }) });
  await expect(card).toBeVisible();
  await card.getByLabel("Blueprint").selectOption({ label: "Sports agency" });
  await expect(page.getByTestId("blueprint-preview")).toContainText("5 pieces · 2 flows · 9 steps");
  await card.getByRole("button", { name: "Apply blueprint" }).click();

  await expect.poll(() => fake.writes.find((w) => w.table === "apply_blueprint")?.body).toMatchObject({ p_business: BIZ, p_blueprint: { key: "sports-agency", version: 1 } });
  const flow = page.locator(".card", { has: page.getByRole("heading", { name: /Opportunity to signed deal/ }) });
  await expect(flow).toContainText("proposed");
  await expect(flow).toContainText("Make first contact within 24 hours");
  await expect(flow).toContainText("Rule: Use the outreach templates");
  await expect(page.getByTestId("pieces")).toContainText("Opportunity pipeline");
  // a board with flows no longer offers a blueprint
  await expect(card).toHaveCount(0);

  await flow.getByRole("button", { name: "Confirm flow" }).click();
  await expect.poll(() => fake.writes.filter((w) => w.method === "PATCH" && (w.table === "board_flows" || w.table === "board_steps")).map((w) => [w.table, w.body]))
    .toEqual([["board_steps", { basis: "stated" }], ["board_flows", { basis: "stated" }]]);
  await expect(flow.getByRole("button", { name: "Confirm flow" })).toHaveCount(0);
});

test("the public page shows eleven operating systems as blueprints, with outlines but not the rules", async ({ page }) => {
  await installFakeSupabase(page);
  await page.goto("/systems");
  await expect(page.getByRole("heading", { name: "An operating system for your kind of business" })).toBeVisible();
  await expect(page.getByTestId("system")).toHaveCount(11);
  await expect(page.getByText("These are blueprints, not client case studies.")).toBeVisible();
  const sports = page.getByTestId("system").filter({ hasText: "Sports agency" });
  await expect(sports).toContainText("Opportunity to signed deal · Media request to appearance");
  // the written rules are the product: they stay inside TEBOS
  await expect(page.getByText("Use the outreach templates")).toHaveCount(0);
});
