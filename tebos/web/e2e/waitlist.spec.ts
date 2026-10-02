import { expect, test } from "@playwright/test";
import { installFakeSupabase } from "./fake-supabase";

test("the waiting list asks for the essentials and sends a waitlist enquiry with the kind of business", async ({ page }) => {
  const fake = await installFakeSupabase(page, { signedIn: false });
  await page.goto("/");
  await page.getByRole("link", { name: /Join the waiting list/ }).click();
  await expect(page.getByRole("heading", { name: "Get your operating system in 3 days" })).toBeVisible();

  await page.getByRole("button", { name: "Join the waiting list" }).click();
  await expect(page.getByText("Please add your name, the business name, a valid email address, the size of the team.")).toBeVisible();
  expect(fake.writes.find((w) => w.table === "enquiries")).toBeUndefined();

  await page.getByLabel("Your name").fill("Thabo");
  await page.getByLabel("Business name").fill("Thabo Builds");
  await page.getByLabel("Email").fill("thabo@builds.example");
  await page.getByLabel("Kind of business").selectOption("trades-construction");
  await page.getByLabel("Team size").selectOption("6-20");
  await page.getByRole("button", { name: "Join the waiting list" }).click();
  await expect(page.getByText("You're on the list.")).toBeVisible();
  expect(fake.writes.find((w) => w.table === "enquiries")?.body).toMatchObject({
    kind: "waitlist", industry: "trades-construction", name: "Thabo", business: "Thabo Builds", email: "thabo@builds.example",
    message: "Team size: 6-20",
  });
});
