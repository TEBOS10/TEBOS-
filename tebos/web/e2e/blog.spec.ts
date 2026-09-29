import { expect, test } from "@playwright/test";
import { installFakeSupabase } from "./fake-supabase";

test("the blog is public: articles list, open, and lead to the demo", async ({ page }) => {
  await installFakeSupabase(page, { signedIn: false });
  await page.goto("/");
  await page.getByRole("link", { name: "Blog" }).first().click();
  await expect(page).toHaveURL(/\/blog$/);
  await expect(page.getByRole("heading", { name: "Structure, flows and measurement" })).toBeVisible();
  await expect(page.getByTestId("post")).toHaveCount(4);
  await page.getByRole("link", { name: /The founder is the middleware/ }).click();
  await expect(page).toHaveTitle(/The founder is the middleware/);
  await expect(page.getByRole("heading", { name: "Ten questions to find out" })).toBeVisible();
  // links inside the text go to this site
  await expect(page.getByRole("link", { name: "tebos-demo.vercel.app/demo" })).toHaveAttribute("href", "/demo");
  await expect(page.getByRole("link", { name: "See a mapped business in the demo" })).toBeVisible();
  await page.goto("/blog/no-such-article");
  await expect(page.getByRole("heading", { name: "That article doesn't exist" })).toBeVisible();
});

test("text links render only for this site or https, never script links", async ({ page }) => {
  const fake = await installFakeSupabase(page, { signedIn: false });
  (fake.tables as Record<string, unknown[]>).contract_links = [{
    token: "l", title: "Agreement", business: "X", status: "sent", body_hash: "x", expires_at: new Date(Date.now() + 864e5).toISOString(),
    body: "# Agreement\n\nSee [the site](https://example.com), [pricing](/pricing), [trap](javascript:alert(1)) and [other](//evil.test).",
  }];
  await page.goto("/contract/l");
  await expect(page.getByRole("link", { name: "the site" })).toHaveAttribute("href", "https://example.com");
  await expect(page.getByRole("link", { name: "pricing" })).toHaveAttribute("href", "/pricing");
  await expect(page.getByRole("link", { name: "trap" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "other" })).toHaveCount(0);
  await expect(page.getByText("[trap](javascript:alert(1))")).toBeVisible();
});
