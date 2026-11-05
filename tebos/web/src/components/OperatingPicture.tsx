import { operatingPicture, pictureCoverage, type PartStatus, type PictureEvidence } from "@core/operatingPicture";
import { playbookForIndustry } from "@core/playbooks";
import { Badge, Card, ErrorNote, Loading } from "./ui";
import { businessEvidence, type Business } from "../lib/data";
import { useOrg } from "../lib/session";
import { useQuery } from "../lib/useQuery";

const STATUS: Record<PartStatus, { label: string; tone: "neutral" | "info" | "good" | "warn" }> = {
  unknown: { label: "Not known", tone: "warn" },
  seen_outside: { label: "Seen from outside", tone: "info" },
  owner_stated: { label: "Owner's statement", tone: "neutral" },
  both: { label: "Seen and stated", tone: "good" },
};

/**
 * How the business actually runs: ownership, the flow of work, the money and time. A website shows little of this,
 * so each part says what was seen, what the owner said, and what is still unknown with the questions that answer it.
 */
export function OperatingPictureCard({ business }: { business: Business }) {
  const org = useOrg();
  const q = useQuery(() => businessEvidence(org.db, business.id), [business.id]);
  if (q.error) return <Card title="Operating picture"><ErrorNote error={q.error} /></Card>;
  if (!q.data) return <Card title="Operating picture"><Loading /></Card>;
  const views = operatingPicture(q.data as unknown as PictureEvidence[], playbookForIndustry(business.industry));
  const cov = pictureCoverage(views);
  return (
    <Card title="Operating picture" subtitle={`How the business runs inside: ${cov.known} of ${cov.total} parts have anything recorded. Nothing here is estimated.`}>
      <div className="stack" style={{ gap: 14 }} data-testid="operating-picture">
        {views.map((v) => (
          <section key={v.part.key} aria-label={v.part.title} className="op-part">
            <div className="row" style={{ justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <strong>{v.part.title}</strong>
              <Badge tone={STATUS[v.status].tone}>{STATUS[v.status].label}</Badge>
            </div>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>{v.part.covers}</p>
            {v.seen.length > 0 && (
              <ul className="op-list">{v.seen.slice(0, 5).map((e) => <li key={e.id}>{e.fact}</li>)}</ul>
            )}
            {v.stated.length > 0 && (
              <ul className="op-list">{v.stated.map((s) => <li key={s.evidence.id}><span className="muted">{s.question}</span> “{s.evidence.fact}” <span className="muted">(owner's statement)</span></li>)}</ul>
            )}
            {v.status === "unknown" && <p style={{ margin: "6px 0 0", fontSize: 13 }}>{v.part.outsideLimit}</p>}
            {v.openQuestions.length > 0 && (
              <details className="op-open">
                <summary>{v.openQuestions.length} question{v.openQuestions.length === 1 ? "" : "s"} would fill this in</summary>
                <ul className="op-list">{v.openQuestions.map((qq) => <li key={qq.key}>{qq.text}</li>)}</ul>
              </details>
            )}
          </section>
        ))}
        <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>The owner's answers come from the interview below and are kept as their statements until a document or connected system confirms them.</p>
      </div>
    </Card>
  );
}
