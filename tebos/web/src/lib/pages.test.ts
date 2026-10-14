import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { POSTS } from "./blog";
import { PUBLIC_PAGES, pageFile, pageHtml, sitemapXml, SITE_URL } from "./pages";

const read = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
// Routes in App that are public but must not be indexed or previewed as pages of their own.
const NOT_LISTED = ["/self-check/result", "/paid", "/reset-password", "/meet", "/sign-in"];

describe("public pages", () => {
  it("lists every public route in the app, and every article", () => {
    const routes = [...read("../App.tsx").matchAll(/path === "(\/[^"]*)"/g)].map((m) => m[1]!);
    const listed = PUBLIC_PAGES.map((p) => p.path);
    for (const r of routes) if (!NOT_LISTED.includes(r)) expect(listed, r).toContain(r);
    for (const p of POSTS) expect(listed).toContain(`/blog/${p.slug}`);
    expect(new Set(listed).size).toBe(listed.length);
  });

  it("gives each page a short title and a real description, claiming nothing", () => {
    for (const p of PUBLIC_PAGES) {
      expect(p.title.length, p.path).toBeLessThanOrEqual(90);
      expect(p.description.length, p.path).toBeGreaterThanOrEqual(50);
      expect(p.description.length, p.path).toBeLessThanOrEqual(200);
      const text = `${p.title} ${p.description}`.toLowerCase();
      expect(text, p.path).not.toMatch(/claude|anthropic|elevenlabs|openai|\br\s?\d|\d+\s?%|case stud|testimonial/);
    }
  });

  it("writes each page's own title, description and address into index.html", () => {
    const template = read("../../index.html");
    const page = { path: "/showcase", title: "A & B", description: `Say "hello" <now> to everyone reading this page today.` };
    const html = pageHtml(template, page);
    expect(html).toContain("<title>A &amp; B</title>");
    expect(html).toContain(`<meta name="description" content="Say &quot;hello&quot; &lt;now&gt; to everyone reading this page today." />`);
    expect(html).toContain(`<meta property="og:title" content="A &amp; B" />`);
    expect(html).toContain(`<link rel="canonical" href="${SITE_URL}/showcase" />`);
    expect(html.match(/<title>/g)).toHaveLength(1);
    expect(() => pageHtml("<html><head></head></html>", page)).toThrow(/missing/);
    expect(pageFile("/")).toBe("index.html");
    expect(pageFile("/blog/a-post")).toBe("blog/a-post.html");
  });

  it("builds the sitemap from the same list, without private links", () => {
    const xml = sitemapXml();
    for (const p of PUBLIC_PAGES) expect(xml).toContain(`<loc>${SITE_URL}${p.path}</loc>`);
    expect(xml).not.toMatch(/contract|invite|reset-password|\/paid/);
  });
});
