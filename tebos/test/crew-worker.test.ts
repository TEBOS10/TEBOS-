import { describe, expect, it } from "vitest";
import { CrewWorker, type CrewJob, type CrewStore } from "../src/crew/worker";
import { ReasoningError, type ReasoningProvider } from "../src/intelligence/provider";

const job = (over: Partial<CrewJob> = {}): CrewJob => ({
  id: "t1", orgId: "o1", kind: "reply_enquiry", brief: "Reply enquiry for BK-00001: Studio shoots, Mon 09 Nov 10:00 (SA time). No brief.",
  business: "Grape Studios", customerFirstName: "Lerato", depositInstructions: "Pay by EFT; use your booking reference.",
  agents: [
    { id: "a1", name: "Bookings · day", team: "bookings", shift: "day", status: "active", instructions: "Sign off as the Grape Studios team." },
    { id: "a2", name: "Bookings · night", team: "bookings", shift: "night", status: "active", instructions: null },
  ],
  ...over,
});
function store(jobs: CrewJob[]) {
  const saved: Array<{ taskId: string; agentId: string; draft: string }> = [];
  const s: CrewStore = {
    nextJob: async (skip) => jobs.find((j) => !skip.includes(j.id) && !saved.some((x) => x.taskId === j.id)) ?? null,
    saveDraft: async (taskId, agentId, draft) => { saved.push({ taskId, agentId, draft }); return true; },
  };
  return { s, saved };
}
const provider = (answer: unknown, seen: string[] = []): ReasoningProvider => ({
  name: "xai", structured: async (req) => { seen.push(req.prompt); return { value: answer, provider: "xai", model: "grok", usage: { inputTokens: 1, outputTokens: 1 } }; },
});
const night = () => new Date("2026-11-02T20:00:00Z");

describe("the crew worker", () => {
  it("has the team's agent on shift draft the work, with a first name and no contact details", async () => {
    const { s, saved } = store([job()]);
    const seen: string[] = [];
    const w = new CrewWorker(s, provider({ draft: "Hi Lerato, thanks for your request." }, seen), () => {}, night);
    expect(await w.runOnce()).toEqual({ taskId: "t1", outcome: "drafted", agent: "Bookings · night" });
    expect(saved).toEqual([{ taskId: "t1", agentId: "a2", draft: "Hi Lerato, thanks for your request." }]);
    expect(seen[0]).toContain("Customer's first name: Lerato");
    expect(seen[0]).toContain("Pay by EFT");
    expect(seen[0]).not.toMatch(/@|061/);
    expect(await w.runOnce()).toBeNull();
  });

  it("never saves an empty draft or one carrying a secret, and moves on", async () => {
    const { s, saved } = store([job()]);
    const w = new CrewWorker(s, provider({ draft: "password: hunter2hunter2" }), () => {}, night);
    expect((await w.runOnce())?.outcome).toBe("failed");
    expect(saved).toEqual([]);
    expect(await w.runOnce()).toBeNull();
  });

  it("leaves refused work for a person and throws provider outages so the worker pauses", async () => {
    const refusing: ReasoningProvider = { name: "xai", structured: async () => { throw new ReasoningError("refusal", "no"); } };
    expect((await new CrewWorker(store([job()]).s, refusing, () => {}, night).runOnce())?.outcome).toBe("refused");
    const down: ReasoningProvider = { name: "xai", structured: async () => { throw new ReasoningError("provider_unavailable", "down"); } };
    await expect(new CrewWorker(store([job()]).s, down, () => {}, night).runOnce()).rejects.toThrow("down");
  });

  it("captions don't carry payment instructions", async () => {
    const seen: string[] = [];
    const { s } = store([job({ kind: "caption", agents: [{ id: "a3", name: "Social · night", team: "social", shift: "night", status: "active", instructions: null }] })]);
    await new CrewWorker(s, provider({ draft: "Golden hour in the studio. #GrapeStudios" }, seen), () => {}, night).runOnce();
    expect(seen[0]).not.toContain("Pay by EFT");
  });
});
