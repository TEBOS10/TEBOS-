import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PUBLIC_LIMITS, RULE_CODES, transitionTable } from "../src";
import { PLAN_TERMS } from "../src/domain/plans";

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

  it("public submission limits match the database's throttle", () => {
    const fromSql = Object.fromEntries(
      [...sql.matchAll(/tebos_private\.throttle\('([a-z_]+)', (\d+), (\d+)\)/g)].map((m) => [m[1], { perSource: Number(m[2]), total: Number(m[3]) }]),
    );
    expect(fromSql).toEqual(PUBLIC_LIMITS);
  });

  it("each plan's monthly change requests match the database's allowance", () => {
    const body = sql.split("function tebos_private.plan_change_allowance")[1]!.split("$$")[1]!;
    const fromSql = Object.fromEntries([...body.matchAll(/when '([a-z]+)' then (\d+)/g)].map((m) => [m[1], Number(m[2])]));
    const fromTs = Object.fromEntries(
      Object.values(PLAN_TERMS).filter((p) => p.changeRequestsPerMonth > 0).map((p) => [p.key, p.changeRequestsPerMonth]),
    );
    expect(fromSql).toEqual(fromTs);
  });
});
