import { expect, test } from "@playwright/test";
import { installFakeSupabase } from "./fake-supabase";
import { seedStudio } from "./booking-seed";
import { ORG } from "./fixtures";

// The AI crew (ADR 0020): agents in teams and shifts draft the work; an admin approves; a person sends and records
// how. The rules are tested in core (99zzj_ai_crew.sql, test/ai-crew.test.ts, test/crew-worker.test.ts).
const now = new Date().toISOString();
const agent = (id: string, name: string, team: string, shift: string) => ({ id, org_id: ORG, name, team, shift, provider: "xai", status: "active", instructions: null, created_by: null, created_at: now });

test("the crew's roster by team and shift, and an admin approving a draft before a person sends it", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  const t = fake.tables as Record<string, unknown[]>;
  seedStudio(t);
  t.ai_agents = [agent("g1", "Bookings · day", "bookings", "day"), agent("g2", "Bookings · night", "bookings", "night"), agent("g3", "Admin · day", "admin", "day")];
  t.ai_tasks = [{ id: "w1", org_id: ORG, team: "bookings", kind: "reply_enquiry", booking_id: "b1", agent_id: "g2", status: "drafted",
    brief: "Reply enquiry for BK-00001: Studio shoots, Mon 09 Nov 10:00 (SA time). No brief.", draft: "Hi Lerato, thanks for your request.",
    decided_by: null, decided_at: null, sent_note: null, created_at: now, updated_at: now }];

  await page.goto("/");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Crew" }).click();
  const roster = page.getByTestId("roster");
  await expect(roster.getByRole("region", { name: "Bookings team" })).toContainText("Bookings · day");
  await expect(roster.getByRole("region", { name: "Bookings team" })).toContainText("Bookings · night");
  // on duty: the shift it is now in South Africa (two day agents by day, one night agent by night)
  const saHour = (new Date().getUTCHours() + 2) % 24;
  await expect(roster.getByText("On duty")).toHaveCount(saHour >= 6 && saHour < 18 ? 2 : 1);
  await expect(page.getByTestId("gaps")).toContainText("Admin night, Social day, Social night");

  const work = page.getByTestId("work").getByRole("listitem", { name: "Reply to a booking request" });
  await expect(work).toContainText("Draft ready for review");
  await expect(work).toContainText("by Bookings · night");
  await work.getByLabel("Draft (edit before deciding)").fill("Hi Lerato, thanks for your request for next Monday.");
  await work.getByRole("button", { name: "Save edits" }).click();
  await work.getByRole("button", { name: "Approve" }).click();
  await expect(work).toContainText("Approved: send it");
  await work.getByLabel("After you've sent it: how, and to whom").fill("Emailed from bookings@ to the customer");
  await work.getByRole("button", { name: "Mark as sent" }).click();
  // the last write lands after the click returns: wait for it rather than reading at once
  await expect.poll(() => fake.writes.filter((w) => w.method === "PATCH" && w.table === "ai_tasks").map((w) => w.body)).toEqual([{ draft: "Hi Lerato, thanks for your request for next Monday." }, { status: "approved" }, { status: "sent", sent_note: "Emailed from bookings@ to the customer" }]);

  // an admin adds a night agent to fill a gap
  const add = page.getByRole("form", { name: "Add an agent" });
  await add.getByLabel("Name").fill("Admin · night");
  await add.getByLabel("Team").selectOption("admin");
  await add.getByLabel("Shift").selectOption("night");
  await add.getByRole("button", { name: "Add to the crew" }).click();
  await expect.poll(() => fake.writes.find((w) => w.method === "POST" && w.table === "ai_agents")?.body).toMatchObject({ org_id: ORG, name: "Admin · night", team: "admin", shift: "night" });
});
