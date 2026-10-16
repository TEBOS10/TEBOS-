// The TEPOS app: sign-in, the second step, then the founder's portals. Only someone who owns a private
// organisation gets in; anyone else is told this is a private system, and sees nothing of it.
import { LayoutGrid, Landmark, KeyRound, GraduationCap, Home, LineChart, LogOut, MessageSquare, Vault } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { TwoStepChallenge } from "../components/TwoStep";
import { Loading } from "../components/ui";
import { PeopleProvider } from "../lib/people";
import { Link, matchPath, RouterProvider, usePath } from "../lib/router";
import { SessionProvider, useOrg, useSessionState } from "../lib/session";
import { StaffProvider } from "../lib/staff";
import { supabase } from "../lib/supabase";
import { AccountPage } from "../pages/AccountPage";
import { NotFound } from "../pages/NotFound";
import { PropertyCasePage, PropertyCasesPage } from "../pages/PropertyPage";
import { PropertyReportPage } from "../pages/PropertyReportPage";
import { ReedsPage, ReedsRequestPage } from "../pages/ReedsPage";
import { ResetPassword } from "../pages/ResetPassword";
import { SignIn } from "../pages/SignIn";
import { TeposHome, TeposPortalPage } from "./TeposPage";

// each portal opens in the organisation that holds it, from the menu as from the city
const NAV: Array<{ to: string; label: string; icon: typeof Vault; exact: boolean; org?: string }> = [
  { to: "/", label: "The city", icon: LayoutGrid, exact: true },
  { to: "/capital", label: "Tidy Capital", icon: Vault, exact: true, org: "irekun" },
  { to: "/property", label: "Tidy Enterprise", icon: Landmark, exact: false, org: "tidy-enterprise" },
  { to: "/irekun", label: "IREKUN", icon: KeyRound, exact: true, org: "irekun" },
  { to: "/academics", label: "Academics", icon: GraduationCap, exact: true },
  { to: "/agent", label: "Real Estate Job", icon: Home, exact: true },
  { to: "/forex", label: "Forex", icon: LineChart, exact: true },
  { to: "/reeds", label: "Ask REEDS", icon: MessageSquare, exact: false },
];

const ROUTES: Array<[string, (p: Record<string, string>) => ReactNode]> = [
  ["/", () => <TeposHome />],
  ["/property", () => <PropertyCasesPage />],
  ["/property/:id", (p) => <PropertyCasePage id={p.id!} />],
  ["/property/:id/report", (p) => <PropertyReportPage id={p.id!} />],
  ["/account", () => <AccountPage />],
  ["/reeds", () => <ReedsPage />],
  ["/reeds/:id", (p) => <ReedsRequestPage id={p.id!} />],
  ["/:portal", (p) => <TeposPortalPage portal={p.portal!} />],
];

export function TeposApp() {
  if (!supabase) return <div className="auth"><div className="auth-card"><h1 className="page-title">TEPOS isn't configured</h1></div></div>;
  return (
    <RouterProvider>
      <SessionProvider db={supabase} app="tepos">
        <Gate />
      </SessionProvider>
    </RouterProvider>
  );
}

function Gate() {
  const { state } = useSessionState();
  const path = usePath();
  if (path === "/reset-password" && state.phase === "ready") return <ResetPassword />;
  switch (state.phase) {
    case "loading":
      return <div className="auth"><Loading label="Opening TEPOS" /></div>;
    case "signed_out":
      return <SignIn name="TEPOS" tagline="Tidy Enterprise Personal Operating System. Private." />;
    case "two_step":
      return <TwoStepChallenge />;
    case "no_organisation":
      return <Private />;
    case "error":
      return <div className="auth"><div className="auth-card"><h1 className="page-title">TEPOS couldn't load your account</h1><p className="muted">{state.message}</p></div></div>;
    case "ready":
      return state.organisations.some((o) => o.organisation.private) ? (
        <PeopleProvider>
          <StaffProvider>
            <Shell><Routes /></Shell>
          </StaffProvider>
        </PeopleProvider>
      ) : <Private />;
  }
}

/** Signed in, but not the owner of TEPOS: nothing of it is shown. */
function Private() {
  const { db } = useSessionState();
  return (
    <div className="auth">
      <div className="auth-card">
        <h1 className="page-title">This is a private system</h1>
        <p className="muted">This account has no access here.</p>
        <button className="btn" onClick={() => void db.auth.signOut()}>Sign out</button>
      </div>
    </div>
  );
}

function Routes() {
  const path = usePath();
  for (const [pattern, render] of ROUTES) {
    const params = matchPath(pattern, path);
    if (params) return <>{render(params)}</>;
  }
  return <NotFound />;
}

function Shell({ children }: { children: ReactNode }) {
  const path = usePath();
  const { organisation, organisations, switchOrganisation, db, session } = useOrg();
  const into = (slug?: string) => {
    const o = slug ? organisations.find((x) => x.organisation.slug === slug) : null;
    if (o && o.organisation.id !== organisation.id) switchOrganisation(o.organisation.id);
  };
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [path]);
  return (
    <div className="shell">
      <aside className={`sidebar no-print ${menuOpen ? "open" : ""}`}>
        <div className="brand">
          <span className="brand-mark" aria-hidden />
          <div>
            <div className="brand-name">TEPOS</div>
            <div className="brand-sub">Personal Operating System</div>
          </div>
          <button type="button" className="menu-toggle" aria-expanded={menuOpen} aria-controls="main-nav" onClick={() => setMenuOpen(!menuOpen)}>Menu</button>
        </div>
        <nav className="nav" id="main-nav" aria-label="Main">
          {NAV.map(({ to, label, icon: Icon, exact, org: slug }) => {
            const active = exact ? path === to : path === to || path.startsWith(`${to}/`);
            return (
              <Link key={to} to={to} onClick={() => into(slug)} className={`nav-link ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}>
                <Icon size={17} aria-hidden /> {label}
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-foot">
          <div className="org-name" data-testid="current-org">{organisation.name}</div>
          <div className="who">
            <Link to="/account" className="mono account-link" title="Your account, password and two-step sign-in">{session.user.email}</Link>
          </div>
          <button className="btn btn-ghost-dark" onClick={() => void db.auth.signOut()}>
            <LogOut size={15} aria-hidden /> Sign out
          </button>
          <p className="principle">Only you</p>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
