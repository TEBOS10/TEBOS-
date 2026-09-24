import { describe, expect, it } from "vitest";
import { deriveScanOutcome, summariseScan, type TargetResult } from "../src";

const t = (uri: string, status: TargetResult["status"], failureDetail?: string): TargetResult => ({ uri, status, failureDetail });

describe("scan outcome", () => {
  it("is completed only when every target was acquired", () => {
    expect(deriveScanOutcome([t("/", "acquired"), t("/about", "acquired")]).status).toBe("completed");
  });

  it("is partial when some evidence was acquired and some was not, and lists what is missing", () => {
    const out = deriveScanOutcome([t("/", "acquired"), t("/contact", "unavailable", "HTTP 503")]);
    expect(out.status).toBe("partial");
    expect(out.missing).toEqual(["/contact — unavailable: HTTP 503"]);
  });

  it("treats a page limit (skipped targets) as partial, not complete", () => {
    expect(deriveScanOutcome([t("/", "acquired"), t("/blog", "skipped")]).status).toBe("partial");
  });

  it("never reports failed while holding acquired evidence", () => {
    expect(deriveScanOutcome([t("/", "partially_acquired"), t("/x", "blocked")]).status).toBe("partial");
  });

  it("is failed when nothing was acquired, or there was nothing to scan", () => {
    expect(deriveScanOutcome([t("https://httpstat.us/503", "unavailable")]).status).toBe("failed");
    expect(deriveScanOutcome([]).status).toBe("failed");
  });

  it("cannot finish while targets are pending", () => {
    const out = deriveScanOutcome([t("/", "acquired"), t("/x", "pending")]);
    expect(out.status).toBe("running");
  });

  it("summarises honestly", () => {
    const targets = [...Array(5)].map((_, i) => t(`/${i}`, "acquired")).concat([t("/a", "unavailable"), t("/b", "unavailable")]);
    expect(summariseScan(targets, 0.78)).toBe("7 targets scanned · 5 acquired · 2 unavailable · confidence 78%");
    expect(summariseScan([t("/", "pending")], null)).toBe("1 target scanned · 0 acquired · 1 pending · confidence not assessed");
  });
});
