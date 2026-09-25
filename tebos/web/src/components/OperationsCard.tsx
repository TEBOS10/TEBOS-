import { connectionLabel } from "@core/capabilities";
import type { ConnectionStatus } from "@core/states";
import { Activity } from "lucide-react";
import { liveOperations } from "../lib/data";
import { ago } from "../lib/format";
import { useOrg } from "../lib/session";
import { useQuery } from "../lib/useQuery";
import { Card, ErrorNote, StatusBadge } from "./ui";

/**
 * What TEBOS last read from the business's own platform: aggregate numbers
 * only, through a read-only login. Shows when each number was read, so a
 * stale reading never looks current.
 */
export function OperationsCard({ businessId }: { businessId: string }) {
  const org = useOrg();
  const q = useQuery(() => liveOperations(org.db, businessId), [businessId]);
  if (!q.data || q.data.connections.length === 0) return q.error ? <ErrorNote error={q.error} title="Couldn't load live operations" /> : null;
  const c = q.data.connections[0]!;
  const label = connectionLabel({ id: c.id, connectorKey: c.connector_key, businessId: c.business_id, status: c.status as ConnectionStatus, grantedScopes: c.granted_scopes, lastVerifiedAt: c.last_verified_at });
  return (
    <Card
      title={<span className="row" style={{ gap: 8 }}><Activity size={16} aria-hidden /> Live operations</span>}
      subtitle="Read-only numbers from the business's own platform. No personal data is read."
      actions={<StatusBadge status={c.status} />}
    >
      <p className="list-meta" data-testid="operations-status">
        {label}
        {c.last_success_at ? ` · last read ${ago(c.last_success_at)}` : ""}
        {c.failure_detail ? ` · ${c.failure_detail}` : ""}
      </p>
      {q.data.facts.length === 0 ? (
        <p className="muted" style={{ marginTop: 8 }}>Nothing read yet. TEBOS's worker reads the platform about once an hour.</p>
      ) : (
        <ul className="list" style={{ marginTop: 8 }}>
          {q.data.facts.map((f) => (
            <li key={f.metric}>
              <div className="list-main">
                <span>{f.fact}</span>
                <span className="list-meta">read {ago(f.retrievedAt)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
