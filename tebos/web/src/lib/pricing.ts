// TEBOS plans as shown on the public pricing page. Prices and deliverables
// come from the core plan terms (src/domain/plans.ts), the same ones the
// payment amount and every client's contract use.
import { EQUITY_SHARE, formatRand, PLAN_TERMS, type PlanKey } from "@core/plans";

export { EQUITY_SHARE };
export type { PlanKey };

export interface Plan {
  key: PlanKey;
  name: string;
  price: string;
  cadence: string;
  pitch: string;
  features: string[];
  cta: string;
}

const monthly = (k: "starter" | "growth" | "company") => formatRand(PLAN_TERMS[k].monthlyCents!);

// Three tiers by the size of the business (tebos-service-spec.md §2). The keys stay "starter", "growth" and
// "company": they are what enquiries store.
export const PLANS: Plan[] = [
  {
    key: "starter",
    name: PLAN_TERMS.starter.name,
    price: monthly("starter"),
    cadence: "per month",
    pitch: "For a business that knows how it runs and needs its website and system brought up to standard.",
    features: PLAN_TERMS.starter.deliverables,
    cta: "Start with Small",
  },
  {
    key: "growth",
    name: PLAN_TERMS.growth.name,
    price: monthly("growth"),
    cadence: "per month",
    pitch: "For a business with a team: roles, handovers and the tools you already use, run against your objectives.",
    features: PLAN_TERMS.growth.deliverables,
    cta: "Start with Medium",
  },
  {
    key: "company",
    name: PLAN_TERMS.company.name,
    price: monthly("company"),
    cadence: "per month",
    pitch: "For companies with several departments: every department built, measured and run.",
    features: PLAN_TERMS.company.deliverables,
    cta: "Start with Company",
  },
  {
    key: "equity",
    name: PLAN_TERMS.equity.name,
    price: EQUITY_SHARE,
    cadence: "equity, instead of fees",
    pitch: "For businesses that can't pay upfront: we take a fixed share and grow with you.",
    features: PLAN_TERMS.equity.deliverables,
    cta: "Apply",
  },
];
