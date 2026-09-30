import { describe, expect, it } from "vitest";
import { signalKey, signalsFor, type ClientState, type Signal } from "../src/domain/maintenance";
import { MaintenanceWorker, type MaintenanceStore, type OpenItem } from "../src/maintenance/worker";

const now = new Date("2026-10-20T08:00:00Z");
const quiet: ClientState = { objectives: [], connections: [], findingsWaiting: { count: 0, oldest: null }, approvalsWaiting: { count: 0, oldest: null } };
const objective = (over: Partial<ClientState["objectives"][number]>) => ({
  id: "ob1", title: "Leads replied to within a day", direction: "at_most" as const, targetValue: 1, dueOn: "2026-12-31", activatedAt: "2026-10-01T00:00:00Z",
  latest: { value: 3, measuredAt: "2026-10-19T00:00:00Z" } as { value: number; measuredAt: string } | null, ...over,
});

describe("maintenance signals", () => {
  it("raises nothing for a healthy client", () => {
    expect(signalsFor({ ...quiet, objectives: [objective({ latest: { value: 1, measuredAt: "2026-10-19T00:00:00Z" } })] }, now)).toEqual([]);
  });

  it("flags an objective past its date, and says whether it can be marked achieved", () => {
    const [missed] = signalsFor({ ...quiet, objectives: [objective({ dueOn: "2026-10-15" })] }, now);
    expect(missed).toMatchObject({ kind: "objective_past_due", subjectId: "ob1", severity: "high" });
    expect(missed!.detail).toMatch(/achieved .* or missed/);
    const [met] = signalsFor({ ...quiet, objectives: [objective({ dueOn: "2026-10-15", latest: { value: 1, measuredAt: "2026-10-14T00:00:00Z" } })] }, now);
    expect(met!.detail).toBe("Its latest measured value meets the target: mark it achieved.");
  });

  it("flags an objective at risk in its last two weeks, high in its last week", () => {
    const soon = signalsFor({ ...quiet, objectives: [objective({ dueOn: "2026-11-01" })] }, now);
    expect(soon).toEqual([expect.objectContaining({ kind: "objective_at_risk", severity: "medium" })]);
    expect(soon[0]!.detail).toContain("the latest measured value (3) doesn't meet the target (at most 1)");
    expect(signalsFor({ ...quiet, objectives: [objective({ dueOn: "2026-10-24" })] }, now)[0]).toMatchObject({ severity: "high" });
    expect(signalsFor({ ...quiet, objectives: [objective({ dueOn: "2026-12-31" })] }, now)).toEqual([]);
  });

  it("flags an objective nobody is measuring", () => {
    const stale = signalsFor({ ...quiet, objectives: [objective({ latest: { value: 3, measuredAt: "2026-09-01T00:00:00Z" } })] }, now);
    expect(stale.map((s) => s.kind)).toEqual(["objective_unmeasured"]);
    const never = signalsFor({ ...quiet, objectives: [objective({ latest: null, activatedAt: "2026-08-01T00:00:00Z" })] }, now);
    expect(never[0]!.detail).toContain("No measured value in 80 days");
  });

  it("flags broken connections, and findings and approvals left waiting", () => {
    const s = signalsFor({
      ...quiet,
      connections: [{ id: "c1", label: "BAME operations snapshot", status: "authentication_required", since: "2026-10-18T00:00:00Z" },
        { id: "c2", label: "CRM", status: "degraded", since: "2026-10-19T00:00:00Z" }],
      findingsWaiting: { count: 2, oldest: "2026-10-10T00:00:00Z" },
      approvalsWaiting: { count: 1, oldest: "2026-10-19T00:00:00Z" }, // only a day: not yet
    }, now);
    expect(s.map((x) => [x.kind, x.severity])).toEqual([["connection_broken", "high"], ["connection_broken", "medium"], ["findings_waiting", "medium"]]);
    expect(s[2]!.title).toBe("2 findings waiting for review");
  });
});

describe("the maintenance worker", () => {
  function fake(state: ClientState, open: OpenItem[], dismissed: string[] = []) {
    const applied: Array<{ raise: Signal[]; refresh: Array<{ id: string }>; resolve: string[] }> = [];
    const store: MaintenanceStore = {
      nextOrgToScan: async () => ({ orgId: "org1", opportunityId: "opp1" }),
      clientState: async () => state,
      openItems: async () => open,
      recentlyDismissed: async () => dismissed,
      apply: async (_o, _p, change) => { applied.push(change); },
    };
    return { store, applied };
  }

  it("raises new signals, refreshes those still true and resolves those that cleared", async () => {
    const state = { ...quiet, objectives: [objective({ dueOn: "2026-10-15" })], connections: [{ id: "c1", label: "CRM", status: "unavailable", since: "2026-10-19T00:00:00Z" }] };
    const { store, applied } = fake(state, [
      { id: "i-conn", kind: "connection_broken", subjectId: "c1" },
      { id: "i-old", kind: "findings_waiting", subjectId: null },
    ]);
    const report = await new MaintenanceWorker(store, () => {}, () => now).runOnce();
    expect(report).toEqual({ orgId: "org1", raised: 1, resolved: 1, open: 2 });
    expect(applied[0]!.raise.map(signalKey)).toEqual(["objective_past_due:ob1"]);
    expect(applied[0]!.refresh.map((r) => r.id)).toEqual(["i-conn"]);
    expect(applied[0]!.resolve).toEqual(["i-old"]);
  });

  it("doesn't raise again what a maintainer recently dismissed", async () => {
    const { store, applied } = fake({ ...quiet, objectives: [objective({ dueOn: "2026-10-15" })] }, [], ["objective_past_due:ob1"]);
    await new MaintenanceWorker(store, () => {}, () => now).runOnce();
    expect(applied[0]!.raise).toEqual([]);
  });
});
