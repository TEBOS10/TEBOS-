// TEBOS plans as shown on the public pricing page. Prices are monthly, in
// Rand, excluding VAT. Change them here.

export type PlanKey = "starter" | "growth" | "equity";

export interface Plan {
  key: PlanKey;
  name: string;
  price: string;
  cadence: string;
  pitch: string;
  features: string[];
  cta: string;
}

export const EQUITY_SHARE = "5%";

// The plans follow the TEBOS lifecycle (ADR 0003): a Diagnostic, then
// Architecture & Operations. The keys stay "starter" and "growth": they are
// what enquiries store.
export const PLANS: Plan[] = [
  {
    key: "starter",
    name: "Diagnostic",
    price: "R2,500",
    cadence: "per month",
    pitch: "Map how the business really runs, and where it still runs through you.",
    features: [
      "Assess: a website scan every month and a diagnostic interview each quarter (AI call or written)",
      "Map: your operating board of objectives, pieces and flows",
      "See which steps depend on the founder's memory",
      "Findings with the evidence behind each one",
      "Up to 3 team members",
    ],
    cta: "Start with a diagnostic",
  },
  {
    key: "growth",
    name: "Architecture & Operations",
    price: "R7,500",
    cadence: "per month",
    pitch: "Design how the business should run, connect what you already use, and run it against your objectives.",
    features: [
      "Everything in the Diagnostic",
      "Architect: rules, owners and handovers for each flow",
      "Integrate: read-only connections to the tools and providers you already use",
      "Govern: every change proposed, approved and on the record",
      "Measure: objectives tracked on your real numbers, not estimates",
      "A diagnostic interview every month",
      "Unlimited team members",
    ],
    cta: "Get started",
  },
  {
    key: "equity",
    name: "Equity partnership",
    price: EQUITY_SHARE,
    cadence: "equity, instead of fees",
    pitch: "For businesses that can't pay upfront: we take a fixed share and grow with you.",
    features: [
      "Everything in Architecture & Operations",
      "No monthly fees",
      "Hands-on support from the TEBOS team to put the architecture in place",
      "A fixed share, agreed upfront",
    ],
    cta: "Apply",
  },
];
