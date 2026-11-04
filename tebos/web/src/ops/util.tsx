// Shared pieces for Tidy Property Operations: money, months, roles, CSV download, and a portfolio context so pages
// don't each re-load the account.
import { createContext, useContext, type ReactNode } from "react";
import { monthStart, nextMonth, rand, saToday } from "@core/opsLedger";
import { useOrg } from "../lib/session";
import { useQuery, type QueryState } from "../lib/useQuery";
import { portfolio, type Portfolio } from "../lib/opsData";

export const OPS_NAME = "Tidy Property Operations";

/** Money, always from integer cents. `basis` says what kind of figure it is. */
export function Money({ cents, basis }: { cents: number; basis?: "expected" | "billed" | "received" | "estimated" | "owed" | "held" | "actual" }) {
  return (
    <span className={`ops-money ${cents < 0 ? "neg" : ""}`} data-basis={basis}>
      {rand(cents)}
    </span>
  );
}

export const BASIS_LABEL = {
  expected: "Expected: from leases",
  billed: "Billed: rent charged",
  received: "Received: payments recorded",
  estimated: "Estimated: market rent of vacant units",
  owed: "Owed: charges not yet settled",
  held: "Held: deposits paid in less refunded",
  actual: "Actual: recorded costs",
} as const;

export const thisMonth = () => monthStart(saToday());
export function prevMonth(m: string): string {
  const y = Number(m.slice(0, 4)), mo = Number(m.slice(5, 7));
  return mo === 1 ? `${y - 1}-12-01` : `${y}-${String(mo - 1).padStart(2, "0")}-01`;
}
export { nextMonth };
export const monthLabel = (m: string) => new Date(`${m}T00:00:00Z`).toLocaleDateString("en-ZA", { month: "long", year: "numeric", timeZone: "UTC" });
export const dayLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** Owners and property managers change records; approvers decide on quotes; viewers read. */
export function useRoles() {
  const { role } = useOrg();
  return {
    manage: role === "org_admin" || role === "operator",
    approve: role === "org_admin" || role === "approver",
    role,
  };
}

export function downloadCsv(name: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// --- the account's portfolio, loaded once and refreshed after changes ---------------------------------------------------
const PortfolioContext = createContext<QueryState<Portfolio> | null>(null);

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const { db, organisation } = useOrg();
  const q = useQuery(() => portfolio(db, organisation.id), [organisation.id]);
  return <PortfolioContext.Provider value={q}>{children}</PortfolioContext.Provider>;
}

export function usePortfolio(): QueryState<Portfolio> {
  const q = useContext(PortfolioContext);
  if (!q) throw new Error("usePortfolio outside PortfolioProvider");
  return q;
}

/** A lease is current on a date when it has started and hasn't ended before it. */
export const leaseCovers = (l: { starts_on: string; ended_on: string | null }, day: string) => l.starts_on <= day && (!l.ended_on || l.ended_on >= day);
