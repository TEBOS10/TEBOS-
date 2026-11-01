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

test("the brands Grape Studios has shot for, named in type, and its portfolio", async ({ page }) => {
  await installFakeSupabase(page, { signedIn: false });
  await page.goto("/");
  const brands = page.locator("#brands");
  await expect(brands.getByText("Brands we've shot for")).toBeVisible();
  await expect(brands.getByRole("listitem")).toHaveText(["PUMA", "G-Star Raw", "Antony Morato", "Happyville", "YMZ", "2Millionicons"]);
  await expect(brands.locator("img")).toHaveCount(0); // never the brands' logos
  await expect(page.getByRole("link", { name: "Portfolio on Behance" })).toHaveAttribute("href", "https://www.behance.net/tebohotefu");
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

test("a delivered shoot: the customer's page opens the gallery; a shot one asks for the balance first", async ({ page }) => {
  const fake = await installFakeSupabase(page, { signedIn: false });
  const t = fake.tables as Record<string, unknown[]>;
  seedStudio(t, "grape-studios");
  const y = new Date(Date.now() - 50 * 3600_000).toISOString(), y2 = new Date(Date.now() - 49 * 3600_000).toISOString();
  const row = (id: string, status: string, extra: Record<string, unknown>) => ({ id, ref: `BK-0000${id}`, org_id: (t.organisations as Array<{ id: string; slug: string }>).find((o) => o.slug === "grape-studios")!.id,
    service_id: "s-studio", package_id: "p-1h", starts_at: y, ends_at: y2, status, status_note: "x", customer_name: "Sipho N", customer_email: "sipho@example.co.za",
    customer_phone: null, brief: null, price_cents: 260000, deposit_cents: 130000, deposit_ref: "EFT 1300", delivered_note: null, token_hash: `tok-${id}`,
    consent_at: y, created_at: y, updated_at: y, assignee_id: null, call_sheet_at: y, releases_note: "Signed.", backed_up_at: y, balance_ref: null, gallery_url: null, ...extra });
  t.bookings = [row("1", "completed", { gallery_url: "https://gallery.example/sipho" }),
                row("2", "delivered", { balance_ref: "EFT 2", gallery_url: "https://gallery.example/sipho", delivered_note: "Gallery link by email, 52 images" })];
  await page.goto("/b/tok-1");
  await expect(page.getByRole("region", { name: "The balance" })).toContainText("R1 300 is due before your gallery is released");
  await expect(page.getByRole("link", { name: "Open your gallery" })).toHaveCount(0);
  await page.goto("/b/tok-2");
  await expect(page.getByRole("link", { name: "Open your gallery" })).toHaveAttribute("href", "https://gallery.example/sipho");
  await expect(page.getByRole("region", { name: "The balance" })).toHaveCount(0);
});
