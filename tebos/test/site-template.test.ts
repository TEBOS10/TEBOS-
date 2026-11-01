import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkSite, contrast, onAccent, renderSite, type SiteConfig } from "../src/domain/site-template";

const sample = JSON.parse(readFileSync(join(__dirname, "..", "templates", "service-site", "sample.json"), "utf8")) as SiteConfig;
const approved: SiteConfig = { ...sample, approved: { copy: true, privacy: true } };

describe("the starter website", () => {
  it("builds a preview of the sample, stamped and kept out of search engines", () => {
    const site = renderSite(sample, "preview");
    expect(Object.keys(site.files).sort()).toEqual(["index.html", "privacy.html", "robots.txt", "site.js", "styles.css"]);
    expect(site.files["index.html"]).toContain("Preview for Sample Plumbing Co: not yet approved for release.");
    expect(site.files["index.html"]).toContain('<meta name="robots" content="noindex">');
    expect(site.files["robots.txt"]).toContain("Disallow: /");
  });
  it("refuses a release until the client approves the copy and the privacy notice", () => {
    expect(() => renderSite(sample, "release")).toThrow(/approved the copy/);
    const site = renderSite({ ...approved, seo: { ...approved.seo, url: "https://example.invalid" } }, "release");
    expect(site.files["index.html"]).not.toContain("Preview for");
    expect(site.files["sitemap.xml"]).toContain("https://example.invalid/privacy.html");
  });
  it("never invents: no testimonials without permission, no prices that weren't given", () => {
    const html = renderSite(approved, "release").files["index.html"]!;
    expect(html).not.toContain('id="clients"');
    expect(html).not.toContain('class="price"');
    expect(checkSite({ ...approved, testimonials: [{ quote: "Great work.", who: "A customer", permission: false }] }).some((p) => p.field === "testimonials[0]")).toBe(true);
    const withQuote = renderSite({ ...approved, testimonials: [{ quote: "Came within the hour.", who: "Thandi, Randburg", permission: true }] }, "release").files["index.html"]!;
    expect(withQuote).toContain("Came within the hour.");
  });
  it("escapes everything the client typed", () => {
    const html = renderSite({ ...approved, hero: { ...approved.hero, headline: `<script>alert("x")</script> Fixed` } }, "release").files["index.html"]!;
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });
  it("needs what it promises: a form address for a form, a phone for a call, a privacy notice when it collects details", () => {
    const fields = (c: SiteConfig) => checkSite(c).map((p) => p.field);
    expect(fields({ ...approved, form: undefined })).toContain("firstAction.kind");
    expect(fields({ ...approved, firstAction: { label: "Call us now", kind: "call" }, business: { ...approved.business, phone: undefined } })).toContain("firstAction.kind");
    expect(fields({ ...approved, privacy: undefined })).toContain("privacy");
    expect(fields({ ...approved, form: { endpoint: "http://insecure.example", consentText: approved.form!.consentText } })).toContain("form.endpoint");
    expect(fields({ ...approved, hero: { ...approved.hero, image: { src: "https://elsewhere.example/a.jpg", alt: "A van" } } })).toContain("images");
    expect(fields(approved)).toEqual([]);
  });
  it("keeps the accent readable and visible", () => {
    expect(onAccent("#c2410c").ratio).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(checkSite({ ...approved, brand: { ...approved.brand, accent: "#d6d3cc", canvas: "light" } }).some((p) => p.field === "brand.accent")).toBe(true);
    expect(checkSite({ ...approved, brand: { ...approved.brand, accent: "#111111", canvas: "dark" } }).some((p) => p.field === "brand.accent")).toBe(true);
  });
  it("only states facts it was given in the search data", () => {
    const html = renderSite(approved, "release").files["index.html"]!;
    const ld = JSON.parse(html.split('<script type="application/ld+json">')[1]!.split("</script>")[0]!);
    expect(ld).toEqual({ "@context": "https://schema.org", "@type": "LocalBusiness", name: "Sample Plumbing Co", areaServed: "Example area, Gauteng",
      description: approved.seo.description, telephone: "010 000 0000" });
  });
  it("only says sent when the receiving address answers with success", () => {
    const js = renderSite(approved, "release").files["site.js"]!;
    expect(js).toContain("if(!r.ok)throw");
    expect(js).toContain('st.dataset.state="sent"');
    expect(js.indexOf('st.dataset.state="sent"')).toBeGreaterThan(js.indexOf("if(!r.ok)throw"));
  });
});

describe("a draft from the client's brief", () => {
  it("uses only what the brief says, and lists what the client still has to supply", async () => {
    const { draftSiteFromBrief } = await import("../src/domain/site-template");
    const draft = draftSiteFromBrief({ business_name: "Northwind Plumbing", first_action: "Request a call-out", visual_direction: "minimal", launch_features: ["contact_form"] }, "Randburg");
    expect(draft).toMatchObject({ business: { name: "Northwind Plumbing", area: "Randburg" }, brand: { canvas: "light" }, firstAction: { label: "Request a call-out", kind: "form" }, approved: { copy: false, privacy: false } });
    const missing = checkSite(draft).map((p) => p.field);
    expect(missing).toEqual(expect.arrayContaining(["hero.headline", "hero.promise", "services", "seo.description", "firstAction.kind", "approved.copy"]));
    expect(() => renderSite(draft, "preview")).toThrow(/headline/);
  });
});
