import { expect, test } from "@playwright/test";
import { installFakeSupabase } from "./fake-supabase";
import { seedStudio } from "./booking-seed";
import { ORG, USER_ID } from "./fixtures";

// Bookings (ADR 0016): the team sees the week and the requests to answer, confirms once the deposit has arrived, and
// closes the studio; a viewer sees when, not who. The rules are tested in core (99zzh_bookings.sql, test/bookings.test.ts).
// a day in next week (Monday + n), so the tests don't depend on which weekday they run
const day = (n: number) => {
  const d = new Date(); d.setUTCHours(12); const wd = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (wd - 1) + 7 + n); return d.toISOString().slice(0, 10);
};
const at = (d: string, hm: string) => new Date(`${d}T${hm}:00+02:00`).toISOString();


test("the team answers a request: confirm once the deposit has arrived", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  const t = fake.tables as Record<string, unknown[]>;
  seedStudio(t);
  const d = day(1);
  t.bookings = [{ id: "b1", ref: "BK-00001", org_id: ORG, service_id: "s-studio", package_id: "p-1h", starts_at: at(d, "10:00"), ends_at: at(d, "11:00"),
    status: "requested", status_note: "Requested online.", customer_name: "Lerato M", customer_email: "lerato@example.co.za", customer_phone: "061 000 0000",
    brief: null, price_cents: 260000, deposit_cents: null, deposit_ref: null, delivered_note: null, token_hash: "tok-1", consent_at: d, created_at: d, updated_at: d }];

  await page.goto("/");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Bookings" }).click();
  await expect(page.getByRole("heading", { name: "Bookings" })).toBeVisible();
  await expect(page.getByTestId("requests")).toContainText("Lerato M");
  await page.getByRole("button", { name: "Next week" }).click();
  await expect(page.getByTestId("week").getByTestId("slot")).toContainText(["Studio shoots"]);
  await page.getByTestId("requests").getByRole("button", { name: /Lerato M/ }).click();
  const panel = page.getByTestId("booking-panel");
  await expect(panel).toContainText("R2 600 · deposit R1 300 not yet received");
  await expect(panel).toContainText("lerato@example.co.za");
  // a booking is confirmed only with a photographer assigned: anyone on the team, not only the owner
  await expect(panel.getByRole("button", { name: "Confirm the booking" })).toBeDisabled();
  await panel.getByRole("combobox").selectOption({ label: "Thandi Mokoena" });
  await panel.getByRole("button", { name: "Assign" }).click();
  await expect.poll(() => fake.writes.filter((w) => w.method === "PATCH" && w.table === "bookings").map((w) => w.body)).toEqual([{ assignee_id: USER_ID }]);
  await panel.getByLabel("Deposit received: its reference").fill("EFT 0811");
  await panel.getByRole("button", { name: "Confirm the booking" }).click();
  await expect.poll(() => fake.writes.filter((w) => w.method === "PATCH" && w.table === "bookings").length).toBe(2);
  const sent = fake.writes.filter((w) => w.method === "PATCH" && w.table === "bookings")[1]!.body as Record<string, unknown>;
  expect(sent).toMatchObject({ status: "confirmed", deposit_ref: "EFT 0811" });
  await expect(panel).toContainText("Confirmed");
});

test("the team closes the studio, and a viewer sees when but not who", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  const t = fake.tables as Record<string, unknown[]>;
  seedStudio(t);
  const d = day(2);
  t.bookings = [{ id: "b1", ref: "BK-00001", org_id: ORG, service_id: "s-studio", package_id: "p-2h", starts_at: at(d, "14:00"), ends_at: at(d, "16:00"),
    status: "confirmed", status_note: "Deposit received.", customer_name: "Lerato M", customer_email: "lerato@example.co.za", customer_phone: null,
    brief: null, price_cents: 340000, deposit_cents: 170000, deposit_ref: "EFT 1", delivered_note: null, token_hash: "tok-1", consent_at: d, created_at: d, updated_at: d }];
  await page.goto("/bookings");
  const off = page.getByRole("form", { name: "Time off" });
  await off.getByLabel("Day").fill(day(3));
  await off.getByLabel("Why (optional, only the team sees it)").fill("Away at a wedding");
  await off.getByRole("button", { name: "Close this time" }).click();
  await expect(page.getByRole("status")).toHaveText("Closed.");
  const sent = fake.writes.find((w) => w.method === "POST" && w.table === "booking_time_off")!.body as Record<string, unknown>;
  expect(sent).toMatchObject({ org_id: ORG, reason: "Away at a wedding" });

  (t.memberships as Array<Record<string, unknown>>).find((m) => m.user_id === USER_ID)!.role = "viewer";
  await page.goto("/bookings");
  await page.getByRole("button", { name: "Next week" }).click();
  await expect(page.getByTestId("week")).toContainText("Studio shoots");
  await expect(page.getByTestId("week")).not.toContainText("Lerato");
  await expect(page.getByText("To answer")).toHaveCount(0);
  await expect(page.getByText("Only the team sees who booked.")).toBeVisible();
});

test("a photographer runs a shoot without the owner: checklist, backup, balance and the gallery", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  const t = fake.tables as Record<string, unknown[]>;
  seedStudio(t);
  const y = new Date(Date.now() - 26 * 3600_000).toISOString(), y2 = new Date(Date.now() - 25 * 3600_000).toISOString();
  t.bookings = [{ id: "b9", ref: "BK-00009", org_id: ORG, service_id: "s-studio", package_id: "p-1h", starts_at: y, ends_at: y2,
    status: "confirmed", status_note: "Deposit received.", customer_name: "Sipho N", customer_email: "sipho@example.co.za", customer_phone: null,
    brief: null, price_cents: 260000, deposit_cents: 130000, deposit_ref: "EFT 1300", delivered_note: null, token_hash: "tok-9", consent_at: y,
    created_at: y, updated_at: y, assignee_id: USER_ID, call_sheet_at: y, releases_note: null, backed_up_at: null, balance_ref: null, gallery_url: null }];
  await page.goto("/bookings");
  const mine = page.getByTestId("my-shoots");
  await expect(mine).toContainText("BK-00009 · Sipho N");
  await mine.getByRole("button", { name: /BK-00009/ }).click();
  const panel = page.getByTestId("booking-panel");
  await expect(panel.getByRole("list", { name: "Shoot checklist" }).getByRole("listitem")).toHaveText(["✓ Photographer assigned", "✓ Call sheet sent",
    "○ Releases signed or noted", "○ Files backed up", "○ Balance paid", "○ Gallery delivered"]);
  // not done until the files are backed up and releases noted
  await expect(panel.getByRole("button", { name: "Mark as shot" })).toBeDisabled();
  await panel.getByRole("textbox", { name: /^Releases/ }).fill("Model release signed by Sipho.");
  await panel.getByRole("button", { name: "Save" }).click();
  await panel.getByRole("button", { name: "Files backed up" }).click();
  await expect(panel.getByRole("button", { name: "Mark as shot" })).toBeEnabled();
  await panel.getByRole("button", { name: "Mark as shot" }).click();
  await expect(panel).toContainText("Shot");
  // delivered only with the gallery and the balance paid
  await expect(panel.getByRole("button", { name: "Mark as delivered" })).toBeDisabled();
  await panel.getByLabel("Gallery link").fill("https://gallery.example/sipho");
  await panel.getByRole("button", { name: "Save the link" }).click();
  await panel.getByLabel(/Balance received \(R1 300\)/).fill("EFT balance 1300");
  await panel.getByRole("button", { name: "Record the balance" }).click();
  await panel.getByLabel("How the images were sent").fill("Gallery link by email, 52 images");
  await panel.getByRole("button", { name: "Mark as delivered" }).click();
  await expect(panel).toContainText("Delivered");
  const patches = fake.writes.filter((w) => w.method === "PATCH" && w.table === "bookings").map((w) => Object.keys(w.body as object).sort().join(","));
  expect(patches).toEqual(["releases_note", "backed_up_at", "status,status_note", "gallery_url", "balance_ref", "delivered_note,status,status_note"]);
});
