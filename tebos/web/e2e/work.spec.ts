import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { installFakeSupabase } from "./fake-supabase";

// Work: each piece labelled for what it is. The Grape Studios concept books nothing and edits photos in the browser,
// and says plainly that the AI studio edits aren't connected.
const photo = readFileSync(new URL("../public/brand/icon-192.png", import.meta.url));

test("the work page labels each piece: a live client site, a concept, a template", async ({ page }) => {
  await installFakeSupabase(page, { signedIn: false });
  await page.goto("/");
  await page.getByRole("navigation", { name: "Site" }).getByRole("link", { name: "Work" }).click();
  await expect(page.getByRole("heading", { name: "Made by TEBOS" })).toBeVisible();
  const work = page.getByTestId("work");
  await expect(work.getByRole("link")).toHaveCount(3);
  await expect(work.getByRole("link", { name: /BAME/ })).toContainText("Live client site");
  await expect(work.getByRole("link", { name: /BAME/ })).toHaveAttribute("href", "https://bamemarketing.site");
  await expect(work.getByRole("link", { name: /Grape Studios/ })).toContainText("Concept");
  await expect(work.getByRole("link", { name: /Service business/ })).toContainText("Template");
});

test("Grape Studios: booking a shoot books nothing; the editor grades, matches and batches in the browser", async ({ page }) => {
  await installFakeSupabase(page, { signedIn: false });
  const sent: string[] = [];
  page.on("request", (r) => { if (r.method() !== "GET") sent.push(r.url()); });
  await page.goto("/work/grape-studios");
  await expect(page.getByText("Concept by TEBOS")).toBeVisible();
  const kinds = page.getByRole("group", { name: "Kind of shoot" });
  await expect(kinds.getByRole("button")).toHaveCount(6);

  await kinds.getByRole("button", { name: /Studio shoots/ }).click();
  const card = page.getByTestId("rate-card");
  await expect(card).toContainText("20 to 25 edited pictures per hour");
  await expect(card).not.toContainText("travel");
  await card.getByRole("button", { name: /1 hour/ }).click();
  await page.getByRole("group", { name: "Day" }).getByRole("button").first().click();
  await page.getByRole("group", { name: "Time" }).getByRole("button", { name: "10:00" }).click();
  await expect(page.getByTestId("deposit")).toContainText("R2 600. A R1 300 deposit (half, non-refundable) holds the date; R1 300 on the day.");
  await page.getByRole("button", { name: "Request this shoot" }).click();
  await expect(page.getByRole("status")).toContainText("nothing was sent");

  // Events is quoted: a custom rate needs a short brief
  await kinds.getByRole("button", { name: /Events/ }).click();
  await expect(card.getByRole("button", { name: /Custom rate/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("group", { name: "Day" }).getByRole("button").nth(1).click();
  await page.getByRole("group", { name: "Time" }).getByRole("button", { name: "14:00" }).click();
  await expect(page.getByRole("button", { name: "Ask for a quote" })).toBeDisabled();
  await page.getByLabel("What do you need?").fill("A 30th birthday, about 40 guests, three hours in Sandton.");
  await expect(page.getByRole("button", { name: "Ask for a quote" })).toBeEnabled();
  await expect(page.locator("body")).not.toContainText(/FNB|account number/i);

  await expect(page.getByText("Your photos appear here.")).toBeVisible();
  await page.getByLabel("Add photos").setInputFiles([
    { name: "one.png", mimeType: "image/png", buffer: photo },
    { name: "two.png", mimeType: "image/png", buffer: photo },
  ]);
  const after = page.getByRole("img", { name: "one.png, after" });
  await expect(after).toBeVisible();
  const original = await after.getAttribute("src");
  await page.getByRole("group", { name: "Look" }).getByRole("button", { name: /Night/ }).click();
  await expect.poll(() => after.getAttribute("src")).not.toBe(original);
  await expect(page.getByRole("list", { name: "Your photos" }).getByRole("button")).toHaveCount(2);
  await page.getByLabel("Add a reference photo").setInputFiles({ name: "ref.png", mimeType: "image/png", buffer: photo });
  await expect(page.getByRole("img", { name: "Reference photo" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save all 2" })).toBeVisible();
  await expect(page.getByText("Studio edits with AI: not connected yet.")).toBeVisible();
  expect(sent).toEqual([]);
});
