import { describe, expect, it } from "vitest";
import { alertsFrom } from "./inbox";

const run = (detail: string | null, at: string, role = "business_intelligence") => ({ agent_role: role, error_detail: detail, started_at: at });

describe("inbox alerts", () => {
  it("are empty when nothing failed and nothing is late", () => {
    expect(alertsFrom([], [])).toEqual([]);
  });

  it("group failed runs by their reason, counting them and keeping the latest time", () => {
    const alerts = alertsFrom([
      run("Analysis is paused", "2026-10-15T01:00:00Z"),
      run("Analysis is paused", "2026-10-15T03:00:00Z"),
      run("Analysis is paused", "2026-10-15T02:00:00Z"),
      run(null, "2026-10-14T23:00:00Z", "acquisition"),
    ], []);
    expect(alerts).toHaveLength(2);
    expect(alerts[0]).toMatchObject({ title: "Business reviews failed", detail: "Analysis is paused", count: 3, at: "2026-10-15T03:00:00Z", link: "/system" });
    expect(alerts[1]).toMatchObject({ title: "Website reading failed", detail: "It stopped without saying why.", count: 1 });
  });

  it("list objectives past their date, oldest first, linking to their board", () => {
    const alerts = alertsFrom([], [
      { id: "b", title: "Later", due_on: "2026-10-10", business_id: "biz", businessName: "BAME" },
      { id: "a", title: "Earlier", due_on: "2026-10-01", business_id: "biz", businessName: null },
    ]);
    expect(alerts.map((a) => a.title)).toEqual(['"Earlier" is past its date', '"Later" is past its date']);
    expect(alerts[1]).toMatchObject({ detail: expect.stringContaining("for BAME"), link: "/businesses/biz/board" });
  });
});
