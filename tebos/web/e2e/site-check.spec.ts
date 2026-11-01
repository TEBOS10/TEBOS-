import { expect, test, type Page } from "@playwright/test";
import { installFakeSupabase } from "./fake-supabase";

// The site check (docs/design-workflow.md, phase 3): every public page is opened in a real browser and checked for
// the faults a person finds by clicking around. A page passes only when all five hold:
//   1. no console errors and no uncaught exceptions;
//   2. every in-page link (#id) points at an element that exists;
//   3. at phone width (390px) nothing scrolls sideways;
//   4. every image says what it is (alt text, or alt="" when it is decoration);
//   5. keyboard focus is visible on the first links and buttons a keyboard user reaches.

const PAGES: Array<{ name: string; url: string }> = [
  { name: "TEBOS home", url: "http://localhost:5174/" },
  { name: "TEBOS pricing", url: "http://localhost:5174/pricing" },
  { name: "TEBOS work", url: "http://localhost:5174/work" },
  { name: "Grape concept", url: "http://localhost:5174/work/grape-studios" },
  { name: "TEBOS waiting list", url: "http://localhost:5174/waitlist" },
  { name: "TEBOS terms", url: "http://localhost:5174/terms" },
  { name: "TEBOS privacy", url: "http://localhost:5174/privacy" },
  { name: "Grape Studios site", url: "http://localhost:5177/" },
  { name: "Grape listing reels", url: "http://localhost:5177/reels" },
];

async function open(page: Page, url: string, width: number) {
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
  await installFakeSupabase(page, { signedIn: false });
  await page.goto(url);
  await page.locator("h1").first().waitFor();
  await page.waitForLoadState("networkidle");
  return errors;
}

for (const p of PAGES) {
  test.describe(`site check: ${p.name}`, () => {
    test("no console errors, working in-page links, described images", async ({ page }) => {
      const errors = await open(page, p.url, 1440);
      const missing = await page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]'))
          .map((a) => a.getAttribute("href")!.slice(1))
          .filter((id) => id && !document.getElementById(decodeURIComponent(id))));
      expect(missing, "in-page links without a target").toEqual([]);
      const undescribed = await page.evaluate(() =>
        Array.from(document.querySelectorAll("img")).filter((i) => !i.hasAttribute("alt")).map((i) => i.getAttribute("src")));
      expect(undescribed, "images without alt").toEqual([]);
      expect(errors, "console errors").toEqual([]);
    });

    test("nothing scrolls sideways at 390px", async ({ page }) => {
      await open(page, p.url, 390);
      const wide = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const over = document.documentElement.scrollWidth - vw;
        // name the elements that stick out, so a failure says where to look
        const culprits = over > 1
          ? Array.from(document.querySelectorAll<HTMLElement>("body *"))
              .filter((el) => el.getBoundingClientRect().right > vw + 1 && getComputedStyle(el).position !== "fixed")
              .slice(0, 5).map((el) => `${el.tagName.toLowerCase()}.${Array.from(el.classList).join(".")}`)
          : [];
        return { over, culprits };
      });
      expect(wide, "page wider than the phone").toEqual({ over: expect.any(Number), culprits: [] });
      expect(wide.over).toBeLessThanOrEqual(1);
    });

    test("keyboard focus is visible", async ({ page }) => {
      await open(page, p.url, 1440);
      const invisible: string[] = [];
      for (let i = 0; i < 6; i++) {
        await page.keyboard.press("Tab");
        const r = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el || el === document.body) return null;
          const s = getComputedStyle(el);
          const ring = (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== "none";
          return { ring, what: `${el.tagName.toLowerCase()} "${(el.textContent ?? "").trim().slice(0, 30)}"` };
        });
        if (r && !r.ring) invisible.push(r.what);
      }
      expect(invisible, "focused without a visible ring").toEqual([]);
    });
  });
}
