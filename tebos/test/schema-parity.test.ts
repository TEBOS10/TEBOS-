import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PUBLIC_LIMITS, RULE_CODES, transitionTable } from "../src";
import { PLAN_TERMS } from "../src/domain/plans";
import { BOARD_LIMITS } from "../src/domain/editions";
import { FACTORY_OUTCOMES, VALIDATION_STATES } from "../src/domain/catalogue";

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

  it("each plan's board ceiling matches the database's", () => {
    const body = sql.split("function tebos_private.plan_board_limit")[1]!.split("$$")[1]!;
    const [flows, pieces] = body.split("else case p_plan");
    const read = (part: string) => ({
      growth: Number(/'growth' then (\d+)/.exec(part)![1]), company: Number(/'company' then (\d+)/.exec(part)![1]), other: Number(/else (\d+)/.exec(part)![1]),
    });
    const f = read(flows!), p = read("else" + pieces!);
    expect({ starter: { flows: f.other, pieces: p.other }, growth: { flows: f.growth, pieces: p.growth }, company: { flows: f.company, pieces: p.company } })
      .toEqual(BOARD_LIMITS);
  });

  it("the catalogue's validation states and factory outcomes match the database's", () => {
    const list = (re: RegExp) => [...re.exec(sql)![1]!.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(list(/check \(validation_state in \(([^)]*)\)\)/)).toEqual([...VALIDATION_STATES]);
    expect(list(/check \(outcome in \(([^)]*)\)\)/)).toEqual([...FACTORY_OUTCOMES]);
  });
});
