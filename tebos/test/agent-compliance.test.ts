import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEAL_GROUPS, DEAL_ITEMS, ITEM_STATUSES, PPRA_CANDIDATE_STEPS, STEP_STATUSES, checkDealItem, checkFfcStep, dealChecklist, type DealItem,
} from "../src/domain/agent";

const TODAY = "2026-10-19";
const entry = (item: string, over: Partial<DealItem> = {}): DealItem => ({ item, status: "missing", dueOn: null, receivedOn: null, keptIn: null, reason: null, note: null, ...over });

describe("deal documents: the rules", () => {
  it("received needs its date; checked also says where it is kept; not applicable says why", () => {
    expect(checkDealItem(entry("buyer_identity", { status: "received" })).ok).toBe(false);
    expect(checkDealItem(entry("buyer_identity", { status: "received", receivedOn: TODAY })).ok).toBe(true);
    expect(checkDealItem(entry("buyer_identity", { status: "checked", receivedOn: TODAY })).ok).toBe(false);
    expect(checkDealItem(entry("buyer_identity", { status: "checked", receivedOn: TODAY, keptIn: "PropCtrl" })).ok).toBe(true);
    expect(checkDealItem(entry("gas_certificate", { status: "not_applicable" })).ok).toBe(false);
    expect(checkDealItem(entry("gas_certificate", { status: "not_applicable", reason: "No gas installation" })).ok).toBe(true);
  });

  it("only documents on the agency's checklist; no contact details, ID numbers or secrets", () => {
    expect(checkDealItem(entry("something_else")).ok).toBe(false);
    expect(checkDealItem(entry("buyer_identity", { note: "ID 8001015009087" })).ok).toBe(false);
    expect(checkDealItem(entry("buyer_identity", { keptIn: "password: hunter2" })).ok).toBe(false);
  });
});

describe("deal documents: the checklist", () => {
  it("lists every document on the agency's list; unrecorded ones are missing", () => {
    const c = dealChecklist([], TODAY);
    expect(c.groups.map((g) => g.group)).toEqual(Object.keys(DEAL_GROUPS));
    expect(c.applicable).toBe(DEAL_ITEMS.length);
    expect(c.inHand).toBe(0);
    expect(c.missing).toHaveLength(DEAL_ITEMS.length);
  });

  it("counts what is in hand, leaves out what doesn't apply, and flags what is overdue", () => {
    const c = dealChecklist([
      entry("mandate_signed", { status: "checked", receivedOn: TODAY, keptIn: "PropCtrl" }),
      entry("condition_report", { status: "received", receivedOn: TODAY }),
      entry("gas_certificate", { status: "not_applicable", reason: "No gas installation" }),
      entry("buyer_identity", { status: "requested", dueOn: "2026-10-17" }),
      entry("buyer_proof_of_address", { status: "requested", dueOn: "2026-10-25" }),
    ], TODAY);
    expect(c.applicable).toBe(DEAL_ITEMS.length - 1);
    expect(c.inHand).toBe(2);
    expect(c.overdue.map((r) => r.key)).toEqual(["buyer_identity"]);
  });

  it("names the source of every requirement, and the candidate co-signing rule is there", () => {
    for (const d of DEAL_ITEMS) expect(d.source, d.key).toBeTruthy();
    expect(DEAL_ITEMS.find((d) => d.key === "mandate_cosigned")?.source).toBe("welcome");
    expect(DEAL_ITEMS.find((d) => d.key === "otp_cosigned")?.source).toBe("welcome");
  });
});

describe("the FFC path", () => {
  it("the PPRA candidate steps each name the form's section", () => {
    expect(PPRA_CANDIDATE_STEPS).toHaveLength(5);
    for (const s of PPRA_CANDIDATE_STEPS) expect(s.source).toMatch(/section 13, 13\.(1|2\.[1-4])$/);
  });

  it("a step names its source; done needs its date and where the proof is kept", () => {
    const base = { title: "Pass the PDE exam", source: "Confirmed by the principal", status: "to_do" as const, dueOn: null, doneOn: null, evidence: null, note: null };
    expect(checkFfcStep(base).ok).toBe(true);
    expect(checkFfcStep({ ...base, source: "" }).ok).toBe(false);
    expect(checkFfcStep({ ...base, status: "done" }).ok).toBe(false);
    expect(checkFfcStep({ ...base, status: "done", doneOn: TODAY, evidence: "Result letter in the agency file" }).ok).toBe(true);
  });
});

describe("compliance: the domain mirrors the database", () => {
  const sql = readFileSync(join(__dirname, "..", "supabase", "migrations", "20261019120000_agent_compliance.sql"), "utf8");
  const listOf = (marker: string) => {
    const start = sql.indexOf(marker);
    const body = sql.slice(start, sql.indexOf("))", start));
    return [...body.matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);
  };
  it("documents, statuses and step statuses match", () => {
    expect(listOf("item         text not null check (item in (")).toEqual(DEAL_ITEMS.map((d) => d.key));
    expect(listOf("status       text not null default 'missing'").slice(1)).toEqual(Object.keys(ITEM_STATUSES));
    expect(listOf("status       text not null default 'to_do'").slice(1)).toEqual(Object.keys(STEP_STATUSES));
  });
});
