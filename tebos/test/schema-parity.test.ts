import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PUBLIC_LIMITS, RULE_CODES, transitionTable } from "../src";
import { PLAN_TERMS } from "../src/domain/plans";
import { BOARD_LIMITS } from "../src/domain/editions";
import { FACTORY_OUTCOMES, VALIDATION_STATES } from "../src/domain/catalogue";
import {
  ASSET_KINDS, ASSET_SOURCES, ASSET_STATUSES, DELIVERY_BUSINESS_DAYS, PRIMARY_OBJECTIVES, READINESS_ITEMS, WAIVABLE, WEB_ROLES, WEBSITE_TYPES,
} from "../src/domain/web-delivery";

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

  it("web delivery's lists match the database's", () => {
    const body = sql.split("create table public.web_projects")[1]!.split(");")[0]!;
    const list = (col: string, src = body) =>
      [...src.split(`check (${col} in (`)[1]!.split(")")[0]!.matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]).sort();
    expect(list("website_type")).toEqual(Object.keys(WEBSITE_TYPES).sort());
    expect(list("primary_objective")).toEqual(Object.keys(PRIMARY_OBJECTIVES).sort());
    const readiness = sql.split("create table public.web_readiness_items")[1]!.split(");")[0]!;
    expect(list("item", readiness)).toEqual(Object.keys(READINESS_ITEMS).sort());
    expect(readiness).toContain("check (status <> 'waived' or item = 'assets')");
    expect([...WAIVABLE]).toEqual(["assets"]);
    const gaps = sql.split("function tebos_private.web_readiness_gaps")[1]!.split("end $$")[0]!;
    expect([...gaps.split("foreach v_item in array array[")[1]!.split("]")[0]!.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]))
      .toEqual(Object.keys(READINESS_ITEMS));
    expect(sql).toContain(`tebos_private.add_business_days(v_today, ${DELIVERY_BUSINESS_DAYS})`);
    const tasks = sql.split("create table public.web_tasks")[1]!.split(");")[0]!;
    expect(list("role", tasks)).toEqual(Object.keys(WEB_ROLES).sort());
    const assets = sql.split("create table public.web_assets")[1]!.split(");")[0]!;
    expect(list("kind", assets)).toEqual(Object.keys(ASSET_KINDS).sort());
    expect(list("source", assets)).toEqual(Object.keys(ASSET_SOURCES).sort());
    expect(list("status", assets)).toEqual(Object.keys(ASSET_STATUSES).sort());
  });

  it("the catalogue's validation states and factory outcomes match the database's", () => {
    const list = (re: RegExp) => [...re.exec(sql)![1]!.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(list(/check \(validation_state in \(([^)]*)\)\)/)).toEqual([...VALIDATION_STATES]);
    expect(list(/check \(outcome in \(([^)]*)\)\)/)).toEqual([...FACTORY_OUTCOMES]);
  });
});
