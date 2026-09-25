import type { ReactNode } from "react";
import { ProfilePrompt } from "./components/ProfilePrompt";
import { Shell } from "./components/Shell";
import { Loading } from "./components/ui";
import { matchPath, RouterProvider, usePath } from "./lib/router";
import { PeopleProvider } from "./lib/people";
import { SessionProvider, useSessionState } from "./lib/session";
import { supabase } from "./lib/supabase";
import { AcceptInvite } from "./pages/AcceptInvite";
import { AccountPage } from "./pages/AccountPage";
import { ResetPassword } from "./pages/ResetPassword";
import { ActionPage } from "./pages/ActionPage";
import { ActionsPage } from "./pages/ActionsPage";
import { ApprovalsPage } from "./pages/ApprovalsPage";
import { BusinessesPage } from "./pages/BusinessesPage";
import { BusinessPage } from "./pages/BusinessPage";
import { ConnectionsPage } from "./pages/ConnectionsPage";
import { CreateOrganisation } from "./pages/CreateOrganisation";
import { FindingPage } from "./pages/FindingPage";
import { FindingsPage } from "./pages/FindingsPage";
import { HomePage } from "./pages/HomePage";
import { NotFound } from "./pages/NotFound";
import { ReportPage } from "./pages/ReportPage";
import { ScanPage } from "./pages/ScanPage";
import { ScansPage } from "./pages/ScansPage";
import { SignIn } from "./pages/SignIn";
import { SystemPage } from "./pages/SystemPage";
import { TeamPage } from "./pages/TeamPage";

const ROUTES: Array<[string, (p: Record<string, string>) => ReactNode]> = [
  ["/", () => <HomePage />],
  ["/businesses", () => <BusinessesPage />],
  ["/businesses/:id", (p) => <BusinessPage id={p.id!} />],
  ["/businesses/:id/report", (p) => <ReportPage id={p.id!} />],
  ["/scans", () => <ScansPage />],
  ["/scans/:id", (p) => <ScanPage id={p.id!} />],
  ["/findings", () => <FindingsPage />],
  ["/findings/:id", (p) => <FindingPage id={p.id!} />],
  ["/actions", () => <ActionsPage />],
  ["/actions/:id", (p) => <ActionPage id={p.id!} />],
  ["/approvals", () => <ApprovalsPage />],
  ["/team", () => <TeamPage />],
  ["/account", () => <AccountPage />],
  ["/connections", () => <ConnectionsPage />],
  ["/system", () => <SystemPage />],
];

function Routes() {
  const path = usePath();
  for (const [pattern, render] of ROUTES) {
    const params = matchPath(pattern, path);
    if (params) return render(params);
  }
  return <NotFound />;
}

function Gate() {
  const { state } = useSessionState();
  const path = usePath();
  // An invitation link works signed out (sign in first), with no organisation yet, or signed in elsewhere.
  const invite = matchPath("/invite/:token", path);
  if (invite && (state.phase === "signed_out" || state.phase === "no_organisation" || state.phase === "ready")) return <AcceptInvite token={invite.token!} />;
  // The emailed reset link signs the person in just to choose a new password.
  if (path === "/reset-password") {
    if (state.phase === "ready" || state.phase === "no_organisation") return <ResetPassword />;
    if (state.phase === "signed_out") return <SignIn notice="That reset link has expired or was already used. Use “Forgot password?” to get a new one." />;
  }
  switch (state.phase) {
    case "loading":
      return (
        <div className="auth">
          <Loading label="Opening TEBOS" />
        </div>
      );
    case "signed_out":
      return <SignIn />;
    case "no_organisation":
      return <CreateOrganisation />;
    case "error":
      return (
        <div className="auth">
          <div className="auth-card">
            <h1 className="page-title">TEBOS couldn't load your account</h1>
            <p className="muted">{state.message}</p>
            <button className="btn" onClick={() => window.location.reload()}>
              Try again
            </button>
          </div>
        </div>
      );
    case "ready":
      return (
        <PeopleProvider>
          <Shell>
            <ProfilePrompt />
            <Routes />
          </Shell>
        </PeopleProvider>
      );
  }
}

export function App() {
  if (!supabase) {
    return (
      <div className="auth">
        <div className="auth-card">
          <h1 className="page-title">TEBOS isn't configured</h1>
          <p className="muted">
            This build has no database settings. Set <span className="mono">VITE_SUPABASE_URL</span> and{" "}
            <span className="mono">VITE_SUPABASE_PUBLISHABLE_KEY</span> (see <span className="mono">web/.env.example</span>) and rebuild.
          </p>
        </div>
      </div>
    );
  }
  return (
    <RouterProvider>
      <SessionProvider db={supabase}>
        <Gate />
      </SessionProvider>
    </RouterProvider>
  );
}
