import { describe, expect, it } from "vitest";
import { ACTOR_LABEL, CATEGORIES, STATUS_LABEL } from "./showcase";

// The public pages a card may point to.
const PUBLIC = ["/", "/demo", "/systems", "/self-check", "/pricing", "/blog", "/tour", "/film", "/waitlist"];

const plays = CATEGORIES.flatMap((c) => c.plays.map((p) => [`${c.key}/${p.key}`, p] as const));

describe("what TEBOS does", () => {
  it.each(plays)("%s plays a whole story", (_, p) => {
    expect(p.before.length).toBeGreaterThan(0);
    expect(p.after.length).toBeGreaterThan(0);
    expect(p.steps.length).toBeGreaterThanOrEqual(3);
    expect(STATUS_LABEL[p.status]).toBeDefined();
    for (const s of p.steps) expect(ACTOR_LABEL[s.by], s.text).toBeDefined();
    if (p.see) expect(PUBLIC).toContain(p.see.href);
  });

  it("has unique keys and no empty rows", () => {
    expect(new Set(CATEGORIES.map((c) => c.key)).size).toBe(CATEGORIES.length);
    for (const c of CATEGORIES) {
      expect(c.plays.length, c.key).toBeGreaterThan(0);
      expect(new Set(c.plays.map((p) => p.key)).size, c.key).toBe(c.plays.length);
    }
  });

  it("claims no results and names no supplier", () => {
    const text = JSON.stringify(CATEGORIES).toLowerCase();
    // illustrations: no invented figures of what a client achieved
    expect(text).not.toMatch(/\d+\s?%|\bcase stud|testimonial/);
    expect(text).not.toMatch(/claude|anthropic|elevenlabs|openai/);
  });
});
