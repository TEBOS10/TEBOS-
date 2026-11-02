import { expect, test, type Page } from "@playwright/test";
import { installFakeSupabase } from "./fake-supabase";
import { ORG } from "./fixtures";

// Tidy Enterprise's public website (ADR 0022): the founder's words, the problems, the six stages, what it is not, and an
// enquiry form that asks for consent; closed (email instead) until the team switches it on in TEBOS. The team then reads
// the enquiry, records that they replied, and closes it. The rules are tested in core (99zzl_property_enquiries.sql).

const site = "http://localhost:5178";
const TIDY = "20000000-0000-4000-8000-0000000000e1";

async function tidyOrg(page: Page, accepting: boolean) {
  const fake = await installFakeSupabase(page, { signedIn: false });
  const t = fake.tables as Record<string, Array<Record<string, unknown>>>;
  t.organisations!.push({ id: TIDY, name: "Tidy Enterprise", slug: "tidy-enterprise", created_at: new Date().toISOString() });
  t.property_enquiry_settings = [{ org_id: TIDY, accepting, updated_at: new Date().toISOString() }];
  return fake;
}

test("the site says what Tidy Enterprise does, in the founder's words, and nothing invented", async ({ page }) => {
  await tidyOrg(page, false);
  await page.goto(site);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("structured economic opportunity");
  await expect(page.locator(".te-stages > li h3")).toHaveText(["Discover", "Assess", "Underwrite", "Strategise", "Execute", "Optimise"]);
  await expect(page.locator(".te-problems li:not(.te-problems-cta)")).toHaveCount(7);
  await expect(page.getByText("Regulated services remain with appropriately qualified professionals.").first()).toBeVisible();
  await expect(page.locator("body")).toContainText("not simply an estate agency, a construction company, a property management company, a lender or a law firm");
  // no testimonials, client logos or invented figures
  await expect(page.locator("body")).not.toContainText(/testimonial|trusted by|clients served/i);
  await expect(page.locator("body")).not.toContainText(/\d+%|\bR ?\d{3}/);
  // closed until the team switches it on: the email address instead of the form
  await expect(page.getByTestId("enquiry-closed")).toContainText("tidyai.enterprise@gmail.com");
  await expect(page.getByTestId("enquiry-form")).toHaveCount(0);
});

test("an enquiry needs consent, keeps personal details out of the description, and gets a reference", async ({ page }) => {
  const fake = await tidyOrg(page, true);
  await page.goto(`${site}/#enquire`);
  const form = page.getByTestId("enquiry-form");
  await form.getByLabel("What is happening with the property?").selectOption("arrears");
  await form.getByLabel("How are you connected to it?").selectOption("owner");
  await form.getByLabel("Roughly where is it?").fill("Sunnyside, Pretoria");
  await form.getByLabel("What is going on, in your words").fill("Two flats empty since March; call me on 082 555 1234.");
  await form.getByLabel("Your name").fill("Thandi N");
  await form.getByLabel("Email", { exact: true }).fill("thandi@example.co.za");
  await form.getByRole("button", { name: "Send enquiry" }).click();
  await expect(form.getByRole("alert")).toContainText("Leave ID numbers, phone numbers and email addresses out");
  await form.getByLabel("What is going on, in your words").fill("Six flats; two have been empty since March and the levies are three months behind.");
  await form.getByRole("button", { name: "Send enquiry" }).click();
  await expect(form.getByRole("alert")).toContainText("Agree to your details being used");
  expect(fake.writes.filter((w) => w.table === "property_enquiry")).toHaveLength(0);
  await form.getByRole("checkbox").check();
  await form.getByRole("button", { name: "Send enquiry" }).click();
  await expect(page.getByTestId("enquiry-sent")).toContainText("EQ-0001");
  const sent = fake.writes.find((w) => w.table === "property_enquiry")!.body as Record<string, unknown>;
  expect(sent).toMatchObject({ p_slug: "tidy-enterprise", p_situation: "arrears", p_relationship: "owner", p_consent: true, p_phone: null });
});

test("on a phone the site reads in one column with no sideways scroll", async ({ page }) => {
  await tidyOrg(page, true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(site);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("the team sees enquiries in TEBOS, and records the reply", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  const t = fake.tables as Record<string, Array<Record<string, unknown>>>;
  const now = new Date().toISOString();
  t.property_enquiry_settings = [{ org_id: ORG, accepting: false, updated_at: now }];
  t.property_enquiries = [{ id: "q1", org_id: ORG, ref: "EQ-0001", situation: "arrears", relationship: "owner", area: "Sunnyside, Pretoria",
    message: "Six flats; two have been empty since March and the levies are three months behind.", name: "Thandi N", email: "thandi@example.co.za",
    phone: null, consent_at: now, status: "new", status_note: null, created_at: now }];
  await page.goto("/");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Enquiries" }).click();
  await expect(page.getByRole("heading", { name: "Enquiries" })).toBeVisible();
  await expect(page.getByTestId("enquiry-state")).toContainText("Off");
  await page.getByTestId("enquiry-toggle").click();
  await expect.poll(() => fake.writes.some((w) => w.table === "property_enquiry_settings" && (w.body as { accepting?: boolean }).accepting === true)).toBe(true);
  const item = page.getByTestId("enquiry");
  await item.getByText("Thandi N").click();
  await expect(item).toContainText("thandi@example.co.za");
  await expect(item).toContainText("Bond arrears, municipal debt or levy debt");
  await item.getByLabel("What happened (kept with the enquiry)").fill("Phoned; site visit booked for Friday.");
  await item.getByRole("button", { name: "Mark contacted" }).click();
  await expect.poll(() => fake.writes.find((w) => w.table === "property_enquiries" && w.method === "PATCH")?.body).toMatchObject({ status: "contacted" });
});
