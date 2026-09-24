// In-memory AcquisitionStore that enforces the same transition rules the
// database does, so worker tests fail if the worker tries anything the
// schema would reject.
import { deriveScanOutcome } from "../../src/domain/scan";
import { canTransition, INITIAL } from "../../src/domain/states";
import type {
  AcquisitionStore,
  ClaimedScan,
  EvidenceDraft,
  ScanCompletion,
  TargetResolution,
  ToolCallRecord,
} from "../../src/acquisition/worker";

export interface MemTarget extends Partial<Omit<TargetResolution, "status">> {
  id: string;
  uri: string;
  sourceId: string;
  status: TargetResolution["status"] | "pending";
}

export class MemoryStore implements AcquisitionStore {
  queue: ClaimedScan[] = [];
  scanStatus = new Map<string, string>();
  completions = new Map<string, ScanCompletion>();
  sources = new Map<string, string>();
  targets: MemTarget[] = [];
  evidence: EvidenceDraft[] = [];
  toolCalls: ToolCallRecord[] = [];
  runs = new Map<string, { status: string; output?: Record<string, unknown>; error?: string | null }>();
  private seq = 0;
  private id = (p: string) => `${p}-${++this.seq}`;

  enqueue(scan: ClaimedScan) {
    this.queue.push(scan);
    this.scanStatus.set(scan.scanId, "queued");
  }

  async claimNextScan() {
    const scan = this.queue.shift() ?? null;
    if (scan) this.transitionScan(scan.scanId, "running");
    return scan;
  }

  private transitionScan(id: string, to: string) {
    const from = this.scanStatus.get(id) ?? INITIAL;
    if (!canTransition("scan", from as never, to as never)) throw new Error(`illegal scan transition ${from} -> ${to}`);
    this.scanStatus.set(id, to);
  }

  async startRun() {
    const id = this.id("run");
    this.runs.set(id, { status: "running" });
    return id;
  }
  async finishRun(_s: ClaimedScan, runId: string, status: string, output: Record<string, unknown>, error: string | null) {
    this.runs.set(runId, { status, output, error });
  }
  async recordToolCall(_s: ClaimedScan, _r: string, call: ToolCallRecord) {
    if (call.status !== "succeeded" && !call.errorDetail) throw new Error("tool call failure without error_detail");
    this.toolCalls.push(call);
  }
  async ensureSource(_s: ClaimedScan, _r: string, uri: string) {
    if (!this.sources.has(uri)) this.sources.set(uri, this.id("src"));
    return this.sources.get(uri)!;
  }
  async addTarget(scan: ClaimedScan, _r: string, uri: string, sourceId: string) {
    if (this.scanStatus.get(scan.scanId) !== "running") throw new Error("targets can only be added to a running scan");
    if (this.targets.some((t) => t.uri === uri)) throw new Error(`duplicate target ${uri}`);
    const id = this.id("tgt");
    this.targets.push({ id, uri, sourceId, status: "pending" });
    return id;
  }
  async resolveTarget(_s: ClaimedScan, _r: string, targetId: string, r: TargetResolution) {
    const t = this.targets.find((x) => x.id === targetId)!;
    if (!canTransition("scan_target", t.status as never, r.status as never)) throw new Error(`illegal target transition ${t.status} -> ${r.status}`);
    if ((r.status === "unavailable" || r.status === "blocked") && !r.failureClass) throw new Error("unavailable target without failure class");
    Object.assign(t, r);
  }
  async recordEvidence(_s: ClaimedScan, _r: string, items: EvidenceDraft[]) {
    for (const e of items) {
      if ((e.state === "unavailable") !== (e.fact === null)) throw new Error("evidence fact/state mismatch");
      if (e.state === "unavailable" && !e.missingDescription) throw new Error("unavailable evidence must say what is missing");
      if (e.state !== "unavailable" && (!e.retrievedAt || !e.excerpt)) throw new Error("acquired evidence needs retrievedAt and excerpt");
    }
    this.evidence.push(...items);
  }
  async finishScan(scan: ClaimedScan, _r: string, c: ScanCompletion) {
    const derived = deriveScanOutcome(this.targets.map((t) => ({ uri: t.uri, status: t.status })));
    if (derived.status !== c.status) throw new Error(`scan reported ${c.status} but targets say ${derived.status}`);
    if (c.status === "failed" && !c.failureClass) throw new Error("failed scan without failure class");
    this.transitionScan(scan.scanId, c.status);
    this.completions.set(scan.scanId, c);
  }
}
