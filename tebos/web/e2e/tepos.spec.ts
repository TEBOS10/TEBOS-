import { expect, test } from "@playwright/test";
import { installFakeSupabase, verifiedFactor } from "./fake-supabase";
import { ORG, USER_ID } from "./fixtures";

// TEPOS and TEBOS are two separate web apps (founder, 16 Oct 2026). TEPOS (port 5175 here) is the founder's: a
// city of six portals in earthy shades, the unbuilt ones under scaffolding. TEBOS (5174) is for clients: their
// tiles in their own colours, and nothing of TEPOS anywhere.

const TEPOS = "http://localhost:5175";
const VAULT = "f1000000-0000-4000-8000-000000000003";
const CLIENT_ORG = "c1000000-0000-4000-8000-000000000001";
const now = () => new Date().toISOString();

test.use({ reducedMotion: "reduce" });

async function founder(page: import("@playwright/test").Page) {
  const fake = await installFakeSupabase(page, { aal: "aal2", factors: [verifiedFactor()] });
  const t = fake.tables as unknown as Record<string, Record<string, unknown>[]>;
  t.organisations!.push({ id: VAULT, name: "IREKUN", slug: "irekun", private: true, created_at: now() });
  t.memberships!.push({ org_id: VAULT, user_id: USER_ID, role: "org_admin", created_at: now() });
  t.res_money_items = [];
  return fake;
}

test("TEPOS: the city and the tiles; Tidy Capital opens in the private organisation; unbuilt portals say so", async ({ page }) => {
  await founder(page);
  await page.goto(`${TEPOS}/`);
  await expect(page).toHaveTitle("TEPOS");
  await expect(page.getByRole("heading", { name: "Tidy", exact: true })).toBeVisible();
  // the city: six buildings, two of them under construction
  const buildings = page.getByRole("group", { name: "Portals as buildings" }).getByRole("button");
  await expect(buildings).toHaveCount(6);
  await expect(page.getByTestId("building-forex")).toHaveAttribute("aria-label", "Forex: not built yet");
  await expect(page.getByTestId("building-capital")).toHaveAttribute("aria-label", "Tidy Capital: open");
  await expect(page.getByTestId("building-enterprise")).toHaveAttribute("aria-label", "Tidy Enterprise: no access"); // no Tidy Enterprise organisation in the fixture
  // and the same portals as tiles, each in its own shade
  const tiles = page.getByRole("region", { name: "Portals" }).getByRole("button");
  await expect(tiles).toHaveCount(6);
  const shades = await tiles.evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundColor));
  expect(new Set(shades).size).toBe(6);

  await page.getByTestId("building-capital").click();
  await expect(page.getByRole("heading", { name: "Tidy Capital" })).toBeVisible();
  await expect(page.getByTestId("current-org")).toHaveText("IREKUN");

  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Forex" }).click();
  await expect(page.getByTestId("portal-not-built")).toContainText("No live trading");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "IREKUN" }).click();
  await expect(page.getByTestId("irekun-two-step")).toContainText("On, with 1 authenticator. This session passed it.");
});

test("TEPOS: a building opens by keyboard too", async ({ page }) => {
  await founder(page);
  await page.goto(`${TEPOS}/`);
  await page.getByTestId("building-academics").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("portal-not-built")).toContainText("study path");
});

test("TEPOS signs in as TEPOS, and its logo is the bronze one", async ({ page }) => {
  await installFakeSupabase(page, { signedIn: false });
  await page.goto(`${TEPOS}/`);
  await expect(page.getByRole("heading", { name: "TEPOS" })).toBeVisible();
  await expect(page.getByText("New to TEBOS")).toHaveCount(0);
  const logo = await page.locator(".brand-mark").first().evaluate((e) => getComputedStyle(e).backgroundImage);
  expect(logo).toContain("tepos-mark.png");
});

test("TEBOS: clients as tiles in their own colours; nothing of TEPOS anywhere", async ({ page }) => {
  const fake = await founder(page);
  const t = fake.tables as unknown as Record<string, Record<string, unknown>[]>;
  t.organisations!.push({ id: CLIENT_ORG, name: "Grape Studios", slug: "grape-studios", private: false, created_at: now() });
  t.memberships!.push({ org_id: CLIENT_ORG, user_id: USER_ID, role: "org_admin", created_at: now() });
  const grape = { id: "b1000000-0000-4000-8000-0000000000a1", org_id: CLIENT_ORG, name: "Grape Studios", relationship: "client", brand_primary: "#141018", brand_accent: "#7b3fe4", brand_surface: "#ffffff",
    app_url: "https://grape.example/staff", industry: null, website: null, archived_at: null, created_at: now(), updated_at: now() };
  const hosp = { ...grape, id: "b1000000-0000-4000-8000-0000000000a2", org_id: ORG, name: "Hospitality OS", relationship: "in_development", brand_primary: "#f2665e", brand_accent: "#1f1f1f", app_url: null };
  const vantage = { ...grape, id: "b1000000-0000-4000-8000-0000000000a3", org_id: ORG, name: "Vantage", brand_primary: "#0f1410", brand_accent: "#a8d5b0", app_url: null };
  t.businesses = [...(t.businesses ?? []), grape, hosp, vantage];
  await page.route("https://grape.example/**", (r) => r.fulfill({ contentType: "text/html", body: "<h1>Grape Studios staff</h1>" }));
  await page.goto("/");
  const map = page.getByRole("region", { name: "Clients" });
  await expect(map.getByTestId(`client-${grape.id}`)).toHaveCSS("background-color", "rgb(20, 16, 24)");
  await expect(map.getByTestId(`client-${hosp.id}`)).toContainText("In development");
  await expect(map.getByRole("button")).toHaveCount(3);
  await expect(map.getByTestId(`client-${vantage.id}`)).toContainText("Web app address not set");
  // the founder owns a private organisation, and still TEBOS shows nothing of TEPOS
  await expect(page.getByText(/TEPOS|Tidy Capital|IREKUN/)).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Organisation" }).locator("option", { hasText: "IREKUN" })).toHaveCount(0);
  await page.goto("/tepos");
  await expect(page.getByRole("heading", { name: "Tidy", exact: true })).toHaveCount(0);
});

test("TEBOS: a client's tile opens the client's own web app, never a page of TEBOS data", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  const t = fake.tables as unknown as Record<string, Record<string, unknown>[]>;
  const grape = { id: "b1000000-0000-4000-8000-0000000000a1", org_id: ORG, name: "Grape Studios", relationship: "client", brand_primary: "#141018", brand_accent: "#7b3fe4",
    brand_surface: "#ffffff", app_url: "https://grape.example/staff", industry: null, website: null, archived_at: null, created_at: now(), updated_at: now() };
  const vantage = { ...grape, id: "b1000000-0000-4000-8000-0000000000a3", name: "Vantage", app_url: null };
  t.businesses = [...(t.businesses ?? []), grape, vantage];
  await page.route("https://grape.example/**", (r) => r.fulfill({ contentType: "text/html", body: "<h1>Grape Studios staff</h1>" }));
  await page.goto("/");
  await page.getByTestId(`client-${vantage.id}`).click();
  await expect(page).toHaveURL("http://localhost:5174/");
  await page.getByTestId(`client-${grape.id}`).click();
  await expect(page).toHaveURL("https://grape.example/staff");
  await expect(page.getByRole("heading", { name: "Grape Studios staff" })).toBeVisible();
});

test.describe("with motion", () => {
  test.use({ reducedMotion: "no-preference" });
  test("opening a portal pulls you through its vortex, then lands inside", async ({ page }) => {
    await founder(page);
    await page.goto(`${TEPOS}/`);
    await page.getByTestId("portal-forex").click();
    await expect(page.locator(".portal-vortex")).toBeVisible();
    await expect(page.getByTestId("portal-not-built")).toBeVisible();
    await expect(page.locator(".portal-vortex")).toHaveCount(0);
  });
});

<<<<<<< HEAD
test("TEPOS signs itself out after 30 minutes without use", async ({ page }) => {
  await page.clock.install();
  await founder(page);
  await page.goto(`${TEPOS}/`);
  await expect(page.getByRole("heading", { name: "Tidy", exact: true })).toBeVisible();
  await page.clock.fastForward("29:00");
  await expect(page.getByRole("heading", { name: "Tidy", exact: true })).toBeVisible();
  await page.clock.fastForward("02:00");
  await expect(page.getByRole("heading", { name: "TEPOS" })).toBeVisible();
=======
test.describe("the city in 3D", () => {
  test.use({ reducedMotion: "no-preference" });
  test("builds itself from the blueprint up, every building stopping where its portal really is, and opens a portal", async ({ page }) => {
    test.setTimeout(90_000);
    await founder(page);
    // ?force3d draws the 3D city on this test browser's software renderer too
    await page.goto(`${TEPOS}/?force3d`);
    const city = page.getByRole("group", { name: "Portals as buildings" });
    await expect(page.getByTestId("city-3d")).toBeVisible();
    await expect(city.getByRole("button")).toHaveCount(6);
    await expect(page.getByTestId("building-capital")).toHaveAttribute("aria-label", "Tidy Capital: open");
    await expect(page.getByTestId("building-forex")).toHaveAttribute("aria-label", "Forex: not built yet");
    await expect(page.getByTestId("building-enterprise")).toHaveAttribute("aria-label", "Tidy Enterprise: no access");
    // the build ends with the city: four portals are built, and it can be built again
    await expect(page.locator(".city3d-caption")).toContainText("4 of 6 built", { timeout: 60_000 });
    await expect(page.getByRole("button", { name: "Build it again" })).toBeVisible();
    await page.getByTestId("building-capital").click();
    await expect(page.getByRole("heading", { name: "Tidy Capital" })).toBeVisible();
  });
>>>>>>> origin/main
});
