import { describe, expect, it } from "vitest";
import { CATEGORIES, deposit } from "./grapeRates";

describe("Grape Studios' rate cards", () => {
  it("has the six categories, each with a cover, and Events quoted only", () => {
    expect(CATEGORIES.map((c) => c.name)).toEqual(["Studio shoots", "On location", "Corporate", "Graduation", "Property listing", "Events"]);
    for (const c of CATEGORIES) expect(c.cover).toMatch(/^\/work\/grape\/[a-z-]+\.jpg$/);
    expect(CATEGORIES.find((c) => c.key === "events")!.packages).toEqual([]);
  });

  it("carries the prices from the cards", () => {
    const price = (k: string, label: string) => CATEGORIES.find((c) => c.key === k)!.packages.find((p) => p.label === label)!.cents / 100;
    expect(price("studio", "1 hour")).toBe(2600);
    expect(price("studio", "Full day")).toBe(12300);
    expect(price("corporate", "Full day")).toBe(9650);
    expect(price("graduation", "1 hour")).toBe(1500);
    expect(price("property", "Per unit")).toBe(800);
  });

  it("asks half as a deposit and the rest on the day", () => {
    expect(deposit(260_000)).toEqual({ deposit: 130_000, balance: 130_000 });
    expect(deposit(965_001)).toEqual({ deposit: 482_501, balance: 482_500 });
  });

  it("keeps banking details off the website", () => {
    expect(JSON.stringify(CATEGORIES)).not.toMatch(/\d{9,}|FNB|account/i);
  });
});
