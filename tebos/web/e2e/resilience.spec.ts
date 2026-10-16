import { expect, test } from "@playwright/test";
import { installFakeSupabase, verifiedFactor, type FakeSupabase } from "./fake-supabase";
import { USER_ID } from "./fixtures";

// Strategic resilience, slice 1: financial resilience in the founder's private
// organisation. The database's rules (one member, no secrets, reliable income
// verified, redacted audit) are tested against real Postgres (core: 99zf);
// here the interface must pre-check them, show refusals, and compute the runway
// only from what is recorded.

// the founder's session passed two-step sign-in; two-step.spec covers sessions that didn't
const TWO_STEP = { aal: "aal2" as const, factors: [verifiedFactor()] };
const VAULT = "f1000000-0000-4000-8000-000000000001";
const now = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);

function tables(fake: FakeSupabase) {
  return fake.tables as unknown as Record<string, Record<string, unknown>[]>;
}

const row = (over: Record<string, unknown>) => ({
  id: crypto.randomUUID(), org_id: VAULT, entity: "personal", amount: null, cadence: null, stream: null, reliability: null, liquid: null,
  basis: "stated", evidence_ref: null, due_on: null, as_of: today(), note: null, created_by: USER_ID, created_at: now(), updated_at: now(), ...over,
});

function seedVault(fake: FakeSupabase, items: Record<string, unknown>[] = []) {
  const t = tables(fake);
  t.organisations!.push({ id: VAULT, name: "IREKUN", slug: "irekun", private: true, created_at: now() });
  t.memberships!.push({ org_id: VAULT, user_id: USER_ID, role: "org_admin", created_at: now() });
  t.res_money_items = items;
}

async function openVault(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("combobox", { name: "Organisation" }).selectOption({ label: "IREKUN" });
  await page.getByRole("group", { name: "Side" }).getByRole("link", { name: /TEPOS/ }).click();
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Tidy Capital" }).click();
  await expect(page.getByRole("heading", { name: "Tidy Capital" })).toBeVisible();
}

test("without a private organisation, the page offers to create one, and nobody else can join it", async ({ page }) => {
  const fake = await installFakeSupabase(page, TWO_STEP);
  tables(fake).platform_admins = [{ user_id: USER_ID, created_at: now() }];
  await page.goto("/");
  await page.getByRole("group", { name: "Side" }).getByRole("link", { name: /TEPOS/ }).click();
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Tidy Capital" }).click();
  await expect(page.getByRole("heading", { name: "Your private organisation" })).toBeVisible();
  await expect(page.getByText("the database refuses anyone else")).toBeVisible();
  await page.getByRole("button", { name: "Create private organisation" }).click();
  await expect.poll(() => fake.writes.find((w) => w.method === "RPC" && w.table === "create_private_organisation")?.body).toMatchObject({ p_name: "IREKUN" });
  await expect(page.getByRole("heading", { name: "Tidy Capital" })).toBeVisible();
  await expect(page.getByTestId("runway-base")).toContainText("Not established");
  await expect(page.getByTestId("runway-base")).toContainText("essential costs (none recorded)");
});

test("runway counts reliable income only; speculative income and lump sums are shown, never counted", async ({ page }) => {
  const fake = await installFakeSupabase(page, TWO_STEP);
  seedVault(fake, [
    row({ kind: "essential_cost", label: "Rent", amount: 8000, cadence: "monthly" }),
    row({ kind: "essential_cost", label: "Food", amount: 4000, cadence: "monthly" }),
    row({ kind: "reserve", label: "Savings", amount: 30000, liquid: true }),
    row({ kind: "income", entity: "tebos", label: "BAME retainer", amount: 6000, cadence: "monthly", stream: "tebos_retainer", reliability: "reliable", basis: "verified", evidence_ref: "Signed agreement" }),
    row({ kind: "income", entity: "tidy_capital", label: "Forex", amount: 50000, cadence: "monthly", stream: "forex_trading", reliability: "speculative" }),
    row({ kind: "income", entity: "tidy_enterprise", label: "Commission (Smith sale)", amount: 80000, cadence: "lump_sum", stream: "agent_commission", reliability: "speculative" }),
  ]);
  await openVault(page);
  await expect(page.getByTestId("runway-base")).toContainText("5 months");
  await expect(page.getByTestId("runway-downside")).toContainText("2.5 months");
  await expect(page.getByTestId("runway-downside")).toContainText("weakest input: stated");
  await expect(page.getByTestId("by-stream")).toContainText("Forex trading (software)");
  await expect(page.getByTestId("by-stream")).toContainText("R80 000 expected lump sums");
  await expect(page.getByTestId("by-cadence")).toContainText("Lump sum (face value)");
  await expect(page.getByTestId("money-flags")).toContainText("TEBOS retainers is 100% of reliable income: a single point of failure.");

  // personal and business kept apart
  await page.getByLabel("Show").selectOption("tebos");
  await expect(page.getByTestId("runway-base")).toContainText("Not established");
  await expect(page.getByTestId("items-income")).toContainText("BAME retainer");
  await expect(page.getByTestId("items-income")).not.toContainText("Forex");
});

test("an unknown amount stays unknown, and is named", async ({ page }) => {
  const fake = await installFakeSupabase(page, TWO_STEP);
  seedVault(fake, [
    row({ kind: "essential_cost", label: "Rent", amount: 8000, cadence: "monthly" }),
    row({ kind: "essential_cost", label: "Medical aid", amount: null, cadence: "monthly" }),
    row({ kind: "reserve", label: "Savings", amount: 30000, liquid: true }),
  ]);
  await openVault(page);
  await expect(page.getByTestId("runway-downside")).toContainText("Not established");
  await expect(page.getByTestId("runway-downside")).toContainText("Missing: Medical aid");
  await expect(page.getByTestId("items-essential_cost")).toContainText("Unknown");
});

test("adding an item: secrets and unverified 'reliable' income are refused before anything is sent", async ({ page }) => {
  const fake = await installFakeSupabase(page, TWO_STEP);
  seedVault(fake);
  await openVault(page);
  await page.getByRole("button", { name: "Add an item" }).click();
  const form = page.getByRole("form", { name: "Add an item" });
  await form.getByLabel("What it is").selectOption("income");
  await form.getByLabel("Belongs to").selectOption("tidy_capital");
  await form.getByLabel("Name").fill("Trading");
  await form.getByLabel("Amount (rand)").fill("9000");
  await form.getByLabel("Stream").selectOption("forex_trading");
  await form.getByLabel("Reliability").selectOption("reliable");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form.getByRole("alert")).toContainText("Trading income is always speculative");
  await form.getByLabel("Reliability").selectOption("speculative");
  await form.getByLabel("Note").fill("broker login password: hunter2");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form.getByRole("alert")).toContainText("Secrets are never stored here");
  expect(fake.writes.filter((w) => w.table === "res_money_items")).toHaveLength(0);

  await form.getByLabel("Note").fill("Paper results only until a track record exists");
  await form.getByRole("button", { name: "Save" }).click();
  await expect.poll(() => fake.writes.find((w) => w.table === "res_money_items" && w.method === "POST")?.body).toMatchObject({
    org_id: VAULT, entity: "tidy_capital", kind: "income", label: "Trading", amount: 9000, cadence: "monthly", stream: "forex_trading", reliability: "speculative", liquid: null, basis: "stated",
  });
  await expect(page.getByTestId("items-income")).toContainText("Trading");
});

test("a database refusal is shown in its own words; a record can be deleted", async ({ page }) => {
  const fake = await installFakeSupabase(page, TWO_STEP);
  seedVault(fake, [row({ kind: "reserve", label: "Savings", amount: 1000, liquid: true })]);
  await openVault(page);
  await page.getByTestId("items-reserve").getByRole("button", { name: "Edit" }).click();
  const form = page.getByRole("form", { name: "Edit item" });
  fake.refuse({ table: "res_money_items", method: "PATCH", message: "resilience records live only in a private organisation", hint: "TEBOS_PERMISSION_DENIED" });
  await form.getByLabel("Amount (rand)").fill("2000");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form.getByRole("alert")).toBeVisible();
  await form.getByRole("button", { name: "Delete" }).click();
  await expect.poll(() => fake.writes.some((w) => w.table === "res_money_items" && w.method === "DELETE")).toBe(true);
  await expect(page.getByText("Nothing recorded yet.")).toBeVisible();
});
