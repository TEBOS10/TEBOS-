import { Download, Printer } from "lucide-react";
import type { ReactNode } from "react";
import { Card, Empty, ErrorNote, Loading, PageHeader, StatusBadge } from "../components/ui";
import { downloadCsv, toCsv } from "../lib/csv";
import { businessReport } from "../lib/data";
import { pct, RISK_LABEL, statusLabel, when } from "../lib/format";
import { usePeople } from "../lib/people";
import { Link } from "../lib/router";
import { useOrg } from "../lib/session";
import { useQuery } from "../lib/useQuery";

type Report = NonNullable<Awaited<ReturnType<typeof businessReport>>>;

/** Evidence states that mean something was actually read. */
const OBTAINED = ["acquired", "partially_acquired"];

/**
 * A business report (dossier §26): everything recorded about one business,
 * with each statement labelled for what it is — observed fact, interpretation,
 * hypothesis, recommendation or user statement — and a section for what could
 * not be read. Nothing here is generated for the report; it is the record.
 */
export function ReportPage({ id }: { id: string }) {
  const org = useOrg();
  const people = usePeople();
  const q = useQuery(() => businessReport(org.db, id), [id]);
  if (q.loading && !q.data) return <Loading label="Assembling the report" />;
  if (q.error) return <ErrorNote error={q.error} title="Couldn't assemble the report" />;
  if (!q.data) return <PageHeader title="Business not found">It doesn't exist, or it belongs to another organisation.</PageHeader>;
  const r = q.data;
  const facts = r.evidence.filter((e) => OBTAINED.includes(e.state) && e.fact);
  const unread = r.targets.filter((t) => t.status !== "acquired");
  const missing = r.evidence.filter((e) => !OBTAINED.includes(e.state));
  const openQuestions = [...new Set(r.activeFindings.flatMap((f) => f.missing_information))];
  const sourceUri = (sourceId: string) => r.sources.find((s) => s.id === sourceId)?.uri ?? "";
  const slug = r.business.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "business";

  return (
    <div className="stack report">
      <PageHeader
        eyebrow={
          <>
            <Link to={`/businesses/${r.business.id}`}>{r.business.name}</Link> · Report
          </>
        }
        title={`${r.business.name}: business report`}
        actions={
          <div className="row no-print">
            <button className="btn" onClick={() => window.print()}>
              <Printer size={15} aria-hidden /> Print or save as PDF
            </button>
          </div>
        }
      >
        <span>Prepared {when(new Date().toISOString())} from the record for {org.organisation.name}</span>
      </PageHeader>

      <Card title="How to read this report">
        <p className="muted">Every statement is labelled for what it is. Only an observed fact was read from a source; everything else is a reading of those facts, a guess to confirm, a proposal, or something someone told TEBOS.</p>
        <div className="row" style={{ marginTop: 10, flexWrap: "wrap" }}>
          <Label kind="fact" /> <Label kind="interpretation" /> <Label kind="hypothesis" /> <Label kind="recommendation" /> <Label kind="user" />
        </div>
      </Card>

      <Card title="Scope">
        <dl className="confidence-parts">
          <Row k="Website">{r.business.website ?? "Not recorded"}</Row>
          <Row k="Industry">{r.business.industry ?? "Not recorded"}</Row>
          <Row k="Latest scan">
            {r.latestScan ? (
              <>
                <StatusBadge status={r.latestScan.status} /> {when(r.latestScan.finished_at ?? r.latestScan.created_at)} · confidence {pct(r.latestScan.confidence)} ·{" "}
                {r.targets.length} targets, {r.targets.length - unread.length} read
              </>
            ) : (
              "No completed scan yet. Findings below, if any, rest on earlier evidence."
            )}
          </Row>
        </dl>
      </Card>

      <Section title="What TEBOS observed" kind="fact" count={facts.length} empty="Nothing has been read from a source yet." csv={() => downloadCsv(`${slug}-evidence.csv`, evidenceCsv(r, sourceUri))} csvLabel="Evidence CSV">
        <ul className="list">
          {facts.map((e) => (
            <li key={e.id}>
              <div className="list-main">
                <span>{e.fact}</span>
                <span className="list-meta mono wrap">
                  {sourceUri(e.source_id)} · {statusLabel(e.state)} · retrieved {when(e.retrieved_at)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="What TEBOS concluded"
        kind="interpretation"
        count={r.activeFindings.length}
        empty="No active findings."
        csv={() => downloadCsv(`${slug}-findings.csv`, findingsCsv(r))}
        csvLabel="Findings CSV"
      >
        <ul className="list">
          {r.activeFindings.map((f) => {
            const cited = r.links.filter((l) => l.finding_id === f.id);
            return (
              <li key={f.id}>
                <div className="list-main">
                  <span className="row" style={{ gap: 8 }}>
                    <Label kind={f.kind === "hypothesis" ? "hypothesis" : "interpretation"} />
                    <Link to={`/findings/${f.id}`} className="list-title">
                      {f.title}
                    </Link>
                  </span>
                  <span>{f.statement}</span>
                  {f.impact_hypothesis && (
                    <span className="list-meta">
                      <Label kind="hypothesis" /> Why it could matter: {f.impact_hypothesis}
                    </span>
                  )}
                  <span className="list-meta">
                    confidence {pct(f.confidence)} · rests on {cited.filter((l) => l.relation === "supports").length} piece(s) of evidence
                    {cited.some((l) => l.relation === "contradicts") ? `, ${cited.filter((l) => l.relation === "contradicts").length} against` : ""}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="What TEBOS recommends" kind="recommendation" count={r.actions.length} empty="No actions proposed." csv={() => downloadCsv(`${slug}-actions.csv`, actionsCsv(r))} csvLabel="Actions CSV">
        <ul className="list">
          {r.actions.map((a) => {
            const outcomes = r.outcomes.filter((o) => o.action_id === a.id);
            return (
              <li key={a.id}>
                <div className="list-main">
                  <Link to={`/actions/${a.id}`} className="list-title">
                    {a.title}
                  </Link>
                  <span className="list-meta">
                    {RISK_LABEL[a.risk_tier]} · owner {a.owner_user_id ? people.nameOf(a.owner_user_id) : "none"}
                  </span>
                  {outcomes.map((o) => (
                    <span className="list-meta" key={o.id}>
                      Outcome · {o.metric}: {o.baseline_value ?? "?"} → {o.observed_value ?? "not yet observed"} {o.unit ?? ""} ·{" "}
                      {o.verified_at ? <strong>verified ({o.verification_method})</strong> : "not verified"}
                    </span>
                  ))}
                </div>
                <StatusBadge status={a.status} />
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="What you told TEBOS" kind="user" count={r.contexts.length} empty="No context has been added.">
        <ul className="list">
          {r.contexts.map((c) => (
            <li key={c.id}>
              <div className="list-main">
                <span>{c.statement}</span>
                <span className="list-meta">
                  {statusLabel(c.kind)} · {c.supplied_by ? people.nameOf(c.supplied_by) : "unknown"} · {when(c.created_at)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Card title="What TEBOS could not read" subtitle="Gaps in the record. Conclusions above do not rest on any of this.">
        {unread.length === 0 && missing.length === 0 && openQuestions.length === 0 ? (
          <Empty>No recorded gaps.</Empty>
        ) : (
          <ul className="list">
            {unread.map((t) => (
              <li key={t.id}>
                <div className="list-main">
                  <span className="mono wrap">{t.uri}</span>
                  <span className="list-meta">
                    {statusLabel(t.status)}
                    {t.failure_class ? ` · ${statusLabel(t.failure_class)}` : ""}
                    {t.failure_detail ? ` · ${t.failure_detail}` : ""}
                  </span>
                </div>
              </li>
            ))}
            {missing.map((e) => (
              <li key={e.id}>
                <div className="list-main">
                  <span>{e.missing_description ?? e.fact ?? "Not obtained"}</span>
                  <span className="list-meta">{statusLabel(e.state)}</span>
                </div>
              </li>
            ))}
            {openQuestions.map((m) => (
              <li key={m}>
                <div className="list-main">
                  <span>{m}</span>
                  <span className="list-meta">Information a finding says is missing</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

const LABELS = {
  fact: { text: "Observed fact", cls: "label-fact" },
  interpretation: { text: "Interpretation", cls: "label-interpretation" },
  hypothesis: { text: "Hypothesis", cls: "label-hypothesis" },
  recommendation: { text: "Recommendation", cls: "label-recommendation" },
  user: { text: "User statement", cls: "label-user" },
} as const;

function Label({ kind }: { kind: keyof typeof LABELS }) {
  return <span className={`kind-label ${LABELS[kind].cls}`}>{LABELS[kind].text}</span>;
}

function Section({ title, kind, count, empty, csv, csvLabel, children }: { title: string; kind: keyof typeof LABELS; count: number; empty: string; csv?: () => void; csvLabel?: string; children: ReactNode }) {
  return (
    <Card
      title={
        <span className="row" style={{ gap: 8 }}>
          {title} <Label kind={kind} />
        </span>
      }
      actions={
        csv && count > 0 ? (
          <button className="btn btn-sm no-print" onClick={csv}>
            <Download size={14} aria-hidden /> {csvLabel}
          </button>
        ) : undefined
      }
    >
      {count === 0 ? <Empty>{empty}</Empty> : children}
    </Card>
  );
}

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div>
      <dt>{k}</dt>
      <dd style={{ display: "block" }}>{children}</dd>
    </div>
  );
}

export function evidenceCsv(r: Pick<Report, "evidence">, sourceUri: (id: string) => string) {
  return toCsv(
    ["evidence_id", "label", "state", "fact", "excerpt", "source", "location", "retrieved_at", "missing"],
    r.evidence.map((e) => [e.id, OBTAINED.includes(e.state) ? "observed fact" : "not obtained", e.state, e.fact, e.excerpt, sourceUri(e.source_id), e.content_location, e.retrieved_at, e.missing_description]),
  );
}

export function findingsCsv(r: Pick<Report, "activeFindings" | "links">) {
  return toCsv(
    ["finding_id", "label", "category", "title", "statement", "why_it_could_matter", "confidence", "supporting_evidence_ids", "contradicting_evidence_ids", "missing_information"],
    r.activeFindings.map((f) => {
      const ids = (rel: string) => r.links.filter((l) => l.finding_id === f.id && l.relation === rel).map((l) => l.evidence_id).join(" ");
      return [f.id, f.kind, f.category, f.title, f.statement, f.impact_hypothesis, f.confidence, ids("supports"), ids("contradicts"), f.missing_information.join("; ")];
    }),
  );
}

export function actionsCsv(r: Pick<Report, "actions" | "outcomes">) {
  return toCsv(
    ["action_id", "label", "title", "status", "risk_tier", "finding_id", "outcome_metric", "baseline", "observed", "unit", "outcome_verified_by"],
    r.actions.flatMap((a) => {
      const outcomes = r.outcomes.filter((o) => o.action_id === a.id);
      const base = [a.id, "recommendation", a.title, a.status, a.risk_tier, a.finding_id];
      if (outcomes.length === 0) return [[...base, null, null, null, null, null]];
      return outcomes.map((o) => [...base, o.metric, o.baseline_value, o.observed_value, o.unit, o.verified_at ? o.verification_method : null]);
    }),
  );
}
