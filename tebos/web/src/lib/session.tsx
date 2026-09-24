// Signed-in user, their organisations, and the organisation currently in view.
import type { Session } from "@supabase/supabase-js";
import { can, type OrgRole, type Permission } from "@core/permissions";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { myOrganisations, type Membership, type Organisation } from "./data";
import type { Db } from "./supabase";

export interface OrgContext {
  db: Db;
  session: Session;
  userId: string;
  organisation: Organisation;
  role: OrgRole;
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
  | { phase: "ready"; session: Session; organisations: OrgContext["organisations"]; currentId: string };

const Ctx = createContext<{ state: State; db: Db; refresh: () => Promise<void>; switchOrganisation: (id: string) => void } | null>(null);

const ORG_KEY = "tebos.organisation";
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

export function SessionProvider({ db, children }: { db: Db; children: ReactNode }) {
  const [state, setState] = useState<State>({ phase: "loading" });
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    db.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = db.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, [db]);

  const load = useCallback(
    async (s: Session | null | undefined, preferId?: string) => {
      if (s === undefined) return;
      if (!s) return setState({ phase: "signed_out" });
      try {
        const organisations = await myOrganisations(db, s.user.id);
        if (organisations.length === 0) return setState({ phase: "no_organisation", session: s });
        const want = preferId ?? remembered();
        const currentId = organisations.find((o) => o.organisation.id === want)?.organisation.id ?? organisations[0]!.organisation.id;
        setState({ phase: "ready", session: s, organisations, currentId });
      } catch (e) {
        setState({ phase: "error", message: (e as Error).message ?? "Could not load your organisations" });
      }
    },
    [db],
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
    }),
    [state, db, load, session],
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
    organisations: state.organisations,
    switchOrganisation,
    refreshOrganisations: refresh,
    can: (p) => can(role, p),
  };
}
