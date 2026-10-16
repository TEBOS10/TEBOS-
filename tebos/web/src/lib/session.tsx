// Signed-in user, their organisations, and the organisation currently in view.
import type { Session } from "@supabase/supabase-js";
import { can, type OrgRole, type Permission } from "@core/permissions";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { myOrganisations, type App, type Membership, type Organisation } from "./data";
import type { Db } from "./supabase";

export interface OrgContext {
  db: Db;
  session: Session;
  userId: string;
  organisation: Organisation;
  role: OrgRole;
  /** this session passed two-step sign-in (aal2); the private organisation's records need it */
  twoStep: boolean;
  organisations: Array<{ membership: Membership; organisation: Organisation }>;
  switchOrganisation: (id: string) => void;
  refreshOrganisations: () => Promise<void>;
  can: (permission: Permission) => boolean;
}

type State =
  | { phase: "loading" }
  | { phase: "signed_out" }
  | { phase: "no_organisation"; session: Session }
  | { phase: "error"; message: string }
  // signed in with a password, and the account has two-step sign-in: the code comes first
  | { phase: "two_step"; session: Session }
  | { phase: "ready"; session: Session; organisations: OrgContext["organisations"]; currentId: string; twoStep: boolean };

const Ctx = createContext<{
  state: State; db: Db; refresh: () => Promise<void>; switchOrganisation: (id: string) => void;
  /** the person arrived from a password-reset email: they choose a new password before anything else */
  recovery: boolean; endRecovery: () => void;
} | null>(null);

// A reset email's link carries type=recovery. Read it as the app loads, before the auth client tidies the address
// away: if the link lands on a page other than /reset-password (Supabase falls back to the main address when the
// requested one isn't on its allowed list), the person is still asked for a new password, not simply signed in.
const RECOVERY_IN_LINK = typeof window !== "undefined" && /(^|[#&?])type=recovery(&|$)/.test(window.location.hash + "&" + window.location.search.slice(1));

const ORG_KEY = "tebos.organisation";

/** The session's assurance level, read from its token. Anything unreadable counts as no second step. */
async function assurance(db: Db): Promise<{ current: string | null; next: string | null }> {
  try {
    const { data } = await db.auth.mfa.getAuthenticatorAssuranceLevel();
    return { current: data?.currentLevel ?? null, next: data?.nextLevel ?? null };
  } catch {
    return { current: null, next: null };
  }
}
const remembered = () => {
  try {
    return localStorage.getItem(ORG_KEY);
  } catch {
    return null;
  }
};
const remember = (id: string) => {
  try {
    localStorage.setItem(ORG_KEY, id);
  } catch {
    /* storage unavailable: the choice just isn't remembered */
  }
};

export function SessionProvider({ db, app = "tebos", children }: { db: Db; app?: App; children: ReactNode }) {
  const [state, setState] = useState<State>({ phase: "loading" });
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [recovery, setRecovery] = useState(RECOVERY_IN_LINK);

  useEffect(() => {
    db.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = db.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      setSession(s);
    });
    return () => data.subscription.unsubscribe();
  }, [db]);

  const load = useCallback(
    async (s: Session | null | undefined, preferId?: string) => {
      if (s === undefined) return;
      if (!s) return setState({ phase: "signed_out" });
      try {
        const level = await assurance(db);
        if (level.next === "aal2" && level.current !== "aal2") return setState({ phase: "two_step", session: s });
        const organisations = await myOrganisations(db, s.user.id, app);
        if (organisations.length === 0) return setState({ phase: "no_organisation", session: s });
        const want = preferId ?? remembered();
        const currentId = organisations.find((o) => o.organisation.id === want)?.organisation.id ?? organisations[0]!.organisation.id;
        setState({ phase: "ready", session: s, organisations, currentId, twoStep: level.current === "aal2" });
      } catch (e) {
        setState({ phase: "error", message: (e as Error).message ?? "Could not load your organisations" });
      }
    },
    [db, app],
  );

  useEffect(() => {
    void load(session);
  }, [session, load]);

  const value = useMemo(
    () => ({
      state,
      db,
      refresh: () => load(session),
      switchOrganisation: (id: string) => {
        remember(id);
        void load(session, id);
      },
      recovery,
      endRecovery: () => setRecovery(false),
    }),
    [state, db, load, session, recovery],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSessionState() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("SessionProvider missing");
  return ctx;
}

/** The organisation context; only valid inside the signed-in, organisation-ready part of the app. */
export function useOrg(): OrgContext {
  const { state, db, refresh, switchOrganisation } = useSessionState();
  if (state.phase !== "ready") throw new Error("useOrg used outside a ready session");
  const current = state.organisations.find((o) => o.organisation.id === state.currentId)!;
  const role = current.membership.role as OrgRole;
  return {
    db,
    session: state.session,
    userId: state.session.user.id,
    organisation: current.organisation,
    role,
    twoStep: state.twoStep,
    organisations: state.organisations,
    switchOrganisation,
    refreshOrganisations: refresh,
    can: (p) => can(role, p),
  };
}

export interface SignedIn {
  db: Db;
  session: Session;
  userId: string;
}

/** The signed-in person, with or without an organisation (TEBOS's staff may have none). */
export function useSignedIn(): SignedIn {
  const { state, db } = useSessionState();
  if (state.phase !== "ready" && state.phase !== "no_organisation") throw new Error("useSignedIn used while signed out");
  return { db, session: state.session, userId: state.session.user.id };
}
