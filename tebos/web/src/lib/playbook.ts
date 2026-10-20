// The sales playbook's text lives in the database (table sales_playbook),
// readable only by TEBOS's staff, so it is never part of this app's public
// code. Prices and deliverables in it are {{placeholders}}, filled here from
// the plan terms that the pricing page and every contract use.
import { ANNUAL_MONTHS_CHARGED, EQUITY_SHARE, formatRand, MIN_TERM_MONTHS, PLAN_TERMS, RUNNING_COSTS } from "@core/plans";

const list = (items: string[]) => items.map((i) => `- ${i}`).join("\n");
const fee = (cents: number) => `${formatRand(cents)} a month, excluding VAT`;

export const PLAYBOOK_FIELDS: Record<string, string> = {
  starter_name: PLAN_TERMS.starter.name,
  starter_fee: fee(PLAN_TERMS.starter.monthlyCents!),
  starter_deliverables: list(PLAN_TERMS.starter.deliverables),
  growth_name: PLAN_TERMS.growth.name,
  growth_fee: fee(PLAN_TERMS.growth.monthlyCents!),
  growth_deliverables: list(PLAN_TERMS.growth.deliverables),
  company_name: PLAN_TERMS.company.name,
  company_fee: fee(PLAN_TERMS.company.monthlyCents!),
  // in playbook text written before 20 Oct 2026 (since replaced): the Company plan no longer has a separate diagnostic fee
  company_from: fee(PLAN_TERMS.company.monthlyCents!),
  company_diagnostic_fee: "included: the first month is paid instead",
  company_deliverables: list(PLAN_TERMS.company.deliverables),
  equity_name: PLAN_TERMS.equity.name,
  equity_share: EQUITY_SHARE,
  equity_deliverables: list(PLAN_TERMS.equity.deliverables),
  min_term: `${MIN_TERM_MONTHS} months`,
  annual: `${ANNUAL_MONTHS_CHARGED} months' fee for 12, paid up front`,
  running_costs: RUNNING_COSTS,
};

/** Fills the known placeholders; an unknown one is left visible, so a typo shows instead of vanishing. */
export function fillPlaybook(text: string): string {
  return text.replace(/\{\{([a-z_]+)\}\}/g, (whole, key: string) => PLAYBOOK_FIELDS[key] ?? whole);
}
