import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { installFakeSupabase, type FakeSupabase } from "./fake-supabase";
import { ORG, USER_ID } from "./fixtures";

// Property Revenue Architecture: a case taken from intake to its assessment
// report. Every figure is labelled; nothing missing is shown as a number. The
// database's own rules are tested against real Postgres (core: 99zd); here the
// interface must pre-check them, show refusals, and compute only from records.

const CASE = "a1000000-0000-4000-8000-000000000001";
const now = () => new Date().toISOString();

function seed(fake: FakeSupabase, over: Record<string, unknown> = {}) {
  const t = fake.tables as unknown as Record<string, Record<string, unknown>[]>;
  t.platform_admins = [{ user_id: USER_ID, created_at: now() }];
  t.property_cases = [{
    id: CASE, org_id: ORG, ref: "PA-001", label: "Client A rental (test)", property_type: "residential_multi", problem: "underperforming_income",
    objective: "improve_cash_flow", suspected_cause: "unknown", authority: "unconfirmed", authority_note: null, constraints: null, desired_outcome: null,
    disposition: "hold_optimise", disposition_reason: "Income underperformance reported; evidence incomplete.", disposition_at: now(),
    created_by: USER_ID, created_at: now(), updated_at: now(), ...over,
  }];
  t.property_evidence = [];
  t.property_figures = [];
  t.property_pathways = [];
  t.property_gates = [];
  return t;
}

async function figure(page: Page, label: string, value: string) {
  const row = page.getByRole("form", { name: label, exact: true });
  await row.getByRole("spinbutton").fill(value);
  await row.getByRole("button", { name: "Save" }).click();
  await expect(row.getByText(/^Recorded:/)).toBeVisible();
}

test("a case opens from the menu, and the database numbers it", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  seed(fake);
  (fake.tables as unknown as Record<string, unknown[]>).property_cases = [];
  await page.goto("/");
  await page.getByRole("link", { name: "Property cases" }).click();
  await expect(page.getByRole("heading", { name: "Property cases" })).toBeVisible();
  await expect(page.getByText("No cases yet.")).toBeVisible();
  const form = page.getByRole("form", { name: "Open a case" });
  // a reason is required
  await form.getByLabel("Case / property label").fill("Client B duplex");
  await form.getByRole("button", { name: "Open case" }).click();
  await expect(form.getByRole("alert")).toContainText("at least 10 characters");
  await form.getByLabel("Why HOLD–OPTIMISE for now").fill("Owner reports vacancies; no documents yet.");
  await form.getByRole("button", { name: "Open case" }).click();
  await expect.poll(() => fake.writes.find((w) => w.table === "property_cases" && w.method === "POST")?.body).toMatchObject({
    org_id: ORG, label: "Client B duplex", problem: "underperforming_income", objective: "improve_cash_flow", disposition_reason: "Owner reports vacancies; no documents yet.",
  });
  // no reference is sent: the database assigns PA-nnn
  expect(fake.writes.find((w) => w.table === "property_cases")!.body).not.toHaveProperty("ref");
  await expect(page.getByRole("heading", { name: "Client B duplex" })).toBeVisible();
});

test("figures stay unknown until supplied, carry their basis, and are computed only when complete", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  seed(fake);
  await page.goto(`/property/${CASE}`);
  await expect(page.getByTestId("m-cash")).toHaveText("Not established");
  await expect(page.getByTestId("m-evidence")).toHaveText("0%");
  await page.getByRole("button", { name: "Economics" }).click();
  for (const [label, v] of [["Scheduled rent, all units let", "50000"], ["Other property income", "0"], ["Vacancy loss (rent of vacant units)", "5000"],
    ["Rent due from occupied units", "45000"], ["Rent actually collected", "40500"], ["Operating expenses", "12000"], ["Debt service", "15000"]] as const) {
    await figure(page, label, v);
  }
  // one input still missing: no number, and it says which
  const cash = page.getByTestId("kpi-Cash flow after debt and reserve");
  await expect(cash).toContainText("Not established");
  await expect(cash).toContainText("Missing: maintenance / capital reserve");
  await figure(page, "Maintenance / capital reserve", "2000");
  await expect(cash).toContainText("R11 500");
  await expect(cash).toContainText("Owner-reported");
  // a supplied zero is a real zero, not unknown
  await expect(page.getByTestId("kpi-Effective income")).toContainText("R40 500");
  // the writes carry the basis; nothing was sent as verified
  const sent = fake.writes.filter((w) => w.table === "property_figures").map((w) => w.body as { basis: string });
  expect(sent.every((b) => b.basis === "owner_reported")).toBe(true);
  // a rent roll that doesn't reconcile is flagged
  await figure(page, "Rent due from occupied units", "50000");
  await expect(page.getByRole("alert").filter({ hasText: "doesn't reconcile" }).first()).toBeVisible();
  // annual view
  await page.getByRole("button", { name: "Monthly" }).click();
  await expect(page.getByTestId("kpi-Net operating income (NOI)")).toContainText("R");
});

test("a verified figure needs checked evidence; evidence readiness weighs quality", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  seed(fake);
  await page.goto(`/property/${CASE}`);
  await page.getByRole("button", { name: "Economics" }).click();
  const row = page.getByRole("form", { name: "Rent due from occupied units", exact: true });
  await row.getByRole("spinbutton").fill("45000");
  await row.getByLabel("Basis").selectOption("verified");
  await row.getByRole("button", { name: "Save" }).click();
  await expect(row.getByRole("alert")).toContainText("names the evidence it was checked against");
  expect(fake.writes.filter((w) => w.table === "property_figures")).toHaveLength(0);

  // record the rent roll as received: half credit
  await page.getByRole("button", { name: "Evidence room" }).click();
  await page.getByTestId("evidence-rent_roll").getByRole("button", { name: "Record" }).click();
  const form = page.getByRole("form", { name: "Record evidence" });
  await form.getByLabel("Status").selectOption("checked");
  await form.getByRole("button", { name: "Save evidence" }).click();
  await expect(form.getByRole("alert")).toContainText("Record the date the document was received");
  await form.getByLabel("Received on").fill("2026-10-10");
  await form.getByRole("button", { name: "Save evidence" }).click();
  await expect(form.getByRole("alert")).toContainText("source and your confidence");
  await form.getByLabel("Source").fill("Managing agent's statement");
  await form.getByLabel("Confidence").selectOption("high");
  await form.getByLabel("Period to").fill("2026-09-30");
  await form.getByRole("button", { name: "Save evidence" }).click();
  await expect(page.getByTestId("evidence-rent_roll")).toContainText("checked · high confidence");
  await expect(page.getByRole("progressbar", { name: "Evidence readiness" })).toHaveAttribute("aria-valuenow", "13"); // 3 of 24 weight points

  // now it can verify the figure
  await page.getByRole("button", { name: "Economics" }).click();
  await row.getByRole("spinbutton").fill("45000");
  await row.getByLabel("Basis").selectOption("verified");
  await row.getByLabel("Checked evidence").selectOption({ label: "Current rent roll" });
  await row.getByRole("button", { name: "Save" }).click();
  await expect(row.getByText(/Recorded: R45 000 · Verified/)).toBeVisible();
});

test("a disposition needs its reason; PROCEED and the evidence gate need confirmed authority; gates pass in order", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  seed(fake);
  await page.goto(`/property/${CASE}`);
  await page.getByRole("button", { name: "Assessment" }).click();
  const disp = page.getByRole("form", { name: "Disposition" });
  await disp.getByLabel("New disposition").selectOption("proceed");
  await disp.getByLabel("Reason and evidence for the change").fill("Statements received and reconciled.");
  await disp.getByRole("button", { name: "Record disposition" }).click();
  await expect(disp.getByRole("alert")).toContainText("authority confirmed");
  await disp.getByLabel("New disposition").selectOption("nurture");
  await disp.getByRole("button", { name: "Record disposition" }).click();
  await expect.poll(() => fake.writes.find((w) => w.table === "property_cases" && w.method === "PATCH")?.body)
    .toMatchObject({ disposition: "nurture", disposition_reason: "Statements received and reconciled." });

  await page.getByRole("button", { name: "Execution gates" }).click();
  const second = page.getByTestId("gate-root_cause");
  await second.getByLabel("Status").selectOption("passed");
  await second.getByLabel("Owner").fill("Tidy");
  await second.getByLabel("Evidence / note").fill("Collections leak");
  await second.getByRole("button", { name: "Update" }).click();
  await expect(second.getByRole("alert")).toContainText("must pass first");
  const first = page.getByTestId("gate-evidence");
  await first.getByLabel("Status").selectOption("passed");
  await first.getByLabel("Owner").fill("Tidy");
  await first.getByLabel("Evidence / note").fill("Statements reconciled");
  await first.getByRole("button", { name: "Update" }).click();
  await expect(first.getByRole("alert")).toContainText("authority confirmed");
  expect(fake.writes.filter((w) => w.table === "property_gates")).toHaveLength(0);
});

test("a recommendation explains itself, and the report separates facts, statements and estimates, with exports", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  const t = seed(fake, { authority: "confirmed" });
  t.property_evidence = [{ id: "ev1", org_id: ORG, case_id: CASE, category: "income", kind: "rent_roll", title: "Current rent roll", source: "Agent", period_start: null,
    period_end: "2026-09-30", received_on: "2026-10-10", responsible: null, status: "checked", confidence: "high", document_ref: null, notes: null, follow_up: null, created_at: now(), updated_at: now() }];
  const f = (key: string, value: number, basis: string, evidence_id: string | null = null) =>
    ({ id: `f-${key}`, org_id: ORG, case_id: CASE, key, value, basis, evidence_id, as_of: "2026-10-01", note: null, recorded_by: USER_ID, created_at: now(), updated_at: now() });
  t.property_figures = [f("rent_due", 45000, "verified", "ev1"), f("operating_expenses", 12000, "owner_reported"), f("uplift", 3000, "estimated")];
  await page.goto(`/property/${CASE}`);
  await page.getByRole("button", { name: "Pathways" }).click();
  await page.getByTestId("pathway-keep_optimise").getByRole("button", { name: "Assess" }).click();
  const form = page.getByRole("form", { name: "Assess Keep / optimise" });
  await form.getByLabel("Status").selectOption("recommended");
  await form.getByLabel("Rationale").fill("Collections are the leak.");
  await form.getByRole("button", { name: "Save pathway" }).click();
  await expect(form.getByRole("alert")).toContainText("why it beats the alternatives");
  await form.getByLabel("Why it is preferred over the alternatives").fill("No capital event needed.");
  await form.getByLabel("Evidence it rests on").fill("Rent roll against receipts.");
  await form.getByLabel("What new evidence would change it").fill("Arrears above three months.");
  await form.getByLabel("Decision owner").fill("Owner");
  await form.getByLabel("Letting / property practitioner").check();
  await form.getByRole("button", { name: "Save pathway" }).click();
  await expect(page.getByTestId("pathway-keep_optimise")).toContainText("recommended");

  await page.getByRole("link", { name: "Assessment report" }).click();
  const report = page.getByTestId("property-report");
  await expect(report.getByRole("heading", { name: "Property Opportunity Assessment · PA-001" })).toBeVisible();
  await expect(report.getByText(/not a valuation, legal opinion, credit decision/).first()).toBeVisible();
  const section = (name: string) => report.locator(".pra-report-section").filter({ has: page.getByRole("heading", { name, exact: true }) });
  await expect(section("Verified facts")).toContainText("Rent due from occupied units");
  await expect(section("Verified facts")).not.toContainText("Operating expenses");
  await expect(section("Owner-reported statements")).toContainText("R12 000");
  await expect(section("Estimates")).toContainText("Estimated monthly net benefit");
  await expect(section("Unknowns")).toContainText("Scheduled rent, all units let: not supplied");
  await expect(section("Recommendation")).toContainText("No capital event needed.");
  await expect(section("Specialists required")).toContainText("Letting / property practitioner");
  await expect(section("Baseline economics (monthly)")).toContainText("Not established");

  const [json] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export case JSON" }).click()]);
  expect(json.suggestedFilename()).toMatch(/^PA-001-case-\d{4}-\d{2}-\d{2}\.json$/);
  const data = JSON.parse(readFileSync((await json.path())!, "utf8"));
  expect(data).toMatchObject({ format: "tidy-enterprise.property-case/v1", case: { ref: "PA-001" }, assessment: { meta: { ref: "PA-001" } } });
  expect(data.case).not.toHaveProperty("created_by");
  const downloads: string[] = [];
  page.on("download", (d) => downloads.push(d.suggestedFilename()));
  await page.getByRole("button", { name: "Export CSV" }).click();
  await expect.poll(() => downloads.length).toBe(2);
  expect(downloads.some((n) => /evidence/.test(n)) && downloads.some((n) => /figures/.test(n))).toBe(true);
});

test("a viewer reads the case but can't change it", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  seed(fake);
  const t = fake.tables as unknown as Record<string, Record<string, unknown>[]>;
  for (const m of t.memberships ?? []) if (m.user_id === USER_ID) m.role = "viewer";
  await page.goto(`/property/${CASE}`);
  await expect(page.getByRole("heading", { name: "Client A rental (test)" })).toBeVisible();
  await page.getByRole("button", { name: "Economics" }).click();
  await expect(page.getByRole("form", { name: "Rent due from occupied units", exact: true }).getByRole("spinbutton")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0);
});
