import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AUDIT_CHAIN_STATUSES, AUDIT_CHECK_LIMITS, describeChain, isAuditChainStatus } from "../src";

const migration = readFileSync(join(__dirname, "..", "supabase", "migrations", "20261017200000_audit_verify.sql"), "utf8")
  .replace(/--[^\n]*/g, "");

describe("audit-chain statuses", () => {
  it("are exactly the ones the database reports", () => {
    const fromSql = new Set([...migration.matchAll(/(?:then|else) '([a-z_]+)'/g)].map((m) => m[1]!));
    expect(fromSql).toEqual(new Set(AUDIT_CHAIN_STATUSES));
  });

  it("recognises only those", () => {
    expect(isAuditChainStatus("intact")).toBe(true);
    expect(isAuditChainStatus("repaired")).toBe(false);
  });
});

describe("describing a chain", () => {
  it("says what was checked when intact", () => {
    expect(describeChain({ status: "intact", events: 12, firstBadId: null, timezoneHint: null })).toContain("All 12 events");
  });

  it("names the event where a chain breaks", () => {
    expect(describeChain({ status: "broken_link", events: 12, firstBadId: 7, timezoneHint: null })).toContain("event 7");
  });

  it("calls an edited event changed, and a time-zone difference something to look into, never fine", () => {
    expect(describeChain({ status: "content_mismatch", events: 12, firstBadId: 3, timezoneHint: null })).toContain("changed after it was written");
    const zoned = describeChain({ status: "content_mismatch", events: 12, firstBadId: 3, timezoneHint: "+02" });
    expect(zoned).toContain("UTC+02");
    expect(zoned).toContain("still needs looking into");
  });

  it("doesn't call missing history a change", () => {
    const s = describeChain({ status: "unverifiable_start", events: 5, firstBadId: null, timezoneHint: null });
    expect(s).toContain("starts part-way");
    expect(s).not.toContain("changed");
  });

  it("states what the check can't prove", () => {
    expect(AUDIT_CHECK_LIMITS).toContain("newest events");
  });
});
