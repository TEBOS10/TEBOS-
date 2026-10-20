// TEBOS's plans: one source for the pricing page, the payment amount and the
// deliverables written into each client's contract. Prices are in Rand,
// excluding VAT (founder, 20 Oct 2026; tebos-service-spec.md §2).
//
// Three tiers by the size of the business, the same for every industry:
// Small, Medium and Company. The subscription includes the build (the website
// and the operating system from the industry's template) and a number of
// change requests each month. Monthly plans run for at least six months; an
// annual plan is ten months' fee for twelve, paid up front. Hosting and any
// service that runs only for the client are charged at cost, listed before
// anything is set up. The plan keys stay "starter", "growth" and "company":
// they are what enquiries, opportunities and billing accounts store.

export type PlanKey = "starter" | "growth" | "company" | "equity";

export interface PlanTerms {
  key: PlanKey;
  name: string;
  /** Fixed monthly fee in cents (ZAR); null when there is none (scoped, or equity). */
  monthlyCents: number | null;
  /** What the client pays before anything starts, in cents; null when nothing is paid online. */
  firstPaymentCents: number | null;
  /** What that first payment is for, e.g. "the first month". */
  firstPaymentFor: string;
  /** Change requests a client may make each month through the client channel (mirrors plan_change_allowance). */
  changeRequestsPerMonth: number;
  deliverables: string[];
}

export const EQUITY_SHARE = "5%";

export const MIN_TERM_MONTHS = 6;
/** An annual plan: twelve months for the price of this many. */
export const ANNUAL_MONTHS_CHARGED = 10;
export const RUNNING_COSTS = "Hosting and any service that runs only for you (a domain, a phone number, a paid map) are charged at cost, and listed with their price before anything is set up";

export const PLAN_TERMS: Record<PlanKey, PlanTerms> = {
  starter: {
    key: "starter",
    name: "Small",
    monthlyCents: 50_000,
    firstPaymentCents: 50_000,
    firstPaymentFor: "the first month",
    changeRequestsPerMonth: 5,
    deliverables: [
      "Build: a website made for your business, and your operating system from your industry's template",
      "An assistant for the owner: reminders and answers from your own records",
      "Your operating board: objectives, pieces and flows",
      "5 change requests a month through your TEBOS channel",
      "Up to 3 team members",
    ],
  },
  growth: {
    key: "growth",
    name: "Medium",
    monthlyCents: 250_000,
    firstPaymentCents: 250_000,
    firstPaymentFor: "the first month",
    changeRequestsPerMonth: 15,
    deliverables: [
      "Everything in Small",
      "Team roles, owners and handovers for each flow",
      "Read-only connections to the tools you already use",
      "Objectives tracked on your real numbers, not estimates",
      "A monthly review",
      "15 change requests a month through your TEBOS channel",
    ],
  },
  company: {
    key: "company",
    name: "Company",
    monthlyCents: 750_000,
    firstPaymentCents: 750_000,
    firstPaymentFor: "the first month",
    changeRequestsPerMonth: 40,
    deliverables: [
      "Everything in Medium, across every department",
      "A named TEBOS maintainer",
      "A monthly review with your leadership",
      "40 change requests a month through your TEBOS channel",
    ],
  },
  equity: {
    key: "equity",
    name: "Equity partnership",
    monthlyCents: null,
    firstPaymentCents: null,
    firstPaymentFor: "nothing: equity partners pay no fees",
    changeRequestsPerMonth: 0,
    deliverables: [
      "Everything in Architecture & Operations",
      "No monthly fees",
      "Hands-on support from the TEBOS team to put the architecture in place",
      "A fixed share, agreed upfront",
    ],
  },
};

/** The fee terms written into a contract, e.g. "R500 per month, excluding VAT, for at least 6 months ...". */
export function feeTerms(plan: PlanKey): string {
  const t = PLAN_TERMS[plan];
  if (t.monthlyCents !== null) {
    return `${formatRand(t.monthlyCents)} per month, excluding VAT, for at least ${MIN_TERM_MONTHS} months; or ${formatRand(t.monthlyCents * ANNUAL_MONTHS_CHARGED)} a year, excluding VAT, paid up front. ${RUNNING_COSTS}`;
  }
  if (t.firstPaymentCents !== null) return `${formatRand(t.firstPaymentCents)} once, excluding VAT, for ${t.firstPaymentFor}`;
  return "no fees";
}

/** "R2,500" from 250000 cents. */
export function formatRand(cents: number): string {
  return `R${Math.round(cents / 100).toLocaleString("en-ZA").replace(/ |\s/g, ",")}`;
}
