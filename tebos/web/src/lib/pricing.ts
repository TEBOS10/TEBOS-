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

const monthly = (k: "starter" | "growth") => formatRand(PLAN_TERMS[k].monthlyCents!);

// The plans follow the TEBOS lifecycle (ADR 0003): a Diagnostic, then
// Architecture & Operations. The keys stay "starter" and "growth": they are
// what enquiries store.
export const PLANS: Plan[] = [
  {
    key: "starter",
    name: PLAN_TERMS.starter.name,
    price: monthly("starter"),
    cadence: "per month",
    pitch: "Map how the business really runs, and where it still runs through you.",
    features: PLAN_TERMS.starter.deliverables,
    cta: "Start with a diagnostic",
  },
  {
    key: "growth",
    name: PLAN_TERMS.growth.name,
    price: monthly("growth"),
    cadence: "per month",
    pitch: "Design how the business should run, connect what you already use, and run it against your objectives.",
    features: PLAN_TERMS.growth.deliverables,
    cta: "Get started",
  },
  {
    key: "company",
    name: PLAN_TERMS.company.name,
    price: formatRand(PLAN_TERMS.company.monthlyFromCents!),
    cadence: `per month and up, after a ${formatRand(PLAN_TERMS.company.firstPaymentCents!)} Company Diagnostic`,
    pitch: "For established companies: every department architected, measured and run, with a proposal scoped to you.",
    features: PLAN_TERMS.company.deliverables,
    cta: "Start with a Company Diagnostic",
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
