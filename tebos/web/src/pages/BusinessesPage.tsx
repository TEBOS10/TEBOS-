import { Card, Empty, ErrorNote, Loading, PageHeader, StatusBadge } from "../components/ui";
import { listBusinesses } from "../lib/data";
import { ago, pct } from "../lib/format";
import { Link } from "../lib/router";
import { useOrg } from "../lib/session";
import { useQuery } from "../lib/useQuery";

export function BusinessesPage() {
  const { db, organisation } = useOrg();
  const q = useQuery(() => listBusinesses(db, organisation.id), [organisation.id]);
  return (
    <>
      <PageHeader eyebrow="Operating records" title="Businesses">
        Each business is a persistent record: its context, evidence, findings and actions build up over time.
      </PageHeader>
      <Card>
        {q.loading && !q.data && <Loading />}
        <ErrorNote error={q.error} title="Couldn't load businesses" />
        {q.data &&
          (q.data.length === 0 ? (
            <Empty>
              No businesses yet. <Link to="/">Scan a website</Link> to create the first one.
            </Empty>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Business</th>
                  <th>Last scan</th>
                  <th>Active findings</th>
                  <th>Open actions</th>
                </tr>
              </thead>
              <tbody>
                {q.data.map(({ business, lastScan, activeFindings, openActions }) => (
                  <tr key={business.id}>
                    <td className="wrap">
                      <Link to={`/businesses/${business.id}`} className="list-title">
                        {business.name}
                      </Link>
                      <div className="list-meta">{business.website ?? "No website"}</div>
                    </td>
                    <td>
                      {lastScan ? (
                        <div className="row">
                          <StatusBadge status={lastScan.status} />
                          <span className="list-meta">
                            {ago(lastScan.created_at)}
                            {lastScan.confidence !== null ? ` · ${pct(lastScan.confidence)}` : ""}
                          </span>
                        </div>
                      ) : (
                        <span className="muted">Never scanned</span>
                      )}
                    </td>
                    <td>{activeFindings}</td>
                    <td>{openActions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
      </Card>
    </>
  );
}
