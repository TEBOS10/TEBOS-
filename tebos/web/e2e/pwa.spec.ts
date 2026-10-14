import { chromium, expect, test } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installFakeSupabase } from "./fake-supabase";

// The installable app: Chrome itself must find nothing stopping installation,
// and with no connection a page shows an honest offline notice. No data is
// stored on the device: the service worker only steps in when a page can't load.

test("Chrome finds the app installable: manifest, icons and service worker in place", async ({ request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ name: "TEBOS", short_name: "TEBOS", start_url: "/reeds", display: "standalone", scope: "/" });
  const sizes = manifest.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes}:${i.purpose}`);
  expect(sizes).toEqual(expect.arrayContaining(["192x192:any", "512x512:any", "512x512:maskable"]));
  for (const icon of manifest.icons) {
    const res = await request.get(icon.src);
    expect(res.status(), icon.src).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/png");
  }

  // Chrome's own verdict, in a normal profile: browsers never install apps from private windows,
  // and every Playwright test context is one, so this check gets its own persistent profile
  const profile = mkdtempSync(join(tmpdir(), "tebos-pwa-"));
  const ctx = await chromium.launchPersistentContext(profile, {
    baseURL: test.info().project.use.baseURL, viewport: { width: 390, height: 844 },
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
  });
  try {
    const p = ctx.pages()[0] ?? (await ctx.newPage());
    await installFakeSupabase(p);
    await p.goto("/reeds");
    await expect(p.getByRole("heading", { name: "Ask TEBOS" })).toBeVisible();
    // the service worker is running this page
    await p.evaluate(() => navigator.serviceWorker.ready);
    await expect.poll(() => p.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 10_000 }).toBe(true);
    const cdp = await ctx.newCDPSession(p);
    const { installabilityErrors } = await cdp.send("Page.getInstallabilityErrors");
    expect(installabilityErrors).toEqual([]);
  } finally {
    await ctx.close();
    rmSync(profile, { recursive: true, force: true });
  }
});

test("with no connection, a page shows the offline notice instead of an error, and keeps no data", async ({ page, context }) => {
  await installFakeSupabase(page);
  await page.goto("/reeds");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 10_000 }).toBe(true);

  await context.setOffline(true);
  await page.goto("/approvals").catch(() => {});
  await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible();
  await expect(page.getByText("Nothing is kept on this phone")).toBeVisible();
  // the only thing stored is the icon: no pages, no data
  const cached = await page.evaluate(async () => {
    const keys = await caches.keys();
    const urls: string[] = [];
    for (const k of keys) for (const r of await (await caches.open(k)).keys()) urls.push(new URL(r.url).pathname);
    return urls;
  });
  expect(cached).toEqual(["/brand/icon-192.png"]);

  await context.setOffline(false);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "You're offline" })).toHaveCount(0);
});
