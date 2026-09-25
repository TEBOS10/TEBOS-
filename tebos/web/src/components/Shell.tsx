import { Building2, CheckSquare, Gauge, Home, LogOut, Plug, ScanSearch, ShieldCheck, Sparkles, Stamp, Users } from "lucide-react";
import type { ReactNode } from "react";
import { Link, usePath } from "../lib/router";
import { useOrg } from "../lib/session";

const NAV = [
  { to: "/", label: "Home", icon: Home, exact: true },
  { to: "/businesses", label: "Businesses", icon: Building2 },
  { to: "/scans", label: "Scans", icon: ScanSearch },
  { to: "/findings", label: "Findings", icon: Sparkles },
  { to: "/actions", label: "Actions", icon: CheckSquare },
  { to: "/approvals", label: "Approvals", icon: Stamp },
  { to: "/team", label: "Team", icon: Users },
  { to: "/connections", label: "Connections", icon: Plug },
  { to: "/system", label: "System", icon: Gauge },
];

export function Shell({ children }: { children: ReactNode }) {
  const path = usePath();
  const { organisation, organisations, switchOrganisation, role, db, session } = useOrg();
  return (
    <div className="shell">
      <aside className="sidebar no-print">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            <ShieldCheck size={18} />
          </span>
          <div>
            <div className="brand-name">TEBOS</div>
            <div className="brand-sub">Business intelligence</div>
          </div>
        </div>
        <nav className="nav" aria-label="Main">
          {NAV.map(({ to, label, icon: Icon, exact }) => {
            const active = exact ? path === to : path === to || path.startsWith(`${to}/`);
            return (
              <Link key={to} to={to} className={`nav-link ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}>
                <Icon size={17} aria-hidden /> {label}
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-foot">
          {organisations.length > 1 ? (
            <select className="org-select" value={organisation.id} onChange={(e) => switchOrganisation(e.target.value)} aria-label="Organisation">
              {organisations.map((o) => (
                <option key={o.organisation.id} value={o.organisation.id}>
                  {o.organisation.name}
                </option>
              ))}
            </select>
          ) : (
            <div className="org-name">{organisation.name}</div>
          )}
          <div className="who">
            <span className="mono">{session.user.email}</span>
            <span className="role">{role.replace("_", " ")}</span>
          </div>
          <button className="btn btn-ghost-dark" onClick={() => db.auth.signOut()}>
            <LogOut size={15} aria-hidden /> Sign out
          </button>
          <p className="principle">Evidence before assertion</p>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
