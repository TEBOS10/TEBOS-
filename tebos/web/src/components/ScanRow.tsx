import { summariseScan } from "@core/scan";
import type { ScanTargetStatus } from "@core/states";
import { ago } from "../lib/format";
import { Link } from "../lib/router";
import { StatusBadge } from "./ui";

export interface ScanRowData {
  scan: { id: string; status: string; confidence: number | null; created_at: string; objective: string | null; scope: unknown };
  business: { name: string } | null;
  targets: Array<{ uri: string; status: string; failure_detail: string | null }>;
}

/** One scan in a list: what was asked, what happened, how sure TEBOS is. */
export function ScanRow({ scan, business, targets }: ScanRowData) {
  const url = (scan.scope as { url?: string } | null)?.url;
  const waiting = scan.status === "queued" || scan.status === "running";
  const summary =
    targets.length > 0
      ? summariseScan(
          targets.map((t) => ({ uri: t.uri, status: t.status as ScanTargetStatus, failureDetail: t.failure_detail })),
          waiting ? null : scan.confidence === null ? null : Number(scan.confidence),
        )
      : waiting
        ? "waiting for the acquisition worker"
        : "no pages were attempted";
  return (
    <li>
      <div className="list-main">
        <Link to={`/scans/${scan.id}`} className="list-title">
          {business?.name ?? url ?? "Scan"}
        </Link>
        <span className="list-meta">
          {ago(scan.created_at)} · {summary}
        </span>
        {scan.objective && <span className="list-meta">Objective: {scan.objective}</span>}
      </div>
      <StatusBadge status={scan.status} />
    </li>
  );
}
