import { expect, test } from "@playwright/test";
import { installFakeSupabase } from "./fake-supabase";
import { USER_ID } from "./fixtures";

const now = new Date().toISOString();
const CONSENT = "Yes, TEBOS may call me now on this number for a short intake call (about five minutes) about my business, and may record and transcribe it to follow up with me.";

test("meeting mode shows the film, then TEBOS rings the prospect on the spot, full screen with nothing of other clients", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  const t = fake.tables as Record<string, Array<Record<string, unknown>>>;
  t.platform_admins = [{ user_id: USER_ID, created_at: now }];
  t.platform_staff = [];
  t.opportunities = [{ id: "o9", enquiry_id: "e9", business: "Secret Client Co", status: "screened", plan: "starter", contact_name: "X", email: "x@x.test", screening: { flags: [] }, created_at: now }];

  await page.goto("/");
  await page.getByRole("link", { name: "Meeting mode" }).click();
  await expect(page.getByRole("heading", { name: "This is what TEBOS does for a business." })).toBeVisible();
  // a day in the life of a gym on TEBOS, each moment a real step of its operating system
  const film = page.getByTestId("scenario");
  await expect(film).toContainText("A gym");
  await page.getByRole("button", { name: "Next" }).click();
  await expect(film).toContainText("The owner drives in after hours");
  await page.getByRole("button", { name: "Next" }).click();
  await expect(film).toContainText("05:58");
  await expect(film).toContainText("Member at the door to checked in");
  await expect(film).toContainText("Automatic · runs on Access control");
  await expect(film).toContainText("Illustration · example names and numbers");
  await page.getByRole("button", { name: "A sports agency" }).click();
  await expect(film).toContainText("An illustrative sports agency");
  await page.getByRole("button", { name: "The TEBOS film" }).click();
  await expect(page.locator("video")).toBeVisible();
  // full screen: no staff navigation, no other client in sight
  await expect(page.getByRole("link", { name: "Pipeline" })).toHaveCount(0);
  await expect(page.getByText("Secret Client Co")).toHaveCount(0);

  await page.getByRole("button", { name: "Talk to TEBOS now" }).click();
  await page.getByRole("button", { name: "Call me now" }).click();
  await expect(page.getByText("Please add your name, the business name, a valid email address, your phone number, the size of the team, your agreement to the call.")).toBeVisible();
  expect(fake.writes.find((w) => w.table === "start_meeting_call")).toBeUndefined();

  await page.getByLabel("Your name").fill("Lerato Mokoena");
  await page.getByLabel("Business name").fill("Pulse Gym");
  await page.getByLabel("Mobile number").fill("082 555 0101");
  await page.getByLabel("Email").fill("lerato@pulse.test");
  await page.getByLabel("Team size").selectOption("6-20");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Call me now" }).click();

  await expect(page.getByRole("status")).toContainText("Calling you now");
  expect(fake.writes.find((w) => w.table === "start_meeting_call")?.body).toEqual({
    p_name: "Lerato Mokoena", p_business: "Pulse Gym", p_email: "lerato@pulse.test", p_phone: "082 555 0101", p_industry: null, p_size: "6-20", p_consent: CONSENT,
  });

  // the worker places the call, then it ends with their answer
  const call = t.intake_calls![0]!;
  call.status = "dialling";
  await expect(page.getByRole("status")).toContainText("Your phone is ringing.", { timeout: 8000 });
  Object.assign(call, { status: "completed", wants_to_proceed: true, outcome_source: "call", transcript: [{ role: "user", message: "Yes" }], ended_at: now });
  await expect(page.getByRole("status")).toContainText("Tomorrow morning you'll get an email", { timeout: 8000 });
});

test("people who aren't TEBOS staff can't use meeting mode", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  const t = fake.tables as Record<string, unknown[]>;
  t.platform_admins = [];
  t.platform_staff = [];
  await page.goto("/meet");
  await expect(page.getByText("This is for TEBOS's own staff.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Talk to TEBOS now" })).toHaveCount(0);
});

test("the pipeline shows what an intake call came to, and staff record an answer the call didn't settle", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  const t = fake.tables as Record<string, Array<Record<string, unknown>>>;
  t.platform_admins = [{ user_id: USER_ID, created_at: now }];
  t.platform_staff = [];
  const opp = (id: string, business: string) => ({ id, enquiry_id: `e-${id}`, plan: "starter", contact_name: "Lerato", business, email: "l@x.test", phone: "+27825550101",
    website: null, message: "Team size: 6-20", status: "screened", screening: { flags: [] }, source: "sales", owner_id: USER_ID, created_at: now, updated_at: now });
  t.opportunities = [opp("o1", "Pulse Gym"), opp("o2", "Iron Works")];
  const base = { requested_by: USER_ID, phone_number: "+27825550101", started_at: now, ended_at: now, duration_secs: 240, outcome_note: null, failure_detail: null,
    follow_up_due_at: now, follow_up_queued_at: null, created_at: now };
  t.intake_calls = [
    { ...base, id: "c1", enquiry_id: "e-o1", status: "completed", transcript: [{ role: "agent", message: "Would you like to go ahead?" }, { role: "user", message: "Yes, let's do it." }], wants_to_proceed: true, outcome_source: "call" },
    { ...base, id: "c2", enquiry_id: "e-o2", status: "completed", transcript: [{ role: "user", message: "Call me back." }], wants_to_proceed: null, outcome_source: null },
  ];
  t.payments = [];
  t.contracts = [];
  t.outbox_emails = [];

  await page.goto("/pipeline");
  const pulse = page.getByTestId("opportunity").filter({ hasText: "Pulse Gym" });
  await expect(pulse).toContainText("wants to go ahead");
  await expect(page.getByTestId("opportunity").filter({ hasText: "Iron Works" })).toContainText("call done: answer open");

  await page.goto("/pipeline/o1");
  await expect(page.getByTestId("intake")).toContainText("Wants to go ahead (said on the call)");
  await page.getByText("What was said (2 turns)").click();
  await expect(page.getByTestId("intake")).toContainText("Yes, let's do it.");
  await expect(page.getByRole("button", { name: "They want to go ahead" })).toHaveCount(0); // the call settled it

  await page.goto("/pipeline/o2");
  await page.getByLabel("How they answered (optional note)").fill("Said yes in the meeting");
  await page.getByRole("button", { name: "They want to go ahead" }).click();
  await expect.poll(() => fake.writes.find((w) => w.table === "intake_calls" && w.method === "PATCH")?.body).toEqual({ wants_to_proceed: true, outcome_note: "Said yes in the meeting" });
});
