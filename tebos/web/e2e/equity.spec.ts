import { expect, test } from "@playwright/test";
import { installFakeSupabase } from "./fake-supabase";
import { ORG, USER_ID } from "./fixtures";

// The equity programme: TEBOS's staff screen applications against the rules, only the founder approves, terms follow a
// signed agreement; an equity partner records its sales and closes its months. The rules are tested in core
// (99zzf_equity_programme.sql, test/equity.test.ts); here the interface must follow them and say things plainly.
const now = new Date().toISOString();
const today = now.slice(0, 10);
const app = (over: Record<string, unknown>) => ({
  id: "a1", org_id: ORG, business_name: "BAME", registration_number: null, sector: "beauty_wellness", trading_since: null, revenue_band: "under_10k",
  employees: 4, owner_full_time: false, revenue_evidence_note: null, reporting_consent: false, package: "starter", status: "screening",
  status_note: "Asked for the no-capital option.", screened_by: null, approved_by: null, agreement_ref: null, created_by: USER_ID, created_at: now, updated_at: now, ...over,
});

function asStaff(t: Record<string, unknown[]>, role: "sales" | "admin") {
  t.memberships = [];
  t.platform_admins = role === "admin" ? [{ user_id: USER_ID }] : [];
  t.platform_staff = [{ user_id: USER_ID, role: "sales", added_by: null, created_at: now }];
  t.staff_profiles = [{ user_id: USER_ID, display_name: "Lindiwe" }];
  t.organisations = [{ id: ORG, name: "BAME", slug: "bame", private: false, app: "tebos", created_at: now }];
  t.opportunities = [];
  t.equity_terms = [];
}

test("staff screen an application in plain words, and only the founder can approve", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  const t = fake.tables as Record<string, unknown[]>;
  asStaff(t, "sales");
  t.equity_applications = [app({})];
  await page.goto("/pipeline/equity");
  await expect(page.getByRole("heading", { name: "Equity partners" })).toBeVisible();
  await expect(page.getByTestId("equity-places")).toHaveText("0 of 5 places taken");
  await page.getByRole("button", { name: /BAME/ }).click();
  const gaps = page.getByTestId("equity-gaps");
  await expect(gaps).toContainText("a CIPC registration number");
  await expect(gaps).toContainText("at least R10,000 a month");

  const facts = page.getByRole("form", { name: "The facts about BAME" });
  await facts.getByLabel("CIPC registration number").fill("2019/123456/07");
  await facts.getByLabel("Trading since").fill("2024-01-15");
  await facts.getByLabel("Money coming in each month").selectOption("10k_50k");
  await facts.getByLabel("What you saw to confirm it").fill("Three months of statements, seen on a video call; not kept.");
  await facts.getByLabel("An owner works in it full time").check();
  await facts.getByLabel("The owner agrees to record every sale in TEBOS").check();
  await facts.getByRole("button", { name: "Save the facts" }).click();
  await expect(page.getByTestId("equity-gaps")).toContainText("Every rule is met.");

  const next = page.getByRole("form", { name: "Next step for BAME" });
  await next.getByLabel("Next step").selectOption({ label: "Qualifies: waiting for the founder" });
  await next.getByLabel("Why").fill("Meets every rule; for the founder.");
  await next.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("Waiting for the founder to say yes or no.")).toBeVisible();
  await expect(page.getByRole("form", { name: "Next step for BAME" }).getByLabel("Next step").locator("option", { hasText: "Approved" })).toHaveCount(0);
});

test("the founder approves, and records the terms once the agreement is signed", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  const t = fake.tables as Record<string, unknown[]>;
  asStaff(t, "admin");
  t.equity_applications = [app({ status: "agreement_signed", registration_number: "2019/123456/07", revenue_band: "10k_50k", agreement_ref: "EQ-BAME-1, signed copy in the vault" })];
  await page.goto("/pipeline/equity");
  await page.getByRole("button", { name: /BAME/ }).click();
  const terms = page.getByRole("form", { name: "Record the terms" });
  await expect(terms).toContainText("5% equity · 5.1% of the votes · Small package · agreement: EQ-BAME-1");
  await terms.getByRole("button", { name: "Record the terms" }).click();
  await expect.poll(() => fake.writes.some((w) => w.method === "POST" && w.table === "equity_terms")).toBe(true);
  const sent = fake.writes.find((w) => w.table === "equity_terms")!.body as Record<string, unknown>;
  expect(sent).toMatchObject({ org_id: ORG, application_id: "a1", package: "starter" });
});

test("an equity partner records sales, corrects a mistake with a reason, and closes last month", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  const t = fake.tables as Record<string, unknown[]>;
  const startedOn = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
  t.equity_terms = [{ org_id: ORG, application_id: "a1", equity_pct: 5, voting_pct: 5.1, package: "starter", agreement_ref: "EQ-BAME-1", starts_on: startedOn, ended_on: null, recorded_by: USER_ID, created_at: now }];
  const last = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 1, 3)).toISOString().slice(0, 10);
  t.partner_sales = [{ id: "s0", org_id: ORG, sold_on: last, kind: "sale", amount_cents: 450000, reference: "INV-1", channel: "walk_in", customer_ref: null, note: null, recorded_by: USER_ID, created_at: now }];
  t.partner_month_closes = [];
  await page.goto("/");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Sales" }).click();
  await expect(page.getByRole("heading", { name: "Sales" })).toBeVisible();
  await expect(page.getByTestId("equity-terms")).toContainText("5% and 5.1% of the votes");

  const add = page.getByRole("form", { name: "Add a sale" });
  await add.getByLabel("Amount (rand)").fill("1200");
  await add.getByLabel("Invoice or receipt number").fill("INV-2");
  await add.getByRole("button", { name: "Record" }).click();
  await expect(add.getByRole("status")).toHaveText("Sale of R1 200 recorded.");
  await expect(page.getByTestId("this-month")).toContainText("R1 200");

  await add.getByRole("button", { name: "A correction" }).click();
  await add.getByLabel("Amount (rand)").fill("-200");
  await add.getByLabel("What it corrects").fill("INV-2 was R1,000, not R1,200.");
  await add.getByRole("button", { name: "Record" }).click();
  await expect(add.getByRole("status")).toHaveText("Correction of R200 recorded.");
  const correction = fake.writes.filter((w) => w.method === "POST" && w.table === "partner_sales").at(-1)!.body as Record<string, unknown>;
  expect(correction).toMatchObject({ kind: "correction", amount_cents: -20000, note: "INV-2 was R1,000, not R1,200." });

  const close = page.getByRole("form", { name: /^Close / });
  await expect(close).toContainText("R4 500");
  await close.getByRole("button", { name: "Close the month" }).click();
  await expect.poll(() => fake.writes.some((w) => w.method === "POST" && w.table === "partner_month_closes")).toBe(true);
  expect(today >= last).toBe(true);
});

test("a business that isn't an equity partner has no Sales page in its menu", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  (fake.tables as Record<string, unknown[]>).equity_terms = [];
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "TEBOS channel" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Sales", exact: true })).toHaveCount(0);
});
