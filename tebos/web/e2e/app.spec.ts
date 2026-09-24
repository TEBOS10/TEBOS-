import { expect, test, type Page } from "@playwright/test";
import { installFakeSupabase } from "./fake-supabase";
import { ACTION, FINDING } from "./fixtures";

const shots = process.env.SCREENSHOT_DIR;
const snap = async (page: Page, name: string) => {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
};

test("signed-out visitors see sign-in, not data", async ({ page }) => {
  await installFakeSupabase(page, { signedIn: false });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(page.getByText("Clayworks")).toHaveCount(0);
  await snap(page, "0-sign-in");
});

test("home shows honest scan states and the command-centre cards", async ({ page }) => {
  await installFakeSupabase(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "What do you want TEBOS to work on?" })).toBeVisible();
  await expect(page.getByText("3 targets scanned · 2 acquired · 1 unavailable · confidence 46%")).toBeVisible();
  await expect(page.getByText("waiting for the acquisition worker")).toBeVisible();
  await expect(page.getByText("Reading: last ran")).toBeVisible();
  await expect(page.getByText("0 verified connections")).toBeVisible();
  await snap(page, "1-home");
});

test("a scan shows what was read, what wasn't, and why TEBOS is as confident as it is", async ({ page }) => {
  await installFakeSupabase(page);
  await page.goto("/scans");
  await page.getByRole("link", { name: "Clayworks Studio (fictional)" }).last().click();
  await expect(page.getByText("Partial.")).toBeVisible();
  await expect(page.getByRole("cell", { name: "HTTP 503 from the site" })).toBeVisible();
  await expect(page.getByText("not obtained").first()).toBeVisible();
  await expect(page.getByText("Few independent sources agree")).toBeVisible();
  await expect(page.getByText(/claude-opus-5 · 2,140 in \/ 610 out tokens/)).toBeVisible();
  await expect(page.getByText("1 proposed finding was rejected for lack of evidence")).toBeVisible();
  await snap(page, "2-scan");
});

test("a finding answers 'why did TEBOS say this?' with the evidence", async ({ page }) => {
  await installFakeSupabase(page);
  await page.goto(`/findings/${FINDING}`);
  await expect(page.getByRole("heading", { name: "Why did TEBOS say this?" })).toBeVisible();
  await expect(page.getByText("Page links to WhatsApp")).toBeVisible();
  await expect(page.getByText('<a href="https://wa.me/27820000000">Order on WhatsApp</a>')).toBeVisible();
  await expect(page.getByText("How orders are recorded after a WhatsApp message")).toBeVisible();
  await snap(page, "3-finding");

  await page.goto("/findings");
  await page.getByRole("link", { name: "No self-service checkout" }).click();
  await expect(page.getByText("Hypothesis.", { exact: true })).toBeVisible();
  await expect(page.getByText(/Reclassified as hypothesis/)).toBeVisible();
});

test("proposing an action derives its risk and approval from the capability", async ({ page }) => {
  await installFakeSupabase(page);
  await page.goto(`/findings/${FINDING}`);
  await page.getByRole("button", { name: "Propose an action" }).click();
  await page.getByLabel("Capability required").selectOption("finance.initiate_payment");
  await expect(page.getByText(/Tier 3 · Consequential: needs approval before it runs, from someone other than the requester/)).toBeVisible();
  await expect(page.getByRole("option", { name: "Tier 1 · Internal" })).toHaveAttribute("disabled", "");
});

test("requesting a scan reuses the business record for the domain and queues the scan", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  await page.goto("/");
  await page.getByLabel("Business website URL").fill("www.clayworks.example/shop");
  await page.getByRole("button", { name: "Add objective or context" }).click();
  await page.getByLabel("Scan objective").fill("Check the order journey");
  await page.getByRole("button", { name: "Scan business" }).click();
  await expect(page).toHaveURL(/\/scans\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Queued. The acquisition worker will pick this scan up")).toBeVisible();
  expect(fake.writes.filter((w) => w.table === "businesses")).toHaveLength(0); // existing record reused
  expect(fake.writes.find((w) => w.table === "scans")?.body).toMatchObject({ objective: "Check the order journey", scope: { url: "https://www.clayworks.example/shop" } });
});

test("an action offers only legal next steps, and explains a refusal", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  await page.goto(`/actions/${ACTION}`);
  await expect(page.getByText("Required, one execution per approval")).toBeVisible();
  await expect(page.getByRole("button", { name: "Queue for execution" })).toHaveCount(0); // tier 2: approval first
  await snap(page, "4-action");

  fake.refuse({ table: "actions", method: "PATCH", hint: "TEBOS_ILLEGAL_TRANSITION", message: "illegal action transition: ready -> cancelled" });
  await page.getByRole("button", { name: "Cancel action" }).click();
  await expect(page.getByText("That step isn't possible from the current state.")).toBeVisible();
  fake.refuse(null);

  await page.getByRole("button", { name: "Request approval" }).click();
  await expect.poll(() => fake.writes.find((w) => w.table === "approvals")?.body).toMatchObject({ risk_tier: 2, requested_operation: "Add a structured order form" });
});

test("a viewer can read but gets no controls", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  fake.tables.memberships![0]!.role = "viewer";
  await page.goto("/");
  await expect(page.getByText("You have view access.")).toBeVisible();
  await page.goto(`/actions/${ACTION}`);
  await expect(page.getByText("Your role can view this action but not change it")).toBeVisible();
  await expect(page.getByRole("button", { name: "Request approval" })).toHaveCount(0);
});
