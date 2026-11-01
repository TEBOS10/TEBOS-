import { expect, test } from "@playwright/test";
import { installFakeSupabase } from "./fake-supabase";
import { ORG, USER_ID } from "./fixtures";

// Milestone 4: the client fills in and submits their brief from their own account; TEBOS's maintainers work from one
// queue across every client, and reopen a brief with a reason. The rules are tested in core
// (99zzd_web_delivery_intake.sql); here the interface must follow them and never claim what didn't happen.
const now = new Date().toISOString();
const M2 = "00000000-0000-4000-8000-0000000000b2";
function seed(t: Record<string, unknown[]>, intake: Record<string, unknown> | null = null) {
  t.web_projects = [{ id: "p1", ref: "WP-0001", org_id: ORG, name: "Our new website", website_type: "service_business", primary_objective: "leads", plan: "starter",
    status: "intake", status_note: "Opened; the brief is with you.", deadline_on: null, clock_paused_on: null, maintainer_id: M2, created_by: M2, created_at: now, updated_at: now }];
  for (const k of ["web_scope_revisions", "web_project_approvals", "web_readiness_items", "web_qa_runs", "web_tasks", "web_task_dependencies", "web_assets",
    "web_deployments", "web_integrations", "web_project_costs", "change_requests", "web_history"]) t[k] = [];
  t.web_intakes = intake ? [{ id: "i1", project_id: "p1", org_id: ORG, status: "draft", submitted_by: null, submitted_at: null, reopen_reason: null, created_at: now, updated_at: now, ...intake }] : [];
  t.billing_accounts = [{ id: "b1", opportunity_id: "o1", org_id: ORG, plan: "starter", monthly_cents: 50000, currency: "ZAR", anchor_day: 1, next_invoice_on: now.slice(0, 10), status: "active", created_at: now, updated_at: now }];
}

test("the client writes their brief, saves a draft, and submits it only once it's complete", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  seed(fake.tables as Record<string, unknown[]>);
  await page.goto("/website");
  await expect(page.getByTestId("client-todos")).toContainText("Fill in and submit your brief");
  const brief = page.getByRole("form", { name: "Your brief" });
  await brief.getByLabel("Business name").fill("Northwind Plumbing");
  await expect(brief.getByTestId("brief-missing")).toContainText("Who the website is for");
  await expect(brief.getByRole("button", { name: "Submit the brief" })).toBeDisabled();
  await brief.getByRole("button", { name: "Save as a draft" }).click();
  await expect(brief.getByRole("status")).toHaveText("Saved as a draft.");
  expect(fake.writes.find((w) => w.method === "POST" && w.table === "web_intakes")!.body).toMatchObject({ project_id: "p1", org_id: ORG });

  await brief.getByLabel("Who it's for").fill("Homeowners in Randburg who need a plumber today.");
  await brief.getByLabel("What visitors should do first").fill("Request a call-out");
  await brief.getByLabel("How you'll know it works").fill("Ten call-outs a month");
  await brief.getByLabel("Pages").fill("Home\nServices\nContact");
  await brief.getByLabel("Visual direction").selectOption("minimal");
  await brief.getByLabel("Contact or enquiry form").check();
  await brief.getByLabel("We hold the rights to the logos, photos, fonts and text we send").check();
  await expect(brief.getByTestId("brief-missing")).toContainText("stated purpose");
  await brief.getByLabel("Anything the site collects from visitors has a stated purpose").check();
  await expect(brief.getByTestId("brief-missing")).toHaveCount(0);
  await brief.getByRole("button", { name: "Submit the brief" }).click();
  await expect(page.getByTestId("brief-summary")).toContainText("Home, Services, Contact");
  const submitted = fake.writes.filter((w) => w.method === "PATCH" && w.table === "web_intakes").at(-1)!.body as Record<string, unknown>;
  expect(submitted).toMatchObject({ status: "submitted", answers: { business_name: "Northwind Plumbing", visual_direction: "minimal", launch_features: ["contact_form"], confirmations: { rights: true, privacy: true } } });
});

test("a refused brief shows the database's reason; nothing is claimed as saved", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  seed(fake.tables as Record<string, unknown[]>, { answers: { business_name: "Northwind" } });
  await page.goto("/website");
  const brief = page.getByRole("form", { name: "Your brief" });
  await brief.getByLabel("Who it's for").fill("Call me on 082 555 1234 about it please.");
  fake.refuse({ table: "web_intakes", method: "PATCH", hint: "", message: "new row for relation \"web_intakes\" violates check constraint" });
  await brief.getByRole("button", { name: "Save as a draft" }).click();
  await expect(brief.getByRole("alert")).toBeVisible();
  await expect(brief.getByRole("status")).toHaveCount(0);
});

test("maintainers work from one queue across clients, and reopen a brief with a reason", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  const t = fake.tables as Record<string, unknown[]>;
  seed(t, { status: "submitted", submitted_at: now, submitted_by: USER_ID, answers: { business_name: "Northwind Plumbing", audience: "Homeowners in Randburg.", pages: ["Home", "Services"], visual_direction: "minimal" } });
  t.memberships = [];
  t.platform_admins = [];
  t.platform_staff = [{ user_id: USER_ID, role: "maintainer", added_by: null, created_at: now }, { user_id: M2, role: "maintainer", added_by: null, created_at: now }];
  t.staff_profiles = [{ user_id: USER_ID, display_name: "Lindiwe" }, { user_id: M2, display_name: "Sipho" }];
  t.organisations = [{ id: ORG, name: "Northwind Studio", slug: "northwind", private: false, app: "tebos", created_at: now }];
  t.change_requests = [{ id: "c1", org_id: ORG, web_project_id: "p1", requested_by: "x", title: "Add our weekend hours", detail: null, units: 1, status: "received", outcome_note: null, period: now.slice(0, 8) + "01", created_at: now, updated_at: now, finished_at: null }];
  await page.goto("/web-delivery");
  const queue = page.getByTestId("web-queue");
  await expect(queue).toContainText("Brief submitted: write the scope");
  await expect(queue).toContainText("Add our weekend hours");
  await expect(queue).toContainText("Sipho");
  await page.getByLabel("Mine only").check();
  await expect(page.getByText("Nothing waiting.")).toBeVisible();
  await page.getByLabel("Mine only").uncheck();

  await queue.getByRole("link", { name: "Brief submitted: write the scope" }).click();
  await expect(page.getByTestId("brief-summary")).toContainText("Northwind Plumbing");
  await page.getByRole("button", { name: "Ask the client to change it" }).click();
  const reopen = page.getByRole("form", { name: "Reopen the brief" });
  await reopen.getByLabel("What the client should add or change").fill("Please add the services you offer on weekends.");
  await reopen.getByRole("button", { name: "Reopen for the client" }).click();
  await expect.poll(() => fake.writes.some((w) => w.method === "PATCH" && w.table === "web_intakes" && (w.body as Record<string, unknown>).status === "draft")).toBe(true);
});
