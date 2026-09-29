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
    expect(fillPlaybook("{{starter_name}}: {{starter_fee}}")).toBe("Diagnostic: R2,500 a month, excluding VAT");
    expect(fillPlaybook("{{growth_deliverables}}")).toContain("- Everything in the Diagnostic");
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

describe("company contract draft", () => {
  it("replaces only the fee clause, with one for a one-off Company Diagnostic", async () => {
    const { DRAFT_AGREEMENT, DRAFT_COMPANY_AGREEMENT } = await import("./contract-drafts");
    expect(DRAFT_COMPANY_AGREEMENT).not.toBe(DRAFT_AGREEMENT);
    expect(DRAFT_COMPANY_AGREEMENT).toContain("The Company Diagnostic has been paid before this agreement was sent.");
    expect(DRAFT_COMPANY_AGREEMENT).not.toContain("The first month has been paid");
    expect(DRAFT_COMPANY_AGREEMENT).toContain("## 3. Term and ending the agreement");
  });
});

describe("sitemap", () => {
  it("lists every blog article", async () => {
    const { POSTS } = await import("./blog");
    const xml = readFileSync(join(__dirname, "../../public/sitemap.xml"), "utf8");
    for (const p of POSTS) expect(xml).toContain(`/blog/${p.slug}</loc>`);
  });
});
