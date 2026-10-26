import { expect, test } from "@playwright/test";
import { installFakeSupabase, verifiedFactor } from "./fake-supabase";
import { USER_ID } from "./fixtures";

// REEDS intake in TEPOS: capture once with its source, a repeat adds nothing, a disagreement is shown, done needs
// evidence, and each source's real state is shown: not connected until a sync has run.

const TEPOS = "http://localhost:5175";
const IREKUN = "f1000000-0000-4000-8000-000000000003";
const now = () => new Date().toISOString();
test.use({ reducedMotion: "reduce" });

async function founder(page: import("@playwright/test").Page) {
  await page.clock.setFixedTime(new Date("2026-10-26T12:30:00+02:00"));
  const fake = await installFakeSupabase(page, { aal: "aal2", factors: [verifiedFactor()] });
  const t = fake.tables as unknown as Record<string, Record<string, unknown>[]>;
  t.organisations!.push({ id: IREKUN, name: "IREKUN", slug: "irekun", private: true, created_at: now() });
  t.memberships!.push({ org_id: IREKUN, user_id: USER_ID, role: "org_admin", created_at: now() });
  t.res_money_items = []; t.agent_contacts = [];
  return fake;
}

async function captureEmail(page: import("@playwright/test").Page, ref: string, due: string) {
  const form = page.getByTestId("capture");
  await form.getByLabel("Source").selectOption("email");
  await form.getByLabel("Its ID (optional)").fill(ref);
  await form.getByLabel("Link (optional)").fill(`https://mail.example/${ref}`);
  await form.getByLabel("From (optional)").fill("Principal");
  await form.getByLabel("Summary").fill("Please send the FICA checklist for the Linden listing");
  await form.getByLabel("Workspace").selectOption("agency");
  await form.getByLabel("The action").fill("Send the FICA checklist");
  await form.getByLabel("Due").fill(due);
  await form.getByRole("button", { name: "Capture" }).click();
}

test("capture once with its source; a repeat adds nothing; a later disagreement is shown, not overwritten", async ({ page }) => {
  const fake = await founder(page);
  await page.goto(`${TEPOS}/intake`);
  // the truth about each source: only typing is available until a sync has run
  await expect(page.getByTestId("source-email")).toContainText("Not connected");
  await expect(page.getByTestId("source-whatsapp_export")).toContainText("No sync has run");

  await captureEmail(page, "msg-001", "2026-10-26");
  await expect(page.getByTestId("capture-result")).toHaveText("Captured: 1 item.");
  await expect(page.getByTestId("commitment")).toHaveCount(1);
  await expect(page.getByTestId("commitment-source")).toContainText("ref msg-001");

  await captureEmail(page, "msg-001", "2026-10-26");
  await expect(page.getByTestId("capture-result")).toHaveText("Already captured: this source is on record, so nothing was added.");
  await expect(page.getByTestId("commitment")).toHaveCount(1);

  await captureEmail(page, "msg-002", "2026-10-29");
  await expect(page.getByTestId("capture-result")).toContainText("1 conflict to settle");
  await expect(page.getByTestId("conflicts")).toContainText("recorded date 2026-10-26, a later source says 2026-10-29");
  const t = fake.tables as unknown as Record<string, Record<string, unknown>[]>;
  expect(t.reeds_commitments![0]!.due_on).toBe("2026-10-26");

  // the morning brief on the week board shows it with its source, and says what isn't read automatically
  await page.goto(`${TEPOS}/`);
  await expect(page.getByTestId("reeds-priority")).toContainText("Send the FICA checklist");
  await expect(page.getByTestId("reeds-priority")).toContainText("From email: Please send the FICA checklist");
  await expect(page.getByTestId("reeds-sources")).toContainText("Email (not connected)");
});

test("no date stays unknown; done needs evidence; a decision waits for the founder", async ({ page }) => {
  const fake = await founder(page);
  await page.goto(`${TEPOS}/intake`);
  const form = page.getByTestId("capture");
  await form.getByLabel("Summary").fill("Owner wants a valuation; also decide on the Saturday show day");
  await form.getByLabel("The action").fill("Confirm the valuation date with the owner");
  await form.getByRole("button", { name: "Add another" }).click();
  await form.getByLabel("Kind").nth(1).selectOption("decision");
  await form.getByLabel("The question").fill("Take the Saturday show day?");
  await form.getByRole("button", { name: "Capture" }).click();
  await expect(page.getByTestId("capture-result")).toHaveText("Captured: 2 items.");
  await expect(page.getByTestId("no-date")).toHaveText("date unknown");
  await expect(page.getByTestId("decision")).toContainText("Take the Saturday show day?");

  const c = page.getByTestId("commitment");
  await c.getByRole("button", { name: "Ready" }).click();
  await c.getByRole("button", { name: "Done…" }).click();
  // the form can't be sent without evidence
  await c.getByRole("button", { name: "Mark done" }).click();
  expect(fake.writes.some((w) => w.method === "PATCH" && w.table === "reeds_commitments" && (w.body as Record<string, unknown>).status === "done")).toBe(false);
  await c.getByLabel("The evidence: what was sent, saved, booked or tested").fill("Owner confirmed 3 Nov by phone, noted in the case");
  await c.getByRole("button", { name: "Mark done" }).click();
  await expect(c).toContainText("Evidence: Owner confirmed 3 Nov by phone");
  const done = fake.writes.filter((w) => w.method === "PATCH" && w.table === "reeds_commitments").at(-1)!.body as Record<string, unknown>;
  expect(done).toMatchObject({ status: "done", completion_evidence: "Owner confirmed 3 Nov by phone, noted in the case" });

  await page.getByTestId("decision").getByLabel("Your decision").fill("Yes, if the photographer is booked");
  await page.getByTestId("decision").getByRole("button", { name: "Record the decision" }).click();
  await expect(page.getByTestId("decisions")).toContainText("No decisions waiting.");
});

test("intake fits a phone screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await founder(page);
  await page.goto(`${TEPOS}/intake`);
  await expect(page.getByTestId("intake-page")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
