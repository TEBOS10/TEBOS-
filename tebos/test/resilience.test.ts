import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALWAYS_SPECULATIVE_STREAMS, CADENCES, ENTITIES, MONEY_BASES, MONEY_KINDS, RELIABILITY, STREAMS,
  checkMoneyItem, looksSecret, monthly, resilience, runwayText, type MoneyItem,
} from "../src/domain/resilience";

const TODAY = "2026-10-17";
let n = 0;
const item = (over: Partial<MoneyItem> & Pick<MoneyItem, "kind" | "label">): MoneyItem => ({
  id: `i${++n}`, entity: "personal", amount: 0, cadence: null, stream: null, reliability: null, liquid: null,
  basis: "stated", evidenceRef: null, dueOn: null, asOf: TODAY, note: null, ...over,
});
const cost = (label: string, amount: number | null, cadence: MoneyItem["cadence"] = "monthly", over: Partial<MoneyItem> = {}) =>
  item({ kind: "essential_cost", label, amount, cadence, ...over });
const reserve = (label: string, amount: number | null, liquid = true, over: Partial<MoneyItem> = {}) =>
  item({ kind: "reserve", label, amount, liquid, ...over });
const income = (label: string, amount: number | null, stream: MoneyItem["stream"], reliability: MoneyItem["reliability"], cadence: MoneyItem["cadence"] = "monthly", over: Partial<MoneyItem> = {}) =>
  item({ kind: "income", label, amount, stream, reliability, cadence, basis: reliability === "reliable" ? "verified" : "stated", evidenceRef: reliability === "reliable" ? "contract.pdf" : null, ...over });

const { id: _id, ...base } = income("Retainer", 5000, "tebos_retainer", "reliable");

describe("money items: the rules", () => {
  it("accepts a well-formed item", () => {
    expect(checkMoneyItem(base)).toEqual({ ok: true });
  });

  it("trading income is always speculative", () => {
    expect(ALWAYS_SPECULATIVE_STREAMS).toContain("forex_trading");
    expect(checkMoneyItem({ ...base, stream: "forex_trading" }).ok).toBe(false);
    expect(checkMoneyItem({ ...base, stream: "forex_trading", reliability: "speculative", basis: "stated", evidenceRef: null }).ok).toBe(true);
  });

  it("a lump sum is speculative until it arrives", () => {
    expect(checkMoneyItem({ ...base, stream: "agent_commission", cadence: "lump_sum" }).ok).toBe(false);
  });

  it("reliable income is verified and names its document", () => {
    expect(checkMoneyItem({ ...base, basis: "stated" }).ok).toBe(false);
    expect(checkMoneyItem({ ...base, evidenceRef: " " }).ok).toBe(false);
  });

  it("fields belong to their kind", () => {
    const { id: _a, ...c } = cost("Rent", 1000);
    expect(checkMoneyItem(c).ok).toBe(true);
    expect(checkMoneyItem({ ...c, cadence: null }).ok).toBe(false);
    expect(checkMoneyItem({ ...c, cadence: "lump_sum" }).ok).toBe(false);
    expect(checkMoneyItem({ ...c, stream: "other" }).ok).toBe(false);
    expect(checkMoneyItem({ ...c, liquid: true }).ok).toBe(false);
    const { id: _b, ...r } = reserve("Savings", 1000);
    expect(checkMoneyItem(r).ok).toBe(true);
    expect(checkMoneyItem({ ...r, liquid: null }).ok).toBe(false);
    expect(checkMoneyItem({ ...r, cadence: "monthly" }).ok).toBe(false);
    expect(checkMoneyItem({ ...r, amount: -1 }).ok).toBe(false);
    expect(checkMoneyItem({ ...r, amount: null }).ok).toBe(true);
  });

  it("refuses secrets in any text field", () => {
    for (const s of ["password: hunter2", "PIN = 1234", "sk_live_abcdefghijkl", "-----BEGIN RSA PRIVATE KEY-----", "AKIAABCDEFGHIJKLMNOP",
      "ghp_abcdefghijklmnopqrstuvwxyz", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.sig", "api key: abc"]) {
      expect(looksSecret(s), s).toBe(true);
      expect(checkMoneyItem({ ...base, note: s }).ok).toBe(false);
    }
    for (const s of ["FNB savings ending 1234", "Pin the date on the calendar", "Password manager holds the login", null]) {
      expect(looksSecret(s), String(s)).toBe(false);
    }
  });
});

describe("runway", () => {
  it("monthly equivalents", () => {
    expect(monthly(100, "daily")).toBeCloseTo(3041.67, 2);
    expect(monthly(1200, "weekly")).toBe(5200);
    expect(monthly(12000, "yearly")).toBe(1000);
    expect(monthly(1, "lump_sum")).toBeNull();
  });

  it("base counts reliable income only; downside assumes all income stops", () => {
    const r = resilience([
      cost("Rent", 8000), cost("Food", 4000),
      reserve("Savings", 30000),
      income("Retainer", 6000, "tebos_retainer", "reliable"),
      income("Trading", 50000, "forex_trading", "speculative"),
    ], TODAY);
    expect(r.essentialCosts.value).toBe(12000);
    expect(r.reliableIncome.value).toBe(6000);
    expect(r.speculativeIncome.value).toBe(50000);
    expect(r.base).toEqual({ state: "months", months: 5, basis: "stated" });
    expect(r.downside).toEqual({ state: "months", months: 2.5, basis: "stated" });
    expect(runwayText(r.base)).toBe("5 months");
    expect(runwayText(r.downside)).toBe("2.5 months");
  });

  it("speculative income and lump sums never count as cash", () => {
    const r = resilience([
      cost("Rent", 10000), reserve("Savings", 20000),
      income("Commission expected", 80000, "agent_commission", "speculative", "lump_sum", { dueOn: "2026-11-30" }),
    ], TODAY);
    expect(r.base).toMatchObject({ state: "months", months: 2 });
    expect(r.lumpSums).toEqual([{ label: "Commission expected", amount: 80000, dueOn: "2026-11-30", stream: "agent_commission" }]);
  });

  it("unknown is not zero: an unknown cost or reserve leaves runway not established, and says why", () => {
    const r = resilience([cost("Rent", 10000), cost("Medical aid", null), reserve("Savings", 20000)], TODAY);
    expect(r.base).toEqual({ state: "not_established", missing: ["Medical aid"] });
    expect(runwayText(r.base)).toBe("Not established");
    expect(r.flags.map((f) => f.text)).toContain("Medical aid: amount unknown, so runway can't be established.");
    const empty = resilience([], TODAY);
    expect(empty.downside).toEqual({ state: "not_established", missing: ["essential costs (none recorded)", "liquid reserves (none recorded)"] });
  });

  it("illiquid reserves don't count; debts due within 90 days come off", () => {
    const r = resilience([
      cost("Rent", 10000), reserve("Savings", 50000), reserve("Property equity", 900000, false),
      item({ kind: "debt", label: "Card", amount: 10000, dueOn: "2026-12-01" }),
      item({ kind: "debt", label: "Student loan", amount: 100000, dueOn: "2028-01-01" }),
    ], TODAY);
    expect(r.available.value).toBe(40000);
    expect(r.illiquidReserves.value).toBe(900000);
    expect(r.downside).toMatchObject({ state: "months", months: 4 });
  });

  it("covered when reliable income meets essential costs", () => {
    const r = resilience([cost("Rent", 5000), reserve("Savings", 0), income("Retainer", 5000, "pra_retainer", "reliable")], TODAY);
    expect(r.base).toEqual({ state: "covered", basis: "stated" });
    expect(runwayText(r.base)).toBe("Covered by reliable income");
    expect(r.downside).toMatchObject({ state: "months", months: 0 });
  });

  it("is labelled by its weakest input", () => {
    const r = resilience([
      cost("Rent", 5000, "monthly", { basis: "verified", evidenceRef: "lease" }),
      reserve("Savings", 10000, true, { basis: "estimated" }),
    ], TODAY);
    expect(r.downside).toMatchObject({ basis: "estimated" });
  });

  it("scopes to one entity, keeping personal and business apart", () => {
    const items = [
      cost("Home rent", 8000), reserve("Personal savings", 16000),
      cost("Hosting", 1000, "monthly", { entity: "tebos" }), reserve("TEBOS account", 6000, true, { entity: "tebos" }),
    ];
    expect(resilience(items, TODAY, "personal").downside).toMatchObject({ months: 2 });
    expect(resilience(items, TODAY, "tebos").downside).toMatchObject({ months: 6 });
    expect(resilience(items, TODAY).downside).toMatchObject({ months: 22000 / 9000 });
  });

  it("groups income by cadence and by stream", () => {
    const r = resilience([
      income("Retainer A", 3000, "tebos_retainer", "reliable"),
      income("Retainer B", 1200, "tebos_retainer", "reliable", "yearly"),
      income("Trading", 100, "forex_trading", "speculative", "daily"),
      income("Commission", 40000, "agent_commission", "speculative", "lump_sum"),
      income("PRA lead", null, "pra_retainer", "speculative"),
    ], TODAY);
    expect(r.byCadence.map((c) => c.cadence)).toEqual(["daily", "monthly", "yearly", "lump_sum"]);
    expect(r.byCadence.find((c) => c.cadence === "monthly")).toEqual({ cadence: "monthly", reliable: 3000, speculative: 0, unknown: 1 });
    expect(r.byStream.find((s) => s.stream === "tebos_retainer")).toEqual({ stream: "tebos_retainer", reliable: 3100, speculative: 0, lumpSums: 0, unknown: 0 });
    expect(r.byStream.find((s) => s.stream === "agent_commission")?.lumpSums).toBe(40000);
    expect(r.speculativeIncome.value).toBeNull(); // the PRA lead has no amount
  });

  it("flags debts due, stale balances, concentration and commitments", () => {
    const r = resilience([
      cost("Rent", 5000), reserve("Savings", 10000, true, { asOf: "2026-08-01" }),
      income("Retainer", 5000, "tebos_retainer", "reliable"),
      item({ kind: "debt", label: "Card", amount: 1000, dueOn: "2026-10-20" }),
      item({ kind: "debt", label: "Old bill", amount: 500, dueOn: "2026-10-01" }),
      item({ kind: "commitment", label: "Surety for a lease", amount: 20000 }),
    ], TODAY);
    const texts = r.flags.map((f) => f.text);
    expect(texts).toContain("Card: due within 30 days (2026-10-20).");
    expect(texts).toContain("Old bill: due date passed (2026-10-01).");
    expect(texts).toContain("Savings: balance is from 2026-08-01; update it.");
    expect(texts).toContain("TEBOS retainers is 100% of reliable income: a single point of failure.");
    expect(texts).toContain("Surety for a lease: a commitment that could become payable.");
  });
});

describe("resilience: parity with the migration", () => {
  const sql = readFileSync(join(__dirname, "../supabase/migrations/20261017040000_resilience_money.sql"), "utf8");
  const listIn = (column: string) => {
    const m = sql.match(new RegExp(`${column}\\s+text[^\\n]*?check \\(${column} in \\(([^)]*)\\)`));
    expect(m, column).not.toBeNull();
    return m![1]!.split(",").map((s) => s.trim().replace(/'/g, "")).sort();
  };
  it.each([
    ["entity", ENTITIES], ["kind", MONEY_KINDS], ["stream", STREAMS], ["cadence", CADENCES], ["reliability", RELIABILITY], ["basis", MONEY_BASES],
  ])("%s lists agree", (column, table) => {
    expect(listIn(column)).toEqual(Object.keys(table).sort());
  });
  it("trading streams are refused as reliable in both", () => {
    for (const s of ALWAYS_SPECULATIVE_STREAMS) expect(sql).toContain(`'${s}'`);
    expect(sql).toMatch(/stream not in \('forex_trading'\)/);
  });
});
