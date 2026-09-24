import { useMemo, useState } from "react";
import { Card, Empty, ErrorNote, Loading, PageHeader, StatusBadge } from "../components/ui";
import { listActions, OPEN_ACTION_STATUSES } from "../lib/data";
import { ago, RISK_LABEL } from "../lib/format";
import { Link } from "../lib/router";
import { useOrg } from "../lib/session";
import { useQuery } from "../lib/useQuery";

export function ActionsPage() {
  const { db, organisation } = useOrg();
  const q = useQuery(() => listActions(db, organisation.id), [organisation.id]);
  const [show, setShow] = useState<"open" | "all">("open");
  const [risk, setRisk] = useState<number | "any">("any");
  const [business, setBusiness] = useState<string>("any");

  const rows = useMemo(
    () =>
      (q.data ?? []).filter(
        ({ action: a }) =>
          (show === "all" || (OPEN_ACTION_STATUSES as readonly string[]).includes(a.status)) &&
          (risk === "any" || a.risk_tier === risk) &&
          (business === "any" || a.business_id === business),
      ),
    [q.data, show, risk, business],
  );
  const businesses = [...new Map((q.data ?? []).filter((r) => r.business).map((r) => [r.business!.id, r.business!.name])).entries()];

  return (
    <>
      <PageHeader eyebrow="Execution" title="Actions">
        Every action comes from a finding, carries a risk tier, and is only complete once a run succeeded — and only verified with proof.
      </PageHeader>
      <Card
        actions={
          <div className="row">
            <select className="input" value={show} onChange={(e) => setShow(e.target.value as "open" | "all")} aria-label="Status filter">
              <option value="open">Open</option>
              <option value="all">All</option>
            </select>
            <select className="input" value={risk} onChange={(e) => setRisk(e.target.value === "any" ? "any" : Number(e.target.value))} aria-label="Risk filter">
              <option value="any">Any risk</option>
              {[0, 1, 2, 3].map((t) => (
                <option key={t} value={t}>
                  {RISK_LABEL[t]}
                </option>
              ))}
            </select>
            <select className="input" value={business} onChange={(e) => setBusiness(e.target.value)} aria-label="Business filter">
              <option value="any">All businesses</option>
              {businesses.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        }
      >
        {q.loading && !q.data && <Loading />}
        <ErrorNote error={q.error} title="Couldn't load actions" />
        {q.data &&
          (rows.length === 0 ? (
            <Empty>{q.data.length === 0 ? "No actions yet. Propose one from a finding." : "No actions match these filters."}</Empty>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Risk</th>
                  <th>Priority</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ action: a, business: b }) => (
                  <tr key={a.id}>
                    <td className="wrap">
                      <Link to={`/actions/${a.id}`} className="list-title">
                        {a.title}
                      </Link>
                      <div className="list-meta">
                        {b?.name} · {ago(a.created_at)}
                      </div>
                    </td>
                    <td>{RISK_LABEL[a.risk_tier]}</td>
                    <td>{a.priority}</td>
                    <td>
                      <StatusBadge status={a.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
      </Card>
    </>
  );
}
