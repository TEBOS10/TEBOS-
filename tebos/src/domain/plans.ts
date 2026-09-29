// TEBOS's plans: one source for the pricing page, the payment amount and the
// deliverables written into each client's contract. Prices are monthly, in
// Rand, excluding VAT.

export type PlanKey = "starter" | "growth" | "equity";

export interface PlanTerms {
  key: PlanKey;
  name: string;
  /** Monthly fee in cents (ZAR); null for the equity partnership. */
  monthlyCents: number | null;
  deliverables: string[];
}

export const EQUITY_SHARE = "5%";

export const PLAN_TERMS: Record<PlanKey, PlanTerms> = {
  starter: {
    key: "starter",
    name: "Diagnostic",
    monthlyCents: 250_000,
    deliverables: [
      "Assess: a website scan every month and a diagnostic interview each quarter (AI call or written)",
      "Map: your operating board of objectives, pieces and flows",
      "See which steps depend on the founder's memory",
      "Findings with the evidence behind each one",
      "Up to 3 team members",
    ],
  },
  growth: {
    key: "growth",
    name: "Architecture & Operations",
    monthlyCents: 750_000,
    deliverables: [
      "Everything in the Diagnostic",
      "Architect: rules, owners and handovers for each flow",
      "Integrate: read-only connections to the tools and providers you already use",
      "Govern: every change proposed, approved and on the record",
      "Measure: objectives tracked on your real numbers, not estimates",
      "A diagnostic interview every month",
      "Unlimited team members",
    ],
  },
  equity: {
    key: "equity",
    name: "Equity partnership",
    monthlyCents: null,
    deliverables: [
      "Everything in Architecture & Operations",
      "No monthly fees",
      "Hands-on support from the TEBOS team to put the architecture in place",
      "A fixed share, agreed upfront",
    ],
  },
};

/** "R2,500" from 250000 cents. */
export function formatRand(cents: number): string {
  return `R${Math.round(cents / 100).toLocaleString("en-ZA").replace(/ |\s/g, ",")}`;
}
