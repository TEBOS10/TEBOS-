import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ACTIVE_PROSPECT, callOrder, canTransition, isTerminal, needsOutcome, nextCallAfter, PROSPECT_STATUS_LABEL, salesProspectMachine } from "../src";

describe("the sales desk", () => {
  it("an outcome note is needed for interest, meetings and a no", () => {
    expect(needsOutcome("interested")).toBe(true);
    expect(needsOutcome("meeting_booked")).toBe(true);
    expect(needsOutcome("not_interested")).toBe(true);
    expect(needsOutcome("no_answer")).toBe(false);
    expect(needsOutcome("do_not_contact")).toBe(false);
  });

  it("schedules the next call, and none after a no, an opt-out or an enquiry", () => {
    expect(nextCallAfter("no_answer", "2026-10-28")).toBe("2026-10-30");
    expect(nextCallAfter("interested", "2026-10-30")).toBe("2026-11-02");
    expect(nextCallAfter("meeting_booked", "2026-12-28")).toBe("2027-01-04");
    expect(nextCallAfter("not_interested", "2026-10-28")).toBeNull();
    expect(nextCallAfter("do_not_contact", "2026-10-28")).toBeNull();
    expect(nextCallAfter("became_enquiry", "2026-10-28")).toBeNull();
  });

  it("calls the most promising first", () => {
    const order = [...ACTIVE_PROSPECT].sort((a, b) => callOrder(a) - callOrder(b));
    expect(order).toEqual(["meeting_booked", "interested", "no_answer", "new"]);
  });

  it("'do not contact' is final, and every status has a label", () => {
    expect(canTransition("sales_prospect", "do_not_contact", "interested")).toBe(false);
    expect(isTerminal("sales_prospect", "do_not_contact")).toBe(true);
    expect(isTerminal("sales_prospect", "became_enquiry")).toBe(true);
    for (const s of Object.keys(salesProspectMachine.transitions)) expect(PROSPECT_STATUS_LABEL[s as keyof typeof PROSPECT_STATUS_LABEL]).toBeTruthy();
  });

  it("the call order matches the database's", () => {
    const sql = readFileSync(join(__dirname, "..", "supabase", "migrations", "20261028090000_sales_prospects.sql"), "utf8");
    expect(sql).toContain("when 'meeting_booked' then 0 when 'interested' then 1 when 'no_answer' then 2 else 3");
  });
});
