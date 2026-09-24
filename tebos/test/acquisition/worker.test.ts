import { describe, expect, it } from "vitest";
import type { Fetcher, FetchOutcome } from "../../src/acquisition/fetcher";
import { AcquisitionWorker, type ClaimedScan } from "../../src/acquisition/worker";
import { MemoryStore } from "./memory-store";

const SITE = "https://acme.example";
const page = (url: string, html: string, over: Partial<Extract<FetchOutcome, { kind: "ok" }>> = {}): FetchOutcome => ({
  kind: "ok",
  requestedUrl: url,
  finalUrl: url,
  status: 200,
  contentType: "text/html; charset=utf-8",
  body: html,
  bytes: html.length,
  truncated: false,
  contentHash: "h",
  redirects: [],
  ...over,
});
const HOME = `<html><head><title>Acme Plumbing</title></head><body><h1>Emergency plumbing</h1>
  <p>${"Fast reliable plumbing in Pretoria. ".repeat(30)}</p>
  <a href="/contact">Contact</a><a href="/about">About</a><a href="/services">Services</a><a href="/private/x">x</a></body></html>`;

function fakeFetcher(routes: Record<string, FetchOutcome | (() => never)>): Fetcher & { calls: string[] } {
  const calls: string[] = [];
  const f = (async (url: string) => {
    calls.push(url);
    const r = routes[url];
    if (typeof r === "function") r();
    return (r as FetchOutcome | undefined) ?? { kind: "http_error", requestedUrl: url, finalUrl: url, status: 404, detail: "HTTP 404" };
  }) as Fetcher & { calls: string[] };
  f.calls = calls;
  return f;
}

function setup(routes: Record<string, FetchOutcome | (() => never)>, scan: Partial<ClaimedScan> = {}) {
  const store = new MemoryStore();
  const claimed: ClaimedScan = { scanId: "scan-1", orgId: "org", businessId: "biz", objective: null, startUrl: `${SITE}/`, targetLimit: 4, ...scan };
  store.enqueue(claimed);
  const fetcher = fakeFetcher(routes);
  const worker = new AcquisitionWorker(store, { workerId: "w1", fetcher, politenessDelayMs: 0 });
  return { store, fetcher, worker };
}

describe("acquisition worker", () => {
  it("reads the site into evidence and completes when every target was acquired", async () => {
    const { store, worker } = setup({
      [`${SITE}/robots.txt`]: page(`${SITE}/robots.txt`, "User-agent: *\nDisallow: /private", { contentType: "text/plain" }),
      [`${SITE}/`]: page(`${SITE}/`, HOME),
      [`${SITE}/contact`]: page(`${SITE}/contact`, '<title>Contact</title><body><h1>Contact</h1><a href="mailto:hi@acme.example">m</a></body>'),
      [`${SITE}/about`]: page(`${SITE}/about`, "<title>About</title><body><h1>About us</h1><p>Family business since 1998.</p></body>"),
      [`${SITE}/services`]: page(`${SITE}/services`, "<title>Services</title><body><h1>Services</h1><p>Geysers, leaks.</p></body>"),
    });
    const report = await worker.runOnce();

    expect(report).toMatchObject({ status: "completed" });
    expect(report!.summary).toMatch(/^4 targets scanned · 4 acquired · confidence \d+%$/);
    expect(store.scanStatus.get("scan-1")).toBe("completed");
    expect(store.targets.map((t) => t.uri)).toEqual([`${SITE}/`, `${SITE}/contact`, `${SITE}/about`, `${SITE}/services`]);
    expect(store.evidence.map((e) => e.fact)).toContain("Email address published: hi@acme.example");
    expect(store.evidence.every((e) => e.state === "acquired" && e.retrievedAt)).toBe(true);
    // one tool call for robots.txt + one per page, all recorded
    expect(store.toolCalls.map((c) => c.tool)).toEqual(["safe_fetch.robots", "safe_fetch", "safe_fetch", "safe_fetch", "safe_fetch"]);
    expect([...store.runs.values()][0]!.status).toBe("succeeded");
    const c = store.completions.get("scan-1")!;
    expect(c.confidence).toBeGreaterThan(0.5);
    expect(c.confidence).toBeLessThan(1); // one self-published site never reaches full confidence
    expect(c.confidenceComponents).toMatchObject({ coverage: 1, sourceReliability: 0.7, method: "acquisition.v1" });
  });

  it("keeps partial evidence, records what is missing, and reports the scan as partial", async () => {
    const { store, worker } = setup(
      {
        [`${SITE}/`]: page(`${SITE}/`, HOME),
        [`${SITE}/contact`]: { kind: "http_error", requestedUrl: `${SITE}/contact`, finalUrl: `${SITE}/contact`, status: 503, detail: "HTTP 503" },
        [`${SITE}/about`]: page(`${SITE}/about`, "<title>About</title><body><h1>About</h1></body>", { truncated: true }),
      },
      { targetLimit: 3 },
    );
    const report = await worker.runOnce();

    expect(report?.status).toBe("partial");
    expect(report?.summary).toMatch(/^3 targets scanned · 1 acquired · 1 partial · 1 unavailable · confidence \d+%$/);
    const contact = store.targets.find((t) => t.uri === `${SITE}/contact`)!;
    expect(contact).toMatchObject({ status: "unavailable", failureClass: "acquisition", httpStatus: 503 });
    const missing = store.evidence.filter((e) => e.state === "unavailable");
    expect(missing).toHaveLength(1);
    expect(missing[0]!.missingDescription).toContain("HTTP 503");
    expect(store.evidence.some((e) => e.state === "partially_acquired" && e.extractionStatus === "partial")).toBe(true);
  });

  it("blocks robots.txt-disallowed pages instead of fetching them", async () => {
    const { store, fetcher, worker } = setup(
      {
        [`${SITE}/robots.txt`]: page(`${SITE}/robots.txt`, "User-agent: *\nDisallow: /contact", { contentType: "text/plain" }),
        [`${SITE}/`]: page(`${SITE}/`, HOME),
      },
      { targetLimit: 2 },
    );
    await worker.runOnce();
    expect(fetcher.calls).not.toContain(`${SITE}/contact`);
    expect(store.targets.find((t) => t.uri === `${SITE}/contact`)).toMatchObject({ status: "blocked", failureClass: "permission" });
    expect(store.toolCalls.find((c) => c.inputSummary.url === `${SITE}/contact`)?.status).toBe("denied");
  });

  it("fails honestly — with a blocked target and no fetch — when the start URL is not public", async () => {
    const { store, fetcher, worker } = setup({}, { startUrl: "http://localhost:8080/admin" });
    const report = await worker.runOnce();
    expect(report).toMatchObject({ status: "failed", confidence: 0 });
    expect(fetcher.calls).toEqual([]); // refused before any request, robots.txt included
    expect(store.targets[0]).toMatchObject({ status: "blocked", failureClass: "validation" });
    expect(store.completions.get("scan-1")).toMatchObject({ failureClass: "validation" });
  });

  it("fails with a validation error when there is nothing to scan", async () => {
    const { store, worker } = setup({}, { startUrl: null });
    expect(await worker.runOnce()).toMatchObject({ status: "failed" });
    expect(store.completions.get("scan-1")).toMatchObject({ failureClass: "validation", failureDetail: "The scan has no website URL to read" });
    expect(store.targets).toHaveLength(0);
  });

  it("preserves acquired evidence when the worker crashes mid-scan", async () => {
    const { store, worker } = setup(
      {
        [`${SITE}/`]: page(`${SITE}/`, HOME),
        [`${SITE}/contact`]: () => {
          throw new Error("socket exploded");
        },
      },
      { targetLimit: 3 },
    );
    const report = await worker.runOnce();
    expect(report?.status).toBe("partial");
    expect(store.targets.find((t) => t.uri === `${SITE}/contact`)).toMatchObject({ status: "unavailable", failureClass: "internal" });
    expect(store.targets.every((t) => t.status !== "pending")).toBe(true);
    expect([...store.runs.values()][0]).toMatchObject({ status: "failed", error: expect.stringContaining("socket exploded") });
    expect(store.evidence.some((e) => e.state === "acquired")).toBe(true);
  });

  it("returns null when there is nothing queued", async () => {
    const worker = new AcquisitionWorker(new MemoryStore(), { workerId: "w", fetcher: fakeFetcher({}), politenessDelayMs: 0 });
    expect(await worker.runOnce()).toBeNull();
  });
});
