import { expect, test } from "@playwright/test";
import { installFakeSupabase } from "./fake-supabase";
import { ORG, USER_ID } from "./fixtures";

// The client channel: a client writes to TEBOS and asks for changes within its plan; a maintainer answers and closes them.
const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const change = (id: string, over: Record<string, unknown> = {}) => ({
  id, org_id: ORG, requested_by: USER_ID, title: `Change ${id}`, detail: null, units: 1, status: "received", outcome_note: null,
  period: new Date().toISOString().slice(0, 8) + "01", created_at: ago(30), updated_at: ago(30), finished_at: null, ...over,
});

test("a client on a plan sees what's left, asks for a change, and writes to TEBOS", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  const t = fake.tables as unknown as Record<string, Record<string, unknown>[]>;
  t.billing_accounts = [{ id: "b1", org_id: ORG, plan: "growth", status: "active", created_at: ago(9000) }];
  t.change_requests = [change("c1", { title: "New gallery photos", status: "done", outcome_note: "Six new photos on the gallery." })];
  t.client_messages = [{ id: "m1", org_id: ORG, from_tebos: true, author_id: null, body: "Welcome to your TEBOS channel.", created_at: ago(60) }];

  await page.goto("/");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "TEBOS channel" }).click();
  await expect(page.getByRole("heading", { name: "TEBOS channel" })).toBeVisible();
  await expect(page.getByTestId("allowance")).toContainText("14 of 15 change requests left on the Medium plan");
  await expect(page.getByTestId("change-requests")).toContainText("Six new photos on the gallery.");
  await expect(page.getByTestId("messages")).toContainText("Welcome to your TEBOS channel.");

  const ask = page.getByTestId("ask-change");
  await ask.getByLabel("What should change").fill("Update the opening hours");
  await ask.getByLabel(/Details/).fill("Saturdays 9 to 1 from November");
  await ask.getByRole("button", { name: "Request the change" }).click();
  await expect.poll(() => fake.writes.find((w) => w.table === "change_requests" && w.method === "POST")?.body)
    .toEqual({ org_id: ORG, title: "Update the opening hours", detail: "Saturdays 9 to 1 from November" });
  await expect(page.getByTestId("allowance")).toContainText("13 of 15");

  // a request not yet started can be withdrawn
  await page.getByTestId("change-requests").getByRole("button", { name: "Cancel this request" }).click();
  await expect.poll(() => fake.writes.find((w) => w.table === "change_requests" && w.method === "PATCH")?.body).toEqual({ status: "cancelled" });

  await page.getByLabel("Write to TEBOS").fill("Thank you, the photos look great.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect.poll(() => fake.writes.find((w) => w.table === "client_messages" && w.method === "POST")?.body)
    .toEqual({ org_id: ORG, body: "Thank you, the photos look great.", from_tebos: false });
  await expect(page.getByTestId("messages")).toContainText("Thank you, the photos look great.");
});

test("over the allowance, or without a plan, the page says why and the database's refusal is shown plainly", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  await page.goto("/channel");
  await expect(page.getByTestId("allowance")).toContainText("There's no active TEBOS plan yet");
  await expect(page.getByRole("button", { name: "Request the change" })).toBeDisabled();

  const t = fake.tables as unknown as Record<string, Record<string, unknown>[]>;
  t.billing_accounts = [{ id: "b1", org_id: ORG, plan: "starter", status: "active", created_at: ago(9000) }];
  t.change_requests = ["a", "b", "c", "d"].map((id) => change(id));
  await page.reload();
  await expect(page.getByTestId("allowance")).toContainText("1 of 5");
  fake.refuse({ table: "change_requests", method: "POST", hint: "TEBOS_OUT_OF_PLAN", message: "this month's 5 change requests are used" });
  await page.getByLabel("What should change").fill("One more thing");
  await page.getByRole("button", { name: "Request the change" }).click();
  await expect(page.getByText(/change requests are used, or there's no active plan yet/)).toBeVisible();
});

test("a maintainer answers as TEBOS, sizes a request, and closes it with what was done", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  const t = fake.tables as unknown as Record<string, Record<string, unknown>[]>;
  t.memberships = [];
  t.platform_admins = [];
  t.platform_staff = [{ user_id: USER_ID, role: "maintainer", added_by: null, created_at: ago(9000) }];
  t.billing_accounts = [{ id: "b1", org_id: ORG, plan: "growth", status: "active", created_at: ago(9000) }];
  t.change_requests = [change("c1", { title: "Online bookings" })];
  t.client_messages = [{ id: "m1", org_id: ORG, from_tebos: false, author_id: "someone-else", body: "Can we add online bookings?", created_at: ago(20) }];

  await page.goto("/");
  await page.getByRole("link", { name: "Client channels" }).click();
  await page.getByTestId("channel-orgs").getByRole("link", { name: "Demo organisation (fixture)" }).click();
  await expect(page.getByTestId("messages")).toContainText("The client");
  await expect(page.getByTestId("messages")).toContainText("Can we add online bookings?");

  await page.getByLabel("Size of Online bookings").selectOption("3");
  await expect.poll(() => fake.writes.find((w) => w.table === "change_requests" && w.method === "PATCH")?.body).toEqual({ units: 3 });
  await page.getByRole("button", { name: "Start" }).click();
  await expect.poll(() => fake.writes.filter((w) => w.table === "change_requests" && w.method === "PATCH").at(-1)?.body).toEqual({ status: "in_progress" });
  const done = page.getByRole("button", { name: "Mark done" });
  await expect(done).toBeDisabled();
  await page.getByLabel("Outcome of Online bookings").fill("Bookings page live, with reminders.");
  await done.click();
  await expect.poll(() => fake.writes.filter((w) => w.table === "change_requests" && w.method === "PATCH").at(-1)?.body)
    .toEqual({ status: "done", outcome_note: "Bookings page live, with reminders." });

  await page.getByLabel("Answer as TEBOS").fill("Done: your bookings page is live.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect.poll(() => fake.writes.find((w) => w.table === "client_messages" && w.method === "POST")?.body)
    .toEqual({ org_id: ORG, body: "Done: your bookings page is live.", from_tebos: true });
});
