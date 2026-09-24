import { ScanRow } from "../components/ScanRow";
import { Card, Empty, ErrorNote, Loading, PageHeader } from "../components/ui";
import { listScans } from "../lib/data";
import { Link } from "../lib/router";
import { useOrg } from "../lib/session";
import { useQuery } from "../lib/useQuery";

export function ScansPage() {
  const { db, organisation } = useOrg();
  const q = useQuery(() => listScans(db, organisation.id), [organisation.id], {
    pollMs: 8000,
    keepPolling: (rows) => rows.some((r) => r.scan.status === "queued" || r.scan.status === "running"),
  });
  return (
    <>
      <PageHeader eyebrow="Intelligence" title="Scans">
        Every scan is kept, including partial and failed ones, with what was and wasn't read. <Link to="/">Start a scan</Link>
      </PageHeader>
      <Card>
        {q.loading && !q.data && <Loading />}
        <ErrorNote error={q.error} title="Couldn't load scans" />
        {q.data && (q.data.length === 0 ? <Empty>No scans yet.</Empty> : <ul className="list">{q.data.map((r) => <ScanRow key={r.scan.id} {...r} />)}</ul>)}
      </Card>
    </>
  );
}
