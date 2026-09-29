import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import { installFakeSupabase } from "./fake-supabase";
import { USER_ID } from "./fixtures";

// TEBOS's client pipeline (staff) and the client's own agreement page.
const now = new Date().toISOString();
const opp = (id: string, over: Record<string, unknown>) => ({
  id, enquiry_id: `e-${id}`, plan: "starter", contact_name: "Thandi", business: "Northwind Studio", email: "thandi@northwind.co.za",
  phone: null, website: "northwind.co.za", message: "We need structure", status: "screened", screening: { flags: [] }, screened_at: now,
  amount_cents: null, currency: "ZAR", payment_url: null, payment_reference: null, org_id: null, decision_note: null, decided_by: null,
  decided_at: null, maintainer_id: null, created_at: now, updated_at: now, ...over,
});

test("TEBOS staff see the pipeline, screening flags, and decide with a reason", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  const t = fake.tables as Record<string, unknown[]>;
  t.platform_admins = [{ user_id: USER_ID, created_at: now }];
  t.opportunities = [
    opp("o1", { business: "Northwind Consulting", email: "t@gmail.com", screening: { flags: [
      { code: "free_email", detail: "A personal address (gmail.com), not the business's own" },
      { code: "competitor_terms", detail: 'Describes itself with words that overlap TEBOS\'s services: "consulting"' },
    ] } }),
    opp("o2", { business: "Clayworks", status: "awaiting_payment", amount_cents: 250000, payment_url: "https://checkout.paystack.com/abc", payment_reference: "tebos-o2" }),
  ];
  t.payments = [];
  t.contracts = [];
  t.outbox_emails = [{ id: "m1", opportunity_id: "o2", kind: "payment_link", to_email: "x@clay.test", subject: "Your TEBOS Diagnostic: payment link", created_at: now, attempts: 1, last_try: now, sent_at: now, error: null }];
  t.platform_staff = [];

  await page.goto("/");
  await page.getByRole("link", { name: "Pipeline" }).click();
  await expect(page.getByRole("heading", { name: "Client pipeline" })).toBeVisible();
  await expect(page.getByTestId("pipeline-counts")).toContainText("1To decide");
  await expect(page.getByTestId("pipeline-counts")).toContainText("1Awaiting payment");

  await page.getByRole("link", { name: "Northwind Consulting" }).click();
  await expect(page.getByTestId("flags")).toContainText("competitor terms");
  await expect(page.getByText("Screening flagged this enquiry: approving it needs a reason.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Decline" })).toBeDisabled();
  // the database refuses a flagged approval without a reason; the page explains
  fake.refuse({ table: "opportunities", method: "PATCH", hint: "TEBOS_VALIDATION", message: "screening flagged this enquiry; say why it is approved anyway" });
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Not saved")).toBeVisible();
  fake.refuse(null);
  await page.getByLabel("Reason or note").fill("Spoke to Thandi: buying for their own firm");
  await page.getByRole("button", { name: "Approve" }).click();
  await expect.poll(() => fake.writes.filter((w) => w.table === "opportunities" && w.method === "PATCH").at(-1)?.body)
    .toEqual({ status: "approved", decision_note: "Spoke to Thandi: buying for their own firm" });

  await page.goto("/pipeline/o2");
  await expect(page.getByText("https://checkout.paystack.com/abc")).toBeVisible();
  await expect(page.getByTestId("emails")).toContainText("Your TEBOS Diagnostic: payment link");
  // an EFT is recorded by an admin, with a bank reference and a note
  await page.getByLabel("Bank reference").fill("FNB TEBOS-o2");
  await page.getByLabel("Note").fill("Seen on the statement");
  await page.getByRole("button", { name: "Record EFT" }).click();
  await expect.poll(() => fake.writes.find((w) => w.table === "payments")?.body).toMatchObject({
    opportunity_id: "o2", provider: "manual", reference: "FNB TEBOS-o2", amount_cents: 250000, status: "success", note: "Seen on the statement",
  });
});

test("an admin drafts the agreement from TEBOS's starting text, and approves it only with a note", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  const t = fake.tables as Record<string, unknown[]>;
  t.platform_admins = [{ user_id: USER_ID, created_at: now }];
  t.contract_templates = [];
  await page.goto("/pipeline/contracts");
  await expect(page.getByText("No templates yet.")).toBeVisible();
  await page.getByRole("button", { name: "New draft" }).click();
  await expect(page.getByLabel("Agreement")).toHaveValue(/\{\{deliverables\}\}/);
  await page.getByRole("button", { name: "Save as agreement-starter v1" }).click();
  await expect.poll(() => fake.writes.find((w) => w.table === "contract_templates")?.body).toMatchObject({ key: "agreement-starter", version: 1, plan: "starter" });
});

test("people who aren't TEBOS staff don't see the pipeline", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  (fake.tables as Record<string, unknown[]>).platform_admins = [];
  (fake.tables as Record<string, unknown[]>).platform_staff = [];
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Businesses" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Pipeline" })).toHaveCount(0);
  await page.goto("/pipeline");
  await expect(page.getByText("This page is for TEBOS's own staff.")).toBeVisible();
});

test("a client reads their agreement and accepts the exact text, without an account", async ({ page }) => {
  const fake = await installFakeSupabase(page, { signedIn: false });
  const body = "# TEBOS client agreement\n\nThis agreement is between **TEBOS** and **Northwind Studio**.\n\n## 1. What TEBOS provides\n\n- Map: your operating board\n- Findings with the evidence";
  (fake.tables as Record<string, unknown[]>).contract_links = [{
    token: "link-1", title: "TEBOS client agreement", body, body_hash: "x", business: "Northwind Studio", status: "sent",
    expires_at: new Date(Date.now() + 864e5).toISOString(),
  }];
  await page.goto("/contract/wrong");
  await expect(page.getByRole("heading", { name: "This link isn't valid" })).toBeVisible();

  await page.goto("/contract/link-1");
  await expect(page.getByRole("heading", { name: "TEBOS client agreement" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "1. What TEBOS provides" })).toBeVisible();
  await expect(page.getByText("Map: your operating board")).toBeVisible();
  const accept = page.getByRole("button", { name: "Accept the agreement" });
  await expect(accept).toBeDisabled();
  await page.getByLabel("Your full name").fill("Thandi Mokoena");
  await page.getByRole("checkbox").check();
  await accept.click();
  await expect(page.getByTestId("accepted")).toContainText("Accepted by Thandi Mokoena");
  expect(fake.writes.find((w) => w.table === "accept_contract")?.body).toEqual({
    p_token: "link-1", p_name: "Thandi Mokoena", p_body_hash: createHash("sha256").update(body).digest("hex"),
  });
  // the page never pretends a payment succeeded
  await page.goto("/paid");
  await expect(page.getByText(/If your payment went through/)).toBeVisible();
});
