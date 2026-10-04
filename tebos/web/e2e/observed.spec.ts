import { expect, test } from "@playwright/test";
import { installFakeSupabase } from "./fake-supabase";
import { BIZ, ORG } from "./fixtures";

// Observed pieces: a piece of the board is confirmed by evidence TEBOS obtained,
// never by the owner's own word, and it shows what confirmed it.

test("a piece is confirmed from evidence TEBOS obtained, and shows what confirmed it", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  const t = fake.tables as Record<string, Array<Record<string, unknown>>>;
  const now = new Date().toISOString();
  t.board_components = [{ id: "pc1", org_id: ORG, business_id: BIZ, name: "WhatsApp", kind: "channel", supplier: null, owner_role: "Owner", description: null,
    basis: "stated", evidence_id: null, connection_id: null, from_blueprint: null, retired_at: null, created_at: now, updated_at: now }];
  t.board_flows = [];
  t.board_steps = [];
  // what the owner said is evidence too, but it can only make a piece stated
  t.sources.push({ id: "said", org_id: ORG, business_id: BIZ, source_type: "user_statement", uri: "owner", label: "Owner", created_at: now });
  t.evidence.push({ id: "said-1", org_id: ORG, business_id: BIZ, source_id: "said", state: "user_supplied", fact: "We take all orders on WhatsApp", created_at: now });

  await page.goto(`/businesses/${BIZ}/board`);
  const pieces = page.getByTestId("pieces");
  await expect(pieces).toContainText("WhatsApp");
  await pieces.getByRole("button", { name: "Confirm from evidence" }).click();
  const form = page.getByRole("form", { name: "Confirm from evidence" });
  const options = await form.getByLabel("Evidence that shows this piece is real").locator("option").allTextContents();
  expect(options.some((o) => o.includes("Page links to WhatsApp"))).toBe(true);
  expect(options.some((o) => o.includes("We take all orders on WhatsApp"))).toBe(false); // the owner's word
  expect(options.some((o) => o.includes("could not be read"))).toBe(false); // evidence that wasn't obtained

  const whatsapp = t.evidence.find((e) => e.fact === "Page links to WhatsApp")!;
  await form.getByLabel("Evidence that shows this piece is real").selectOption(whatsapp.id as string);
  await form.getByRole("button", { name: "Confirm" }).click();
  await expect.poll(() => fake.writes.find((w) => w.table === "board_components" && w.method === "PATCH")?.body)
    .toEqual({ basis: "observed", evidence_id: whatsapp.id });
  await expect(page.getByTestId("cited")).toContainText("Confirmed by: Page links to WhatsApp");
  await expect(pieces.getByRole("button", { name: "Cite newer evidence" })).toBeVisible();
});

test("with nothing obtained yet, the board says how to get evidence instead of offering the owner's word", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  const t = fake.tables as Record<string, Array<Record<string, unknown>>>;
  const now = new Date().toISOString();
  t.board_components = [{ id: "pc1", org_id: ORG, business_id: BIZ, name: "Notebook", kind: "document", supplier: null, owner_role: null, description: null,
    basis: "stated", evidence_id: null, connection_id: null, from_blueprint: null, retired_at: null, created_at: now, updated_at: now }];
  t.board_flows = [];
  t.board_steps = [];
  t.evidence = [];
  await page.goto(`/businesses/${BIZ}/board`);
  await page.getByTestId("pieces").getByRole("button", { name: "Confirm from evidence" }).click();
  await expect(page.getByText("No evidence can confirm this yet")).toBeVisible();
});
