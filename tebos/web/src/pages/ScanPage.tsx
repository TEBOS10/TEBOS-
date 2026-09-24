import { summariseScan } from "@core/scan";
import type { ScanTargetStatus } from "@core/states";
import { ExternalLink } from "lucide-react";
import { Badge, Card, ConfidencePanel, Empty, ErrorNote, Loading, PageHeader, StatusBadge } from "../components/ui";
import { getScan, type Evidence } from "../lib/data";
import { ago, pct, statusLabel, when } from "../lib/format";
import { Link } from "../lib/router";
import { useOrg } from "../lib/session";
import { useQuery } from "../lib/useQuery";

const WAITING = new Set(["queued", "running"]);

export function ScanPage({ id }: { id: string }) {
  const { db } = useOrg();
  const q = useQuery(() => getScan(db, id), [id], {
    pollMs: 5000,
    // keep refreshing while pages are being read or findings are still to come
    keepPolling: (d) => !!d && (WAITING.has(d.scan.status) || (d.scan.status !== "failed" && d.scan.status !== "cancelled" && !d.runs.some((r) => r.agent_role === "business_intelligence" && r.status !== "running"))),
  });
  if (q.loading && !q.data) return <Loading />;
  if (q.error) return <ErrorNote error={q.error} title="Couldn't load this scan" />;
  if (!q.data) return <PageHeader title="Scan not found">It doesn't exist, or it belongs to another organisation.</PageHeader>;

  const { scan, business, targets, evidence, findings, runs, sources } = q.data;
  const url = (scan.scope as { url?: string } | null)?.url ?? business.website;
  const waiting = WAITING.has(scan.status);
  const summary = targets.length
    ? summariseScan(targets.map((t) => ({ uri: t.uri, status: t.status as ScanTargetStatus, failureDetail: t.failure_detail })), waiting ? null : scan.confidence)
    : null;
  const analysis = runs.filter((r) => r.agent_role === "business_intelligence").at(-1);

  return (
    <div className="stack">
      <PageHeader
        eyebrow={<Link to={`/businesses/${business.id}`}>{business.name}</Link>}
        title={
          <span className="row">
            Scan of {url ? new URL(url).hostname : business.name} <StatusBadge status={scan.status} />
          </span>
        }
      >
        <span>Requested {when(scan.created_at)}</span>
        {scan.objective && <span>· Objective: {scan.objective}</span>}
      </PageHeader>

      {waiting && (
        <div className="note note-info" role="status">
          {scan.status === "queued"
            ? "Queued. The acquisition worker will pick this scan up; this page refreshes on its own."
            : "Reading the site now. Pages appear below as each one is resolved."}
        </div>
      )}
      {scan.status === "failed" && (
        <div className="note note-bad" role="status">
          <div>
            <strong>No page could be read.</strong> {scan.failure_detail}
          </div>
        </div>
      )}
      {scan.status === "partial" && (
        <div className="note note-warn" role="status">
          <div>
            <strong>Partial.</strong> Some pages couldn't be read. TEBOS kept everything it did read and lists what is missing below.
          </div>
        </div>
      )}

      <div className="grid grid-main">
        <div className="stack">
          <Card title="Pages" subtitle={summary ?? "No pages attempted yet"}>
            {targets.length === 0 ? (
              <Empty>{waiting ? "Waiting for the first page…" : "No pages were attempted."}</Empty>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Page</th>
                    <th>Outcome</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {targets.map((t) => (
                    <tr key={t.id}>
                      <td className="wrap mono">
                        <a href={t.uri} target="_blank" rel="noreferrer noopener">
                          {t.uri}
                        </a>
                      </td>
                      <td>
                        <StatusBadge status={t.status} />
                      </td>
                      <td className="wrap muted">{t.failure_detail ?? (t.http_status ? `HTTP ${t.http_status}` : "")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card title="Evidence" subtitle={evidenceLine(evidence)}>
            {evidence.length === 0 ? <Empty>No evidence recorded yet.</Empty> : <EvidenceByPage evidence={evidence} targets={targets} sources={sources} />}
          </Card>
        </div>

        <div className="stack">
          <Card title="Confidence">
            {waiting ? <Empty>Assessed when reading finishes.</Empty> : <ConfidencePanel score={scan.confidence} components={scan.confidence_components} />}
          </Card>
          <Card title="Findings" subtitle={analysisLine(analysis)}>
            {findings.length === 0 ? (
              <Empty>{analysis?.status === "running" ? "Interpreting the evidence…" : "No findings from this scan."}</Empty>
            ) : (
              <ul className="list">
                {findings.map((f) => (
                  <li key={f.id}>
                    <div className="list-main">
                      <Link to={`/findings/${f.id}`} className="list-title">
                        {f.title}
                      </Link>
                      <span className="list-meta">
                        {statusLabel(f.category)} · {pct(f.confidence)} confidence
                      </span>
                    </div>
                    <StatusBadge status={f.kind} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Agent runs" subtitle="Who did what for this scan">
            {runs.length === 0 ? (
              <Empty>None yet.</Empty>
            ) : (
              <ul className="list">
                {runs.map((r) => (
                  <li key={r.id}>
                    <div className="list-main">
                      <span className="list-title">{r.agent_role === "acquisition" ? "Acquisition" : r.agent_role === "business_intelligence" ? "Business intelligence" : statusLabel(r.agent_role)}</span>
                      <span className="list-meta">
                        {ago(r.started_at)}
                        {r.model ? ` · ${r.model}` : ""}
                        {r.tokens_in ? ` · ${r.tokens_in.toLocaleString()} in / ${(r.tokens_out ?? 0).toLocaleString()} out tokens` : ""}
                      </span>
                      {r.error_detail && <span className="list-meta" style={{ color: "var(--bad-fg)" }}>{r.error_detail}</span>}
                    </div>
                    <StatusBadge status={r.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function evidenceLine(evidence: Evidence[]): string {
  const facts = evidence.filter((e) => e.fact).length;
  const missing = evidence.length - facts;
  return `${facts} observed fact${facts === 1 ? "" : "s"} · ${missing} page${missing === 1 ? "" : "s"} not obtained`;
}

function analysisLine(run: { status: string; output_summary: unknown } | undefined): string {
  if (!run) return "Not analysed yet";
  const out = (run.output_summary ?? {}) as { rejected?: unknown[] };
  if (run.status === "running") return "Analysis in progress";
  if (run.status === "failed") return "The last analysis attempt failed";
  const rejected = Array.isArray(out.rejected) ? out.rejected.length : 0;
  return rejected ? `${rejected} proposed finding${rejected === 1 ? " was" : "s were"} rejected for lack of evidence` : "Every finding cites obtained evidence";
}

export function EvidenceItem({ e, sourceUri }: { e: Evidence; sourceUri?: string | null }) {
  const missing = !e.fact;
  return (
    <div className={`evidence ${missing ? "missing" : ""}`}>
      {missing ? (
        <div className="evidence-fact">
          <Badge tone="warn">not obtained</Badge> {e.missing_description}
        </div>
      ) : (
        <div className="evidence-fact">{e.fact}</div>
      )}
      {e.excerpt && <div className="excerpt">{e.excerpt}</div>}
      <div className="evidence-meta">
        {sourceUri && (
          <a href={sourceUri} target="_blank" rel="noreferrer noopener" className="row">
            {sourceUri} <ExternalLink size={11} aria-hidden />
          </a>
        )}
        {e.content_location && <span className="mono">@ {e.content_location}</span>}
        {e.retrieved_at && <span>retrieved {when(e.retrieved_at)}</span>}
        {e.state !== "acquired" && !missing && <Badge tone="warn">{statusLabel(e.state)}</Badge>}
      </div>
    </div>
  );
}

function EvidenceByPage({ evidence, targets, sources }: { evidence: Evidence[]; targets: Array<{ id: string; uri: string }>; sources: Array<{ id: string; uri: string | null }> }) {
  const groups = targets
    .map((t) => ({ uri: t.uri, items: evidence.filter((e) => e.scan_target_id === t.id) }))
    .filter((g) => g.items.length > 0);
  const loose = evidence.filter((e) => !targets.some((t) => t.id === e.scan_target_id));
  return (
    <div className="stack">
      {groups.map((g) => (
        <div key={g.uri} className="stack" style={{ gap: 8 }}>
          <div className="mono faint">{g.uri}</div>
          {g.items.map((e) => (
            <EvidenceItem key={e.id} e={e} />
          ))}
        </div>
      ))}
      {loose.map((e) => (
        <EvidenceItem key={e.id} e={e} sourceUri={sources.find((s) => s.id === e.source_id)?.uri} />
      ))}
    </div>
  );
}
