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

export const PLANS: Plan[] = [
  {
    key: "starter",
    name: "Starter",
    price: "R2,500",
    cadence: "per month",
    pitch: "See clearly what's holding the business back.",
    features: [
      "Website and public-presence scan, re-run monthly",
      "A diagnostic interview each quarter (AI call or written)",
      "Findings with the evidence behind each one",
      "Action tracking with approvals",
      "Up to 3 team members",
    ],
    cta: "Get started",
  },
  {
    key: "growth",
    name: "Growth",
    price: "R7,500",
    cadence: "per month",
    pitch: "Connect your real numbers and prove every fix.",
    features: [
      "Everything in Starter",
      "Read-only connections to the tools you already use",
      "Reviews that combine interviews, live figures and your website",
      "A diagnostic interview every month",
      "Outcome checks: each fix measured against your numbers",
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
      "Everything in Growth",
      "No monthly fees",
      "Hands-on support from the TEBOS team to put fixes in place",
      "A fixed share, agreed upfront",
    ],
    cta: "Apply",
  },
];
