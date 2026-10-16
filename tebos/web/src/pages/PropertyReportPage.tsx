// The Property Opportunity Assessment: generated from the case's stored
// records by @core/property's composeAssessment. Verified facts, the owner's
// statements, estimates and recommendations are kept in separate sections.
// Print or save as PDF from the browser; the structured case exports as JSON,
// and the evidence register and figures as CSV (safe against formula injection).
import { BASES, CONFIDENCE, EVIDENCE_CATEGORIES, FIGURES, money, PATHWAYS, SPECIALISTS, type Basis, type EvidenceCategory, type FigureKey, type Metric, type PathwayKey } from "@core/property";
import { ErrorNote, Loading } from "../components/ui";
import { toCsv, downloadCsv } from "../lib/csv";
import { getPropertyCase } from "../lib/data";
import { when } from "../lib/format";
import { assess, caseExport } from "../lib/property";
import { Link } from "../lib/router";
import { useOrg } from "../lib/session";
import { useQuery } from "../lib/useQuery";
import { downloadJson } from "./PropertyPage";

const fmt = (m: Metric, kind: "money" | "percent" | "months" = "money") =>
  m.value === null ? "Not established" : kind === "money" ? money(m.value) : kind === "percent" ? `${m.value.toFixed(1)}%` : `${m.value.toFixed(1)} months`;
const basisOf = (m: Metric) => (m.value === null ? (m.missing.length ? `missing ${m.missing.map((k) => FIGURES[k].label.toLowerCase()).join(", ")}` : "undefined for these figures") : m.basis ? BASES[m.basis] : "");

export function PropertyReportPage({ id }: { id: string }) {
  const org = useOrg();
  const q = useQuery(() => getPropertyCase(org.db, id), [id]);
  if (q.loading && !q.data) return <div className="pra"><Loading /></div>;
  if (q.error) return <div className="pra"><ErrorNote error={q.error} title="Couldn't load the case" /></div>;
  if (!q.data) return <div className="pra"><h1>Case not found</h1></div>;
  const data = q.data;
  const r = assess(data);
  const e = r.economics;
  const stamp = r.meta.generatedAt.slice(0, 10);

  const exportJson = () => downloadJson(`${r.meta.ref}-case-${stamp}.json`, caseExport(data));
  const exportCsv = () => {
    downloadCsv(`${r.meta.ref}-evidence-${stamp}.csv`, toCsv(
      ["Category", "Title", "Status", "Confidence", "Source", "Period from", "Period to", "Received", "Responsible", "Document reference", "Notes", "Follow-up"],
      data.evidence.map((x) => [EVIDENCE_CATEGORIES[x.category as EvidenceCategory] ?? x.category, x.title, x.status, x.confidence, x.source, x.period_start, x.period_end, x.received_on, x.responsible, x.document_ref, x.notes, x.follow_up]),
    ));
    downloadCsv(`${r.meta.ref}-figures-${stamp}.csv`, toCsv(
      ["Figure", "Monthly value", "Basis", "As of"],
      data.figures.map((f) => [FIGURES[f.key as FigureKey]?.label ?? f.key, Number(f.value), BASES[f.basis as Basis], f.as_of]),
    ));
  };

  const Facts = ({ title, lines, empty }: { title: string; lines: typeof r.verified; empty: string }) => (
    <section className="pra-report-section">
      <h2>{title}</h2>
      {lines.length === 0 ? <p className="pra-empty">{empty}</p> : (
        <table className="pra-table"><tbody>{lines.map((l) => <tr key={l.label}><td>{l.label}</td><td className="num">{l.value}</td><td>as of {l.asOf}</td></tr>)}</tbody></table>
      )}
    </section>
  );

  return (
    <div className="pra pra-report" data-testid="property-report">
      <div className="pra-actions no-print">
        <Link to={`/property/${data.case.id}`} className="pra-btn ghost">Back to the case</Link>
        <button type="button" className="pra-btn" onClick={exportJson}>Export case JSON</button>
        <button type="button" className="pra-btn" onClick={exportCsv}>Export CSV</button>
        <button type="button" className="pra-btn primary" onClick={() => window.print()}>Print / Save PDF</button>
      </div>

      <header className="pra-report-head">
        <div className="pra-eyebrow">Tidy Enterprise · Property Revenue Architecture</div>
        <h1>{r.meta.title}</h1>
        <p className="pra-sub">{data.case.label}</p>
        <p className="pra-note">Report date {when(r.meta.generatedAt)} · version {when(r.meta.version)} (the case's last change)</p>
        <p className="pra-confidential">{r.meta.confidentiality}</p>
      </header>

      <section className="pra-report-section"><h2>Executive assessment</h2><ul>{r.executive.map((x) => <li key={x}>{x}</li>)}</ul></section>

      <Facts title="Verified facts" lines={r.verified} empty="No figure has been verified against checked evidence yet." />
      <Facts title="Owner-reported statements" lines={r.ownerReported} empty="None recorded." />
      <Facts title="Estimates" lines={r.estimates} empty="None recorded." />

      <section className="pra-report-section"><h2>Unknowns</h2>{r.unknowns.length ? <ul>{r.unknowns.map((x) => <li key={x}>{x}</li>)}</ul> : <p>Every figure and material item is accounted for.</p>}</section>

      <section className="pra-report-section">
        <h2>Source quality</h2>
        <p>Evidence readiness <strong>{r.sourceQuality.percent}%</strong>, weighted by how material each item is: {r.sourceQuality.checked} of {r.sourceQuality.total} material items checked and current.</p>
        {r.sourceQuality.conflicting.length > 0 && <p>Conflicting: {r.sourceQuality.conflicting.map((x) => x.title).join(", ")}.</p>}
        {r.sourceQuality.stale.length > 0 && <p>Stale: {r.sourceQuality.stale.map((x) => x.title).join(", ")}.</p>}
        <table className="pra-table">
          <thead><tr><th>Evidence</th><th>Status</th><th>Source</th><th>Period to</th></tr></thead>
          <tbody>{data.evidence.length === 0 ? <tr><td colSpan={4}>No evidence recorded.</td></tr> : data.evidence.map((x) => (
            <tr key={x.id}><td>{x.title}</td><td>{x.status}{x.confidence && CONFIDENCE.includes(x.confidence as never) ? ` · ${x.confidence}` : ""}</td><td>{x.source ?? "—"}</td><td>{x.period_end ?? "—"}</td></tr>
          ))}</tbody>
        </table>
      </section>

      <section className="pra-report-section">
        <h2>Baseline economics (monthly)</h2>
        <table className="pra-table">
          <thead><tr><th>Indicator</th><th className="num">Value</th><th>Basis</th><th>Formula</th></tr></thead>
          <tbody>
            {([["Effective income", e.effectiveIncome, "money"], ["Collection shortfall", e.collectionShortfall, "money"], ["Net operating income", e.noi, "money"],
              ["Cash flow after debt and reserve", e.cashFlow, "money"], ["Rent collection rate", e.collectionRate, "percent"], ["Physical occupancy", e.occupancy, "percent"],
              ["Operating expense ratio", e.expenseRatio, "percent"], ["Break-even occupancy", e.breakEvenOccupancy, "percent"]] as const).map(([label, m, kind]) => (
              <tr key={label}><td>{label}</td><td className="num">{fmt(m, kind)}</td><td>{basisOf(m)}</td><td>{m.formula}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="pra-note">Annual: effective income {e.annual.effectiveIncome === null ? "not established" : money(e.annual.effectiveIncome)}, NOI {e.annual.noi === null ? "not established" : money(e.annual.noi)}, cash flow {e.annual.cashFlow === null ? "not established" : money(e.annual.cashFlow)}. Tax, timing and one-off capital costs are treated separately.</p>
        {e.warnings.length > 0 && <div className="pra-notice">{e.warnings.map((w) => <p key={w}>{w}</p>)}</div>}
      </section>

      <section className="pra-report-section"><h2>Root-cause hypotheses</h2><ul>{r.rootCause.map((x) => <li key={x}>{x}</li>)}</ul></section>

      <section className="pra-report-section">
        <h2>Scenarios</h2>
        <table className="pra-table"><tbody>
          <tr><td>Base case</td><td className="num">{fmt(e.scenarios.base)}</td><td>{basisOf(e.scenarios.base)}</td></tr>
          <tr><td>Optimisation case (estimate)</td><td className="num">{fmt(e.scenarios.optimisation)}</td><td>{basisOf(e.scenarios.optimisation)}</td></tr>
          <tr><td>Downside case (stress test)</td><td className="num">{fmt(e.scenarios.downside)}</td><td>{basisOf(e.scenarios.downside)}</td></tr>
          <tr><td>Simple payback</td><td className="num">{fmt(e.scenarios.payback, "months")}</td><td>{basisOf(e.scenarios.payback)}</td></tr>
          <tr><td>One-off capital need</td><td className="num">{fmt(e.oneOffCapex)}</td><td>{basisOf(e.oneOffCapex)}</td></tr>
        </tbody></table>
      </section>

      <section className="pra-report-section">
        <h2>Pathway comparison</h2>
        {r.pathways.length === 0 ? <p className="pra-empty">No pathway assessed yet.</p> : (
          <table className="pra-table">
            <thead><tr><th>Pathway</th><th>Status</th><th>Rationale</th><th>Risks</th><th>Specialists</th></tr></thead>
            <tbody>{r.pathways.map((p) => (
              <tr key={p.pathway}><td>{PATHWAYS[p.pathway as PathwayKey].label}</td><td>{p.status}</td><td>{p.rationale ?? "—"}</td><td>{p.risks ?? "—"}</td><td>{p.specialists.map((s) => SPECIALISTS[s]).join(", ") || "—"}</td></tr>
            ))}</tbody>
          </table>
        )}
      </section>

      <section className="pra-report-section">
        <h2>Recommendation</h2>
        {!r.recommendation ? <p>No pathway is recommended yet: the evidence doesn't yet support one.</p> : (
          <dl className="pra-dl">
            <dt>Recommended pathway</dt><dd>{PATHWAYS[r.recommendation.pathway].label}</dd>
            <dt>Rationale</dt><dd>{r.recommendation.rationale}</dd>
            <dt>Why it is preferred over the alternatives</dt><dd>{r.recommendation.whyPreferred}</dd>
            <dt>Evidence it rests on</dt><dd>{r.recommendation.evidenceSummary}</dd>
            <dt>What would change it</dt><dd>{r.recommendation.wouldChange}</dd>
            <dt>Decision owner</dt><dd>{r.recommendation.decisionOwner}</dd>
            {r.recommendation.timeline && <><dt>Timeline (planning window)</dt><dd>{r.recommendation.timeline}</dd></>}
            {r.recommendation.costOnceOff !== null && <><dt>Estimated once-off cost</dt><dd>{money(r.recommendation.costOnceOff)} (estimate)</dd></>}
            {r.recommendation.downside && <><dt>Downside case</dt><dd>{r.recommendation.downside}</dd></>}
          </dl>
        )}
        <p className="pra-note">This is a recommendation, not a guarantee of rental uplift, valuation, financing or any transaction outcome.</p>
      </section>

      <section className="pra-report-section"><h2>Risks</h2>{r.risks.length ? <ul>{r.risks.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="pra-empty">No case-specific risks recorded yet.</p>}</section>
      <section className="pra-report-section"><h2>Specialists required</h2>{r.specialists.length ? <ul>{r.specialists.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="pra-empty">None identified yet.</p>}</section>

      <section className="pra-report-section">
        <h2>Decision gates</h2>
        <table className="pra-table"><tbody>{r.gates.map((g) => <tr key={g.title}><td>{g.title}</td><td>{g.status.replace("_", " ")}</td><td>{g.owner ?? "—"}</td><td>{g.note ?? "—"}</td></tr>)}</tbody></table>
      </section>

      <section className="pra-report-section"><h2>Next actions</h2><ol>{r.nextActions.map((x) => <li key={x}>{x}</li>)}</ol></section>

      <footer className="pra-report-foot">{r.meta.ref} · {r.meta.confidentiality}</footer>
    </div>
  );
}
