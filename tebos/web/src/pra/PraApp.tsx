// The Property Revenue Architect Platform (founder, 29 Oct 2026): its own platform, linked to TEPOS, apart from TEBOS.
// A separate web app from the same code base (vite.pra.config.ts), with its own sign-in and its own accounts: a
// landlord's account belongs to this app alone (organisations.app = 'pra'), and its records are isolated by the same
// row-level security as everything else. Nothing here reads TEBOS's or TEPOS's organisations.
import { House, LogOut, UserRound } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { TwoStepChallenge } from "../components/TwoStep";
import { ErrorNote, Field, Loading } from "../components/ui";
import { PeopleProvider } from "../lib/people";
import { Link, matchPath, RouterProvider, usePath } from "../lib/router";
import { SessionProvider, useOrg, useSessionState } from "../lib/session";
import { supabase } from "../lib/supabase";
import { AccountPage } from "../pages/AccountPage";
import { NotFound } from "../pages/NotFound";
import { PropertiesPage, PropertyJourneyPage } from "../pages/PropertiesPage";
import { ResetPassword } from "../pages/ResetPassword";
import { SignIn } from "../pages/SignIn";

export const PRA_NAME = "Property Revenue Architect";

const NAV = [
  { to: "/", label: "Your properties", icon: House, exact: false },
  { to: "/account", label: "Account", icon: UserRound, exact: true },
];

const ROUTES: Array<[string, (p: Record<string, string>) => ReactNode]> = [
  ["/", () => <PropertiesPage />],
  ["/properties", () => <PropertiesPage />],
  ["/properties/:id", (p) => <PropertyJourneyPage id={p.id!} />],
  ["/account", () => <AccountPage issuer={PRA_NAME} />],
];

export function PraApp() {
  if (!supabase) return <div className="auth"><div className="auth-card"><h1 className="page-title">{PRA_NAME} isn't configured</h1></div></div>;
  return (
    <RouterProvider>
      <SessionProvider db={supabase} app="pra">
        <Gate />
      </SessionProvider>
    </RouterProvider>
  );
}

function Gate() {
  const { state, recovery } = useSessionState();
  const path = usePath();
  if (recovery && state.phase !== "loading" && state.phase !== "signed_out" && state.phase !== "error") return <ResetPassword />;
  if (path === "/reset-password" && state.phase !== "loading" && state.phase !== "signed_out" && state.phase !== "error") return <ResetPassword />;
  switch (state.phase) {
    case "loading":
      return <div className="auth"><Loading label={`Opening ${PRA_NAME}`} /></div>;
    case "signed_out":
      return <SignIn name={PRA_NAME} allowSignUp tagline="Where your property stands, what is holding it back, what happens next, and the evidence that it worked." />;
    case "two_step":
      return <TwoStepChallenge name={PRA_NAME} />;
    case "no_organisation":
      return <OpenAccount />;
    case "error":
      return <div className="auth"><div className="auth-card"><h1 className="page-title">Your account couldn't load</h1><p className="muted">{state.message}</p></div></div>;
    case "ready":
      return (
        <PeopleProvider>
          <Shell><Routes /></Shell>
        </PeopleProvider>
      );
  }
}

/** Signed in for the first time: the landlord opens their own account. One per person; properties go inside it. */
function OpenAccount() {
  const { db, refresh } = useSessionState();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (name.trim().length < 2) { setError(new Error("Give your account a name, such as your own name or your property business.")); return; }
    setBusy(true);
    const { error: err } = await db.rpc("create_pra_account", { p_name: name.trim() });
    setBusy(false);
    if (err) { setError(err); return; }
    await refresh();
  }
  return (
    <div className="auth pra-auth">
      <div className="auth-card">
        <p className="pra-eyebrow">{PRA_NAME}</p>
        <h1 className="page-title">Open your property account</h1>
        <p className="muted">Your properties, their problems, evidence and plans stay in this account. No one else sees them unless you invite them.</p>
        <form className="form" onSubmit={submit} aria-label="Open your property account">
          <Field label="Account name" hint="Your own name, or your property business's name.">
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
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [path]);
  return (
    <div className="shell pra">
      <aside className={`sidebar no-print ${menuOpen ? "open" : ""}`}>
        <div className="brand">
          <span className="pra-mark" aria-hidden>PRA</span>
          <div>
            <div className="brand-name">{PRA_NAME}</div>
            <div className="brand-sub">Tidy Enterprise</div>
          </div>
          <button type="button" className="menu-toggle" aria-expanded={menuOpen} aria-controls="main-nav" onClick={() => setMenuOpen(!menuOpen)}>Menu</button>
        </div>
        <nav className="nav" id="main-nav" aria-label="Main">
          {NAV.map(({ to, label, icon: Icon, exact }) => {
            const active = exact ? path === to : to === "/" ? path === "/" || path.startsWith("/properties") : path.startsWith(to);
            return (
              <Link key={to} to={to} className={`nav-link ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}>
                <Icon size={17} aria-hidden /> {label}
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-foot">
          <div className="org-name" data-testid="current-org">{organisation.name}</div>
          <div className="who mono">{session.user.email}</div>
          <button className="btn btn-ghost-dark" onClick={() => void db.auth.signOut()}>
            <LogOut size={15} aria-hidden /> Sign out
          </button>
          <p className="principle">Evidence before assertion</p>
        </div>
      </aside>
      <main className="main">
        {children}
        <p className="pra-boundary muted">
          Software for organising your property's records, problems and plans. It is not legal, tax, financial or
          property-practitioner advice; regulated work stays with the appropriate professional.
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
