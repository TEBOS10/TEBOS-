import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fillPlaybook, PLAYBOOK_FIELDS } from "./playbook";

const migrations = join(__dirname, "../../../supabase/migrations");
// every playbook text any migration writes (the seed, and later updates)
const seed = () =>
  readdirSync(migrations)
    .map((f) => readFileSync(join(migrations, f), "utf8"))
    .flatMap((sql) => [...sql.matchAll(/\$pb\$([\s\S]*?)\$pb\$/g)].map((m) => m[1]!))
    .join("\n");

describe("sales playbook", () => {
  it("fills prices and deliverables from the plan terms", () => {
    expect(fillPlaybook("{{starter_name}}: {{starter_fee}}")).toBe("Small: R500 a month, excluding VAT");
    expect(fillPlaybook("{{company_name}}: {{company_fee}}")).toBe("Company: R7,500 a month, excluding VAT");
    expect(fillPlaybook("{{growth_deliverables}}")).toContain("- Everything in Small");
    expect(fillPlaybook("{{min_term}}; {{annual}}")).toBe("6 months; 10 months' fee for 12, paid up front");
    expect(fillPlaybook("{{equity_share}}")).toBe("5%");
  });

  it("leaves an unknown placeholder visible", () => {
    expect(fillPlaybook("{{starter_price}}")).toBe("{{starter_price}}");
  });

  it("uses only placeholders it can fill, and never types a price in", () => {
    const text = seed();
    const used = [...text.matchAll(/\{\{([a-z_]+)\}\}/g)].map((m) => m[1]!);
    expect(used.length).toBeGreaterThan(5);
    for (const key of used) expect(PLAYBOOK_FIELDS).toHaveProperty(key);
    expect(text).not.toMatch(/R\d/);
  });
});

describe("contract draft", () => {
  it("has a six-month minimum, a yearly option, and the same agreement for every tier", async () => {
    const { DRAFT_AGREEMENT, DRAFT_COMPANY_AGREEMENT, draftFor } = await import("./contract-drafts");
    expect(DRAFT_COMPANY_AGREEMENT).toBe(DRAFT_AGREEMENT);
    expect(draftFor("company")).toBe(draftFor("starter"));
    expect(DRAFT_AGREEMENT).toContain("at least six months from the date you accept it (twelve on an annual plan)");
    expect(DRAFT_AGREEMENT).toContain("or yearly in advance on an annual plan");
    expect(DRAFT_AGREEMENT).not.toContain("Company Diagnostic");
  });
});

describe("sitemap", () => {
  it("lists every blog article", async () => {
    const { POSTS } = await import("./blog");
    // the sitemap is generated at build time from the list of public pages
    const xml = (await import("./pages")).sitemapXml();
    for (const p of POSTS) expect(xml).toContain(`/blog/${p.slug}</loc>`);
  });
});
