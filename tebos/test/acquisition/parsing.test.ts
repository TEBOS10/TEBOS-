import { describe, expect, it } from "vitest";
import { extractHtml } from "../../src/acquisition/extract";
import { normaliseUrl, planTargets } from "../../src/acquisition/plan";
import { isAllowed, parseRobots } from "../../src/acquisition/robots";

describe("robots.txt", () => {
  const rules = parseRobots(`
    User-agent: Googlebot
    Disallow: /

    User-agent: *
    Disallow: /private
    Disallow: /*.pdf$
    Allow: /private/press
  `);

  it("applies the generic group, longest match wins, allow wins ties", () => {
    expect(isAllowed(rules, "https://a.co/")).toBe(true);
    expect(isAllowed(rules, "https://a.co/private/team")).toBe(false);
    expect(isAllowed(rules, "https://a.co/private/press/2026")).toBe(true);
    expect(isAllowed(rules, "https://a.co/brochure.pdf")).toBe(false);
    expect(isAllowed(rules, "https://a.co/brochure.pdf?x=1")).toBe(true);
  });

  it("prefers a TEBOS-specific group", () => {
    const r = parseRobots("User-agent: *\nDisallow: /\n\nUser-agent: tebos\nAllow: /");
    expect(isAllowed(r, "https://a.co/anything")).toBe(true);
  });
});

describe("target planning", () => {
  it("normalises for de-duplication", () => {
    expect(normaliseUrl("HTTPS://Example.com/About/#team")).toBe("https://example.com/About");
    expect(normaliseUrl("mailto:x@y.z")).toBeNull();
  });

  it("keeps same-site pages, prefers high-value ones, skips assets and low-value pages", () => {
    const planned = planTargets(
      "https://www.acme.co.za/",
      ["/blog/post-1", "/contact-us", "https://acme.co.za/about", "/logo.png", "https://other.com/contact", "/login", "/services", "/contact-us#form"],
      3,
      new Set(["https://www.acme.co.za/"]),
    );
    expect(planned).toEqual(["https://www.acme.co.za/contact-us", "https://acme.co.za/about", "https://www.acme.co.za/services"]);
  });
});

describe("HTML extraction", () => {
  const html = `<!doctype html><html><head>
    <title>Mmupi &amp; Clay | Pottery</title>
    <meta name="description" content="Handmade ceramics in Pretoria">
    <script>var title = "<title>fake</title>"; window.contact = "mailto:fake@x.com";</script>
    </head><body>
    <h1>Handmade <em>ceramics</em></h1>
    <p>Order through WhatsApp or email us.</p>
    <a href="https://wa.me/27820000000">Chat on WhatsApp</a>
    <a href="mailto:hello@mmupi.co.za?subject=Hi">Email</a>
    <a href="tel:+27 82 000 0000">Call</a>
    <a href="https://www.instagram.com/mmupi">Instagram</a>
    <a href="/shop">Shop</a>
    <!-- <a href="mailto:hidden@x.com">hidden</a> -->
    </body></html>`;
  const x = extractHtml(html, "https://mmupiandclay.co.za/");
  const facts = x.facts.map((f) => f.fact);

  it("records what is visibly on the page, with excerpts and locations", () => {
    expect(facts).toContain("Page title: Mmupi & Clay | Pottery");
    expect(facts).toContain("Meta description: Handmade ceramics in Pretoria");
    expect(facts).toContain("H1 heading: Handmade ceramics");
    expect(facts).toContain("Email address published: hello@mmupi.co.za");
    expect(facts).toContain("Phone number published: +27820000000");
    expect(facts).toContain("Page links to WhatsApp");
    expect(facts).toContain("Page links to instagram");
    expect(x.facts.every((f) => f.excerpt.length > 0 && f.contentLocation.length > 0)).toBe(true);
    expect(x.links).toContain("https://mmupiandclay.co.za/shop");
  });

  it("ignores scripts and comments", () => {
    expect(facts.join(" ")).not.toContain("fake");
    expect(facts.join(" ")).not.toContain("hidden@x.com");
  });

  it("never records absence as a fact", () => {
    // this page has no form: nothing should claim otherwise, in either direction
    expect(x.facts.some((f) => f.kind === "form")).toBe(false);
    expect(facts.some((f) => /\bno\b|missing|lacks|does not/i.test(f))).toBe(false);
  });

  it("records forms with their fields", () => {
    const f = extractHtml('<body><form action="/send"><input name="email"><textarea name="message"></textarea></form></body>', "https://a.co/");
    const form = f.facts.find((x) => x.kind === "form");
    expect(form?.fact).toBe("Page contains 1 form");
    expect(form?.structuredValue).toEqual({ forms: [{ action: "/send", fields: ["email", "message"] }] });
  });
});
