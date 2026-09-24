// Names for the people in the current organisation, so history reads
// "Nia approved" rather than an id. Only colleagues' profiles are readable
// (row-level security), so a name is shown only to people who share an
// organisation with that person.
import { createContext, useContext, type ReactNode } from "react";
import { listMembers, myProfile, type Profile } from "./data";
import { useOrg } from "./session";
import { useQuery } from "./useQuery";

interface People {
  members: Awaited<ReturnType<typeof listMembers>>;
  me: Profile | null;
  loaded: boolean;
  nameOf: (userId: string | null | undefined) => string;
  actorLabel: (actorType: string, actorId: string | null) => string;
  reload: () => void;
}

const Ctx = createContext<People | null>(null);

export function PeopleProvider({ children }: { children: ReactNode }) {
  const { db, organisation, userId } = useOrg();
  const q = useQuery(async () => ({ members: await listMembers(db, organisation.id), me: await myProfile(db, userId) }), [organisation.id, userId]);
  const members = q.data?.members ?? [];

  const nameOf = (id: string | null | undefined) => {
    if (!id) return "Unknown";
    if (id === userId) return q.data?.me?.display_name ? `${q.data.me.display_name} (you)` : "You";
    const m = members.find((x) => x.membership.user_id === id);
    if (m?.profile) return m.profile.display_name;
    return m ? "A member without a name yet" : "Someone no longer in this organisation";
  };
  const actorLabel = (actorType: string, actorId: string | null) =>
    actorType === "user" ? nameOf(actorId) : actorType === "agent" ? "TEBOS agent" : actorType === "connector" ? "Connector" : "System";

  return (
    <Ctx.Provider value={{ members, me: q.data?.me ?? null, loaded: !!q.data, nameOf, actorLabel, reload: q.reload }}>{children}</Ctx.Provider>
  );
}

export function usePeople(): People {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("PeopleProvider missing");
  return ctx;
}
