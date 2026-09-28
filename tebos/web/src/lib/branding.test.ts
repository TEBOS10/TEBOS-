import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The interface never names the AI model or its vendor: what TEBOS shows is
// TEBOS. (The model that served each run is still recorded in the database.)
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?|css|html)$/.test(f) && !f.endsWith(".test.ts") && f !== "database.types.ts" ? [p] : [];
  });

describe("branding", () => {
  it("no page, component or demo record names the AI model or voice vendor", () => {
    const hits = [...files("src"), "index.html"].filter((f) => /claude|anthropic|elevenlabs/i.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });
});
