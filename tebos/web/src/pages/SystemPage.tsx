import { Card, Empty, ErrorNote, Loading, PageHeader, StatusBadge } from "../components/ui";
import { auditTrail, systemOverview } from "../lib/data";
import { ago, RISK_LABEL, statusLabel, when } from "../lib/format";
import { usePeople } from "../lib/people";
import { Link } from "../lib/router";
import { useOrg } from "../lib/session";
import { useQuery } from "../lib/useQuery";

export function SystemPage() {
  const org = useOrg();
  const q = useQuery(() => systemOverview(org.db, org.organisation.id), [org.organisation.id]);
  return (
    <div className="stack">
      <PageHeader eyebrow="System / Advanced" title="System">
        What TEBOS can do, what is actually connected, what its workers did, and the audit trail.
      </PageHeader>
      {q.loading && !q.data && <Loading />}
      <ErrorNote error={q.error} title="Couldn't load system state" />
      {q.data && <Overview data={q.data} />}
      <AuditCard />
    </div>
  );
}

function Overview({ data }: { data: Awaited<ReturnType<typeof systemOverview>> }) {
  const providers = data.connectors.length;
  return (
        <div className="grid grid-2">
          <Card title="Capabilities" subtitle="What TEBOS knows how to do. Knowing is not the same as being connected.">
            <ul className="list">
              {data.capabilities.map((c) => {
                return (
                  <li key={c.key}>
                    <div className="list-main">
                      <span className="list-title">{c.name}</span>
                      <span className="list-meta">
                        <span className="mono">{c.key}</span> · {RISK_LABEL[c.default_risk_tier]}
                      </span>
                    </div>
                    {c.key === "web.read_public" || c.key.startsWith("analysis.") ? (
                      <StatusBadge status="configured" />
                    ) : providers === 0 ? (
                      <span className="list-meta">no provider yet</span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </Card>
          <div className="stack">
            <Card title="Connections" subtitle="Shown as connected only after a fresh, successful check" actions={<Link to="/connections" className="btn btn-sm">Manage</Link>}>
              {data.connections.length === 0 ? (
                <Empty>No external systems connected. Actions that need one are carried out by a person for now.</Empty>
              ) : (
                <ul className="list">
                  {data.connections.map((c) => (
                    <li key={c.id}>
                      <div className="list-main">
                        <span className="list-title">{c.connector_key}</span>
                        <span className="list-meta">last verified {ago(c.last_verified_at)}</span>
                      </div>
                      <StatusBadge status={c.status} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="Worker runs" subtitle="The latest agent runs in this organisation">
              {data.runs.length === 0 ? (
                <Empty>No worker activity recorded. If scans stay queued, check the worker service.</Empty>
              ) : (
                <ul className="list">
                  {data.runs.map((r) => (
                    <li key={r.id}>
                      <div className="list-main">
                        <span className="list-title">{statusLabel(r.agent_role)}</span>
                        <span className="list-meta">
                          {ago(r.started_at)}
                          {r.model ? ` · ${r.model}` : ""}
                          {r.error_detail ? ` · ${r.error_detail}` : ""}
                        </span>
                      </div>
                      <StatusBadge status={r.status} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
  );
}

function AuditCard() {
  const org = useOrg();
  const { actorLabel } = usePeople();
  const audit = useQuery(() => auditTrail(org.db, org.organisation.id), [org.organisation.id]);
  return (
      <Card title="Audit trail" subtitle="Append-only and tamper-evident. The latest 50 events in this organisation.">
        {audit.loading && !audit.data && <Loading />}
        <ErrorNote error={audit.error} title="Couldn't load the audit trail" />
        {audit.data &&
          (audit.data.length === 0 ? (
            <Empty>No events yet.</Empty>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Event</th>
                  <th>Actor</th>
                </tr>
              </thead>
              <tbody>
                {audit.data.map((e) => (
                  <tr key={e.id}>
                    <td className="mono">{when(e.occurred_at)}</td>
                    <td className="mono">{e.action}</td>
                    <td className="mono wrap">
                      {actorLabel(e.actor_type, e.actor_id)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
      </Card>
  );
}
