import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EMPTY_FACTS, PROPERTY_KINDS, advertCopy, caption, checkFacts, features, openingLine, priceText, shotList, type ListingFacts,
} from "../src/domain/studio";

// The founder's own example (19 Oct): a commercial property in Westdene, Bloemfontein.
const westdene: ListingFacts = { ...EMPTY_FACTS, kind: "commercial", suburb: "Westdene", city: "Bloemfontein", bathrooms: 1, kitchens: 1, offices: 4 };
const card = { name: "", title: "Real Estate Professional | Property Value Creation", phone: "", email: "", agencyLine: "" };

describe("the studio: facts", () => {
  it("accepts what the founder states and refuses the rest", () => {
    expect(checkFacts(westdene).ok).toBe(true);
    expect(checkFacts({ ...westdene, offices: 100 }).ok).toBe(false);
    expect(checkFacts({ ...westdene, bathrooms: 1.5 }).ok).toBe(false);
    expect(checkFacts({ ...westdene, floorM2: -1 }).ok).toBe(false);
    expect(checkFacts({ ...westdene, highlights: Array(7).fill("Pool") }).ok).toBe(false);
    expect(checkFacts({ ...westdene, highlights: ["x".repeat(61)] }).ok).toBe(false);
    expect(checkFacts({ ...westdene, highlights: ["Call 082 555 1234"] }).ok).toBe(false);
    expect(checkFacts({ ...westdene, suburb: "password: hunter2" }).ok).toBe(false);
  });
});

describe("the studio: the advert says only what was stated", () => {
  it("prices a sale and a rental, and never invents one", () => {
    expect(priceText(850000, "sale")).toBe("R850 000");
    expect(priceText(8500, "rental")).toBe("R8 500 per month");
    expect(priceText(null, "sale")).toBeNull();
    expect(advertCopy("sale", null, westdene, "available").price).toBe("Price on request");
  });

  it("lists only the features filled in", () => {
    expect(features(westdene)).toEqual([
      { value: "1", label: "Bathroom" }, { value: "4", label: "Offices" }, { value: "1", label: "Kitchen" },
    ]);
    expect(features(EMPTY_FACTS)).toEqual([]);
    expect(features({ ...EMPTY_FACTS, bedrooms: 0, floorM2: 1250 })).toEqual([{ value: "1 250 m²", label: "Floor area" }]);
  });

  it("the founder's Westdene example", () => {
    const c = advertCopy("sale", 850000, westdene, "available");
    expect(c).toMatchObject({ ribbon: "FOR SALE", headline: "Commercial property for sale", place: "Westdene, Bloemfontein", price: "R850 000" });
    expect(advertCopy("sale", 850000, westdene, "closed")).toMatchObject({ ribbon: "JUST SOLD", price: "Sold" });
    expect(advertCopy("rental", 8500, westdene, "available").ribbon).toBe("TO LET");
  });
});

describe("the studio: the walkthrough and the caption", () => {
  it("films only the rooms the facts list, arriving first and closing at the door", () => {
    const s = shotList(westdene).map((x) => x.title);
    expect(s[0]).toBe("Arrival");
    expect(s.at(-1)).toBe("Close");
    expect(s).toContain("Office 4");
    expect(s).not.toContain("Bedroom");
    expect(s).not.toContain("Living areas");
  });

  it("the opening line and caption carry no invented figure", () => {
    expect(openingLine("sale", 850000, westdene)).toBe("This commercial property in Westdene, Bloemfontein at R850 000: let me show you what it is, and what it could become.");
    const text = caption("sale", 850000, westdene, "available", card);
    expect(text.split("\n")[0]).toBe("For sale: commercial property in Westdene, Bloemfontein.");
    expect(text).toContain("R850 000");
    expect(text).toContain("#Westdene #Bloemfontein #PelserRealEstate #ForSale");
    expect(text.match(/R\d/g)).toHaveLength(1);
    expect(text).not.toMatch(/%|yield|per cent/i);
  });
});

describe("the studio: the domain mirrors the database", () => {
  const sql = readFileSync(join(__dirname, "..", "supabase", "migrations", "20261019140000_agent_listing_studio.sql"), "utf8");
  it("the kinds of property and the limits match", () => {
    const start = sql.indexOf("property_kind in (");
    const kinds = [...sql.slice(start, sql.indexOf("))", start)).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(kinds).toEqual(Object.keys(PROPERTY_KINDS));
    expect(sql).toContain("cardinality(highlights) <= 6");
    expect(sql).toContain("between 1 and 60");
  });
});
