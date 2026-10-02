import { describe, expect, it } from "vitest";
import { blueprintByKey } from "../src/domain/blueprints";
import { followUpDueAt, followUpEmail, readWantsToProceed } from "../src/domain/intake";

describe("intake calls", () => {
  it("counts only a clear yes or no from the call", () => {
    expect(readWantsToProceed({ wants_to_proceed: true })).toBe(true);
    expect(readWantsToProceed({ wants_to_proceed: "No" })).toBe(false);
    expect(readWantsToProceed({ wants_to_proceed: "maybe later" })).toBeNull();
    expect(readWantsToProceed({ wants_to_proceed: null })).toBeNull();
    expect(readWantsToProceed(undefined)).toBeNull();
  });

  it("follows up at 09:00 Johannesburg time the day after the call", () => {
    expect(followUpDueAt(new Date("2026-10-06T14:30:00Z")).toISOString()).toBe("2026-10-07T07:00:00.000Z");
    // 23:30 in Johannesburg is still that day there: the next morning, not two days later
    expect(followUpDueAt(new Date("2026-10-06T21:30:00Z")).toISOString()).toBe("2026-10-07T07:00:00.000Z");
    // 00:30 in Johannesburg is already the next day there
    expect(followUpDueAt(new Date("2026-10-06T22:30:00Z")).toISOString()).toBe("2026-10-08T07:00:00.000Z");
  });

  const base = { name: "Lerato Mokoena", business: "Pulse Gym", industry: "marketing-agency", waitlistUrl: "https://tebos.test/waitlist" };

  it("outlines the blueprint's pieces and flows by name, never its rules", () => {
    const bp = blueprintByKey("marketing-agency")!;
    const { subject, text } = followUpEmail({ ...base, wantsToProceed: true });
    expect(subject).toBe("What TEBOS would build for Pulse Gym");
    expect(text.startsWith("Hi Lerato,")).toBe(true);
    for (const p of bp.pieces) expect(text).toContain(`- ${p.name}`);
    for (const f of bp.flows) expect(text).toContain(f.name);
    for (const f of bp.flows) for (const s of f.steps) if (s.rule) expect(text).not.toContain(s.rule);
    expect(text).toContain("You told us you'd like to go ahead");
  });

  it("asks for a yes or no when the call didn't settle it, and lets a no go", () => {
    expect(followUpEmail({ ...base, wantsToProceed: null }).text).toContain("Just reply yes or no");
    const no = followUpEmail({ ...base, wantsToProceed: false });
    expect(no.text).toContain("that's completely fine");
    expect(no.text).toContain("We won't contact you again");
    expect(no.text).not.toContain("The pieces it runs on");
  });

  it("without a known kind of business, promises a map, not a blueprint", () => {
    const { text } = followUpEmail({ ...base, industry: null, wantsToProceed: null });
    expect(text).toContain("TEBOS would start by mapping how Pulse Gym really runs");
  });
});
