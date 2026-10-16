import { expect, test } from "@playwright/test";
import { installFakeSupabase, verifiedFactor } from "./fake-supabase";
import { ORG, USER_ID } from "./fixtures";

// TEPOS (personal) and TEBOS (clients), two sides of one app (founder, 17 Oct
// 2026). TEPOS: six portals in earthy shades; the ones not built yet say so.
// TEBOS: clients as tiles in their own colours, "Not connected yet" until linked.

const VAULT = "f1000000-0000-4000-8000-000000000003";
const CLIENT_ORG = "c1000000-0000-4000-8000-000000000001";
const now = () => new Date().toISOString();

test.use({ reducedMotion: "reduce" });

test("TEPOS: six portals; Tidy Capital opens in the private organisation; one not built yet says so", async ({ page }) => {
  const fake = await installFakeSupabase(page, { aal: "aal2", factors: [verifiedFactor()] });
  const t = fake.tables as unknown as Record<string, Record<string, unknown>[]>;
  t.organisations!.push({ id: VAULT, name: "IREKUN", slug: "irekun", private: true, created_at: now() });
  t.memberships!.push({ org_id: VAULT, user_id: USER_ID, role: "org_admin", created_at: now() });
  t.res_money_items = [];
  await page.goto("/");
  await page.getByRole("group", { name: "Side" }).getByRole("link", { name: /TEPOS/ }).click();
  await expect(page.getByRole("heading", { name: "Tidy", exact: true })).toBeVisible();
  const portals = page.getByRole("region", { name: "Portals" }).getByRole("button");
  await expect(portals).toHaveCount(6);
  await expect(page.getByTestId("portal-academics")).toContainText("Not built yet");
  await expect(page.getByTestId("portal-capital")).toContainText("Open");
  await expect(page.getByTestId("portal-enterprise")).toContainText("No access"); // the fixture has no Tidy Enterprise organisation
  // each tile in its own colour
  const shades = await portals.evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundColor));
  expect(new Set(shades).size).toBe(6);

  await page.getByTestId("portal-capital").click();
  await expect(page.getByRole("heading", { name: "Tidy Capital" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Organisation" })).toHaveValue(VAULT);
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Forex" })).toBeVisible();

  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Forex" }).click();
  await expect(page.getByTestId("portal-not-built")).toContainText("No live trading");

  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "IREKUN" }).click();
  await expect(page.getByTestId("irekun-two-step")).toContainText("On, with 1 authenticator. This session passed it.");
});

test("TEBOS: clients as tiles in their own colours; not connected says so; a tile opens the client", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  const t = fake.tables as unknown as Record<string, Record<string, unknown>[]>;
  t.organisations!.push({ id: CLIENT_ORG, name: "Grape Studios", slug: "grape-studios", private: false, created_at: now() });
  t.memberships!.push({ org_id: CLIENT_ORG, user_id: USER_ID, role: "org_admin", created_at: now() });
  const grape = { id: "b1000000-0000-4000-8000-0000000000a1", org_id: CLIENT_ORG, name: "Grape Studios", relationship: "client", brand_primary: "#141018", brand_accent: "#7b3fe4", brand_surface: "#ffffff",
    industry: null, website: null, archived_at: null, created_at: now(), updated_at: now() };
  const hosp = { ...grape, id: "b1000000-0000-4000-8000-0000000000a2", org_id: ORG, name: "Hospitality OS", relationship: "in_development", brand_primary: "#f2665e", brand_accent: "#1f1f1f" };
  t.businesses = [...(t.businesses ?? []), grape, hosp];
  await page.goto("/");
  const map = page.getByRole("region", { name: "Clients" });
  await expect(map.getByTestId(`client-${grape.id}`)).toContainText("Not connected yet");
  await expect(map.getByTestId(`client-${hosp.id}`)).toContainText("In development");
  await expect(map.getByTestId(`client-${grape.id}`)).toHaveCSS("background-color", "rgb(20, 16, 24)");
  // businesses that are only scanned are not clients, and aren't on the map
  await expect(map.getByRole("button")).toHaveCount(2);
  await map.getByTestId(`client-${grape.id}`).click();
  await expect(page).toHaveURL(new RegExp(`/businesses/${grape.id}$`));
  await expect(page.getByRole("combobox", { name: "Organisation" })).toHaveValue(CLIENT_ORG);
});

test.describe("with motion", () => {
  test.use({ reducedMotion: "no-preference" });
  test("opening a portal pulls you through its vortex, then lands inside", async ({ page }) => {
    await installFakeSupabase(page);
    await page.goto("/tepos");
    await page.getByTestId("portal-forex").click();
    await expect(page.locator(".portal-vortex")).toBeVisible();
    await expect(page.getByTestId("portal-not-built")).toBeVisible();
    await expect(page.locator(".portal-vortex")).toHaveCount(0);
  });
});
