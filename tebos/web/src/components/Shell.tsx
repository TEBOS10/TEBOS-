import { BookOpen, Briefcase, Building2, ListChecks, Receipt, CheckSquare, Gauge, Home, LogOut, Plug, ScanSearch, ShieldCheck, Sparkles, Stamp, Users } from "lucide-react";
import type { ReactNode } from "react";
import { DEMO_BUSINESS } from "../demo/data";
import { exitDemo, isDemo } from "../demo/mode";
import { Link, usePath } from "../lib/router";
import { useOrg } from "../lib/session";
import { useStaff } from "../lib/staff";

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
  // TEBOS's own staff also see the client pipeline and the sales playbook
  const { access } = useStaff();
  const nav = access?.sales || access?.maintainer
    ? [...NAV, { to: "/pipeline", label: "Pipeline", icon: Briefcase, exact: false }, { to: "/sales", label: "Sales playbook", icon: BookOpen, exact: false },
       ...(access?.maintainer ? [{ to: "/pipeline/queue", label: "Maintainer queue", icon: ListChecks, exact: true }] : []),
       ...(access?.admin ? [{ to: "/pipeline/billing", label: "Billing", icon: Receipt, exact: true }] : [])]
    : NAV;
  return (
    <div className="shell">
      <aside className="sidebar no-print">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            <ShieldCheck size={18} />
          </span>
          <div>
            <div className="brand-name">TEBOS</div>
            <div className="brand-sub">Business Operating Systems</div>
          </div>
        </div>
        <nav className="nav" aria-label="Main">
          {nav.map(({ to, label, icon: Icon, exact }) => {
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
            <Link to="/account" className="mono account-link" title="Your account and password">{session.user.email}</Link>
            <span className="role">{role.replace("_", " ")}</span>
          </div>
          <button className="btn btn-ghost-dark" onClick={() => (isDemo ? exitDemo() : db.auth.signOut())}>
            <LogOut size={15} aria-hidden /> {isDemo ? "Leave demo" : "Sign out"}
          </button>
          <p className="principle">Evidence before assertion</p>
        </div>
      </aside>
      <main className="main">
        {isDemo && <DemoBanner />}
        {children}
      </main>
    </div>
  );
}

/** Says plainly that this is a demo on a fictional agency, and suggests a route through it. */
function DemoBanner() {
  return (
    <div className="demo-banner no-print" role="note" aria-label="Demo">
      <div>
        <strong>Demo · Brightline Creative is a fictional agency.</strong> Every name, figure and quote is invented. Nothing you do here is saved or
        sent anywhere; reloading starts over.
      </div>
      <ol className="demo-steps">
        <li><Link to={`/businesses/${DEMO_BUSINESS}`}>See what TEBOS knows about the agency</Link></li>
        <li><Link to={`/businesses/${DEMO_BUSINESS}/board`}>See its operating board</Link></li>
        <li><Link to="/findings">Open a finding and check its evidence</Link></li>
        <li><Link to="/approvals">Approve the change your ops lead proposed</Link></li>
        <li><a href="/tour">Watch the 1-minute tour</a></li>
      </ol>
      <button className="btn btn-sm" onClick={exitDemo}>Leave demo</button>
    </div>
  );
}
