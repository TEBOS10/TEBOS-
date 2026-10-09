// TEBOS's own staff: who they are and what they may do. Staff don't share an
// organisation with each other, so names come from the staff directory (a
// database function only staff can read), not from organisation profiles.
import { createContext, useContext, type ReactNode } from "react";
import { isDemo } from "../demo/mode";
import { staffAccess, staffDirectory, type StaffAccess, type StaffMember } from "./data";
import { useSignedIn } from "./session";
import { useQuery } from "./useQuery";

interface Staff {
  access: StaffAccess | null;
  loading: boolean;
  members: StaffMember[];
  nameOf: (userId: string | null | undefined) => string;
  reload: () => void;
}

const NO_ACCESS: StaffAccess = { admin: false, sales: false, maintainer: false };
const Ctx = createContext<Staff | null>(null);

export function StaffProvider({ children }: { children: ReactNode }) {
  const { db, userId } = useSignedIn();
  const access = useQuery(() => (isDemo ? Promise.resolve(NO_ACCESS) : staffAccess(db, userId)), [userId]);
  const isStaff = !!(access.data?.sales || access.data?.maintainer);
  const directory = useQuery(() => (isStaff ? staffDirectory(db) : Promise.resolve([])), [isStaff]);
  const members = directory.data ?? [];
  const nameOf = (id: string | null | undefined) => {
    if (!id) return "Nobody";
    const m = members.find((x) => x.user_id === id);
    const name = m?.display_name ?? "Former staff";
    return id === userId ? `${name} (you)` : name;
  };
  return (
    <Ctx.Provider value={{ access: access.data ?? null, loading: access.loading && !access.data, members, nameOf, reload: () => { access.reload(); directory.reload(); } }}>
      {children}
    </Ctx.Provider>
  );
}

export function useStaff(): Staff {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("StaffProvider missing");
  return ctx;
}
