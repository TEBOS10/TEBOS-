import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONSENT_METHODS, FEE_TERMS, REFERRAL_DESTINATIONS, referralGaps, referralSummary, type ReferralDraft } from "../src/domain/referrals";
import { canTransition } from "../src/domain/states";

const sql = readFileSync(join(__dirname, "..", "supabase", "migrations", "20261107090000_channel_referrals.sql"), "utf8");
const today = "2026-11-07";
const base: ReferralDraft = {
  destination: "real_estate_assist", via_agency: true, contact_id: "c1", problem: "Tenant in arrears, landlord needs help",
  status: "identified", consent_on: null, consent_how: null, agency_permission_ref: null, partner_terms_ref: null,
  fee_terms: "not_agreed", fee_terms_ref: null, next_step: "Ask the landlord", next_step_on: today, outcome: null,
};

describe("channel referrals", () => {
  it("a new need is complete with a problem and a next step", () => {
    expect(referralGaps(base, today)).toEqual([]);
  });

  it("nothing moves without recorded consent", () => {
    expect(referralGaps({ ...base, status: "consent_given" }, today)).toContain("Record when and how the person agreed to be introduced.");
    expect(referralGaps({ ...base, status: "consent_given", consent_on: today, consent_how: "email" }, today)).toEqual([]);
    expect(referralGaps({ ...base, status: "consent_given", consent_on: "2026-11-08", consent_how: "email" }, today))
      .toContain("Consent is recorded once it has been given, not in advance.");
  });

  it("Real Estate Assist: no introduction without the written referral arrangement", () => {
    const r = { ...base, status: "introduced" as const, consent_on: today, consent_how: "in_writing" as const };
    expect(referralGaps(r, today)).toContain("Record where Real Estate Assist's written referral arrangement is.");
    expect(referralGaps({ ...r, partner_terms_ref: "Referral letter, 3 Nov" }, today)).toEqual([]);
  });

  it("Tidy Enterprise: the agency's book isn't the company's pipeline without written permission", () => {
    const r = { ...base, destination: "tidy_enterprise" as const, status: "introduced" as const, consent_on: today, consent_how: "email" as const };
    expect(referralGaps(r, today).join(" ")).toMatch(/agency's written permission/);
    expect(referralGaps({ ...r, agency_permission_ref: "Principal's email, 6 Nov" }, today)).toEqual([]);
    // the founder's own lead needs no agency permission
    expect(referralGaps({ ...r, via_agency: false, contact_id: null }, today)).toEqual([]);
  });

  it("closed referrals say how they ended; an agreed fee says where it is written", () => {
    expect(referralGaps({ ...base, status: "withdrawn", next_step: null, next_step_on: null }, today)).toContain("Say how it ended.");
    expect(referralGaps({ ...base, fee_terms: "agreed_in_writing" }, today)).toContain("Record where the fee agreement is.");
  });

  it("the summary counts records per destination", () => {
    const s = referralSummary([
      { destination: "real_estate_assist", status: "identified" },
      { destination: "real_estate_assist", status: "served" },
      { destination: "tidy_enterprise", status: "resolved" },
    ]);
    expect(s).toEqual([
      { destination: "real_estate_assist", open: 2, introduced: 1, accepted: 1, resolved: 0 },
      { destination: "tidy_enterprise", open: 0, introduced: 1, accepted: 1, resolved: 1 },
    ]);
  });

  it("mirrors the database's lists and machine", () => {
    const list = (col: string) => [...new RegExp(`${col}\\s+text[^\\n]*check \\(${col} in \\(([^)]*)\\)`).exec(sql)![1]!.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(list("destination")).toEqual([...REFERRAL_DESTINATIONS]);
    expect(list("consent_how")).toEqual([...CONSENT_METHODS]);
    expect(list("fee_terms")).toEqual([...FEE_TERMS]);
    expect(canTransition("channel_referral", "served", "resolved")).toBe(true);
    expect(canTransition("channel_referral", "identified", "introduced")).toBe(false);
  });
});
