import { describe, expect, it } from "vitest";
import { analysisPausedSince, PROVIDER_FAULT_DETAIL, runDetail, type AnalysisRun } from "../src/domain/analysis";

const run = (at: string, over: Partial<AnalysisRun> = {}): AnalysisRun =>
  ({ agent_role: "business_intelligence", status: "succeeded", started_at: `2026-10-0${at}T00:00:00Z`, output_summary: {}, error_detail: null, ...over });
const fault = (at: string, kind = "misconfigured") => run(at, { status: "failed", output_summary: { findings: 0, providerFault: true, fault: kind } });

describe("analysis status", () => {
  it("is paused since the first provider fault in the latest streak", () => {
    expect(analysisPausedSince([run("1"), fault("2"), fault("3")])).toBe("2026-10-02T00:00:00Z");
  });
  it("is running when the latest analysis succeeded, or failed because of the business's own evidence", () => {
    expect(analysisPausedSince([fault("1"), run("2")])).toBeNull();
    expect(analysisPausedSince([fault("1"), run("2", { status: "failed", output_summary: { findings: 0 } })])).toBeNull();
    expect(analysisPausedSince([])).toBeNull();
  });
  it("ignores other workers' runs", () => {
    expect(analysisPausedSince([fault("1"), run("2", { agent_role: "acquisition" })])).toBe("2026-10-01T00:00:00Z");
  });
  it("shows neutral words for a provider fault, even on runs recorded with the raw message", () => {
    const old = run("1", { status: "failed", output_summary: { findings: 0, providerFault: true }, error_detail: "misconfigured: Anthropic rejected the request: 400" });
    expect(runDetail(old)).toBe(PROVIDER_FAULT_DETAIL.misconfigured);
    expect(runDetail(fault("2", "provider_unavailable"))).toBe(PROVIDER_FAULT_DETAIL.provider_unavailable);
    expect(runDetail(run("3", { status: "failed", error_detail: "refusal: declined" }))).toBe("refusal: declined");
  });
  it("names no service", () => {
    for (const text of Object.values(PROVIDER_FAULT_DETAIL)) expect(text).not.toMatch(/anthropic|claude|openai/i);
  });
});
