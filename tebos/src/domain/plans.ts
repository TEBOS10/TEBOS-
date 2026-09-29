// TEBOS's plans: one source for the pricing page, the payment amount and the
// deliverables written into each client's contract. Prices are in Rand,
// excluding VAT.
//
// Small businesses pay a fixed monthly fee. Larger companies (roughly 20 to
// 200 people) pay a one-off Company Diagnostic first; the monthly fee after
// it is scoped to the company in a written proposal. Equity partners pay no
// fees.

export type PlanKey = "starter" | "growth" | "company" | "equity";

export interface PlanTerms {
  key: PlanKey;
  name: string;
  /** Fixed monthly fee in cents (ZAR); null when there is none (scoped, or equity). */
  monthlyCents: number | null;
  /** The lowest monthly fee a scoped plan is proposed at, in cents. */
  monthlyFromCents?: number;
  /** What the client pays before anything starts, in cents; null when nothing is paid online. */
  firstPaymentCents: number | null;
  /** What that first payment is for, e.g. "the first month". */
  firstPaymentFor: string;
  deliverables: string[];
}

export const EQUITY_SHARE = "5%";

export const PLAN_TERMS: Record<PlanKey, PlanTerms> = {
  starter: {
    key: "starter",
    name: "Diagnostic",
    monthlyCents: 250_000,
    firstPaymentCents: 250_000,
    firstPaymentFor: "the first month",
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
    firstPaymentCents: 750_000,
    firstPaymentFor: "the first month",
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
  company: {
    key: "company",
    name: "Company Operating Architecture",
    monthlyCents: null,
    monthlyFromCents: 2_500_000,
    firstPaymentCents: 1_500_000,
    firstPaymentFor: "the Company Diagnostic",
    deliverables: [
      "For companies of roughly 20 to 200 people",
      "Company Diagnostic first: interviews with your leadership and teams, a scan of your systems, and your full operating board",
      "A written architecture proposal with a fixed monthly fee, scoped to your company",
      "Everything in Architecture & Operations, across every department",
      "A named TEBOS maintainer and a monthly review with your leadership",
    ],
  },
  equity: {
    key: "equity",
    name: "Equity partnership",
    monthlyCents: null,
    firstPaymentCents: null,
    firstPaymentFor: "nothing: equity partners pay no fees",
    deliverables: [
      "Everything in Architecture & Operations",
      "No monthly fees",
      "Hands-on support from the TEBOS team to put the architecture in place",
      "A fixed share, agreed upfront",
    ],
  },
};

/** The fee terms written into a contract, e.g. "R2,500 per month, excluding VAT". */
export function feeTerms(plan: PlanKey): string {
  const t = PLAN_TERMS[plan];
  if (t.monthlyCents !== null) return `${formatRand(t.monthlyCents)} per month, excluding VAT`;
  if (t.firstPaymentCents !== null) {
    return `${formatRand(t.firstPaymentCents)} once, excluding VAT, for ${t.firstPaymentFor}; the monthly fee after it${t.monthlyFromCents ? ` (from ${formatRand(t.monthlyFromCents)} per month)` : ""} is agreed in a written proposal`;
  }
  return "no fees";
}

/** "R2,500" from 250000 cents. */
export function formatRand(cents: number): string {
  return `R${Math.round(cents / 100).toLocaleString("en-ZA").replace(/ |\s/g, ",")}`;
}
