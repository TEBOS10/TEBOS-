import { expect, test } from "@playwright/test";
import { installFakeSupabase } from "./fake-supabase";
import { ORG, USER_ID } from "./fixtures";

// Milestone 3: the client works with TEBOS from their own account (sees where their website stands, approves, asks
// for changes); TEBOS's maintainers see the team's load and record accounts, costs and history. The rules are tested
// in core (99zzc_web_delivery_portal.sql); here the interface must show them and never claim what didn't happen.
const now = new Date().toISOString();
const M2 = "00000000-0000-4000-8000-0000000000b2";
const project = (over: Record<string, unknown> = {}) => ({
  id: "p1", ref: "WP-0001", org_id: ORG, name: "Our new website", website_type: "booking", primary_objective: "bookings", plan: "starter",
  status: "approval", status_note: "Scope 1 and the design direction are with you to approve.", deadline_on: null, clock_paused_on: null,
  maintainer_id: M2, created_by: M2, created_at: now, updated_at: now, ...over,
});
const scope = { id: "r1", project_id: "p1", org_id: ORG, revision: 1, pages: ["Home", "Services", "Book", "Contact"], features: ["Booking request form"],
  workflows: ["Booking request to confirmation"], exclusions: "No online payments in this phase.", primary_conversion: "Send a booking request",
  acceptance_criteria: ["A booking request saves, or shows an error and keeps what was typed."], recurring_costs: "None", created_by: M2, created_at: now };

function seed(t: Record<string, unknown[]>, over: Record<string, unknown> = {}) {
  t.web_projects = [project(over)];
  t.web_scope_revisions = [scope];
  t.web_project_approvals = [];
  t.web_readiness_items = [];
  t.web_qa_runs = [];
  t.web_tasks = [];
  t.web_task_dependencies = [];
  t.web_assets = [{ id: "a1", project_id: "p1", org_id: ORG, label: "Logo (SVG)", kind: "logo", source: "unknown", status: "missing", licence_note: null, location: null, created_by: M2, created_at: now, updated_at: now }];
  t.web_deployments = [];
  t.web_integrations = [];
  t.web_project_costs = [];
  t.change_requests = [];
  t.web_history = [{ project_id: "p1", occurred_at: now, by_tebos: true, action: "web_projects.update", entity_type: "web_projects", from_status: "scope_review", to_status: "approval", note: "Scope 1 and the design direction are with you to approve." }];
  t.billing_accounts = [{ id: "b1", opportunity_id: "o1", org_id: ORG, plan: "starter", monthly_cents: 50000, currency: "ZAR", anchor_day: 1, next_invoice_on: now.slice(0, 10), status: "active", created_at: now, updated_at: now }];
}

test("the client sees their website, what TEBOS needs from them, and approves from their own account", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  seed(fake.tables as Record<string, unknown[]>);
  await page.goto("/");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Your website" }).click();
  await expect(page.getByRole("heading", { name: "Your website" })).toBeVisible();
  const todos = page.getByTestId("client-todos");
  await expect(todos).toContainText("Approve the scope and its costs");
  await expect(todos).toContainText("Approve the design direction");
  await expect(todos).toContainText("Send 1 item TEBOS needs from you");
  await expect(page.getByText("No online payments in this phase.")).toBeVisible();
  await expect(page.getByTestId("web-history")).toContainText("TEBOS");

  await page.getByRole("button", { name: "Approve the scope and its costs" }).click();
  await expect(page.getByText("Approved").first()).toBeVisible();
  const sent = fake.writes.find((w) => w.method === "POST" && w.table === "web_project_approvals")!.body as Record<string, unknown>;
  expect(sent).toMatchObject({ project_id: "p1", revision_id: "r1", kind: "scope" });
  // the release isn't offered before client review
  await expect(page.getByRole("button", { name: /Approve the release/ })).toHaveCount(0);
});

test("the client asks TEBOS for a change; a refusal from their plan is explained, not hidden", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  seed(fake.tables as Record<string, unknown[]>, { status: "handover", status_note: "Live; handover pack sent." });
  await page.goto("/website");
  const form = page.getByRole("form", { name: "Ask for a change" });
  await form.getByLabel("What should change?").fill("New gallery photos");
  await form.getByLabel("Details").fill("Replace the three gallery photos with the ones we sent.");
  fake.refuse({ table: "change_requests", method: "POST", hint: "TEBOS_OUT_OF_PLAN", message: "this month's 5 change requests are used" });
  await form.getByRole("button", { name: "Send the request" }).click();
  await expect(form.getByRole("alert")).toContainText("this month's 5 change requests are used");
  await expect(form.getByRole("status")).toHaveCount(0);
  fake.refuse(null);
  await form.getByRole("button", { name: "Send the request" }).click();
  await expect(form.getByRole("status")).toContainText("Received by TEBOS");
  await expect(page.getByTestId("client-changes")).toContainText("New gallery photos");
  const sent = fake.writes.filter((w) => w.method === "POST" && w.table === "change_requests").at(-1)!.body as Record<string, unknown>;
  expect(sent).toMatchObject({ org_id: ORG, web_project_id: "p1", title: "New gallery photos" });
});

test("a client who isn't their organisation's admin can't approve", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  const t = fake.tables as Record<string, Array<Record<string, unknown>>>;
  seed(t);
  t.memberships = t.memberships!.map((m) => (m.user_id === USER_ID ? { ...m, role: "viewer" } : m));
  await page.goto("/website");
  await expect(page.getByText("Approve the scope and its costs: waiting for your organisation's admin.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve the scope and its costs" })).toHaveCount(0);
  await expect(page.getByText("Your organisation's admin or an operator can ask for changes.")).toBeVisible();
});

test("maintainers see the team's load and record the client's accounts and costs; the client's requests land on the project", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  const t = fake.tables as Record<string, unknown[]>;
  seed(t);
  t.memberships = [];
  t.platform_admins = [];
  t.platform_staff = [{ user_id: USER_ID, role: "maintainer", added_by: null, created_at: now }, { user_id: M2, role: "maintainer", added_by: null, created_at: now }];
  t.staff_profiles = [{ user_id: USER_ID, display_name: "Lindiwe" }, { user_id: M2, display_name: "Sipho" }];
  t.organisations = [{ id: ORG, name: "Northwind Studio", slug: "northwind", private: false, app: "tebos", created_at: now }];
  t.change_requests = [{ id: "c1", org_id: ORG, web_project_id: "p1", requested_by: "x", title: "New gallery photos", detail: "Replace the three photos.", units: 1, status: "received", outcome_note: null, period: now.slice(0, 8) + "01", created_at: now, updated_at: now, finished_at: null }];
  await page.goto("/web-delivery");
  await expect(page.getByTestId("web-team")).toContainText("Sipho");
  await expect(page.getByTestId("web-team")).toContainText("1 of 8 open");
  await expect(page.getByTestId("web-project")).toContainText("Run by Sipho");

  await page.goto("/web-delivery/p1");
  await expect(page.getByTestId("web-changes")).toContainText("New gallery photos");
  await page.getByLabel("Maintainer").selectOption(USER_ID);
  await expect.poll(() => fake.writes.some((w) => w.method === "PATCH" && w.table === "web_projects" && (w.body as Record<string, unknown>).maintainer_id === USER_ID)).toBe(true);

  // an account with access needs a way for that access to end
  const accounts = page.getByRole("heading", { name: "Accounts and access" }).locator("xpath=ancestor::section[1]");
  await accounts.getByRole("button", { name: "Add" }).click();
  const acc = page.getByRole("form", { name: "Add an account" });
  await acc.getByLabel("Provider").fill("Static host");
  await acc.getByLabel("What the site uses it for").fill("Hosts the client's website.");
  await acc.getByLabel("How TEBOS's access ends").fill("short");
  await acc.getByRole("button", { name: "Record the account" }).click();
  // the form itself won't send it (and the database would refuse it: 99zzc)
  expect(fake.writes.some((w) => w.table === "web_integrations")).toBe(false);
  await acc.getByLabel("How TEBOS's access ends").fill("Remove TEBOS from the client's team at handover.");
  await acc.getByRole("button", { name: "Record the account" }).click();
  await expect(page.getByTestId("web-integrations")).toContainText("The client's account · TEBOS: Can deploy");

  // a recurring cost the client pays must be disclosed first
  const costs = page.getByRole("heading", { name: "Costs" }).locator("xpath=ancestor::section[1]");
  await costs.getByRole("button", { name: "Add" }).click();
  const cost = page.getByRole("form", { name: "Add a cost" });
  await cost.getByLabel("What it is").fill("Hosting plan");
  await cost.getByLabel("Amount (rand)").fill("120");
  await cost.getByLabel("How often").selectOption("monthly");
  await cost.getByLabel("Paid by").selectOption("client");
  await cost.getByRole("button", { name: "Record the cost" }).click();
  await expect(cost.getByRole("alert")).toContainText("must be disclosed to them first");
  await cost.getByLabel("Disclosed to the client").check();
  await cost.getByRole("button", { name: "Record the cost" }).click();
  await expect(page.getByTestId("web-costs")).toContainText("Hosting plan · R120 a month · paid by the client · disclosed");
});

test("screenshots (on request only)", async ({ page }) => {
  test.skip(!process.env.SHOTS, "screenshots only on request");
  const fake = await installFakeSupabase(page);
  seed(fake.tables as Record<string, unknown[]>);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/website");
  await page.getByTestId("client-todos").waitFor();
  await page.screenshot({ path: `${process.env.SHOTS}/portal-phone.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
