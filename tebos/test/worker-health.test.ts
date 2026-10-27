import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LATE_MINUTES, RUNNING_MINUTES, sinceLabel, workerState, workerSummary } from "../src";
import { Heartbeat } from "../src/heartbeat";

describe("worker health", () => {
  it("no beat is never, not running", () => {
    expect(workerState(null)).toBe("never");
    expect(workerSummary({ state: "never", minutesSince: null, lastPassErrors: 0 })).toMatch(/Nothing runs on its own/);
  });

  it("reads running, late and stopped from the beat's age", () => {
    expect(workerState(0)).toBe("running");
    expect(workerState(RUNNING_MINUTES)).toBe("running");
    expect(workerState(RUNNING_MINUTES + 1)).toBe("late");
    expect(workerState(LATE_MINUTES)).toBe("late");
    expect(workerState(LATE_MINUTES + 1)).toBe("stopped");
  });

  it("says when a running worker had failures", () => {
    expect(workerSummary({ state: "running", minutesSince: 3, lastPassErrors: 2 })).toBe("Running (last pass 3 min ago), but 2 steps failed in it.");
    expect(workerSummary({ state: "stopped", minutesSince: 6 * 1440, lastPassErrors: 0 })).toMatch(/^Stopped: the last pass was 6 days ago/);
  });

  it("labels ages", () => {
    expect(sinceLabel(0)).toBe("just now");
    expect(sinceLabel(59)).toBe("59 min ago");
    expect(sinceLabel(120)).toBe("2 h ago");
    expect(sinceLabel(3 * 1440)).toBe("3 days ago");
  });

  it("the thresholds match the database's", () => {
    const sql = readFileSync(join(__dirname, "..", "supabase", "migrations", "20261027090000_worker_heartbeat.sql"), "utf8");
    expect(sql).toContain(`when v_min <= ${RUNNING_MINUTES} then 'running' when v_min <= ${LATE_MINUTES} then 'late'`);
  });
});

describe("heartbeat", () => {
  const fakePool = (fail = false) => {
    const calls: unknown[][] = [];
    return { calls, pool: { query: async (_sql: string, params: unknown[]) => { if (fail) throw new Error("db down"); calls.push(params); return { rows: [] }; } } };
  };

  it("beats at most once a minute unless forced, and reports failed steps once", async () => {
    const { calls, pool } = fakePool();
    const hb = new Heartbeat(pool as never, "w1", "batch", { sources: true }, () => {});
    hb.failed("sources", "Outlook sign-in failed (400)");
    expect(await hb.beat()).toBe(true);
    expect(calls[0]).toEqual(["w1", "batch", expect.any(String), 1, "sources: Outlook sign-in failed (400)", '{"sources":true}']);
    expect(await hb.beat()).toBe(false);
    expect(await hb.beat(true)).toBe(true);
    expect(calls[1]![3]).toBe(0);
    expect(calls[1]![4]).toBeNull();
  });

  it("a stage paused by a fault counts as a failed step, so running never hides it", async () => {
    const { calls, pool } = fakePool();
    let paused: string | null = "intelligence paused (misconfigured: credit balance is too low)";
    const hb = new Heartbeat(pool as never, "w1", "batch", {}, () => {}, 60_000, () => [paused, null]);
    expect(await hb.beat(true)).toBe(true);
    expect(calls[0]![3]).toBe(1);
    expect(calls[0]![4]).toBe("intelligence paused (misconfigured: credit balance is too low)");
    // a real step failure in the same pass is reported first, and both are counted
    hb.failed("sources", "Outlook read failed (503)");
    await hb.beat(true);
    expect(calls[1]![3]).toBe(2);
    expect(calls[1]![4]).toBe("sources: Outlook read failed (503)");
    // once the stage is back, the beat is clean
    paused = null;
    await hb.beat(true);
    expect(calls[2]![3]).toBe(0);
    expect(calls[2]![4]).toBeNull();
  });

  it("a failed beat is logged and never throws", async () => {
    const { pool } = fakePool(true);
    const events: Record<string, unknown>[] = [];
    const hb = new Heartbeat(pool as never, "w1", "continuous", {}, (e) => events.push(e));
    expect(await hb.beat(true)).toBe(false);
    expect(events[0]).toMatchObject({ event: "heartbeat.error" });
  });
});
