import { expect, test } from "@playwright/test";
import { GOOD_CODE, installFakeSupabase, verifiedFactor } from "./fake-supabase";
import { USER_ID } from "./fixtures";

// Two-step sign-in (TOTP). Supabase verifies the codes and raises the session
// to aal2; the database then opens the private organisation's records (core:
// 99zg). Here: setting it up, being asked for the code after a password
// sign-in, and the resilience page saying what it needs.

const VAULT = "f1000000-0000-4000-8000-000000000002";

test("turning it on: scan or type the key, confirm with a code; a wrong code is refused", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  await page.goto("/account");
  const card = page.getByTestId("two-step");
  await expect(card).toContainText("Off.");
  await card.getByRole("button", { name: "Turn on two-step sign-in" }).click();
  await expect(card.getByRole("img", { name: "QR code for your authenticator app" })).toBeVisible();
  await expect(card.getByTestId("totp-secret")).toHaveText("JBSWY3DPEHPK3PXP");
  expect(fake.writes.find((w) => w.table === "auth/factors")?.body).toMatchObject({ factor_type: "totp", friendly_name: "Phone", issuer: "TEBOS" });

  const confirm = card.getByRole("form", { name: "Confirm authenticator" });
  await confirm.getByLabel("6-digit code").fill("000000");
  await confirm.getByRole("button", { name: "Confirm" }).click();
  await expect(card.getByRole("alert")).toContainText("Invalid TOTP code");
  expect(fake.factors[0]!.status).toBe("unverified");

  await confirm.getByLabel("6-digit code").fill(GOOD_CODE);
  await confirm.getByRole("button", { name: "Confirm" }).click();
  await expect(card).toContainText("Two-step sign-in is on.");
  await expect(card).toContainText("On, with 1 authenticator.");
  await expect(card).toContainText("Add a backup authenticator on a second device");
  expect(fake.factors[0]!.status).toBe("verified");
});

test("an unconfirmed attempt is cleared before a new one; a backup can be added and removed", async ({ page }) => {
  const stale = { ...verifiedFactor("Old"), status: "unverified" as const };
  const fake = await installFakeSupabase(page, { aal: "aal2", factors: [verifiedFactor("Phone"), stale] });
  await page.goto("/account");
  const card = page.getByTestId("two-step");
  await expect(card).toContainText("On, with 1 authenticator.");
  await card.getByLabel("Name for this authenticator").fill("Tablet");
  await card.getByRole("button", { name: "Add a backup authenticator" }).click();
  await expect.poll(() => fake.writes.some((w) => w.method === "DELETE" && w.table === `auth/factors/${stale.id}`)).toBe(true);
  const confirm = card.getByRole("form", { name: "Confirm authenticator" });
  await confirm.getByLabel("6-digit code").fill(GOOD_CODE);
  await confirm.getByRole("button", { name: "Confirm" }).click();
  await expect(card).toContainText("Backup authenticator added.");
  await expect(card).toContainText("On, with 2 authenticators.");

  page.on("dialog", (d) => void d.accept());
  await card.getByRole("listitem").filter({ hasText: "Tablet" }).getByRole("button", { name: "Remove" }).click();
  await expect(card).toContainText("On, with 1 authenticator.");
});

test("after a password sign-in, the code comes first; nothing else loads until it passes", async ({ page }) => {
  const fake = await installFakeSupabase(page, { aal: "aal1", factors: [verifiedFactor()] });
  await page.goto("/");
  const form = page.getByRole("form", { name: "Two-step sign-in" });
  await expect(form.getByRole("heading", { name: "Enter your code" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Resilience" })).toHaveCount(0);
  await form.getByLabel("6-digit code").fill("999999");
  await form.getByRole("button", { name: "Continue" }).click();
  await expect(form.getByRole("alert")).toContainText("Invalid TOTP code");
  await form.getByLabel("6-digit code").fill(GOOD_CODE);
  await form.getByRole("button", { name: "Continue" }).click();
  await expect(form).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Home" })).toBeVisible();
  expect(fake.writes.filter((w) => w.table.endsWith("/verify"))).toHaveLength(2);
});

test("the private records say what they need when the session has no second step", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  const t = fake.tables as unknown as Record<string, Record<string, unknown>[]>;
  t.organisations!.push({ id: VAULT, name: "IREKUN", slug: "irekun", private: true, created_at: new Date().toISOString() });
  t.memberships!.push({ org_id: VAULT, user_id: USER_ID, role: "org_admin", created_at: new Date().toISOString() });
  await page.goto("/");
  await page.getByRole("combobox", { name: "Organisation" }).selectOption({ label: "IREKUN" });
  await page.getByRole("link", { name: "Resilience" }).click();
  await expect(page.getByRole("heading", { name: "Two-step sign-in is needed" })).toBeVisible();
  await page.getByRole("link", { name: "Set up two-step sign-in" }).click();
  await expect(page.getByTestId("two-step")).toContainText("Off.");
});
