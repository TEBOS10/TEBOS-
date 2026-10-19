// TEPOS home and portal pages. Each portal opens in the organisation that holds it. Portals not built yet say
// so, and say what they will hold; nothing here is invented.
import { ErrorNote } from "../components/ui";
import { PortalTile, usePortal } from "../components/Portal";
import { Link, navigate } from "../lib/router";
import { useOrg } from "../lib/session";
import { useQuery } from "../lib/useQuery";
import { ResiliencePage } from "../pages/ResiliencePage";
import { AgentOffice } from "./AgentOffice";
import { COMING, PORTALS, type Portal } from "./portals";
import { TeposCity } from "./TeposCity";

/** Opens a portal: into its organisation first, then its page. */
export function useOpenPortal() {
  const org = useOrg();
  const portal = usePortal();
  function target(p: Pick<Portal, "org" | "to">) {
    const into = p.org ? org.organisations.find((o) => o.organisation.slug === p.org) : null;
    return { allowed: !p.org || !!into, go: () => { if (into && into.organisation.id !== org.organisation.id) org.switchOrganisation(into.organisation.id); navigate(p.to); } };
  }
  return { ...portal, target };
}

export function TeposHome() {
  const { open, overlay, target } = useOpenPortal();
  return (
    <div className="tepos">
      {overlay}
      <header className="tepos-head">
        <div className="tepos-eyebrow">TEPOS · Tidy Enterprise Personal Operating System</div>
        <h1>Tidy</h1>
        <p>Your own city. Each building is a portal; the ones still under scaffolding aren't built yet.</p>
      </header>
      <TeposCity onOpen={(p, e) => { const t = target(p); if (t.allowed) open(e, p.shade, p.accent, t.go); }} allowed={(p) => target(p).allowed} />
      <section className="portal-grid" aria-label="Portals">
        {PORTALS.map((p) => {
          const t = target(p);
          return (
            <PortalTile key={p.key} testId={`portal-${p.key}`} shade={p.shade} accent={p.accent} monogram={p.monogram} name={p.name} line={p.line}
              status={!t.allowed ? "No access" : p.built ? "Open" : "Not built yet"}
              onOpen={(e) => t.allowed && open(e, p.shade, p.accent, t.go)} />
          );
        })}
      </section>
      <p className="tepos-foot">REEDS works across TEPOS and TEBOS: <Link to="/reeds">ask REEDS</Link>.</p>
    </div>
  );
}

export function TeposPortalPage({ portal }: { portal: string }) {
  if (portal === "capital") return <ResiliencePage />;
  if (portal === "irekun") return <Irekun />;
  if (portal === "agent") return <AgentOffice />;
  const p = PORTALS.find((x) => x.key === portal);
  const coming = COMING[portal];
  if (!p || !coming) return <div className="tepos"><h1>Not found</h1><p><Link to="/">Back to TEPOS</Link></p></div>;
  return (
    <div className="tepos">
      <header className="tepos-head">
        <div className="tepos-eyebrow"><Link to="/">TEPOS</Link> / {p.name}</div>
        <h1>{p.name}</h1>
        <p>{p.line}</p>
      </header>
      <section className="tepos-card" data-testid="portal-not-built">
        <h2>Not built yet</h2>
        <p className="tepos-muted">{coming.priority}. When it is built, it will hold:</p>
        <ul>{coming.holds.map((h) => <li key={h}>{h}</li>)}</ul>
        <p className="tepos-muted">Nothing is shown here until it is real.</p>
      </section>
    </div>
  );
}

/** IREKUN: the security backbone. What protects the private organisation, and what isn't built yet. */
function Irekun() {
  const org = useOrg();
  const q = useQuery(async () => {
    const { data, error } = await org.db.auth.mfa.listFactors();
    if (error) throw error;
    return (data?.all ?? []).filter((f) => f.factor_type === "totp" && f.status === "verified").length;
  }, [org.userId]);
  return (
    <div className="tepos">
      <header className="tepos-head">
        <div className="tepos-eyebrow"><Link to="/">TEPOS</Link> / IREKUN</div>
        <h1>IREKUN</h1>
        <p>The security backbone of Tidy. Never sold.</p>
      </header>
      <ErrorNote error={q.error} title="Couldn't check two-step sign-in" />
      <section className="tepos-cards">
        <div className="tepos-card" data-testid="irekun-two-step">
          <h2>Two-step sign-in</h2>
          {q.data === undefined ? <p className="tepos-muted">Checking…</p> : q.data === 0
            ? <p><strong>Off.</strong> A password alone signs you in. <Link to="/account">Turn it on</Link>: your private records need it.</p>
            : <p><strong>On</strong>, with {q.data} authenticator{q.data === 1 ? "" : "s"}{org.twoStep ? ". This session passed it." : ", but this session didn't use it: sign in again with your code."}{q.data === 1 ? " Add a backup on a second device." : ""} <Link to="/account">Manage</Link></p>}
        </div>
        <div className="tepos-card">
          <h2>Private organisation</h2>
          <p>{org.organisation.private ? `${org.organisation.name}: you are its only member. The database refuses anyone else, including invitations.` : "Open IREKUN from the city to see your private organisation."}</p>
        </div>
        <div className="tepos-card">
          <h2>Not built yet</h2>
          <ul>
            <li>The private document vault: storing documents, every read audited, short-lived links.</li>
            <li>Encrypted export and backup, with a restore test.</li>
            <li>Automatic deletion of records past their keep date.</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
