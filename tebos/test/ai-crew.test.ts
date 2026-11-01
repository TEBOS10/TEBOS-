import { describe, expect, it } from "vitest";
import { canTransition } from "../src/domain/states";
import { pickAgent, rosterGaps, shiftAt, type CrewAgent } from "../src/domain/aiCrew";

const agents: CrewAgent[] = [
  { id: "a1", name: "Bookings · day", team: "bookings", shift: "day", status: "active" },
  { id: "a2", name: "Bookings · night", team: "bookings", shift: "night", status: "active" },
  { id: "a3", name: "Admin · day", team: "admin", shift: "day", status: "active" },
  { id: "a4", name: "Social · night", team: "social", shift: "night", status: "paused" },
];

describe("the AI crew", () => {
  it("runs day from 06:00 to 18:00 South African time, night otherwise", () => {
    expect(shiftAt(new Date("2026-11-02T04:00:00Z"))).toBe("day");   // 06:00 SAST
    expect(shiftAt(new Date("2026-11-02T15:59:00Z"))).toBe("day");   // 17:59
    expect(shiftAt(new Date("2026-11-02T16:00:00Z"))).toBe("night"); // 18:00
    expect(shiftAt(new Date("2026-11-02T03:59:00Z"))).toBe("night"); // 05:59
  });

  it("gives work to the team's agent on shift, falls back to the team's other agent, and never to a paused one", () => {
    expect(pickAgent(agents, "reply_enquiry", new Date("2026-11-02T08:00:00Z"))?.id).toBe("a1");
    expect(pickAgent(agents, "call_sheet", new Date("2026-11-02T20:00:00Z"))?.id).toBe("a2");
    expect(pickAgent(agents, "balance_reminder", new Date("2026-11-02T20:00:00Z"))?.id).toBe("a3");
    expect(pickAgent(agents, "caption", new Date("2026-11-02T20:00:00Z"))).toBeNull();
  });

  it("shows where a team has nobody on a shift", () => {
    expect(rosterGaps(agents)).toEqual([{ team: "admin", shift: "night" }, { team: "social", shift: "day" }, { team: "social", shift: "night" }]);
  });

  it("lets people decide: an agent's draft goes to approval, and only approved work is sent", () => {
    expect(canTransition("ai_task", "drafted", "approved")).toBe(true);
    expect(canTransition("ai_task", "queued", "approved")).toBe(false);
    expect(canTransition("ai_task", "drafted", "sent")).toBe(false);
    expect(canTransition("ai_task", "approved", "sent")).toBe(true);
  });
});
