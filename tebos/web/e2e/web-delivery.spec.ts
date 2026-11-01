import { expect, test, type Page } from "@playwright/test";
import { installFakeSupabase, type FakeSupabase } from "./fake-supabase";
import { USER_ID } from "./fixtures";

// The Web Delivery dashboard: a maintainer sees every project with its stage, its clock and what holds it up; opens a
// project for a client with an active plan; and works a project's file. The database's rules are tested in core
// (99zz_web_delivery.sql, 99zzb_web_delivery_ledger.sql); here the interface must show its refusals and never claim
// a step that didn't happen.
const now = new Date().toISOString();
const CLIENT = "00000000-0000-4000-8000-0000000000c1";
const OTHER = "00000000-0000-4000-8000-0000000000b2";
const project = (id: string, over: Record<string, unknown>) => ({
  id, ref: `WP-000${id.slice(-1)}`, org_id: CLIENT, name: "Northwind website", website_type: "service_business", primary_objective: "leads",
  plan: "starter", status: "intake", status_note: "Intake form received from the client.", deadline_on: null, clock_paused_on: null,
  created_by: USER_ID, created_at: now, updated_at: now, ...over,
});

async function asMaintainer(page: Page): Promise<FakeSupabase> {
  const fake = await installFakeSupabase(page);
  const t = fake.tables as Record<string, unknown[]>;
  t.memberships = [];
  t.platform_admins = [];
  t.platform_staff = [{ user_id: USER_ID, role: "maintainer", added_by: null, created_at: now }];
  t.staff_profiles = [{ user_id: USER_ID, display_name: "Lindiwe" }];
  t.organisations = [...(t.organisations ?? []), { id: CLIENT, name: "Northwind Studio", slug: "northwind", private: false, app: "tebos", created_at: now }];
  t.billing_accounts = [{ id: "b1", opportunity_id: "o1", org_id: CLIENT, plan: "starter", monthly_cents: 50000, currency: "ZAR", anchor_day: 1, next_invoice_on: now.slice(0, 10), status: "active", created_at: now, updated_at: now }];
  t.opportunities = [];
  t.web_projects = [
    project("p1", {}),
    project("p2", { name: "Cosmo Dental site", status: "build", deadline_on: "2020-01-06", status_note: "Ready: building." }),
    project("p3", { name: "Fitzanne lettings", status: "blocked_client", deadline_on: "2099-01-01", clock_paused_on: now.slice(0, 10), status_note: "Waiting for the client's photographs." }),
  ];
  t.web_scope_revisions = [];
  t.web_project_approvals = [];
  t.web_readiness_items = [];
  t.web_qa_runs = [];
  t.web_tasks = [
    { id: "t1", project_id: "p2", org_id: CLIENT, role: "creative", title: "Design direction", done_when: "The client approves one hero idea.", due_on: null, assigned_to: OTHER, status: "done", blocked_reason: null, evidence: "Approved on the call.", created_by: USER_ID, created_at: now, updated_at: now },
    { id: "t2", project_id: "p2", org_id: CLIENT, role: "frontend", title: "Build the home page", done_when: "Home renders at 375 and 1280 px.", due_on: null, assigned_to: USER_ID, status: "review", blocked_reason: null, evidence: null, created_by: USER_ID, created_at: now, updated_at: now },
    { id: "t3", project_id: "p2", org_id: CLIENT, role: "qa", title: "QA the home page", done_when: "Every criterion checked with evidence.", due_on: null, assigned_to: null, status: "todo", blocked_reason: null, evidence: null, created_by: USER_ID, created_at: now, updated_at: now },
  ];
  t.web_task_dependencies = [{ task_id: "t3", depends_on: "t2", project_id: "p2", created_at: now }];
  t.web_assets = [];
  t.web_deployments = [];
  return fake;
}

test("the board shows each project's stage, clock and hold-up, with the few numbers that matter", async ({ page }) => {
  await asMaintainer(page);
  await page.goto("/web-delivery");
  await expect(page.getByRole("heading", { name: "Web delivery" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Web delivery" })).toBeVisible();
  const stats = page.getByTestId("web-stats");
  await expect(stats).toContainText("3Open projects");
  await expect(stats).toContainText("1Due within a day or late");
  await expect(stats).toContainText("1Waiting on the client");
  const rows = page.getByTestId("web-project");
  await expect(rows).toHaveCount(3);
  const intake = rows.filter({ hasText: "Northwind website" });
  await expect(intake).toContainText("Clock not started");
  await expect(intake).toContainText("9 things before the build can start");
  await expect(rows.filter({ hasText: "Cosmo Dental site" })).toContainText("Overdue");
  await expect(rows.filter({ hasText: "Cosmo Dental site" })).toContainText("1 of 3 tasks done (33%)");
  await expect(rows.filter({ hasText: "Fitzanne lettings" })).toContainText("Paused: waiting on the client");
  await expect(rows.filter({ hasText: "Fitzanne lettings" })).toContainText("Waiting for the client's photographs.");
});

test("a maintainer opens a project for a client with an active plan; the package comes from the plan", async ({ page }) => {
  const fake = await asMaintainer(page);
  await page.goto("/web-delivery");
  await page.getByRole("button", { name: "New project" }).click();
  const form = page.getByRole("form", { name: "New project" });
  await form.getByRole("combobox", { name: "Client" }).selectOption({ label: "Northwind Studio" });
  await expect(form).toContainText("Package: Small (their active plan)");
  await form.getByLabel("Project name").fill("Northwind bookings site");
  await form.getByLabel("Website type").selectOption({ label: "Booking website" });
  await form.getByLabel("Where it starts").fill("Intake call held; pages agreed in principle.");
  await form.getByRole("button", { name: "Open the project" }).click();
  await expect(page.getByTestId("web-project")).toHaveCount(4);
  const sent = fake.writes.find((w) => w.method === "POST" && w.table === "web_projects")!.body as Record<string, unknown>;
  expect(sent).toMatchObject({ org_id: CLIENT, plan: "starter", website_type: "booking", name: "Northwind bookings site" });
});

test("a project's file: readiness from the database, scope held to the package, refusals explained", async ({ page }) => {
  const fake = await asMaintainer(page);
  await page.goto("/web-delivery/p1");
  await expect(page.getByRole("heading", { name: "Northwind website" })).toBeVisible();
  await expect(page.getByTestId("stage-track").locator("[aria-current=step]")).toHaveText("Intake");
  await expect(page.getByTestId("readiness-gaps")).toContainText("scope: no scope has been written");

  // scope beyond the Small package is refused before anything is sent
  await page.getByRole("button", { name: "Write the scope" }).click();
  const scope = page.getByRole("form", { name: "Write the scope" });
  await scope.getByLabel("Pages").fill(Array.from({ length: 11 }, (_, i) => `Page ${i + 1}`).join("\n"));
  await scope.getByLabel("What visitors should do first").fill("Send an enquiry from the contact form");
  await scope.getByLabel("Not included").fill("No payments or bookings in this phase.");
  await scope.getByLabel("Recurring costs").fill("None");
  await scope.getByLabel("Accepted when").fill("The form saves the enquiry or shows an error.");
  await scope.getByRole("button", { name: "Save as a new revision" }).click();
  await expect(scope.getByRole("alert")).toContainText("Offer a revised quote, a smaller launch scope or a later phase");
  expect(fake.writes.some((w) => w.table === "web_scope_revisions")).toBe(false);
  await scope.getByLabel("Pages").fill("Home\nServices\nContact");
  await scope.getByRole("button", { name: "Save as a new revision" }).click();
  await expect(page.getByTestId("web-scope")).toContainText("Home, Services, Contact");

  // only the client approves
  await expect(page.getByTestId("web-approvals")).toContainText("Scope and costs: Not yet");

  // readiness evidence is required; the database's refusal to build is shown with its reason
  await page.getByRole("button", { name: "Update: Technical access has been verified" }).click();
  const access = page.getByRole("form", { name: "Technical access has been verified" });
  await access.getByLabel("Evidence").fill("Repository and preview access confirmed.");
  await access.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("web-readiness")).toContainText("Repository and preview access confirmed.");

  const move = page.getByRole("form", { name: "Move the project" });
  await move.getByLabel("Move to").selectOption({ label: "Scope review" });
  await move.getByLabel("Why").fill("Scope revision 1 written for the client.");
  fake.refuse({ table: "web_projects", method: "PATCH", hint: "TEBOS_VALIDATION", message: "every change of state says why" });
  await move.getByRole("button", { name: "Move" }).click();
  await expect(move.getByRole("alert")).toContainText("every change of state says why");
  fake.refuse(null);
  await move.getByRole("button", { name: "Move" }).click();
  await expect(page.getByTestId("status-note")).toHaveText("Scope revision 1 written for the client.");
});

test("tasks: a dependency waits, nobody accepts their own review, done needs evidence; assets need a licence", async ({ page }) => {
  const fake = await asMaintainer(page);
  await page.goto("/web-delivery/p2");
  const tasks = page.getByTestId("web-task");
  const home = tasks.filter({ has: page.getByText("Build the home page", { exact: true }) });
  await expect(home).toContainText("Someone else reviews this.");
  await expect(home.getByRole("button", { name: "Accept as done" })).toHaveCount(0);
  const qa = tasks.filter({ hasText: "QA the home page" });
  await expect(qa.getByRole("button", { name: "Waiting on another task" })).toBeDisabled();
  await qa.getByRole("button", { name: "Take it" }).click();
  await expect(qa).toContainText("yours");

  // a blocked task says why
  await qa.getByRole("button", { name: "Blocked" }).click();
  await qa.getByLabel("What is it waiting for?").fill("Waiting for the home page to pass review.");
  await qa.getByRole("button", { name: "Save" }).click();
  await expect(tasks.filter({ hasText: "QA the home page" })).toContainText("Blocked: Waiting for the home page to pass review.");

  // an asset can't be marked received without where it came from and its licence
  const assets = page.getByRole("form", { name: "Add an asset" });
  await assets.getByLabel("Asset").fill("Logo (SVG)");
  await assets.getByRole("button", { name: "Add" }).click();
  await page.getByRole("button", { name: "Update Logo (SVG)" }).click();
  const edit = page.getByRole("form", { name: "Update Logo (SVG)" });
  await edit.getByLabel("Status").selectOption("received");
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(edit.getByRole("alert")).toContainText("Say where this asset came from");
  await edit.getByLabel("Source").selectOption("client_supplied");
  await edit.getByLabel("Licence or permission").fill("The client's own logo, owned outright.");
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("web-assets")).toContainText("Supplied by the client: The client's own logo, owned outright.");

  // production can't be recorded before release
  const dep = page.getByRole("form", { name: "Record a deployment" });
  await dep.getByLabel("Environment").selectOption("production");
  await dep.getByLabel("Address").fill("https://northwind.example");
  await dep.getByLabel("Commit").fill("1de4b0b");
  await dep.getByLabel("What you checked there").fill("Home and the form load on the live domain.");
  await dep.getByRole("button", { name: "Record the deployment" }).click();
  await expect(dep.getByRole("alert")).toContainText("Production deploys happen in release.");
  expect(fake.writes.some((w) => w.table === "web_deployments")).toBe(false);
});

test("the dashboard fits a phone, and is for maintainers only", async ({ page }) => {
  await asMaintainer(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/web-delivery");
  await expect(page.getByTestId("web-project")).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await page.goto("/web-delivery/p2");
  await expect(page.getByTestId("web-tasks")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});

test("a salesperson doesn't get the dashboard", async ({ page }) => {
  const fake = await asMaintainer(page);
  (fake.tables as Record<string, unknown[]>).platform_staff = [{ user_id: USER_ID, role: "sales", added_by: null, created_at: now }];
  await page.goto("/web-delivery");
  await expect(page.getByText("This page is for TEBOS's own staff.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Web delivery" })).toHaveCount(0);
});

test("screenshots (on request only)", async ({ page }) => {
  test.skip(!process.env.SHOTS, "screenshots only on request");
  await asMaintainer(page);
  const dir = process.env.SHOTS!;
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/web-delivery");
  await page.getByTestId("web-project").first().waitFor();
  await page.screenshot({ path: `${dir}/board-desktop.png`, fullPage: true });
  await page.goto("/web-delivery/p2");
  await page.getByTestId("web-tasks").waitFor();
  await page.screenshot({ path: `${dir}/project-desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/web-delivery");
  await page.getByTestId("web-project").first().waitFor();
  await page.screenshot({ path: `${dir}/board-phone.png`, fullPage: true });
});
