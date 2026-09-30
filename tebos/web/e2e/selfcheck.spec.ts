import { expect, test } from "@playwright/test";
import { installFakeSupabase } from "./fake-supabase";

test("the self-check scores ten answers, shows where to start, shares only the score, and can become an enquiry", async ({ page }) => {
  const fake = await installFakeSupabase(page, { signedIn: false });
  await page.goto("/");
  await page.getByRole("link", { name: "Take the free self-check · 2 min" }).click();
  await expect(page.getByRole("heading", { name: "How much does your business run through you?" })).toBeVisible();
  const submit = page.getByRole("button", { name: /Answer all ten/ });
  await expect(submit).toBeDisabled();

  // yes, yes, sometimes, then no for the rest, and yes to the last
  const choices = ["Yes", "Yes", "Sometimes", "No", "No", "No", "No", "No", "No", "Yes"];
  const questions = page.getByTestId("sc-question");
  for (const [i, c] of choices.entries()) await questions.nth(i).getByRole("radio", { name: c }).click();
  await page.getByLabel("People in the business (optional)").selectOption("51-200");
  await page.getByRole("button", { name: "See my score" }).click();

  // the database's score (7 of 20 points), with no name sent
  expect(fake.writes.find((w) => w.table === "submit_self_check")?.body).toEqual({ p_answers: [2, 2, 1, 0, 0, 0, 0, 0, 0, 2], p_size: "51-200", p_region: null });
  await expect(page.getByTestId("sc-card")).toContainText("35%");
  await expect(page.getByTestId("sc-card")).toContainText("The middleware in places");
  await expect(page.getByRole("heading", { name: "Where to start" })).toBeVisible();
  await expect(page.getByText(/^Sales\./)).toBeVisible();

  // sharing carries only the score
  const linkedin = await page.getByRole("link", { name: "LinkedIn" }).getAttribute("href");
  expect(decodeURIComponent(linkedin!)).toContain("/self-check/result?s=35");
  expect(decodeURIComponent(linkedin!)).not.toContain("2,2,1");

  // talking to TEBOS is a separate, optional step, sized to the Company plan
  await page.getByLabel("Your name").fill("Naledi");
  await page.getByLabel("Business name").fill("Big Co");
  await page.getByLabel("Email").fill("naledi@bigco.example");
  await page.getByRole("button", { name: "Talk to TEBOS" }).click();
  await expect(page.getByText("We'll be in touch at naledi@bigco.example")).toBeVisible();
  expect(fake.writes.find((w) => w.table === "enquiries")?.body).toMatchObject({
    plan: "company", business: "Big Co", message: "From the self-check: 35% (The middleware in places). Areas to start with: Sales, Pricing, Objectives. Size: 51-200 people.",
  });
});

test("a shared result shows the score and invites others to take the check", async ({ page }) => {
  await installFakeSupabase(page, { signedIn: false });
  await page.goto("/self-check/result?s=70");
  await expect(page.getByTestId("sc-card")).toContainText("70%");
  await expect(page.getByTestId("sc-card")).toContainText("The business runs through you");
  await page.getByRole("link", { name: "Take the self-check" }).click();
  await expect(page).toHaveURL(/\/self-check$/);
  await page.goto("/self-check/result?s=abc");
  await expect(page.getByTestId("sc-card")).toHaveCount(0);
});

test("public pages fit a phone screen without scrolling sideways", async ({ page }) => {
  await installFakeSupabase(page, { signedIn: false });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/self-check", "/self-check/result?s=60", "/pricing", "/blog", "/blog/the-founder-is-the-middleware", "/privacy"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} is ${overflow}px wider than the screen`).toBeLessThanOrEqual(0);
  }
});
