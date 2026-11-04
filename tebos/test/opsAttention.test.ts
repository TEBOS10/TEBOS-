import { describe, expect, it } from "vitest";
import { ATTENTION_RULES, attention, type AttentionInput } from "../src/domain/opsAttention";
import { rand } from "../src/domain/opsLedger";

const TODAY = "2026-11-05";
function base(over: Partial<AttentionInput> = {}): AttentionInput {
  return {
    today: TODAY,
    properties: [{ id: "p1", name: "Sample Court" }],
    units: [
      { id: "u1", property_id: "p1", label: "1A", market_rent_cents: 650000, held_back: false },
      { id: "u2", property_id: "p1", label: "1B", market_rent_cents: null, held_back: false },
      { id: "u3", property_id: "p1", label: "2A", market_rent_cents: 700000, held_back: true },
    ],
    tenants: [{ id: "t1", full_name: "Tenant A", email: "a@example.test", phone: null }],
    leases: [{ id: "l1", unit_id: "u1", tenant_id: "t1", ref: "L-0001", starts_on: "2026-09-01", ends_on: null, ended_on: null, status: "active", deposit_cents: 0, deposit_held_at: null }],
    positions: [{ lease_id: "l1", overdue_cents: 0, d31_60: 0, d61_90: 0, d90_plus: 0, deposit_held_cents: 0 }],
    maintenance: [],
    ...over,
  };
}
const keys = (i: AttentionInput) => attention(i).map((x) => x.key);

describe("needs attention", () => {
  it("a tidy portfolio flags only what is genuinely open: the vacant unit, not the held-back one", () => {
    expect(keys(base())).toEqual(["vacant:u2"]);
    expect(attention(base())[0]!.detail).toBe("No market rent recorded");
  });

  it("overdue rent: over 30 days is serious, under is a warning, and the largest comes first", () => {
    const items = attention(base({
      tenants: [{ id: "t1", full_name: "Tenant A", email: "a@x.test", phone: null }, { id: "t2", full_name: "Tenant B", email: null, phone: "0820000000" }],
      units: [{ id: "u1", property_id: "p1", label: "1A", market_rent_cents: 1, held_back: false }, { id: "u2", property_id: "p1", label: "1B", market_rent_cents: 1, held_back: false }],
      leases: [
        { id: "l1", unit_id: "u1", tenant_id: "t1", ref: "L-0001", starts_on: "2026-01-01", ends_on: null, ended_on: null, status: "active", deposit_cents: 0, deposit_held_at: null },
        { id: "l2", unit_id: "u2", tenant_id: "t2", ref: "L-0002", starts_on: "2026-01-01", ends_on: null, ended_on: null, status: "active", deposit_cents: 0, deposit_held_at: null },
      ],
      positions: [
        { lease_id: "l1", overdue_cents: 300000, d31_60: 0, d61_90: 0, d90_plus: 0, deposit_held_cents: 0 },
        { lease_id: "l2", overdue_cents: 120000, d31_60: 120000, d61_90: 0, d90_plus: 0, deposit_held_cents: 0 },
      ],
    }));
    expect(items.map((i) => [i.key, i.severity])).toEqual([["overdue:l2", "bad"], ["overdue:l1", "warn"]]);
    expect(items[0]!.title).toBe(`Tenant B owes ${rand(120000)} overdue`);
    expect(items[0]!.detail).toBe("L-0002 · Sample Court, unit 1B · some over 30 days");
  });

  it("rent not yet charged for the month shows the gap, and nothing when fully billed", () => {
    expect(attention(base({ month: { label: "November 2026", expected_cents: 650000, billed_cents: 0 } })).find((i) => i.key === "uncharged")?.title)
      .toBe(`${rand(650000)} of November 2026's rent isn't charged yet`);
    expect(keys(base({ month: { label: "November 2026", expected_cents: 650000, billed_cents: 650000 } }))).not.toContain("uncharged");
  });

  it("fixed terms ending: warn within 30 days, inform within 60, ignore later or already ended", () => {
    const lease = (id: string, ends_on: string | null, ended_on: string | null = null) =>
      ({ id, unit_id: "u1", tenant_id: "t1", ref: id, starts_on: "2026-01-01", ends_on, ended_on, status: ended_on ? "ended" : "active", deposit_cents: 0, deposit_held_at: null });
    const items = attention(base({ leases: [lease("a", "2026-11-20"), lease("b", "2026-12-30"), lease("c", "2027-03-01"), lease("d", "2026-11-10", "2026-11-04")], positions: [] }));
    const ending = items.filter((i) => i.key.startsWith("ending:"));
    expect(ending.map((i) => [i.key, i.severity])).toEqual([["ending:a", "warn"], ["ending:b", "info"]]);
    expect(ending[0]!.title).toBe("Tenant A's fixed term ends in 15 days");
    expect(ATTENTION_RULES.leaseEndingSoon).toBe(60);
  });

  it("a lease that has ended leaves its unit vacant from the next day", () => {
    const ended = base({ leases: [{ id: "l1", unit_id: "u1", tenant_id: "t1", ref: "L-0001", starts_on: "2026-01-01", ends_on: null, ended_on: "2026-11-04", status: "ended", deposit_cents: 0, deposit_held_at: null }] });
    expect(keys(ended)).toContain("vacant:u1");
    expect(attention(ended).find((i) => i.key === "vacant:u1")!.detail).toBe(`About ${rand(650000)} a month at market rent (estimated)`);
  });

  it("maintenance: quotes awaiting approval, urgent jobs at once, others only once stale; finished jobs never", () => {
    const m = (id: string, status: string, priority: string, reported_on: string) => ({ id, ref: id, title: "Job", status, priority, reported_on, property_id: "p1" });
    const items = attention(base({ units: [], maintenance: [
      m("M-1", "quoted", "normal", TODAY), m("M-2", "reported", "urgent", TODAY), m("M-3", "in_progress", "normal", "2026-10-01"),
      m("M-4", "reported", "normal", "2026-11-01"), m("M-5", "done", "urgent", "2026-01-01"), m("M-6", "cancelled", "normal", "2026-01-01"),
    ] }));
    expect(items.map((i) => [i.key, i.severity])).toEqual([["stale:M-2", "bad"], ["stale:M-3", "warn"], ["quote:M-1", "warn"]]);
    expect(items[1]!.title).toBe("M-3 Job open for 35 days");
  });

  it("incomplete records: where the deposit is held, deposit not fully received, no way to contact the tenant", () => {
    const items = attention(base({
      units: [{ id: "u1", property_id: "p1", label: "1A", market_rent_cents: 1, held_back: false }],
      tenants: [{ id: "t1", full_name: "Tenant A", email: null, phone: null }],
      leases: [{ id: "l1", unit_id: "u1", tenant_id: "t1", ref: "L-0001", starts_on: "2026-09-01", ends_on: null, ended_on: null, status: "active", deposit_cents: 650000, deposit_held_at: null }],
      positions: [{ lease_id: "l1", overdue_cents: 0, d31_60: 0, d61_90: 0, d90_plus: 0, deposit_held_cents: 250000 }],
    }));
    expect(items.map((i) => i.key)).toEqual(["deposit-where:l1", "deposit-short:l1", "contact:t1"]);
    expect(items[1]!.title).toBe(`L-0001: ${rand(400000)} of the deposit not received`);
    expect(items.every((i) => i.severity === "info" && i.basis.length > 0)).toBe(true);
  });

  it("a new lease gets a week before an unpaid deposit is flagged", () => {
    const fresh = base({
      leases: [{ id: "l1", unit_id: "u1", tenant_id: "t1", ref: "L-0001", starts_on: "2026-11-01", ends_on: null, ended_on: null, status: "active", deposit_cents: 100, deposit_held_at: "Bank savings" }],
      positions: [{ lease_id: "l1", overdue_cents: 0, d31_60: 0, d61_90: 0, d90_plus: 0, deposit_held_cents: 0 }],
    });
    expect(keys(fresh)).not.toContain("deposit-short:l1");
  });

  it("every item links somewhere in the app and says what it was computed from", () => {
    const items = attention(base({ month: { label: "November 2026", expected_cents: 2, billed_cents: 1 } }));
    for (const i of items) { expect(i.link.startsWith("/")).toBe(true); expect(i.basis).not.toBe(""); }
  });
});
