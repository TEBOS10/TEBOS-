// Scan outcome derivation (dossier §25/§39/§44).
//
// A scan's final status is derived from what actually happened to its
// targets — never chosen by the caller. The database enforces the same rule
// (tebos_private.guard_scan_outcome), so a scan cannot be reported complete
// while evidence is missing, or failed while it holds acquired evidence.

import { formatConfidence } from "./confidence";
import type { ScanStatus, ScanTargetStatus } from "./states";

export interface TargetResult {
  uri: string;
  status: ScanTargetStatus;
  failureDetail?: string | null;
}

export type ScanOutcome =
  | { status: Extract<ScanStatus, "completed" | "partial" | "failed">; counts: TargetCounts; missing: string[] }
  | { status: "running"; counts: TargetCounts; missing: string[]; pending: string[] };

export interface TargetCounts {
  total: number;
  acquired: number;
  partiallyAcquired: number;
  unavailable: number;
  blocked: number;
  skipped: number;
  pending: number;
}

export function countTargets(targets: readonly TargetResult[]): TargetCounts {
  const n = (s: ScanTargetStatus) => targets.filter((t) => t.status === s).length;
  return {
    total: targets.length,
    acquired: n("acquired"),
    partiallyAcquired: n("partially_acquired"),
    unavailable: n("unavailable"),
    blocked: n("blocked"),
    skipped: n("skipped"),
    pending: n("pending"),
  };
}

export function deriveScanOutcome(targets: readonly TargetResult[]): ScanOutcome {
  const counts = countTargets(targets);
  const missing = targets
    .filter((t) => t.status !== "acquired" && t.status !== "pending")
    .map((t) => (t.failureDetail ? `${t.uri} — ${t.status}: ${t.failureDetail}` : `${t.uri} — ${t.status}`));

  if (counts.pending > 0) {
    return { status: "running", counts, missing, pending: targets.filter((t) => t.status === "pending").map((t) => t.uri) };
  }
  if (counts.total > 0 && counts.acquired === counts.total) return { status: "completed", counts, missing };
  if (counts.acquired + counts.partiallyAcquired > 0) return { status: "partial", counts, missing };
  return { status: "failed", counts, missing };
}

/** e.g. "7 targets scanned · 5 acquired · 2 unavailable · confidence 78%" */
export function summariseScan(targets: readonly TargetResult[], confidence: number | null): string {
  const c = countTargets(targets);
  const parts = [`${c.total} target${c.total === 1 ? "" : "s"} scanned`, `${c.acquired} acquired`];
  if (c.partiallyAcquired) parts.push(`${c.partiallyAcquired} partial`);
  if (c.unavailable) parts.push(`${c.unavailable} unavailable`);
  if (c.blocked) parts.push(`${c.blocked} blocked`);
  if (c.skipped) parts.push(`${c.skipped} skipped`);
  if (c.pending) parts.push(`${c.pending} pending`);
  parts.push(formatConfidence(confidence));
  return parts.join(" · ");
}
