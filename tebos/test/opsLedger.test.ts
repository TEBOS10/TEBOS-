import { describe, expect, it } from "vitest";
import {
  addDays, daysBetween, liveEntries, matchReference, nextMonth, parseDate, parsePaymentsCsv, parseRand, position, proRata, rand,
  statement, toCsv, type Entry,
} from "../src/domain/opsLedger";

let n = 0;
const e = (p: Partial<Entry> & Pick<Entry, "kind" | "amount_cents" | "effective_on">): Entry => ({
  id: `e${++n}`, account: "rent", category: p.kind === "charge" ? "rent" : null, reverses_id: null, created_at: `2026-01-01T00:00:${String(n).padStart(2, "0")}Z`, ...p,
});

describe("dates", () => {
  it("counts days across months and leap years without time zones", () => {
    expect(daysBetween("2028-02-01", "2028-03-01")).toBe(29);
    expect(daysBetween("2026-02-01", "2026-03-01")).toBe(28);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(nextMonth("2026-12-01")).toBe("2027-01-01");
  });
  it("reads South African bank dates, day first", () => {
    expect(parseDate("03/11/2026")).toBe("2026-11-03");
    expect(parseDate("2026/11/03")).toBe("2026-11-03");
    expect(parseDate("31/02/2026")).toBeNull();
    expect(parseDate("Date")).toBeNull();
  });
});

describe("pro-rated rent", () => {
  it("charges the full month when the lease covers it", () => expect(proRata(850000, "2026-11-01", "2026-01-01", null)).toBe(850000));
  it("charges a part month by days, rounded half up to the cent", () => {
    // 16 Nov to 30 Nov = 15 of 30 days of R8 500
    expect(proRata(850000, "2026-11-01", "2026-11-16", null)).toBe(425000);
    // 1 to 10 Feb 2026 of R7 000.01: 700001 × 10 / 28 = 250000.357… → 250000
    expect(proRata(700001, "2026-02-01", "2026-01-01", "2026-02-10")).toBe(250000);
    // half a cent rounds up: 3 × 15 / 30 = 1.5 → 2
    expect(proRata(3, "2026-11-01", "2026-11-16", null)).toBe(2);
  });
  it("charges nothing for a month the lease doesn't touch", () => {
    expect(proRata(850000, "2026-11-01", "2026-12-01", null)).toBe(0);
    expect(proRata(850000, "2026-11-01", "2026-01-01", "2026-10-31")).toBe(0);
  });
});

describe("positions: oldest charge settled first", () => {
  it("ages what is left of each charge from its due date", () => {
    const entries = [
      e({ kind: "charge", amount_cents: 800000, effective_on: "2026-08-01" }),
      e({ kind: "charge", amount_cents: 800000, effective_on: "2026-09-01" }),
      e({ kind: "charge", amount_cents: 800000, effective_on: "2026-10-01" }),
      e({ kind: "charge", amount_cents: 800000, effective_on: "2026-11-01" }),
      e({ kind: "payment", amount_cents: 1000000, effective_on: "2026-10-15" }),
    ];
    const p = position(entries, "2026-11-04");
    // R10 000 settles August in full and R2 000 of September
    expect(p.d61_90).toBe(600000); // what's left of September (64 days)
    expect(p.d31_60).toBe(800000); // October (34 days)
    expect(p.d1_30).toBe(800000); // November (3 days)
    expect(p.d90_plus).toBe(0);
    expect(p.overdue_cents).toBe(2200000);
    expect(p.balance_cents).toBe(2200000);
    expect(p.last_payment_on).toBe("2026-10-15");
  });
  it("a charge falling due today is current, not overdue", () => {
    const p = position([e({ kind: "charge", amount_cents: 500000, effective_on: "2026-11-04" })], "2026-11-04");
    expect(p.current_cents).toBe(500000);
    expect(p.overdue_cents).toBe(0);
  });
  it("an overpayment is a credit in the tenant's favour", () => {
    const p = position([e({ kind: "charge", amount_cents: 500000, effective_on: "2026-11-01" }), e({ kind: "payment", amount_cents: 600000, effective_on: "2026-11-01" })], "2026-11-04");
    expect(p.balance_cents).toBe(-100000);
    expect(p.overdue_cents).toBe(0);
  });
  it("a reversed entry and its reversal both drop out", () => {
    const pay = e({ kind: "payment", amount_cents: 500000, effective_on: "2026-11-02" });
    const entries = [e({ kind: "charge", amount_cents: 500000, effective_on: "2026-11-01" }), pay, e({ kind: "reversal", amount_cents: 500000, effective_on: "2026-11-03", reverses_id: pay.id })];
    expect(liveEntries(entries)).toHaveLength(1);
    expect(position(entries, "2026-11-04").overdue_cents).toBe(500000);
  });
  it("keeps the deposit apart: never income, never arrears", () => {
    const entries = [
      e({ kind: "charge", account: "deposit", category: "deposit", amount_cents: 1000000, effective_on: "2026-10-01" }),
      e({ kind: "payment", account: "deposit", amount_cents: 1000000, effective_on: "2026-10-01" }),
      e({ kind: "refund", account: "deposit", amount_cents: 250000, effective_on: "2026-11-01" }),
    ];
    const p = position(entries, "2026-11-04");
    expect(p.deposit_held_cents).toBe(750000);
    expect(p.balance_cents).toBe(0);
    expect(p.last_payment_on).toBeNull();
  });
  it("ignores entries after the as-of date", () => {
    const p = position([e({ kind: "charge", amount_cents: 500000, effective_on: "2026-12-01" })], "2026-11-04");
    expect(p.balance_cents).toBe(0);
  });
});

describe("statements", () => {
  it("runs the balance and shows a reversal undoing its entry", () => {
    const c = e({ kind: "charge", amount_cents: 500000, effective_on: "2026-11-01" });
    const wrong = e({ kind: "payment", amount_cents: 50000, effective_on: "2026-11-02" });
    const rows = statement([c, wrong, e({ kind: "reversal", amount_cents: 50000, effective_on: "2026-11-02", reverses_id: wrong.id }),
      e({ kind: "payment", amount_cents: 500000, effective_on: "2026-11-03" })], "rent");
    expect(rows.map((r) => r.running_cents)).toEqual([500000, 450000, 500000, 0]);
    expect(rows[1]!.reversed).toBe(true);
  });
});

describe("money typed by people", () => {
  it("reads rand amounts exactly", () => {
    expect(parseRand("R 8 500,00")).toBe(850000);
    expect(parseRand("8500.5")).toBe(850050);
    expect(parseRand("1,234.56")).toBe(123456);
    expect(parseRand("0,07")).toBe(7);
    expect(parseRand("12.345")).toBeNull();
    expect(parseRand("abc")).toBeNull();
    // the classic floating point trap: 0.1 + 0.2 never happens here
    expect((parseRand("0.10") ?? 0) + (parseRand("0.20") ?? 0)).toBe(30);
  });
  it("writes rand amounts in South African style", () => {
    expect(rand(123456)).toBe("R 1 234,56");
    expect(rand(-5)).toBe("−R 0,05");
  });
});

describe("payments from a bank statement", () => {
  it("reads lines, skips the header and money out, and reports problems", () => {
    const { lines, problems } = parsePaymentsCsv('Date,Description,Amount\n03/11/2026,"MAGNUS L-0001 RENT",8500.00\n04/11/2026,BANK FEES,-35.00\nnot a date,x,1\n05/11/2026,L-0002,abc\n');
    expect(lines).toEqual([{ line: 2, date: "2026-11-03", reference: "MAGNUS L-0001 RENT", amount_cents: 850000 }]);
    expect(problems.map((p) => p.line)).toEqual([3, 4, 5]);
  });
  it("matches one lease reference, never a guess", () => {
    expect(matchReference("magnus l-0001 rent", ["L-0001", "L-0002"])).toBe("L-0001");
    expect(matchReference("L-0001 and L-0002", ["L-0001", "L-0002"])).toBeNull();
    expect(matchReference("rent", ["L-0001"])).toBeNull();
  });
  it("writes CSV that survives commas and quotes", () => {
    expect(toCsv([["a,b", 'say "hi"', null]])).toBe('"a,b","say ""hi""",""\r\n');
  });
});
