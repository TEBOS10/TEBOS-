import type { ReactNode } from "react";
import { ProfilePrompt } from "./components/ProfilePrompt";
import { Shell } from "./components/Shell";
import { Loading } from "./components/ui";
import { matchPath, RouterProvider, usePath } from "./lib/router";
import { PeopleProvider } from "./lib/people";
import { SessionProvider, useSessionState } from "./lib/session";
import { supabase } from "./lib/supabase";
import { exitDemo, isDemo } from "./demo/mode";
import { AcceptInvite } from "./pages/AcceptInvite";
import { AccountPage } from "./pages/AccountPage";
import { ResetPassword } from "./pages/ResetPassword";
import { ActionPage } from "./pages/ActionPage";
import { ActionsPage } from "./pages/ActionsPage";
import { ApprovalsPage } from "./pages/ApprovalsPage";
import { BusinessesPage } from "./pages/BusinessesPage";
import { BusinessPage } from "./pages/BusinessPage";
import { BoardPage } from "./pages/BoardPage";
import { ConnectionsPage } from "./pages/ConnectionsPage";
import { CreateOrganisation } from "./pages/CreateOrganisation";
import { FindingPage } from "./pages/FindingPage";
import { FindingsPage } from "./pages/FindingsPage";
import { HomePage } from "./pages/HomePage";
import { InterviewPage } from "./pages/InterviewPage";
import { NotFound } from "./pages/NotFound";
import { ReportPage } from "./pages/ReportPage";
import { ScanPage } from "./pages/ScanPage";
import { ScansPage } from "./pages/ScansPage";
import { SignIn } from "./pages/SignIn";
import { SystemPage } from "./pages/SystemPage";
import { TourPage } from "./pages/TourPage";
import { FilmPage } from "./pages/FilmPage";
import { LandingPage } from "./pages/LandingPage";
import { PricingPage } from "./pages/PricingPage";
import { ContractPage, PaidPage } from "./pages/ContractPage";
import { ContractTemplatesPage, OpportunityPage, PipelinePage } from "./pages/PipelinePage";
import { SalesPlaybookPage, StaffInvitePage, StaffTeamPage } from "./pages/SalesPages";
import { StaffShell } from "./components/StaffShell";
import { BlogIndex, BlogPost } from "./pages/BlogPage";
import { LegalPage } from "./pages/LegalPage";
import { SelfCheckPage, SelfCheckShared } from "./pages/SelfCheckPage";
import { DeliveryQueuePage } from "./pages/DeliveryPage";
import { StaffProvider, useStaff } from "./lib/staff";
import { TeamPage } from "./pages/TeamPage";

const ROUTES: Array<[string, (p: Record<string, string>) => ReactNode]> = [
  ["/", () => <HomePage />],
  ["/sign-in", () => <HomePage />],
  ["/businesses", () => <BusinessesPage />],
  ["/businesses/:id", (p) => <BusinessPage id={p.id!} />],
  ["/businesses/:id/report", (p) => <ReportPage id={p.id!} />],
  ["/businesses/:id/board", (p) => <BoardPage id={p.id!} />],
  ["/scans", () => <ScansPage />],
  ["/scans/:id", (p) => <ScanPage id={p.id!} />],
  ["/findings", () => <FindingsPage />],
  ["/findings/:id", (p) => <FindingPage id={p.id!} />],
  ["/actions", () => <ActionsPage />],
  ["/actions/:id", (p) => <ActionPage id={p.id!} />],
  ["/approvals", () => <ApprovalsPage />],
  ["/interviews/:id", (p) => <InterviewPage id={p.id!} />],
  ["/team", () => <TeamPage />],
  ["/account", () => <AccountPage />],
  ["/connections", () => <ConnectionsPage />],
  ["/system", () => <SystemPage />],
  ...staffRoutes(),
];

// TEBOS's own staff pages: the same in the normal app and in the staff workspace.
function staffRoutes(): Array<[string, (p: Record<string, string>) => ReactNode]> {
  return [
    ["/pipeline", () => <PipelinePage />],
    ["/pipeline/contracts", () => <ContractTemplatesPage />],
    ["/pipeline/team", () => <StaffTeamPage />],
    ["/pipeline/queue", () => <DeliveryQueuePage />],
    ["/pipeline/:id", (p) => <OpportunityPage id={p.id!} />],
    ["/sales", () => <SalesPlaybookPage />],
  ];
}
const STAFF_ROUTES = staffRoutes();

function Routes({ routes = ROUTES }: { routes?: typeof ROUTES }) {
  const path = usePath();
  for (const [pattern, render] of routes) {
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
  const staffInvite = matchPath("/staff-invite/:token", path);
  if (staffInvite && (state.phase === "signed_out" || state.phase === "no_organisation" || state.phase === "ready")) return <StaffInvitePage token={staffInvite.token!} />;
  // The tour is public: it shows no data.
  if (path === "/tour") return <TourPage />;
  if (path === "/film") return <FilmPage />;
  if (path === "/pricing") return <PricingPage />;
  if (path === "/blog") return <BlogIndex />;
  if (path === "/self-check") return <SelfCheckPage />;
  if (path === "/self-check/result") return <SelfCheckShared />;
  if (path === "/privacy") return <LegalPage which="privacy" />;
  if (path === "/terms") return <LegalPage which="terms" />;
  const blogPost = matchPath("/blog/:slug", path);
  if (blogPost) return <BlogPost slug={blogPost.slug!} />;
  // The client's contract and payment return pages: no account needed, the link is the key.
  const contract = matchPath("/contract/:token", path);
  if (contract) return <ContractPage token={contract.token!} />;
  if (path === "/paid") return <PaidPage />;
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
      if (isDemo) {
        exitDemo();
        return null;
      }
      // Visitors land on the home page; everything else asks them to sign in.
      return path === "/" ? <LandingPage /> : <SignIn />;
    case "no_organisation":
      return (
        <StaffProvider>
          <NoOrganisation />
        </StaffProvider>
      );
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
          <StaffProvider>
            <Shell>
              <ProfilePrompt />
              <Routes />
            </Shell>
          </StaffProvider>
        </PeopleProvider>
      );
  }
}

/**
 * Signed in, but in no organisation. TEBOS's staff work from the staff
 * workspace (a platform admin can still create an organisation from "/");
 * anyone else is told how access works.
 */
function NoOrganisation() {
  const { access, loading } = useStaff();
  const path = usePath();
  if (loading) return <div className="auth"><Loading label="Opening TEBOS" /></div>;
  const staff = access?.sales || access?.maintainer;
  if (!staff || (access?.admin && path === "/")) return <CreateOrganisation />;
  return (
    <StaffShell>
      {path === "/" ? <PipelinePage /> : <Routes routes={STAFF_ROUTES} />}
    </StaffShell>
  );
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
