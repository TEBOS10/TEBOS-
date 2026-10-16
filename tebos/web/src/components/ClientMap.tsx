// The TEBOS client map (founder, 17 Oct 2026): each client as a tile in its own colours. Opening one goes through
// its portal into that client's organisation. A client whose systems aren't linked says "Not connected yet":
// nothing is shown as measured until it is.
import { RELATIONSHIPS, type Relationship } from "@core/brand";
import { clientMap } from "../lib/data";
import { navigate } from "../lib/router";
import { useOrg } from "../lib/session";
import { useQuery } from "../lib/useQuery";
import { PortalTile, usePortal } from "./Portal";

const FALLBACK = { primary: "#2b2f36", accent: "#c9d1db" };
const monogram = (name: string) => name.replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";

export function ClientMap() {
  const org = useOrg();
  const q = useQuery(() => clientMap(org.db), [org.userId]);
  const { open, overlay } = usePortal();
  if (!q.data || q.data.length === 0) return null;
  return (
    <section className="client-map" aria-label="Clients">
      {overlay}
      <div className="client-map-head">
        <h2>Clients</h2>
        <p>Each business in its own colours. Choose one to go into its operating system.</p>
      </div>
      <div className="portal-grid">
        {q.data.map(({ business: b, connected }) => {
          const primary = b.brand_primary ?? FALLBACK.primary;
          const accent = b.brand_accent ?? FALLBACK.accent;
          const rel = b.relationship as Relationship;
          const status = rel === "in_development" ? RELATIONSHIPS.in_development : connected ? "Connected" : "Not connected yet";
          return (
            <PortalTile key={b.id} testId={`client-${b.id}`} shade={primary} accent={accent} monogram={monogram(b.name)} name={b.name}
              line={b.industry ?? RELATIONSHIPS[rel]} status={status}
              onOpen={(e) => open(e, primary, accent, () => {
                if (b.org_id !== org.organisation.id) org.switchOrganisation(b.org_id);
                navigate(`/businesses/${b.id}`);
              })} />
          );
        })}
      </div>
    </section>
  );
}
