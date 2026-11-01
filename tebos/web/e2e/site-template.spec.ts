import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { renderSite, type SiteConfig } from "../../src/domain/site-template";

// The TEBOS starter website, built from the sample config and served as plain files: it must fit a phone and a desktop,
// keep the call to action in reach, work by keyboard, still read with motion turned off, and say "sent" only when the
// receiving address answers with success. Unit rules are in core (test/site-template.test.ts).
const sample = JSON.parse(readFileSync(new URL("../../templates/service-site/sample.json", import.meta.url), "utf8")) as SiteConfig;
const config: SiteConfig = { ...sample, form: { ...sample.form!, endpoint: "https://site.test/enquiries" } };
const TYPES: Record<string, string> = { html: "text/html", css: "text/css", js: "text/javascript", txt: "text/plain", xml: "application/xml" };

async function serve(page: Page, answer: { status: number } | "hang" = { status: 200 }) {
  const site = renderSite(config, "preview");
  const posts: unknown[] = [];
  await page.route("https://site.test/**", async (route) => {
    const path = new URL(route.request().url()).pathname.slice(1) || "index.html";
    if (path === "enquiries") {
      posts.push(route.request().postDataJSON());
      if (answer === "hang") return;
      return route.fulfill({ status: answer.status, body: "{}" });
    }
    const body = site.files[path];
    return body === undefined ? route.fulfill({ status: 404, body: "" }) : route.fulfill({ status: 200, contentType: TYPES[path.split(".").pop()!], body });
  });
  return posts;
}

async function fill(page: Page) {
  const form = page.getByRole("form", { name: "Send Sample Plumbing Co a message" });
  await form.getByLabel("Your name").fill("Visitor");
  await form.getByLabel("Phone or email").fill("visitor@example.invalid");
  await form.getByLabel("How can we help?").fill("The geyser is leaking.");
  await form.getByRole("checkbox").check();
  return form;
}

test("fits a phone: no sideways scroll, the menu opens, the call to action stays in reach", async ({ page }) => {
  await serve(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("https://site.test/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("The leak, found and fixed today.");
  await expect(page.getByText("Preview for Sample Plumbing Co: not yet approved for release.")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  // the bar joins once the hero's own button has scrolled away
  await expect(page.locator(".reach")).toHaveClass(/is-hidden/);
  await page.mouse.wheel(0, 2400);
  await expect(page.locator(".reach")).not.toHaveClass(/is-hidden/);
  await expect(page.locator(".reach .btn")).toBeInViewport();
  const toggle = page.getByRole("button", { name: "Menu" });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Services" }).click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
});

test("the form says sent only on success, and keeps the message when it fails", async ({ page }) => {
  const posts = await serve(page, { status: 500 });
  await page.goto("https://site.test/#contact");
  let form = await fill(page);
  await form.getByRole("button", { name: "Send" }).click();
  await expect(form.getByRole("status")).toContainText("Not sent. Your message is still here");
  await expect(form.getByLabel("How can we help?")).toHaveValue("The geyser is leaking.");
  expect(posts).toHaveLength(1);
  expect(posts[0]).toMatchObject({ name: "Visitor", consent: true });

  await page.unroute("https://site.test/**");
  await serve(page, { status: 200 });
  await page.goto("https://site.test/#contact");
  form = await fill(page);
  await form.getByRole("button", { name: "Send" }).click();
  await expect(form.getByRole("status")).toHaveText("Sent. Sample Plumbing Co has your message and will reply.");
});

test("the form refuses to send without consent, and won't send twice while sending", async ({ page }) => {
  const posts = await serve(page, "hang");
  await page.goto("https://site.test/#contact");
  const form = await fill(page);
  await form.getByRole("checkbox").uncheck();
  await form.getByRole("button", { name: "Send" }).click();
  expect(posts).toHaveLength(0);
  await form.getByRole("checkbox").check();
  await form.getByRole("button", { name: "Send" }).click();
  await expect(form.getByRole("status")).toHaveText("Sending…");
  await expect(form.getByRole("button", { name: "Send" })).toBeDisabled();
  expect(posts).toHaveLength(1);
});

test("reads with motion turned off, works by keyboard, and has its privacy notice", async ({ page }) => {
  await serve(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("https://site.test/");
  for (const step of await page.locator(".step").all()) await expect(step).toHaveCSS("opacity", "1");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.goto("https://site.test/privacy.html");
  await expect(page.getByRole("heading", { name: "Privacy notice" })).toBeVisible();
  await expect(page.getByText("Twelve months after your last request.")).toBeVisible();
});

test("screenshots (on request only)", async ({ page }) => {
  test.skip(!process.env.SHOTS, "screenshots only on request");
  await serve(page);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto("https://site.test/");
  await page.screenshot({ path: `${process.env.SHOTS}/site-desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("https://site.test/");
  await page.screenshot({ path: `${process.env.SHOTS}/site-phone.png`, fullPage: true });
});
