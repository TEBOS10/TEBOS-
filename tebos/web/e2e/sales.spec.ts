import { expect, test } from "@playwright/test";
import { installFakeSupabase } from "./fake-supabase";
import { USER_ID } from "./fixtures";

// The sales team: a salesperson with no organisation works from the staff
// workspace, sells from the playbook and adds leads that are theirs; a
// platform admin invites staff; an invited person joins as staff only.
const now = new Date().toISOString();
const REP2 = "00000000-0000-4000-8000-0000000000b2";
const opp = (id: string, over: Record<string, unknown>) => ({
  id, enquiry_id: `e-${id}`, plan: "starter", contact_name: "Thandi", business: "Northwind Studio", email: "thandi@northwind.co.za",
  phone: null, website: "northwind.co.za", message: null, status: "screened", screening: { flags: [] }, screened_at: now,
  amount_cents: null, currency: "ZAR", payment_url: null, payment_reference: null, org_id: null, decision_note: null, decided_by: null,
  decided_at: null, maintainer_id: null, source: "website", owner_id: null, created_at: now, updated_at: now, ...over,
});
const playbook = [
  { id: "p1", key: "what", position: 10, title: "What TEBOS is", body: "**TEBOS is business operating architecture.**\n\n## Not an AI agency\n\n- We connect to what they already use.", updated_by: null, updated_at: now },
  { id: "p2", key: "plans", position: 20, title: "Plans and prices", body: "## {{starter_name}}: {{starter_fee}}\n\n{{starter_deliverables}}", updated_by: null, updated_at: now },
];

test("a salesperson without an organisation sells from the staff workspace: playbook, leads, and their own pipeline", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  const t = fake.tables as Record<string, unknown[]>;
  t.memberships = [];
  t.platform_admins = [];
  t.platform_staff = [{ user_id: USER_ID, role: "sales", added_by: null, created_at: now }, { user_id: REP2, role: "sales", added_by: null, created_at: now }];
  t.staff_profiles = [{ user_id: USER_ID, display_name: "Lindiwe" }, { user_id: REP2, display_name: "Sipho" }];
  t.sales_playbook = playbook;
  t.opportunities = [
    opp("o1", { business: "Mine Ltd", source: "sales", owner_id: USER_ID }),
    opp("o2", { business: "Sipho's Lead", source: "sales", owner_id: REP2 }),
    opp("o3", { business: "Web Enquiry Co" }),
  ];
  t.payments = [];
  t.contracts = [];
  t.outbox_emails = [];

  await page.goto("/");
  // the staff workspace, not a client's app
  await expect(page.getByRole("heading", { name: "Client pipeline" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Businesses" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Staff", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Contract templates" })).toHaveCount(0);
  await expect(page.getByTestId("opportunity")).toHaveCount(3);
  await expect(page.getByText("Lindiwe (you)")).toBeVisible();

  // "Mine" shows only their own leads
  await page.getByRole("button", { name: "Mine" }).click();
  await expect(page.getByTestId("opportunity")).toHaveCount(1);
  await expect(page.getByTestId("opportunity")).toContainText("Mine Ltd");

  // adding a lead sends only the lead: the database decides it's theirs
  await page.getByRole("button", { name: "Add a lead" }).click();
  const form = page.getByRole("form", { name: "Add a lead" });
  await form.getByLabel("Business").fill("Lerato Studio");
  await form.getByLabel("Contact name").fill("Lerato");
  await form.getByLabel("Email").fill("lerato@leratostudio.co.za");
  await form.getByLabel("Plan they're considering").selectOption("growth");
  await form.getByLabel("Notes").fill("Met at the founders breakfast");
  await form.getByRole("button", { name: "Add lead" }).click();
  await expect.poll(() => fake.writes.find((w) => w.table === "enquiries")?.body).toEqual({
    plan: "growth", name: "Lerato", business: "Lerato Studio", email: "lerato@leratostudio.co.za", phone: null, website: null, message: "Met at the founders breakfast",
  });

  // an unowned website enquiry can be taken; someone else's lead can't
  await page.goto("/pipeline/o2");
  await expect(page.getByTestId("owner")).toHaveText("Sipho");
  await expect(page.getByRole("button", { name: "Take this lead" })).toHaveCount(0);
  await page.goto("/pipeline/o3");
  await page.getByRole("button", { name: "Take this lead" }).click();
  await expect.poll(() => fake.writes.filter((w) => w.table === "opportunities" && w.method === "PATCH").at(-1)?.body).toEqual({ owner_id: USER_ID });

  // the playbook, with prices from the plan terms
  await page.getByRole("link", { name: "Sales playbook" }).click();
  await expect(page.getByRole("heading", { name: "Sales playbook" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Diagnostic: R2,500 a month, excluding VAT" })).toBeVisible();
  await expect(page.getByText("Everything in the Diagnostic")).toHaveCount(0);
  await expect(page.getByText(/Map: your operating board/)).toBeVisible();
  await expect(page.getByText("{{")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0); // only admins edit
});

test("a platform admin invites staff, sees the link once, revokes, and edits the playbook", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  const t = fake.tables as Record<string, unknown[]>;
  t.platform_admins = [{ user_id: USER_ID, created_at: now }];
  t.platform_staff = [{ user_id: REP2, role: "sales", added_by: USER_ID, created_at: now }];
  t.staff_profiles = [{ user_id: REP2, display_name: "Sipho", email: "sipho@tebos.test" }];
  t.staff_invitations = [];
  t.sales_playbook = playbook;
  t.opportunities = [];

  await page.goto("/");
  await page.getByRole("link", { name: "Pipeline" }).click();
  await page.getByRole("link", { name: "Staff", exact: true }).click();
  await expect(page.getByTestId("staff")).toContainText("Sipho");
  await page.getByLabel("Email address").fill("Nomsa@tebos.test");
  await page.getByRole("button", { name: "Create invitation link" }).click();
  await expect(page.getByTestId("staff-invite-link")).toContainText("/staff-invite/fixture-staff-token");
  expect(fake.writes.find((w) => w.table === "create_staff_invitation")?.body).toEqual({ p_email: "Nomsa@tebos.test", p_role: "sales" });
  await expect(page.getByTestId("staff-invitations")).toContainText("nomsa@tebos.test");
  await page.getByRole("button", { name: "Revoke" }).click();
  await expect.poll(() => fake.writes.find((w) => w.table === "staff_invitations" && w.method === "PATCH")?.body).toEqual({ status: "revoked" });

  await page.getByRole("button", { name: "Remove sales" }).click();
  await expect.poll(() => fake.writes.find((w) => w.table === "platform_staff" && w.method === "DELETE")).toBeTruthy();

  await page.goto("/sales");
  await page.getByRole("button", { name: "Edit" }).first().click();
  await page.getByLabel("Text").fill("**Updated.**");
  await page.getByRole("button", { name: "Save" }).click();
  await expect.poll(() => fake.writes.find((w) => w.table === "sales_playbook")?.body).toEqual({ title: "What TEBOS is", body: "**Updated.**" });
});

test("an invited salesperson creates their account and joins as staff only", async ({ page }) => {
  const fake = await installFakeSupabase(page, { signedIn: false });
  const t = fake.tables as Record<string, unknown[]>;
  t.staff_invitation_links = [{ token: "staff-1", email: "operator@fixture.test", role: "sales" }];
  await page.goto("/staff-invite/nope");
  await expect(page.getByRole("heading", { name: "This invitation isn't valid" })).toBeVisible();
  await page.goto("/staff-invite/staff-1");
  await expect(page.getByText(/invited to join TEBOS's team \(sales\)/)).toBeVisible();
  await expect(page.getByRole("tab", { name: "Create account" })).toBeVisible();
});

test("a signed-in invitee accepts and lands on the playbook", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  const t = fake.tables as Record<string, unknown[]>;
  t.memberships = [];
  t.platform_admins = [];
  t.platform_staff = [];
  t.sales_playbook = playbook;
  t.staff_invitation_links = [{ token: "staff-1", email: "operator@fixture.test", role: "sales" }];
  await page.goto("/staff-invite/staff-1");
  await expect(page.getByRole("heading", { name: "Join TEBOS's team: Sales" })).toBeVisible();
  await page.getByRole("button", { name: "Join the team" }).click();
  await expect(page.getByRole("heading", { name: "Sales playbook" })).toBeVisible();
  expect(fake.writes.find((w) => w.table === "accept_staff_invitation")?.body).toEqual({ p_token: "staff-1" });
  // staff only: still no client app
  await expect(page.getByRole("link", { name: "Businesses" })).toHaveCount(0);
});
