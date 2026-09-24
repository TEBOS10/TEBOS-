import { Card, Empty, ErrorNote, Loading, PageHeader, StatusBadge } from "../components/ui";
import { listApprovals } from "../lib/data";
import { ago, RISK_LABEL, statusLabel } from "../lib/format";
import { usePeople } from "../lib/people";
import { Link } from "../lib/router";
import { useOrg } from "../lib/session";
import { useQuery } from "../lib/useQuery";

export function ApprovalsPage() {
  const org = useOrg();
  const q = useQuery(() => listApprovals(org.db, org.organisation.id), [org.organisation.id]);
  const pending = (q.data ?? []).filter((r) => r.approval.status === "pending");
  const decided = (q.data ?? []).filter((r) => r.approval.status !== "pending");
  return (
    <>
      <PageHeader eyebrow="Controls" title="Approvals">
        {org.can("approval.decide")
          ? "Requests waiting for your decision. Open one to see the action, its finding and its evidence before deciding."
          : "Your role can see approvals but not decide them."}
      </PageHeader>
      {q.loading && !q.data && <Loading />}
      <ErrorNote error={q.error} title="Couldn't load approvals" />
      {q.data && (
        <div className="grid grid-2">
          <Card title="Waiting" subtitle={`${pending.length} pending`}>
            {pending.length === 0 ? <Empty>Nothing is waiting for a decision.</Empty> : <Rows rows={pending} />}
          </Card>
          <Card title="Decided">{decided.length === 0 ? <Empty>No decisions yet.</Empty> : <Rows rows={decided} />}</Card>
        </div>
      )}
    </>
  );
}

function Rows({ rows }: { rows: Awaited<ReturnType<typeof listApprovals>> }) {
  const { nameOf } = usePeople();
  return (
    <ul className="list">
      {rows.map(({ approval: a, action }) => (
        <li key={a.id}>
          <div className="list-main">
            {action ? (
              <Link to={`/actions/${action.id}`} className="list-title">
                {action.title}
              </Link>
            ) : (
              <span className="list-title">{a.requested_operation}</span>
            )}
            <span className="list-meta">
              {RISK_LABEL[a.risk_tier]} · requested by {nameOf(a.requested_by)} {ago(a.requested_at)}
              {a.decided_by ? ` · ${statusLabel(a.status).toLowerCase()} by ${nameOf(a.decided_by)}` : ""}
              {a.decision_note ? ` · "${a.decision_note}"` : ""}
            </span>
          </div>
          <StatusBadge status={a.status} />
        </li>
      ))}
    </ul>
  );
}
