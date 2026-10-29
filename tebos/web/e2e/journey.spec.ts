import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { installFakeSupabase, type FakeSupabase } from "./fake-supabase";
import { ORG, USER_ID } from "./fixtures";

// The Property Revenue Architect Platform, Release 1 (docs/pra-platform/release-1.md §4): a landlord, in their own
// organisation in the TEBOS app, takes a property from its first record to a resolved problem. The interface must
// pre-check the database's rules and explain each refusal; the rules themselves are proved against real Postgres
// (core: supabase/tests/99zx_property_journey.sql), including that other organisations see nothing.

const now = () => new Date().toISOString();
const inDays = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
type Tables = Record<string, Record<string, unknown>[]>;

function empty(fake: FakeSupabase): Tables {
  const t = fake.tables as unknown as Tables;
  for (const k of ["property_cases", "property_problems", "property_evidence", "property_workstreams", "property_baselines", "property_outcome_reviews", "audit_events"]) t[k] = [];
  return t;
}

const PROP = "c1000000-0000-4000-8000-000000000001";
function seedProperty(t: Tables, over: Record<string, unknown> = {}) {
  t.property_cases!.push({
    id: PROP, org_id: ORG, ref: "PA-001", label: "Flat in Hatfield (test)", property_type: "single_residential", area: "Hatfield, Pretoria",
    current_use: "Let to one tenant", problem: "underperforming_income", objective: "improve_cash_flow", suspected_cause: "unknown", authority: "unconfirmed",
    authority_note: null, constraints: null, desired_outcome: null, disposition: "hold_optimise", disposition_reason: "The owner is tracking this property.",
    disposition_at: now(), next_review_on: null, created_by: USER_ID, created_at: now(), updated_at: now(), ...over,
  });
  t.property_problems!.push({
    id: "c2000000-0000-4000-8000-000000000001", org_id: ORG, case_id: over.id ?? PROP, category: "maintenance", title: "Geyser leaks",
    experienced: "Water marks under the geyser after every weekend.", consequence: null, workaround: null, intervention: null, specialist: null,
    expected_result: null, measure: null, status: "open", result_note: null, closed_on: null, created_by: USER_ID, created_at: now(), updated_at: now(),
  });
}

async function stage(page: Page, label: string) {
  await expect(page.getByRole("region", { name: "Where it stands" }).locator(".badge")).toHaveText(label);
}

test("a landlord takes a property from its first record to a resolved problem, with evidence at every step", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  const t = empty(fake);
  await page.goto("/");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Properties" }).click();
  await expect(page.getByRole("heading", { name: "Your properties" })).toBeVisible();
  await expect(page.getByText("No properties yet.")).toBeVisible();

  // 1. create the property: what isn't known stays unknown
  await page.getByRole("button", { name: "Add a property" }).click();
  const add = page.getByRole("form", { name: "Add a property" });
  await add.getByRole("button", { name: "Add property" }).click();
  await expect(add.getByRole("alert")).toContainText("name you'll recognise");
  await add.getByLabel("Property name").fill("Duplex in Soshanguve (test)");
  await add.getByLabel("Area").fill("Soshanguve, Pretoria");
  await add.getByRole("button", { name: "Add property" }).click();
  await expect(page).toHaveURL(/\/properties\/[0-9a-f-]+$/);
  expect(fake.writes.find((w) => w.table === "property_cases" && w.method === "POST")?.body).toMatchObject({
    org_id: ORG, label: "Duplex in Soshanguve (test)", area: "Soshanguve, Pretoria", property_type: null, current_use: null,
    disposition_reason: expect.stringContaining("no professional assessment"),
  });
  await expect(page.getByRole("heading", { name: "Duplex in Soshanguve (test)" })).toBeVisible();
  await stage(page, "Discover");
  const next = page.getByTestId("next-actions");
  await expect(next).toContainText("Complete the property profile");
  await expect(next).toContainText("Record what is holding the property back");
  await expect(next).toContainText("Not known yet");

  // 2. record a problem; tenants' personal details are refused
  await page.getByRole("button", { name: "Record a problem" }).click();
  const pf = page.getByRole("form", { name: "Record a problem" });
  await pf.getByLabel("Short name").fill("Unit 2 rent paid late");
  await pf.getByLabel("What is happening").fill("Tenant on 082 555 1234 pays after the 7th.");
  await pf.getByRole("button", { name: "Record problem" }).click();
  await expect(pf.getByRole("alert")).toContainText("Leave out phone numbers");
  expect(fake.writes.some((w) => w.table === "property_problems")).toBe(false);
  await pf.getByLabel("What is happening").fill("Rent for unit 2 arrives after the 7th in three of the last four months.");
  await pf.getByLabel("What it costs you").fill("The bond is paid from savings when rent is late.");
  await pf.getByRole("button", { name: "Record problem" }).click();
  const problem = page.getByRole("listitem", { name: "Unit 2 rent paid late" });
  await expect(problem.locator(".badge").first()).toHaveText("Open");
  await expect(problem).toContainText("No evidence recorded");
  await stage(page, "Assess");
  await expect(next).toContainText('Gather evidence for "Unit 2 rent paid late"');

  // 3. reference the evidence: where it came from and where it is kept
  await problem.getByRole("button", { name: "Add evidence" }).click();
  const ef = problem.getByRole("form", { name: "Add evidence" });
  await ef.getByLabel("What it is").fill("Bank statements, July to October");
  await ef.getByRole("button", { name: "Add" }).click();
  await expect(ef.getByRole("alert")).toContainText("Say where it came from");
  await ef.getByLabel("Where it came from").fill("Owner's bank app");
  await ef.getByLabel("Where it is kept").fill("Drive / Property / Bank");
  await ef.getByRole("button", { name: "Add" }).click();
  // 4. what is verified, missing or uncertain
  await expect(problem).toContainText("Received, not yet checked");
  await stage(page, "Strategise");
  await expect(next).toContainText('Agree an action for "Unit 2 rent paid late"');
  await expect(next).toContainText("The evidence hasn't been checked yet");

  // 5–6. agree an action: who, by when, why, and how we'll know it's done
  await problem.getByRole("button", { name: "Agree an action" }).click();
  const af = problem.getByRole("form", { name: "Agree an action" });
  await af.getByLabel("What is to be done").fill("Agree a new debit order date");
  await af.getByLabel("Who is responsible").fill("Owner");
  await af.getByLabel("Deadline").fill(inDays(7));
  await af.getByLabel("Why it is needed").fill("short");
  await af.getByRole("button", { name: "Agree action" }).click();
  await expect(af.getByRole("alert")).toContainText("Say why this action is needed");
  await af.getByLabel("Why it is needed").fill("Rent arrives after the bond is paid; an earlier date removes the gap.");
  await af.getByLabel("Done when").fill("Signed addendum on file");
  await af.getByRole("button", { name: "Agree action" }).click();
  await stage(page, "Execute");
  expect(fake.writes.find((w) => w.table === "property_workstreams" && w.method === "POST")?.body).toMatchObject({
    owner: "Owner", reason: expect.stringContaining("earlier date"), done_when: "Signed addendum on file",
  });

  // 7. complete it: done needs its proof
  const action = problem.getByRole("listitem", { name: "Agree a new debit order date" });
  await action.getByRole("button", { name: "Done" }).click();
  const done = action.getByRole("form", { name: "Complete Agree a new debit order date" });
  await done.getByLabel("What was done").fill("Addendum signed by owner and tenant");
  await done.getByRole("button", { name: "Mark done" }).click();
  await expect(action.getByRole("alert")).toContainText("Done needs its proof");
  await done.getByLabel("Proof").selectOption({ label: "Bank statements, July to October" });
  await done.getByRole("button", { name: "Mark done" }).click();
  await expect(action.locator(".badge")).toHaveText("Done");
  await expect(next).toContainText('Check whether "Unit 2 rent paid late" is fixed');

  // 8. resolution rests on checked evidence; the journey reaches Optimise
  const move = problem.getByRole("form", { name: "Move Unit 2 rent paid late" });
  await move.getByLabel("Move this problem to").selectOption({ label: "Action planned" });
  await move.getByLabel("The intervention").fill("Move the debit order date to the 1st, agreed in writing.");
  await move.getByRole("button", { name: "Save" }).click();
  await expect(problem.locator(".badge").first()).toHaveText("Action planned");
  await move.getByLabel("Move this problem to").selectOption({ label: "Resolved" });
  await move.getByLabel("What happened: the result").fill("November rent arrived on the 2nd, before the bond debit.");
  await move.getByRole("button", { name: "Save" }).click();
  await expect(move.getByRole("alert")).toContainText("checked evidence");
  const stmt = problem.getByRole("listitem", { name: "Bank statements, July to October" });
  await stmt.getByRole("button", { name: "Check it" }).click();
  await stmt.getByLabel("What you checked").fill("November rent received on the 2nd");
  await stmt.getByRole("button", { name: "Mark checked" }).click();
  await expect(problem).toContainText("Checked");
  await move.getByLabel("Move this problem to").selectOption({ label: "Resolved" });
  await move.getByLabel("What happened: the result").fill("November rent arrived on the 2nd, before the bond debit.");
  await move.getByRole("button", { name: "Save" }).click();
  await expect(problem.locator(".badge").first()).toHaveText("Resolved");
  await stage(page, "Optimise");
  await expect(next).toContainText("Look for the next constraint");
  const ms = page.getByTestId("milestones");
  for (const m of ["Property recorded", "First problem recorded", "First evidence received", "First action agreed", "First action completed, with proof", "Problem resolved, with checked evidence"]) {
    await expect(ms).toContainText(m);
  }
  expect(t.property_problems![0]).toMatchObject({ status: "resolved", closed_on: expect.any(String) });

  // 9. the history, from the audit trail
  const prob = t.property_problems![0]!;
  t.audit_events!.push({
    id: 9001, org_id: ORG, occurred_at: now(), actor_type: "user", actor_id: USER_ID, action: "property_problems.update", entity_type: "property_problems",
    entity_id: prob.id, before: { title: prob.title, status: "planned" }, after: { title: prob.title, status: "resolved" }, prev_hash: null, hash: "x",
  });
  await page.reload();
  await expect(page.getByTestId("journey-history")).toContainText("Problem changed: Unit 2 rent paid late · planned → resolved");

  // 10. export the owner's own records
  const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export my records" }).click()]);
  expect(file.suggestedFilename()).toBe("PA-001-property-journey.json");
  const data = JSON.parse(readFileSync((await file.path())!, "utf8"));
  expect(data).toMatchObject({ format: "tebos.property-journey/v1", property: { label: "Duplex in Soshanguve (test)" }, journey: { stage: { stage: "optimise" } } });
  expect(data.problems[0]).toMatchObject({ title: "Unit 2 rent paid late", status: "resolved" });
  expect(data.problems[0]).not.toHaveProperty("created_by");
  expect(data.property).not.toHaveProperty("created_by");
  expect(data.history).toHaveLength(1);
});

test("a viewer reads the journey but can't change it", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  const t = empty(fake);
  seedProperty(t);
  for (const m of t.memberships!) if (m.user_id === USER_ID) m.role = "viewer";
  await page.goto(`/properties/${PROP}`);
  await expect(page.getByRole("heading", { name: "Flat in Hatfield (test)" })).toBeVisible();
  await expect(page.getByRole("listitem", { name: "Geyser leaks" })).toBeVisible();
  await expect(page.getByTestId("next-actions")).toContainText('Gather evidence for "Geyser leaks"');
  await expect(page.getByRole("button", { name: "Record a problem" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add evidence" })).toHaveCount(0);
  await expect(page.getByRole("form")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Export my records" })).toBeVisible();
});

test("the portfolio places each property on its journey, and works on a phone", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  const t = empty(fake);
  seedProperty(t);
  seedProperty(t, { id: "c1000000-0000-4000-8000-000000000002", ref: "PA-002", label: "Townhouse in Centurion (test)", area: "Centurion" });
  t.property_problems![1]!.id = "c2000000-0000-4000-8000-000000000002";
  t.property_workstreams!.push({
    id: "c3000000-0000-4000-8000-000000000001", org_id: ORG, case_id: "c1000000-0000-4000-8000-000000000002", problem_id: "c2000000-0000-4000-8000-000000000002",
    title: "Get a plumber's quote", owner: "Owner", due_on: inDays(-3), status: "planned", reason: "The leak is damaging the ceiling below.", done_when: "Written quote",
    depends_on: null, budget: null, approval: "not_needed", approved_by: null, approved_on: null, completion_evidence: null, completed_on: null,
    completion_evidence_id: null, note: null, created_at: now(), updated_at: now(),
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/properties");
  await expect(page.getByTestId("portfolio-totals")).toHaveText("2 properties · 2 open problems · 1 overdue actions");
  const town = page.getByRole("listitem").filter({ hasText: "Townhouse in Centurion (test)" });
  await expect(town).toContainText("Execute");
  await expect(town).toContainText('Follow up "Get a plumber\'s quote"');
  await expect(page.getByRole("listitem").filter({ hasText: "Flat in Hatfield (test)" })).toContainText("Assess");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await town.getByRole("link", { name: "Townhouse in Centurion (test)" }).click();
  await expect(page.getByTestId("next-actions")).toContainText("It was due on");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
