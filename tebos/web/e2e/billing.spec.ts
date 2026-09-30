import { expect, test } from "@playwright/test";
import { installFakeSupabase } from "./fake-supabase";
import { ORG, USER_ID } from "./fixtures";

const day = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const now = new Date().toISOString();
const account = (id: string, over: Record<string, unknown>) => ({
  id, opportunity_id: `o-${id}`, org_id: ORG, plan: "starter", monthly_cents: 250000, currency: "ZAR", anchor_day: 15, next_invoice_on: day(20),
  status: "active", fee_note: null, status_note: null, created_at: now, updated_at: now, ...over,
});
const invoice = (id: string, over: Record<string, unknown>) => ({
  id, number: `TEBOS-2026-000${id}`, billing_account_id: "b1", opportunity_id: "o-b1", org_id: ORG, period_start: day(-10), period_end: day(20),
  amount_cents: 250000, currency: "ZAR", status: "open", issued_on: day(-10), due_on: day(-3), paid_at: null, payment_url: "https://checkout.paystack.test/x",
  payment_reference: `tebos-inv-${id}`, void_reason: null, created_at: now, ...over,
});

test("a platform admin sees what's billed and owed, sets a Company fee from the proposal, and records an EFT", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  const t = fake.tables as Record<string, unknown[]>;
  t.platform_admins = [{ user_id: USER_ID, created_at: now }];
  t.billing_accounts = [account("b1", {}), account("b2", { plan: "company", monthly_cents: null, next_invoice_on: null, anchor_day: null, status: "awaiting_fee" })];
  t.invoices = [invoice("1", { due_on: day(-20) }), invoice("2", { status: "paid", paid_at: now, due_on: day(-40) })];
  t.opportunities = [{ id: "o-b1", business: "Northwind Studio", plan: "starter", email: "t@nw.test" }, { id: "o-b2", business: "Big Co", plan: "company", email: "c@big.test" }];

  await page.goto("/pipeline/billing");
  await expect(page.getByRole("heading", { name: "Billing" })).toBeVisible();
  await expect(page.getByTestId("billing-stats")).toContainText("R2,500Billed monthly");
  await expect(page.getByTestId("billing-stats")).toContainText("1Overdue");
  await expect(page.getByTestId("invoices")).toContainText("20 days late");
  await expect(page.getByText(/More than 14 days late/)).toBeVisible();

  // a Company fee comes from the agreed proposal
  const big = page.getByTestId("billing-accounts").locator("li", { hasText: "Big Co" });
  await big.getByRole("button", { name: "Set the agreed fee" }).click();
  await big.getByLabel("Monthly fee (R, excluding VAT)").fill("30,000");
  await big.getByLabel("First invoice on").fill(day(5));
  await big.getByLabel("Where the fee comes from").fill("Proposal accepted by Naledi on 3 November");
  await big.getByRole("button", { name: "Save" }).click();
  await expect.poll(() => fake.writes.find((w) => w.table === "billing_accounts")?.body).toEqual({
    monthly_cents: 3000000, fee_note: "Proposal accepted by Naledi on 3 November", next_invoice_on: day(5), status: "active", status_note: "Proposal accepted by Naledi on 3 November",
  });

  // an EFT against the overdue invoice
  const overdue = page.getByTestId("invoice").filter({ hasText: "TEBOS-2026-0001" });
  await overdue.getByRole("button", { name: "Record EFT" }).click();
  await overdue.getByLabel("Bank reference").fill("FNB TEBOS-2026-0001");
  await overdue.getByLabel("Note").fill("Seen on the statement");
  await overdue.getByRole("button", { name: "Record EFT" }).last().click();
  await expect.poll(() => fake.writes.find((w) => w.table === "payments")?.body).toMatchObject({
    invoice_id: "1", opportunity_id: "o-b1", provider: "manual", reference: "FNB TEBOS-2026-0001", amount_cents: 250000, status: "success",
  });
});

test("billing is for platform admins only", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  const t = fake.tables as Record<string, unknown[]>;
  t.platform_admins = [];
  t.platform_staff = [{ user_id: USER_ID, role: "sales", added_by: null, created_at: now }];
  await page.goto("/pipeline/billing");
  await expect(page.getByText("Only TEBOS's platform admins manage billing.")).toBeVisible();
});

test("a client sees their invoices and pays an open one through the secure link", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  const t = fake.tables as Record<string, unknown[]>;
  t.invoices = [invoice("1", { due_on: day(4) }), invoice("2", { status: "paid", paid_at: now })];
  await page.goto("/");
  const card = page.getByTestId("client-invoices");
  await expect(page.getByText("1 to pay.", { exact: false })).toBeVisible();
  await expect(card).toContainText("TEBOS-2026-0001 · R2,500");
  await expect(card.getByRole("link", { name: "Pay now" })).toHaveAttribute("href", "https://checkout.paystack.test/x");
  await expect(card.getByRole("link", { name: "Pay now" })).toHaveCount(1);
  await expect(card).toContainText("Paid");
});
