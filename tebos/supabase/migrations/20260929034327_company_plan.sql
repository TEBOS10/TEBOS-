-- The Company plan: for established companies (roughly 20 to 200 people).
-- They pay a one-off Company Diagnostic first; the monthly fee after it is
-- scoped in a written proposal. The amounts live in src/domain/plans.ts, the
-- one source for the pricing page, the payment and the contract.

alter table public.enquiries drop constraint enquiries_plan_check,
  add constraint enquiries_plan_check check (plan in ('starter', 'growth', 'company', 'equity'));
alter table public.opportunities drop constraint opportunities_plan_check,
  add constraint opportunities_plan_check check (plan in ('starter', 'growth', 'company', 'equity'));
alter table public.contract_templates drop constraint contract_templates_plan_check,
  add constraint contract_templates_plan_check check (plan in ('starter', 'growth', 'company', 'equity'));

-- The playbook's plans section, with the new tier (prices stay placeholders).
update public.sales_playbook set body = $pb$Prices are fixed. Don't discount, don't bundle, don't promise extras: the contract the client signs lists exactly these deliverables.

## Which plan

- **Small businesses** (up to about 20 people): the {{starter_name}}, then {{growth_name}}.
- **Established companies** (about 20 to 200 people, several departments, a leadership team): {{company_name}}. Don't sell them the small plans: they need every department mapped, and they can pay for it.
- **Strong businesses that can't pay upfront:** they can apply for the {{equity_name}}.

## {{starter_name}}: {{starter_fee}}

Where every small business starts. We map how the business really runs.

{{starter_deliverables}}

## {{growth_name}}: {{growth_fee}}

For small businesses ready to have the structure built and run.

{{growth_deliverables}}

## {{company_name}}: from {{company_from}}

It starts with the Company Diagnostic, {{company_diagnostic_fee}}, paid before any work starts. After it, TEBOS writes a proposal with a fixed monthly fee scoped to the company. You don't quote the monthly fee; say "from" the figure above, and that the proposal sets it.

{{company_deliverables}}

## {{equity_name}}: {{equity_share}} equity instead of fees

For strong businesses that can't pay upfront. It needs a valuation and a shareholder agreement, so it takes longer and TEBOS's founders decide each one. Don't promise it: say "you can apply, and the team decides".

{{equity_deliverables}}

## International clients

Every plan is available outside South Africa. Clients pay by card on the Paystack page, in Rand; company proposals can be quoted in US dollars, euros or pounds.

## How payment works

- Small-business plans: monthly, in advance, month to month. Either side can end it with 30 days' notice.
- The first payment (the first month, or the Company Diagnostic) is made online before anything starts, including the first call.
- Once the payment is confirmed, TEBOS emails the agreement automatically. When the client accepts it, their account is set up and their TEBOS maintainer is assigned.$pb$
 where key = 'plans';
