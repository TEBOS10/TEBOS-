import { expect, test } from "@playwright/test";
import { seedStudio } from "./booking-seed";
import { installFakeSupabase } from "./fake-supabase";

// Grape Studios' own site (ADR 0016): the six categories and their rates; booking a time that is free; the customer's
// private page with the booking's schedule and the studio's week. Before Grape Studios is set up in TEBOS, it shows
// the rate cards and says online booking opens soon.
test.use({ baseURL: "http://localhost:5177" });

test("before set-up: the six categories with their rates, and booking by email", async ({ page }) => {
  await installFakeSupabase(page, { signedIn: false });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Book the shoot/ })).toBeVisible();
  await expect(page.getByTestId("hero")).toHaveAttribute("data-scene", "still");
  const cats = page.locator(".gs-cat");
  await expect(cats).toHaveCount(6);
  await expect(cats.first()).toContainText("Studio shoots");
  await expect(cats.first()).toContainText("From R2 600");
  await expect(page.getByTestId("not-open").first()).toContainText("Online booking opens soon");
  await cats.filter({ hasText: "Corporate" }).click();
  await expect(page.getByRole("heading", { name: "Corporate" })).toBeVisible();
  await page.getByRole("group", { name: "Rate" }).getByRole("button", { name: /Full day/ }).click();
  await expect(page.getByTestId("not-open")).toContainText("email");
  await expect(page.locator("body")).not.toContainText(/FNB|63175867846/);
});

test("booked online: a free time, a deposit due, and a private page with the schedule", async ({ page }) => {
  const fake = await installFakeSupabase(page, { signedIn: false });
  seedStudio(fake.tables as Record<string, unknown[]>, "grape-studios");
  await page.goto("/");
  await expect(page.getByTestId("not-open")).toHaveCount(0);
  await page.locator(".gs-cat").filter({ hasText: "Studio shoots" }).click();
  await page.getByRole("group", { name: "Rate" }).getByRole("button", { name: /1 hour/ }).click();
  await page.getByRole("group", { name: "Day" }).getByRole("button").nth(2).click();
  await page.getByRole("group", { name: "Time" }).getByRole("button", { name: "10:00" }).click();
  await expect(page.getByTestId("summary")).toContainText("R2 600. A R1 300 deposit (half, non-refundable) holds your date");
  const form = page.getByRole("form", { name: "Your details" });
  await form.getByLabel("Your name").fill("Lerato M");
  await form.getByLabel("Email").fill("lerato@example.co.za");
  await form.getByRole("button", { name: "Request this shoot" }).click();
  await expect(page.getByRole("heading", { name: "Request this shoot" })).toHaveCount(0);
  // consent is required
  await expect(page).not.toHaveURL(/\/b\//);
  await form.getByRole("checkbox").check();
  await form.getByRole("button", { name: "Request this shoot" }).click();

  await expect(page).toHaveURL(/\/b\/tok-/);
  const mine = page.getByTestId("my-booking");
  await expect(mine.getByTestId("status")).toContainText("Requested. Waiting for the team to confirm.");
  await expect(mine.getByRole("list", { name: "Schedule" })).toContainText("R1 300, due to hold your date");
  await expect(mine.getByRole("region", { name: "Paying the deposit" })).toContainText("Pay by EFT");
  await expect(mine.getByRole("region", { name: "The studio's week" })).toContainText("10:00–11:00 · you");
  await expect(mine).not.toContainText("lerato@example.co.za");
  const sent = fake.writes.find((w) => w.table === "booking_request")!.body as Record<string, unknown>;
  expect(sent).toMatchObject({ p_slug: "grape-studios", p_package: "p-1h", p_name: "Lerato M", p_consent: true });
});

test("a wrong link shows nothing", async ({ page }) => {
  await installFakeSupabase(page, { signedIn: false });
  await page.goto("/b/not-a-real-link");
  await expect(page.getByRole("heading", { name: "We couldn't find that booking" })).toBeVisible();
});
