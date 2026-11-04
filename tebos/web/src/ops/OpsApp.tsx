// Tidy Property Operations (founder's master build directive, 4 Nov 2026; ADR 0023): a property-management product
// distributed through TEBOS. Its own web app (vite.ops.config.ts) with its own sign-in and accounts
// (organisations.app = 'ops'); records are isolated by the same row-level security as everything else. It records and
// reconciles rent; it never holds or moves money.
import { Building2, ClipboardList, Gauge, LogOut, ReceiptText, UserRound, Users, Wrench } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { TwoStepChallenge } from "../components/TwoStep";
import { ErrorNote, Field, Loading } from "../components/ui";
import { PeopleProvider } from "../lib/people";
import { Link, matchPath, RouterProvider, usePath } from "../lib/router";
import { SessionProvider, useOrg, useSessionState } from "../lib/session";
import { supabase } from "../lib/supabase";
import { AccountPage } from "../pages/AccountPage";
import { NotFound } from "../pages/NotFound";
import { ResetPassword } from "../pages/ResetPassword";
import { SignIn } from "../pages/SignIn";
import { DashboardPage } from "./DashboardPage";
import { LeasePage, NewLeasePage } from "./LeasePages";
import { MaintenancePage, RequestPage } from "./MaintenancePages";
import { PropertiesPage, PropertyPage, PropertyReportPage } from "./PropertyPages";
import { RentPage } from "./RentPage";
import { TenantPage, TenantsPage } from "./TenantPages";
import { OPS_NAME, PortfolioProvider, usePortfolio } from "./util";

const NAV = [
  { to: "/", label: "Overview", icon: Gauge, match: (p: string) => p === "/" },
  { to: "/properties", label: "Properties", icon: Building2, match: (p: string) => p.startsWith("/properties") },
  { to: "/tenants", label: "Tenants", icon: Users, match: (p: string) => p.startsWith("/tenants") || p.startsWith("/leases") },
  { to: "/rent", label: "Rent and arrears", icon: ReceiptText, match: (p: string) => p.startsWith("/rent") },
  { to: "/maintenance", label: "Maintenance", icon: Wrench, match: (p: string) => p.startsWith("/maintenance") },
  { to: "/account", label: "Account", icon: UserRound, match: (p: string) => p === "/account" },
];

const ROUTES: Array<[string, (p: Record<string, string>) => ReactNode]> = [
  ["/", () => <DashboardPage />],
  ["/properties", () => <PropertiesPage />],
  ["/properties/:id", (p) => <PropertyPage id={p.id!} />],
  ["/properties/:id/report/:month", (p) => <PropertyReportPage id={p.id!} month={p.month!} />],
  ["/tenants", () => <TenantsPage />],
  ["/tenants/:id", (p) => <TenantPage id={p.id!} />],
  ["/leases/new/:unit", (p) => <NewLeasePage unitId={p.unit!} />],
  ["/leases/:id", (p) => <LeasePage id={p.id!} />],
  ["/rent", () => <RentPage />],
  ["/maintenance", () => <MaintenancePage />],
  ["/maintenance/:id", (p) => <RequestPage id={p.id!} />],
  ["/account", () => <AccountPage issuer={OPS_NAME} />],
];

export function OpsApp() {
  if (!supabase) return <div className="auth"><div className="auth-card"><h1 className="page-title">{OPS_NAME} isn't configured</h1></div></div>;
  return (
    <RouterProvider>
      <SessionProvider db={supabase} app="ops">
        <Gate />
      </SessionProvider>
    </RouterProvider>
  );
}

function Gate() {
  const { state, recovery } = useSessionState();
  const path = usePath();
  const ready = state.phase !== "loading" && state.phase !== "signed_out" && state.phase !== "error";
  if ((recovery || path === "/reset-password") && ready) return <ResetPassword />;
  switch (state.phase) {
    case "loading":
      return <div className="auth ops-auth"><Loading label={`Opening ${OPS_NAME}`} /></div>;
    case "signed_out":
      return <div className="ops-auth"><SignIn name={OPS_NAME} allowSignUp tagline="Every unit, every rand owed and paid, every repair: one record you can defend." /></div>;
    case "two_step":
      return <div className="ops-auth"><TwoStepChallenge name={OPS_NAME} /></div>;
    case "no_organisation":
      return <OpenAccount />;
    case "error":
      return <div className="auth ops-auth"><div className="auth-card"><h1 className="page-title">Your account couldn't load</h1><p className="muted">{state.message}</p></div></div>;
    case "ready":
      return (
        <PeopleProvider>
          <PortfolioProvider>
            <Shell><Routes /></Shell>
          </PortfolioProvider>
        </PeopleProvider>
      );
  }
}

/** Signed in for the first time: open an account (a free manual pilot to start). */
function OpenAccount() {
  const { db, refresh } = useSessionState();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (name.trim().length < 2) { setError(new Error("Give the account a name, such as your property business's name.")); return; }
    setBusy(true);
    const { error: err } = await db.rpc("create_ops_account", { p_name: name.trim() });
    setBusy(false);
    if (err) { setError(err); return; }
    await refresh();
  }
  return (
    <div className="auth ops-auth">
      <div className="auth-card">
        <p className="eyebrow">{OPS_NAME}</p>
        <h1 className="page-title">Open your operations account</h1>
        <p className="muted">Your properties, tenants, rent and maintenance stay in this account. Nobody else sees them unless you add them to your team.</p>
        <form className="form" onSubmit={submit} aria-label="Open your operations account">
          <Field label="Account name" hint="Your property business's name, or your own.">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <ErrorNote error={error} title="Not opened" />
          <button className="btn btn-primary" disabled={busy}>Open account</button>
        </form>
        <button className="btn" onClick={() => void db.auth.signOut()}>Sign out</button>
      </div>
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const path = usePath();
  const { organisation, db, session } = useOrg();
  const p = usePortfolio();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [path]);
  const sub = p.data?.subscription;
  return (
    <div className="shell ops-app">
      <aside className={`sidebar no-print ${menuOpen ? "open" : ""}`}>
        <div className="brand">
          <span className="ops-mark" aria-hidden>TPO</span>
          <div>
            <div className="brand-name">Property Operations</div>
            <div className="brand-sub">Tidy Enterprise</div>
          </div>
          <button type="button" className="menu-toggle" aria-expanded={menuOpen} aria-controls="main-nav" onClick={() => setMenuOpen(!menuOpen)}>
            <ClipboardList size={16} aria-hidden /> Menu
          </button>
        </div>
        <nav className="nav" id="main-nav" aria-label="Main">
          {NAV.map(({ to, label, icon: Icon, match }) => {
            const active = match(path);
            return (
              <Link key={to} to={to} className={`nav-link ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}>
                <Icon size={17} aria-hidden /> {label}
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-foot">
          <div className="org-name" data-testid="current-org">{organisation.name}</div>
          {sub && (
            <div className="ops-plan" data-testid="plan">
              {sub.plan === "pilot" ? "Pilot" : sub.plan} · {sub.status === "trial" ? "trial" : sub.status}
              {sub.trial_ends_on && sub.status === "trial" ? ` until ${sub.trial_ends_on}` : ""}
            </div>
          )}
          <div className="who mono">{session.user.email}</div>
          <button className="btn btn-ghost-dark" onClick={() => void db.auth.signOut()}>
            <LogOut size={15} aria-hidden /> Sign out
          </button>
        </div>
      </aside>
      <main className="main">
        {sub?.status === "suspended" && (
          <div className="note note-warn" role="status" data-testid="suspended">This account is paused: you can read everything, but nothing can be changed until Tidy reactivates it.</div>
        )}
        {children}
        <p className="ops-boundary muted no-print">
          {OPS_NAME} records and reconciles rent; it never holds or moves money. It is not legal, tax or accounting advice.
        </p>
      </main>
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
