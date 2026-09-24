import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RULE_CODES, transitionTable } from "../src";

const migrationsDir = join(__dirname, "..", "supabase", "migrations");
const sql = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(migrationsDir, f), "utf8"))
  .join("\n")
  .replace(/--[^\n]*/g, "");

describe("domain mirrors the database", () => {
  it("state machines match public.state_transitions exactly", () => {
    const block = sql
      .split("insert into public.state_transitions")
      .slice(1)
      .map((part) => part.split(";")[0]!)
      .join("\n");
    const fromSql = [...block.matchAll(/\('([a-z_]+)', '([a-z_()]+)', '([a-z_]+)'\)/g)]
      .map((m) => `${m[1]}:${m[2]}->${m[3]}`)
      .sort();
    const fromTs = transitionTable()
      .map(([m, f, t]) => `${m}:${f}->${t}`)
      .sort();
    expect(fromSql.length).toBeGreaterThan(50);
    expect(fromTs).toEqual(fromSql);
  });

  it("every rule the database raises has a domain code", () => {
    const hints = new Set([...sql.matchAll(/hint = '(TEBOS_[A-Z_]+)'/g)].map((m) => m[1]!));
    expect(hints.size).toBeGreaterThan(10);
    for (const h of hints) expect(RULE_CODES).toContain(h);
  });

  it("no table stores raw secrets", () => {
    expect(sql).not.toMatch(/\b(api_key|secret|password|access_token|refresh_token)\s+text/i);
  });
});
