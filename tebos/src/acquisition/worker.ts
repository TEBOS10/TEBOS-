// The acquisition worker: takes a queued scan and reads the business's
// public website into first-class evidence (dossier §12 stages 2–5).
//
//   claim scan (queued -> running)
//   -> vet + fetch robots.txt, then the start page
//   -> plan more same-site pages up to the scan's target limit
//   -> fetch each through the SSRF-safe fetcher
//   -> record every target's honest outcome and the evidence it produced
//   -> finish the scan as completed / partial / failed, derived from the targets
//
// Public reading needs no approval (tier 0), but everything is recorded: an
// agent run, one tool call per fetch, and — through the database triggers —
// an audit event for every row written, attributed to this run.
//
// The worker never interprets evidence. Findings are the intelligence
// layer's job.

import { scoreConfidence, type ConfidenceInputs } from "../domain/confidence";
import type { FailureClass } from "../domain/rules";
import { deriveScanOutcome, summariseScan, type TargetResult } from "../domain/scan";
import type { ScanTargetStatus } from "../domain/states";
import { checkUrlShape } from "../security/url-safety";
import { extractHtml, extractPlainText, type Extraction } from "./extract";
import { defaultVetter, safeFetch, type Fetcher, type FetchOutcome, type Vetter } from "./fetcher";
import { normaliseUrl, planTargets } from "./plan";
import { isAllowed, NO_ROBOTS, parseRobots, type RobotsRules } from "./robots";

// ---------------------------------------------------------------------------
// Storage port
// ---------------------------------------------------------------------------

export interface ClaimedScan {
  scanId: string;
  orgId: string;
  businessId: string;
  objective: string | null;
  /** scope.url if the scan names one, else the business website. */
  startUrl: string | null;
  targetLimit: number;
}

type TargetFailureClass = Extract<FailureClass, "acquisition" | "extraction" | "permission" | "validation" | "internal">;

export interface TargetResolution {
  status: Exclude<ScanTargetStatus, "pending">;
  httpStatus?: number | null;
  failureClass?: TargetFailureClass | null;
  failureDetail?: string | null;
  contentHash?: string | null;
  bytes?: number | null;
}

export interface EvidenceDraft {
  sourceId: string;
  scanTargetId: string;
  state: "acquired" | "partially_acquired" | "unavailable";
  fact: string | null;
  missingDescription: string | null;
  excerpt: string | null;
  structuredValue: Record<string, unknown> | null;
  contentLocation: string | null;
  retrievedAt: string | null;
  extractionStatus: "complete" | "partial" | "failed" | "not_applicable";
  confidence: number | null;
}

export interface ScanCompletion {
  status: "completed" | "partial" | "failed";
  confidence: number;
  confidenceComponents: Record<string, unknown>;
  failureClass: FailureClass | null;
  failureDetail: string | null;
}

export interface ToolCallRecord {
  tool: string;
  capabilityKey: string;
  permissionsUsed: string[];
  status: "succeeded" | "failed" | "denied";
  inputSummary: Record<string, unknown>;
  outputSummary: Record<string, unknown> | null;
  errorDetail: string | null;
  latencyMs: number;
}

export interface AcquisitionStore {
  /** Atomically move the oldest queued scan to running and return it. */
  claimNextScan(workerId: string): Promise<ClaimedScan | null>;
  startRun(scan: ClaimedScan): Promise<string>;
  finishRun(scan: ClaimedScan, runId: string, status: "succeeded" | "failed", output: Record<string, unknown>, errorDetail: string | null): Promise<void>;
  recordToolCall(scan: ClaimedScan, runId: string, call: ToolCallRecord): Promise<void>;
  ensureSource(scan: ClaimedScan, runId: string, uri: string): Promise<string>;
  addTarget(scan: ClaimedScan, runId: string, uri: string, sourceId: string): Promise<string>;
  resolveTarget(scan: ClaimedScan, runId: string, targetId: string, resolution: TargetResolution): Promise<void>;
  recordEvidence(scan: ClaimedScan, runId: string, items: EvidenceDraft[]): Promise<void>;
  finishScan(scan: ClaimedScan, runId: string, completion: ScanCompletion): Promise<void>;
}

// ---------------------------------------------------------------------------
// Outcome classification
// ---------------------------------------------------------------------------

/** A company's own public website: useful, but self-published and uncorroborated. */
export const PUBLIC_WEB_RELIABILITY = 0.7;

interface PageResult {
  uri: string;
  resolution: TargetResolution;
  extraction: Extraction | null;
  outcome: FetchOutcome | null;
  retrievedAt: string;
}

export function classifyFetch(outcome: FetchOutcome): { resolution: TargetResolution; extraction: Extraction | null } {
  switch (outcome.kind) {
    case "ok": {
      const extraction = outcome.contentType.startsWith("text/plain") ? extractPlainText(outcome.body) : extractHtml(outcome.body, outcome.finalUrl);
      const base = { httpStatus: outcome.status, contentHash: outcome.contentHash, bytes: outcome.bytes };
      if (extraction.facts.length === 0) {
        return {
          resolution: { ...base, status: "unavailable", failureClass: "extraction", failureDetail: `Page loaded (HTTP ${outcome.status}) but no readable content could be extracted` },
          extraction: null,
        };
      }
      if (outcome.truncated) {
        return {
          resolution: { ...base, status: "partially_acquired", failureClass: "extraction", failureDetail: `Page exceeded the size limit; only the first ${outcome.bytes} bytes were read` },
          extraction,
        };
      }
      return { resolution: { ...base, status: "acquired" }, extraction };
    }
    case "blocked":
      return { resolution: { status: "blocked", failureClass: "validation", failureDetail: `Not fetched: ${outcome.detail}` }, extraction: null };
    case "http_error": {
      const permission = outcome.status === 401 || outcome.status === 403;
      const detail =
        permission ? `HTTP ${outcome.status} — the page requires access TEBOS does not have`
        : outcome.status === 404 || outcome.status === 410 ? `HTTP ${outcome.status} — no page at this address`
        : `HTTP ${outcome.status} from the site`;
      return { resolution: { status: "unavailable", httpStatus: outcome.status, failureClass: permission ? "permission" : "acquisition", failureDetail: detail }, extraction: null };
    }
    case "unreadable":
      return { resolution: { status: "unavailable", httpStatus: outcome.status, failureClass: "extraction", failureDetail: outcome.detail }, extraction: null };
    case "network_error":
      return { resolution: { status: "unavailable", failureClass: "acquisition", failureDetail: outcome.detail }, extraction: null };
  }
}

export function scanConfidence(pages: readonly PageResult[]): { score: number; components: Record<string, unknown> } {
  const total = pages.length;
  const acquired = pages.filter((p) => p.resolution.status === "acquired").length;
  const partial = pages.filter((p) => p.resolution.status === "partially_acquired").length;
  const qualities = pages.filter((p) => p.extraction).map((p) => p.extraction!.quality);
  const inputs: ConfidenceInputs = {
    coverage: total === 0 ? 0 : (acquired + 0.5 * partial) / total,
    sourceReliability: PUBLIC_WEB_RELIABILITY,
    recency: 1,
    // pages of one website cannot independently corroborate each other
    corroboration: 0.3 * Math.min(1, (acquired + partial) / 3),
    extractionQuality: qualities.length ? qualities.reduce((a, b) => a + b, 0) / qualities.length : 0,
    contradiction: 0,
  };
  const c = scoreConfidence(inputs);
  return { score: c.score, components: { ...c.components, limitingFactors: c.limitingFactors, method: "acquisition.v1" } };
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

export interface WorkerOptions {
  workerId: string;
  fetcher?: Fetcher;
  vet?: Vetter;
  /** Pause between requests to the same site. */
  politenessDelayMs?: number;
  timeoutMs?: number;
  maxBytes?: number;
  now?: () => Date;
  log?: (event: Record<string, unknown>) => void;
}

export interface ScanReport {
  scanId: string;
  status: ScanCompletion["status"];
  summary: string;
  confidence: number;
}

const sleep = (ms: number) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

export class AcquisitionWorker {
  private readonly fetcher: Fetcher;
  private readonly vet: Vetter;
  private readonly now: () => Date;
  private readonly log: (event: Record<string, unknown>) => void;

  constructor(
    private readonly store: AcquisitionStore,
    private readonly options: WorkerOptions,
  ) {
    this.fetcher = options.fetcher ?? safeFetch;
    this.vet = options.vet ?? defaultVetter();
    this.now = options.now ?? (() => new Date());
    this.log = options.log ?? (() => {});
  }

  /** Claim and process one queued scan. Returns null when the queue is empty. */
  async runOnce(): Promise<ScanReport | null> {
    const scan = await this.store.claimNextScan(this.options.workerId);
    if (!scan) return null;
    return this.process(scan);
  }

  async process(scan: ClaimedScan): Promise<ScanReport> {
    const runId = await this.store.startRun(scan);
    this.log({ event: "scan.started", scanId: scan.scanId, runId, startUrl: scan.startUrl });
    const pages: PageResult[] = [];
    const pending = new Map<string, string>(); // targetId -> uri, for crash cleanup

    try {
      const report = await this.acquire(scan, runId, pages, pending);
      await this.store.finishRun(scan, runId, "succeeded", { ...report }, null);
      this.log({ event: "scan.finished", ...report });
      return report;
    } catch (err) {
      // Partial-state principle: keep what was acquired, say what was not.
      const detail = `Acquisition stopped unexpectedly: ${(err as Error).message}`;
      this.log({ event: "scan.error", scanId: scan.scanId, runId, detail });
      for (const [targetId, uri] of pending) {
        const resolution: TargetResolution = { status: "unavailable", failureClass: "internal", failureDetail: detail };
        await this.store.resolveTarget(scan, runId, targetId, resolution);
        pages.push({ uri, resolution, extraction: null, outcome: null, retrievedAt: this.now().toISOString() });
      }
      const report = await this.finish(scan, runId, pages, "internal", detail);
      await this.store.finishRun(scan, runId, "failed", { ...report }, detail);
      return report;
    }
  }

  private async acquire(scan: ClaimedScan, runId: string, pages: PageResult[], pending: Map<string, string>): Promise<ScanReport> {
    if (!scan.startUrl) {
      return this.finish(scan, runId, pages, "validation", "The scan has no website URL to read");
    }

    const startUrl = normaliseUrl(scan.startUrl) ?? scan.startUrl;
    const shape = checkUrlShape(startUrl);
    const robots = shape.safe ? await this.fetchRobots(scan, runId, startUrl) : NO_ROBOTS;

    const seen = new Set<string>();
    const first = await this.readPage(scan, runId, startUrl, robots, pending);
    pages.push(first);
    seen.add(startUrl);
    if (first.outcome?.kind === "ok") seen.add(normaliseUrl(first.outcome.finalUrl) ?? first.outcome.finalUrl);

    if (first.extraction && first.outcome?.kind === "ok") {
      const next = planTargets(first.outcome.finalUrl, first.extraction.links, scan.targetLimit - 1, seen);
      for (const uri of next) {
        await sleep(this.options.politenessDelayMs ?? 500);
        pages.push(await this.readPage(scan, runId, uri, robots, pending));
      }
    }

    const failure = pages.every((p) => p.resolution.status !== "acquired" && p.resolution.status !== "partially_acquired");
    return this.finish(
      scan,
      runId,
      pages,
      failure ? (first.resolution.failureClass ?? "acquisition") : null,
      failure ? `No page could be read: ${first.resolution.failureDetail ?? "unknown reason"}` : null,
    );
  }

  private async fetchRobots(scan: ClaimedScan, runId: string, startUrl: string): Promise<RobotsRules> {
    const robotsUrl = new URL("/robots.txt", startUrl).toString();
    const started = Date.now();
    const outcome = await this.fetcher(robotsUrl, {
      vet: this.vet,
      accept: "text/plain",
      timeoutMs: this.options.timeoutMs,
      maxBytes: 256 * 1024,
    });
    const rules = outcome.kind === "ok" ? parseRobots(outcome.body) : NO_ROBOTS;
    await this.store.recordToolCall(scan, runId, {
      tool: "safe_fetch.robots",
      capabilityKey: "web.read_public",
      permissionsUsed: ["web.read_public"],
      status: outcome.kind === "ok" ? "succeeded" : "failed",
      inputSummary: { url: robotsUrl },
      outputSummary: outcome.kind === "ok" ? { disallowRules: rules.disallow.length, allowRules: rules.allow.length } : null,
      errorDetail: outcome.kind === "ok" ? null : `robots.txt not read (${outcome.kind}); reading with no restrictions`,
      latencyMs: Date.now() - started,
    });
    return rules;
  }

  private async readPage(
    scan: ClaimedScan,
    runId: string,
    uri: string,
    robots: RobotsRules,
    pending: Map<string, string>,
  ): Promise<PageResult> {
    const sourceId = await this.store.ensureSource(scan, runId, uri);
    const targetId = await this.store.addTarget(scan, runId, uri, sourceId);
    pending.set(targetId, uri);
    const retrievedAt = this.now().toISOString();

    let outcome: FetchOutcome | null = null;
    let resolution: TargetResolution;
    let extraction: Extraction | null = null;
    const started = Date.now();

    const shape = checkUrlShape(uri);
    if (!shape.safe) {
      // refused before any fetcher sees it; the fetcher re-checks every hop anyway
      resolution = { status: "blocked", failureClass: "validation", failureDetail: `Not fetched: ${shape.detail}` };
    } else if (!isAllowed(robots, uri)) {
      resolution = { status: "blocked", failureClass: "permission", failureDetail: "Disallowed by the site's robots.txt" };
    } else {
      outcome = await this.fetcher(uri, { vet: this.vet, timeoutMs: this.options.timeoutMs, maxBytes: this.options.maxBytes });
      ({ resolution, extraction } = classifyFetch(outcome));
    }

    await this.store.recordToolCall(scan, runId, {
      tool: "safe_fetch",
      capabilityKey: "web.read_public",
      permissionsUsed: ["web.read_public"],
      status: resolution.status === "blocked" ? "denied" : outcome?.kind === "ok" ? "succeeded" : "failed",
      inputSummary: { url: uri },
      outputSummary: outcome?.kind === "ok" ? { finalUrl: outcome.finalUrl, status: outcome.status, bytes: outcome.bytes, truncated: outcome.truncated } : null,
      errorDetail: resolution.failureDetail && resolution.status !== "acquired" ? resolution.failureDetail : null,
      latencyMs: Date.now() - started,
    });

    await this.store.resolveTarget(scan, runId, targetId, resolution);
    pending.delete(targetId);
    await this.store.recordEvidence(scan, runId, this.evidenceFor(sourceId, targetId, uri, resolution, extraction, outcome, retrievedAt));
    this.log({ event: "target.resolved", scanId: scan.scanId, uri, status: resolution.status, detail: resolution.failureDetail ?? undefined });
    return { uri, resolution, extraction, outcome, retrievedAt };
  }

  private evidenceFor(
    sourceId: string,
    targetId: string,
    uri: string,
    resolution: TargetResolution,
    extraction: Extraction | null,
    outcome: FetchOutcome | null,
    retrievedAt: string,
  ): EvidenceDraft[] {
    if (!extraction || (resolution.status !== "acquired" && resolution.status !== "partially_acquired")) {
      return [
        {
          sourceId,
          scanTargetId: targetId,
          state: "unavailable",
          fact: null,
          missingDescription: `${uri} could not be read: ${resolution.failureDetail ?? resolution.status}`,
          excerpt: null,
          structuredValue: { status: resolution.status, httpStatus: resolution.httpStatus ?? null },
          contentLocation: null,
          retrievedAt: outcome ? retrievedAt : null,
          extractionStatus: "failed",
          confidence: null,
        },
      ];
    }
    const partial = resolution.status === "partially_acquired";
    const finalUrl = outcome?.kind === "ok" ? outcome.finalUrl : uri;
    return extraction.facts.map((f) => ({
      sourceId,
      scanTargetId: targetId,
      state: partial ? "partially_acquired" : "acquired",
      fact: f.fact,
      missingDescription: null,
      excerpt: f.excerpt,
      structuredValue: { ...(f.structuredValue ?? {}), kind: f.kind, finalUrl },
      contentLocation: f.contentLocation,
      retrievedAt,
      extractionStatus: partial ? "partial" : "complete",
      // how sure TEBOS is that it read this correctly — not whether it is true
      confidence: partial ? 0.6 : 0.9,
    }));
  }

  private async finish(
    scan: ClaimedScan,
    runId: string,
    pages: PageResult[],
    failureClass: FailureClass | null,
    failureDetail: string | null,
  ): Promise<ScanReport> {
    const targets: TargetResult[] = pages.map((p) => ({ uri: p.uri, status: p.resolution.status, failureDetail: p.resolution.failureDetail }));
    const derived = deriveScanOutcome(targets);
    // pending targets are always resolved before we get here
    const status = derived.status === "running" ? "partial" : derived.status;
    const { score, components } = scanConfidence(pages);
    const confidence = status === "failed" ? 0 : score;
    const completion: ScanCompletion = {
      status,
      confidence,
      confidenceComponents: { ...components, missing: derived.missing },
      failureClass: status === "failed" ? (failureClass ?? "acquisition") : null,
      failureDetail: status === "failed" ? failureDetail : status === "partial" ? `${derived.missing.length} target(s) not fully read` : null,
    };
    await this.store.finishScan(scan, runId, completion);
    return { scanId: scan.scanId, status, summary: summariseScan(targets, confidence), confidence };
  }
}
