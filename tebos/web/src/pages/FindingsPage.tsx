import { Card, Empty, ErrorNote, Loading, PageHeader, StatusBadge } from "../components/ui";
import { listFindings } from "../lib/data";
import { ago, pct, statusLabel } from "../lib/format";
import { Link } from "../lib/router";
import { useOrg } from "../lib/session";
import { useQuery } from "../lib/useQuery";

export function FindingsPage() {
  const { db, organisation } = useOrg();
  const q = useQuery(() => listFindings(db, organisation.id), [organisation.id]);
  return (
    <>
      <PageHeader eyebrow="Intelligence" title="Findings">
        Interpretations of the evidence. Each one links back to what TEBOS actually saw; hypotheses are marked as such.
      </PageHeader>
      <Card>
        {q.loading && !q.data && <Loading />}
        <ErrorNote error={q.error} title="Couldn't load findings" />
        {q.data &&
          (q.data.length === 0 ? (
            <Empty>No findings yet. They appear once a scan has been read and analysed.</Empty>
          ) : (
            <ul className="list">
              {q.data.map(({ finding: f, business }) => (
                <li key={f.id}>
                  <div className="list-main">
                    <Link to={`/findings/${f.id}`} className="list-title">
                      {f.title}
                    </Link>
                    <span className="list-meta">
                      {business?.name} · {statusLabel(f.category)} · {pct(f.confidence)} confidence · {ago(f.created_at)}
                    </span>
                  </div>
                  <StatusBadge status={f.kind} />
                </li>
              ))}
            </ul>
          ))}
      </Card>
    </>
  );
}
