import { expect, test, type Page } from "@playwright/test";
import { installFakeSupabase, type FakeSupabase } from "./fake-supabase";
import { APPROVER_ID, ORG, USER_ID } from "./fixtures";
import { addDays, monthStart, saToday } from "../../src/domain/opsLedger";

// Tidy Property Operations: a landlord runs a portfolio from the first property to arrears and a finished repair.
// The database's own rules (no overlap, append-only ledger, reversal rules, approver-only approval, unit limit,
// suspension) are tested against real Postgres (core: 99zzm); here the interface must send the right records,
// show only figures computed from them, and refuse what the role may not do.

test.use({ baseURL: "http://localhost:5179" });
type Tables = Record<string, Array<Record<string, unknown>>>;
const now = () => new Date().toISOString();
const PROP = "a3000000-0000-4000-8000-000000000001";
const UNIT = "a3000000-0000-4000-8000-000000000011";
const UNIT2 = "a3000000-0000-4000-8000-000000000012";
const TENANT = "a3000000-0000-4000-8000-000000000021";
const LEASE = "a3000000-0000-4000-8000-000000000031";
const SUPPLIER = "a3000000-0000-4000-8000-000000000041";

function opsAccount(fake: FakeSupabase, status = "trial"): Tables {
  const t = fake.tables as unknown as Tables;
  for (const o of t.organisations!) if (o.id === ORG) o.app = "ops";
  t.ops_subscriptions = [{ org_id: ORG, plan: "pilot", status, unit_limit: 60, user_limit: 5, trial_ends_on: null, note: null, updated_at: now() }];
  for (const k of ["ops_properties", "ops_units", "ops_tenants", "ops_leases", "ops_ledger", "ops_suppliers", "ops_maintenance", "ops_maintenance_photos"]) t[k] = [];
  return t;
}

function seedLet(t: Tables) {
  t.ops_properties!.push({ id: PROP, org_id: ORG, name: "Hatfield Court (test)", street: null, suburb: "Hatfield", city: "Pretoria", province: "Gauteng", postal_code: "0083", kind: "residential", archived_at: null, created_by: USER_ID, created_at: now(), updated_at: now() });
  t.ops_units!.push(
    { id: UNIT, org_id: ORG, property_id: PROP, label: "1A", unit_type: "one_bed", market_rent_cents: 650000, held_back: false, held_back_reason: null, created_at: now(), updated_at: now() },
    { id: UNIT2, org_id: ORG, property_id: PROP, label: "1B", unit_type: "two_bed", market_rent_cents: 800000, held_back: false, held_back_reason: null, created_at: now(), updated_at: now() },
  );
  t.ops_tenants!.push({ id: TENANT, org_id: ORG, full_name: "Thandi Mokoena (test)", email: "thandi@example.test", phone: null, notes: null, created_at: now(), updated_at: now() });
  t.ops_leases!.push({ id: LEASE, org_id: ORG, unit_id: UNIT, tenant_id: TENANT, ref: "L-0001", starts_on: monthStart(saToday()), ends_on: null, rent_cents: 650000, due_day: 1,
    deposit_cents: 650000, deposit_held_at: null, status: "active", ended_on: null, end_reason: null, created_by: USER_ID, created_at: now(), updated_at: now() });
}

const posts = (fake: FakeSupabase, table: string) => fake.writes.filter((w) => w.table === table && w.method === "POST").map((w) => w.body as Record<string, unknown>);

async function kpi(page: Page, label: string) {
  return page.getByRole("region", { name: "This month" }).locator(".ops-kpi", { hasText: label }).locator(".ops-kpi-value");
}

test("a first sign-in opens an account; the database creates the pilot", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  const t = fake.tables as unknown as Tables;
  t.memberships = [];
  await page.goto("/");
  const form = page.getByRole("form", { name: "Open your operations account" });
  await form.getByRole("button", { name: "Open account" }).click();
  await expect(form.getByRole("alert")).toContainText("Give the account a name");
  await form.getByLabel("Account name").fill("Mokoena Rentals");
  await form.getByRole("button", { name: "Open account" }).click();
  await expect.poll(() => fake.writes.find((w) => w.table === "create_ops_account")?.body).toEqual({ p_name: "Mokoena Rentals" });
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(page.getByTestId("plan")).toContainText("Pilot · trial");
});

test("property, unit, tenant and lease: the records go in, and occupancy comes from the lease", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  opsAccount(fake);
  await page.goto("/properties");
  const add = page.getByRole("form", { name: "Add a property" });
  await add.getByLabel("Name").fill("Sunnyside Flats (test)");
  await add.getByLabel("City or town").fill("Pretoria");
  await add.getByLabel("Postal code").fill("0002");
  await add.getByRole("button", { name: "Add property" }).click();
  await expect.poll(() => posts(fake, "ops_properties")[0]).toMatchObject({ org_id: ORG, name: "Sunnyside Flats (test)", city: "Pretoria", postal_code: "0002" });
  // adding a property opens it
  await expect(page.getByRole("heading", { name: "Sunnyside Flats (test)" })).toBeVisible();

  const unit = page.getByRole("form", { name: "Add a unit" });
  await unit.getByLabel("Unit").fill("2C");
  await unit.getByLabel("Market rent (R)").fill("7 250,50");
  await unit.getByRole("button", { name: "Add unit" }).click();
  await expect.poll(() => posts(fake, "ops_units")[0]).toMatchObject({ label: "2C", market_rent_cents: 725050 });
  const row = page.getByTestId("units").getByRole("row", { name: /2C/ });
  await expect(row).toContainText("Vacant");
  await expect(row).toContainText("R 7 250,50");

  await row.getByRole("link", { name: "Start a lease" }).click();
  const tenant = page.getByRole("form", { name: "Add a tenant" });
  await tenant.getByLabel("Full name").fill("Sipho Dlamini (test)");
  await tenant.getByLabel("Phone").fill("082 555 0101");
  await tenant.getByRole("button", { name: "Add tenant" }).click();
  await expect.poll(() => posts(fake, "ops_tenants")[0]).toMatchObject({ full_name: "Sipho Dlamini (test)", phone: "082 555 0101", email: null });

  const lease = page.getByRole("form", { name: "Start a lease" });
  await expect(lease.getByLabel("Tenant")).toHaveValue(/[0-9a-f-]{36}/);
  await expect(lease.getByLabel("Monthly rent (R)")).toHaveValue("7250.5");
  await lease.getByLabel("Monthly rent (R)").fill("7000");
  await lease.getByLabel("Deposit agreed (R)").fill("7000");
  await lease.getByLabel("Deposit held at").fill("Bank savings, deposits account");
  await lease.getByRole("button", { name: "Start lease" }).click();
  await expect.poll(() => posts(fake, "ops_leases")[0]).toMatchObject({ rent_cents: 700000, deposit_cents: 700000, due_day: 1, starts_on: saToday() });
  // the database numbers the lease; the interface never sends a reference
  expect(posts(fake, "ops_leases")[0]).not.toHaveProperty("ref");
  await expect(page.getByRole("heading", { name: /L-0001/ })).toBeVisible();
  await expect(page.getByText("Tenant's payment reference:")).toContainText("L-0001");

  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Properties" }).click();
  await page.getByTestId("properties").getByRole("link", { name: "Sunnyside Flats (test)" }).click();
  await expect(page.getByTestId("units").getByRole("row", { name: /2C/ })).toContainText("Let");
  await expect(page.getByTestId("units").getByRole("row", { name: /2C/ })).toContainText("Sipho Dlamini (test)");
});

test("rent is charged once, a payment settles it, a reversal is kept on the record, and arrears follow", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  const t = opsAccount(fake);
  seedLet(t);
  await page.goto("/");
  await expect(await kpi(page, "Expected rent")).toHaveText("R 6 500,00");
  await expect(await kpi(page, "Billed")).toHaveText("R 0,00");
  await expect(page.getByTestId("occupancy")).toContainText("1");

  await page.getByTestId("charge-rent").click();
  await expect(page.getByRole("status").filter({ hasText: /Charged 1|1 lease/ })).toBeVisible();
  await expect(await kpi(page, "Billed")).toHaveText("R 6 500,00");
  // charging again adds nothing
  await page.getByTestId("charge-rent").click();
  await expect(page.getByRole("status").filter({ hasText: /already|0/ })).toBeVisible();
  expect(t.ops_ledger!.filter((e) => e.kind === "charge")).toHaveLength(1);

  await page.goto(`/leases/${LEASE}`);
  const pos = page.getByTestId("lease-position");
  await expect(pos.locator(".ops-kpi", { hasText: "Balance" })).toContainText("R 6 500,00");
  const pay = page.getByRole("form", { name: "Record a payment" });
  await pay.getByLabel("Amount (R)").fill("4000");
  await pay.getByLabel("Bank reference").fill("L-0001 NOV");
  await pay.getByRole("button", { name: "Record payment" }).click();
  await expect.poll(() => posts(fake, "ops_ledger").find((b) => b.kind === "payment")).toMatchObject({ lease_id: LEASE, amount_cents: 400000, account: "rent", method: "eft", reference: "L-0001 NOV" });
  await expect(pos.locator(".ops-kpi", { hasText: "Balance" })).toContainText("R 2 500,00");

  // a wrong payment is corrected by a reversal with a reason, never by editing or deleting
  page.once("dialog", (d) => void d.accept("Payment captured on the wrong lease"));
  await page.getByTestId("statement-rent").getByRole("row", { name: /L-0001 NOV/ }).getByRole("button", { name: "Reverse" }).click();
  await expect.poll(() => posts(fake, "ops_ledger").find((b) => b.kind === "reversal")).toMatchObject({ amount_cents: 400000, account: "rent", note: "Payment captured on the wrong lease" });
  expect(fake.writes.some((w) => w.table === "ops_ledger" && (w.method === "PATCH" || w.method === "DELETE"))).toBe(false);
  await expect(pos.locator(".ops-kpi", { hasText: "Balance" })).toContainText("R 6 500,00");
  await expect(page.getByTestId("statement-rent").getByRole("row", { name: /L-0001 NOV/ })).toContainText("reversed");

  await page.goto("/rent");
  const arrears = page.getByTestId("arrears");
  await expect(arrears.getByRole("row", { name: /Thandi Mokoena/ })).toContainText("R 6 500,00");
});

test("a bank statement CSV is previewed, matched by lease reference, and imported only on confirmation", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  const t = opsAccount(fake);
  seedLet(t);
  await page.goto("/rent");
  const csv = `Date,Description,Amount\n${saToday()},L-0001 rent,"6 500,00"\n${saToday()},UNKNOWN PAYER,1200.00\n`;
  await page.getByLabel("Bank statement CSV").setInputFiles({ name: "statement.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  const preview = page.getByTestId("import-preview");
  await expect(preview.getByRole("row", { name: /L-0001 rent/ })).toContainText("L-0001");
  await expect(preview.getByRole("row", { name: /UNKNOWN PAYER/ })).toContainText("No single lease reference found");
  expect(posts(fake, "ops_ledger")).toHaveLength(0);
  await page.getByRole("button", { name: /^Import 1/ }).click();
  await expect.poll(() => posts(fake, "ops_ledger")).toHaveLength(1);
  expect(posts(fake, "ops_ledger")[0]).toMatchObject({ lease_id: LEASE, kind: "payment", account: "rent", amount_cents: 650000 });
});

test("maintenance runs from report to done, and only an approver or the owner approves the quote", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  const t = opsAccount(fake);
  seedLet(t);
  t.ops_suppliers!.push({ id: SUPPLIER, org_id: ORG, name: "Pipe Pros (test)", trade: "Plumbing", phone: null, email: null, active: true, created_at: now(), updated_at: now() });
  await page.goto("/maintenance");
  const report = page.getByRole("form", { name: "Report maintenance" });
  await report.getByRole("combobox").first().selectOption(PROP);
  await report.getByLabel("What's wrong").fill("Geyser leaking in 1A");
  await report.getByRole("button", { name: "Report" }).click();
  await expect.poll(() => posts(fake, "ops_maintenance")[0]).toMatchObject({ property_id: PROP, title: "Geyser leaking in 1A" });
  // reporting opens the request, numbered by the database
  await expect(page.getByRole("heading", { name: /Geyser leaking in 1A M-0001/ })).toBeVisible();
  // a photo: the record first (the storage policy needs it), then the private file under the account's own folder
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
  await page.getByLabel("Add a photo").setInputFiles({ name: "geyser.png", mimeType: "image/png", buffer: png });
  await expect.poll(() => fake.writes.find((w) => w.method === "UPLOAD")?.body).toMatch(new RegExp(`^ops-files/${ORG}/maintenance/[0-9a-f-]{36}/[0-9a-f-]{36}$`));
  const photoAt = fake.writes.findIndex((w) => w.table === "ops_maintenance_photos" && w.method === "POST");
  expect(photoAt).toBeGreaterThanOrEqual(0);
  expect(photoAt).toBeLessThan(fake.writes.findIndex((w) => w.method === "UPLOAD"));

  const quote = page.getByRole("form", { name: "Record the quote" });
  await quote.getByLabel("Supplier").selectOption(SUPPLIER);
  await quote.getByLabel("Quote (R)").fill("3 200");
  await quote.getByRole("button", { name: "Record quote" }).click();
  await expect(page.getByRole("button", { name: "Approve quote" })).toBeVisible();
  await page.getByRole("button", { name: "Approve quote" }).click();
  await page.getByRole("button", { name: "Work has started" }).click();
  const done = page.getByRole("form", { name: "Mark done" });
  await done.getByLabel("Actual cost (R)").fill("3 150");
  await done.getByRole("button", { name: "Mark done" }).click();
  const patchesOf = () => fake.writes.filter((w) => w.table === "ops_maintenance" && w.method === "PATCH").map((w) => w.body as Record<string, unknown>);
  await expect.poll(() => patchesOf().length).toBe(4);
  const all = patchesOf();
  expect(all.map((b) => b.status)).toEqual(["quoted", "approved", "in_progress", "done"]);
  expect(all[3]).toMatchObject({ cost_cents: 315000, completed_on: saToday() });
  await expect(page.getByTestId("request-details")).toContainText("R 3 150,00");
});

test("an operator records the quote but cannot approve it; a viewer can read but not change anything", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  const t = opsAccount(fake);
  seedLet(t);
  for (const m of t.memberships!) if (m.org_id === ORG && m.user_id === USER_ID) m.role = "operator";
  t.ops_suppliers!.push({ id: SUPPLIER, org_id: ORG, name: "Pipe Pros (test)", trade: "Plumbing", phone: null, email: null, active: true, created_at: now(), updated_at: now() });
  t.ops_maintenance!.push({ id: "a3000000-0000-4000-8000-000000000051", org_id: ORG, ref: "M-0001", property_id: PROP, unit_id: UNIT, title: "Broken window", description: null, priority: "normal",
    status: "quoted", supplier_id: SUPPLIER, quote_cents: 90000, quote_ref: null, decided_by: null, decided_at: null, cost_cents: null, completed_on: null, status_note: null,
    reported_on: saToday(), created_by: APPROVER_ID, created_at: now(), updated_at: now() });
  await page.goto("/maintenance/a3000000-0000-4000-8000-000000000051");
  await expect(page.getByText("Waiting for the owner or an approver to decide on the quote.")).toBeHidden();
  await expect(page.getByRole("button", { name: "Approve quote" })).toHaveCount(0);
  await expect(page.getByRole("form", { name: "Cancel the request" })).toBeVisible();

  for (const m of t.memberships!) if (m.org_id === ORG && m.user_id === USER_ID) m.role = "viewer";
  await page.goto(`/leases/${LEASE}`);
  await expect(page.getByTestId("lease-position")).toBeVisible();
  await expect(page.getByRole("form", { name: "Record a payment" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reverse" })).toHaveCount(0);
  await page.goto("/");
  await expect(page.getByTestId("charge-rent")).toHaveCount(0);
  await page.goto(`/properties/${PROP}`);
  await expect(page.getByRole("form", { name: "Add a unit" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Start a lease" })).toHaveCount(0);
});

test("a suspended account says so", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  seedLet(opsAccount(fake, "suspended"));
  await page.goto("/");
  await expect(page.getByTestId("suspended")).toContainText("paused");
});

// stress data: long names, a large balance, an unpaid deposit, a vacant unit, a stale urgent repair
function seedStress(t: Tables) {
  seedLet(t);
  const long = "Nomvuyiso Thandeka Mahlangu-Van der Westhuizen (test, a deliberately long name)";
  t.ops_tenants![0]!.full_name = long;
  t.ops_tenants![0]!.email = null; // no way to contact them: flagged
  t.ops_leases![0]!.starts_on = monthStart(addDays(saToday(), -60)); // past the deposit's grace week
  t.ops_properties![0]!.name = "The Residences at Hatfield Gardens, Block C (test property with a long name)";
  t.ops_ledger!.push(
    { id: crypto.randomUUID(), org_id: ORG, lease_id: LEASE, kind: "charge", account: "rent", category: "other", method: null, period: null, amount_cents: 987654321,
      effective_on: addDays(saToday(), -45), reference: null, note: "Large historical balance (test)", reverses_id: null, created_by: USER_ID, created_at: now() },
  );
  t.ops_maintenance!.push({ id: "a3000000-0000-4000-8000-000000000052", org_id: ORG, ref: "M-0002", property_id: PROP, unit_id: UNIT, title: "No water to the whole block", description: null,
    priority: "urgent", status: "reported", supplier_id: null, quote_cents: null, quote_ref: null, decided_by: null, decided_at: null, cost_cents: null, completed_on: null,
    status_note: null, reported_on: addDays(saToday(), -20), created_by: USER_ID, created_at: now(), updated_at: now() });
  return long;
}

test("needs attention lists what to act on, most serious first, each linked and explained", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  const t = opsAccount(fake);
  seedStress(t);
  await page.goto("/");
  const list = page.getByTestId("attention");
  const items = list.getByRole("listitem");
  // serious first: the large overdue balance and the urgent repair; then this month's uncharged rent and the vacant unit
  await expect(items.first()).toContainText("overdue");
  await expect(items.first()).toContainText("Serious");
  await expect(list).toContainText("No water to the whole block open for 20 days");
  await expect(list).toContainText("isn't charged yet");
  await expect(list).toContainText("1B is vacant");
  // six at a time; the rest one press away
  await expect(items).toHaveCount(6);
  const more = page.getByRole("button", { name: "Show all 7" });
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await more.click();
  await expect(items).toHaveCount(7);
  await expect(list).toContainText("deposit not received");
  await expect(list).toContainText("No contact details for");
  // every line says what it was computed from
  await expect(list).toContainText("Charges past their due date, less payments");
  // and goes where the work is
  await list.getByRole("link", { name: /No water/ }).click();
  await expect(page.getByRole("heading", { name: /No water to the whole block/ })).toBeVisible();
});

test("with nothing outstanding, the panel says so instead of showing an empty box", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  const t = opsAccount(fake);
  seedLet(t);
  t.ops_units = t.ops_units!.filter((u) => u.id === UNIT);
  t.ops_leases![0]!.deposit_cents = 0;
  t.ops_ledger!.push({ id: crypto.randomUUID(), org_id: ORG, lease_id: LEASE, kind: "charge", account: "rent", category: "rent", method: null, period: monthStart(saToday()),
    amount_cents: 650000, effective_on: monthStart(saToday()), reference: null, note: null, reverses_id: null, created_by: USER_ID, created_at: now() },
  { id: crypto.randomUUID(), org_id: ORG, lease_id: LEASE, kind: "payment", account: "rent", category: null, method: "eft", period: null,
    amount_cents: 650000, effective_on: monthStart(saToday()), reference: null, note: null, reverses_id: null, created_by: USER_ID, created_at: now() });
  await page.goto("/");
  await expect(page.getByText("Nothing needs attention")).toBeVisible();
});

test("the theme: dark by default, light on request, remembered, and System follows the device", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  seedLet(opsAccount(fake));
  await page.goto("/");
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-theme", "dark");
  const theme = page.getByRole("radiogroup", { name: "Theme" });
  await expect(theme.getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");
  await theme.getByRole("radio", { name: "Light" }).click();
  await expect(html).toHaveAttribute("data-theme", "light");
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe("rgb(244, 245, 247)");
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "light");
  // keyboard: arrow keys move the choice within the group
  await page.getByRole("radio", { name: "Light" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "System" })).toHaveAttribute("aria-checked", "true");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(html).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(html).toHaveAttribute("data-theme", "light");
});

test("keyboard: the first Tab reaches 'Skip to content', which moves focus to the page", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  seedLet(opsAccount(fake));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press("Enter");
  await expect(page.locator("main#main")).toBeFocused();
});

test("the reader's settings: less motion stops the bars growing; more contrast strengthens text and edges", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  seedLet(opsAccount(fake));
  await page.emulateMedia({ reducedMotion: "reduce", contrast: "more" });
  await page.goto("/");
  await expect(page.getByTestId("kpis")).toBeVisible();
  const bar = page.locator(".ops-bar > span").first();
  await expect(bar).toBeAttached();
  expect(await bar.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  const faint = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--ops-text-4").trim());
  const strong = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--ops-text-2").trim());
  expect(faint).toBe(strong);
});

test.describe("on a touch screen", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  test("every button and field is at least 44px tall", async ({ page }) => {
    const fake = await installFakeSupabase(page);
    seedLet(opsAccount(fake));
    await page.goto(`/leases/${LEASE}`);
    await expect(page.getByTestId("lease-position")).toBeVisible();
    const small = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>(".ops-app .btn, .ops-app .input, .ops-app .menu-toggle"))
      .filter((el) => el.offsetParent !== null && el.getBoundingClientRect().height < 44).map((el) => el.outerHTML.slice(0, 80)));
    expect(small).toEqual([]);
  });
});

for (const [width, height] of [[390, 844], [768, 1024], [1440, 900]] as const) {
  test(`at ${width}px, every main page fits the screen, even with long names and large balances`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const fake = await installFakeSupabase(page);
    seedStress(opsAccount(fake));
    for (const path of ["/", "/properties", `/properties/${PROP}`, "/tenants", `/tenants/${TENANT}`, `/leases/${LEASE}`, "/rent", "/maintenance"]) {
      await page.goto(path);
      await expect(page.locator("main h1").first()).toBeVisible();
      await expect(page.getByRole("status").filter({ hasText: "Loading" })).toHaveCount(0);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });
}

test("on a phone, every main page fits the screen", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  const fake = await installFakeSupabase(page);
  seedLet(opsAccount(fake));
  for (const path of ["/", "/properties", `/properties/${PROP}`, "/tenants", `/leases/${LEASE}`, "/rent", "/maintenance"]) {
    await page.goto(path);
    await expect(page.locator("main h1").first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});
