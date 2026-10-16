// The TEBOS client map (founder, 16 Oct 2026): each client as a tile in its own colours. Opening one goes through
// its portal straight into the client's own web app, where TEBOS's people work in their own department. Never a
// page of TEBOS's data about the client. A client whose web app address isn't recorded says so and opens nothing.
import { RELATIONSHIPS, type Relationship } from "@core/brand";
import { clientMap } from "../lib/data";
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
        <p>Each client in its own colours. Choose one to go straight into its web app, to your department there.</p>
      </div>
      <div className="portal-grid">
        {q.data.map(({ business: b, connected }) => {
          const primary = b.brand_primary ?? FALLBACK.primary;
          const accent = b.brand_accent ?? FALLBACK.accent;
          const rel = b.relationship as Relationship;
          const app = b.app_url;
          const status = rel === "in_development" && !app ? RELATIONSHIPS.in_development : !app ? "Web app address not set" : connected ? "Open web app · connected" : "Open web app";
          return (
            <PortalTile key={b.id} testId={`client-${b.id}`} shade={primary} accent={accent} monogram={monogram(b.name)} name={b.name}
              line={b.industry ?? RELATIONSHIPS[rel]} status={status}
              onOpen={(e) => { if (app) open(e, primary, accent, () => window.location.assign(app)); }} />
          );
        })}
      </div>
    </section>
  );
}
