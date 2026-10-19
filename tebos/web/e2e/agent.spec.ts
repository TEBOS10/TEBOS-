import { expect, test } from "@playwright/test";
import { installFakeSupabase, verifiedFactor } from "./fake-supabase";
import { USER_ID } from "./fixtures";

// The Real Estate Job portal in TEPOS (port 5175): the agent's office, slice 1. Every listing and person with its
// next step and date, in the private organisation, after two-step sign-in. No personal details are accepted.

const TEPOS = "http://localhost:5175";
const VAULT = "f1000000-0000-4000-8000-000000000003";
const now = () => new Date().toISOString();
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

test.use({ reducedMotion: "reduce" });

async function founder(page: import("@playwright/test").Page, aal: "aal1" | "aal2" = "aal2") {
  // aal1 here is an account without an authenticator: with one, sign-in itself asks for the code first
  const fake = await installFakeSupabase(page, { aal, factors: aal === "aal2" ? [verifiedFactor()] : [] });
  const t = fake.tables as unknown as Record<string, Record<string, unknown>[]>;
  t.organisations!.push({ id: VAULT, name: "IREKUN", slug: "irekun", private: true, created_at: now() });
  t.memberships!.push({ org_id: VAULT, user_id: USER_ID, role: "org_admin", created_at: now() });
  const base = { org_id: VAULT, outcome: null, note: null, stage_at: now(), created_by: USER_ID, created_at: now(), updated_at: now() };
  t.agent_listings = [
    { ...base, id: "a1000000-0000-4000-8000-000000000001", ref: "L-001", label: "3-bed house, Erf 512 Northcliff", deal: "sale", stage: "mandate", price: 1850000,
      mandate: "sole", mandate_ends_on: day(5), next_step: "Present the valuation", next_step_on: day(-2) },
  ];
  t.agent_contacts = [
    { ...base, id: "a1000000-0000-4000-8000-0000000000b1", ref: "B-001", role: "buyer", label: "First-time buyer, R1.2m, pre-approved", listing_id: null, source: "portal",
      stage: "new", next_step: "Book viewings", next_step_on: day(0) },
  ];
  return fake;
}

test("TEPOS: Real Estate Job opens in the private organisation with every next step, overdue first", async ({ page }) => {
  await founder(page);
  await page.goto(`${TEPOS}/`);
  await expect(page.getByTestId("building-agent")).toHaveAttribute("aria-label", "Real Estate Job: open");
  await page.getByTestId("building-agent").click();
  await expect(page.getByRole("heading", { name: "Real Estate Job" })).toBeVisible();
  await expect(page.getByTestId("current-org")).toHaveText("IREKUN");

  const rows = page.getByTestId("agenda").getByRole("row");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("2 days late");
  await expect(rows.nth(0)).toContainText("L-001");
  await expect(rows.nth(1)).toContainText("today");
  await expect(page.getByTestId("count-overdue")).toContainText("1");
  await expect(page.getByTestId("mandates-ending")).toContainText("L-001");
  await expect(page.getByTestId("contacts")).toContainText("B-001");
});

test("TEPOS: a listing is added with its next step; personal details and open-ended closures are refused", async ({ page }) => {
  const fake = await founder(page);
  await page.goto(`${TEPOS}/agent`);
  await expect(page.getByTestId("agenda")).toBeVisible();

  // a buyer described by a phone number is refused before anything is sent
  await page.getByRole("button", { name: "Add a buyer" }).click();
  const buyer = page.getByRole("form", { name: "Add a buyer" });
  await buyer.getByLabel("Description").fill("Call 082 555 1234");
  await buyer.getByLabel("Next step").fill("Call back");
  await buyer.getByRole("button", { name: "Save" }).click();
  await expect(buyer).toContainText("No email addresses, phone numbers or ID numbers");
  expect(fake.writes.filter((w) => w.table === "agent_contacts")).toHaveLength(0);
  await buyer.getByRole("button", { name: "Cancel" }).click();

  // a listing with its next step
  await page.getByRole("button", { name: "Add a listing" }).click();
  const form = page.getByRole("form", { name: "Add a listing" });
  await form.getByLabel("Property").fill("2-bed flat, Parkhurst");
  await form.getByLabel("Sale or rental").selectOption("rental");
  await form.getByLabel("Rent a month (rand)").fill("12 500");
  await form.getByLabel("Next step").fill("Photos and floor plan");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form).toHaveCount(0);
  const write = fake.writes.find((w) => w.table === "agent_listings" && w.method === "POST")!;
  expect(write.body).toMatchObject({ org_id: VAULT, label: "2-bed flat, Parkhurst", deal: "rental", price: 12500, next_step: "Photos and floor plan", next_step_on: day(0) });

  // closing a listing needs to say how it ended
  await page.getByTestId("listings").getByRole("row", { name: /Northcliff/ }).getByRole("button", { name: "Edit" }).click();
  const edit = page.getByRole("form", { name: "Edit listing" });
  await edit.getByLabel("Stage").selectOption("lost");
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(edit).toContainText("Say how it ended.");
  await edit.getByLabel("How it ended").fill("Owner chose another agency");
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(edit).toHaveCount(0);
  const patch = fake.writes.find((w) => w.table === "agent_listings" && w.method === "PATCH")!;
  expect(patch.body).toMatchObject({ stage: "lost", outcome: "Owner chose another agency", next_step: null, next_step_on: null });
});

test("TEPOS: without two-step sign-in, the office stays closed", async ({ page }) => {
  await founder(page, "aal1");
  await page.goto(`${TEPOS}/agent`);
  // all of TEPOS asks for the second step first (migration tepos_two_step)
  await expect(page.getByTestId("tepos-two-step-first")).toBeVisible();
  await expect(page.getByTestId("agenda")).toHaveCount(0);
});

test("TEPOS: a deal's documents follow the agency's checklist; nothing is stored, only where it is kept", async ({ page }) => {
  const fake = await founder(page);
  const t = fake.tables as unknown as Record<string, Record<string, unknown>[]>;
  t.agent_deal_items = [];
  t.agent_ffc_steps = [];
  await page.goto(`${TEPOS}/agent`);
  await page.getByRole("button", { name: "Documents for L-001" }).click();
  const docs = page.getByTestId("deal-documents");
  await expect(docs).toContainText("Pelser Real Estate, Property Check list (Office use)");
  await expect(docs.getByTestId("documents-deal")).toContainText("co-signed by a full-status practitioner");
  await expect(page.getByTestId("deal-documents-summary")).toContainText("0 of 37");

  // not applicable needs a reason
  await docs.getByRole("button", { name: "Update Gas certificate" }).click();
  const form = page.getByRole("form", { name: "Update Gas certificate" });
  await form.getByLabel("Status").selectOption("not_applicable");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form).toContainText("Say why it doesn't apply");
  await form.getByLabel("Why it doesn't apply").fill("No gas installation");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form).toHaveCount(0);
  expect(fake.writes.find((w) => w.table === "agent_deal_items")!.body).toMatchObject({
    org_id: VAULT, listing_id: "a1000000-0000-4000-8000-000000000001", item: "gas_certificate", status: "not_applicable", reason: "No gas installation",
  });
  await expect(page.getByTestId("deal-documents-summary")).toContainText("0 of 36");
});

test("TEPOS: the FFC path holds only steps with a source, starting from the PPRA's own form", async ({ page }) => {
  const fake = await founder(page);
  const t = fake.tables as unknown as Record<string, Record<string, unknown>[]>;
  t.agent_deal_items = [];
  t.agent_ffc_steps = [];
  await page.goto(`${TEPOS}/agent`);
  const ffc = page.getByTestId("ffc-path");
  await ffc.getByRole("button", { name: "Add the PPRA's candidate registration steps (5)" }).click();
  await expect(ffc.getByTestId("ffc-steps").getByRole("row")).toHaveCount(5);
  const added = fake.writes.find((w) => w.table === "agent_ffc_steps")!.body as Array<Record<string, unknown>>;
  expect(added.map((r) => r.source)).toEqual([13.1, "13.2.1", "13.2.2", "13.2.3", "13.2.4"].map((n) => `PPRA application for a Fidelity Fund Certificate (natural person), section 13, ${n}`));

  // a step without a source is refused before anything is sent
  await ffc.getByRole("button", { name: "Add a step" }).click();
  const form = page.getByRole("form", { name: "Add a step" });
  await form.getByLabel("Step").fill("Pass the PDE exam");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form).toContainText("Say where this requirement comes from");
});
