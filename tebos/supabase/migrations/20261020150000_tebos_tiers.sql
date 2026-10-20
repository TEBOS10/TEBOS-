-- TEBOS's three tiers (founder, 20 Oct 2026; tebos-service-spec.md §2): Small, Medium and Company, the same for every
-- industry, each including the build and a number of change requests a month. Monthly plans run for at least six
-- months; a yearly plan is ten months' fee for twelve. The amounts live in src/domain/plans.ts; the playbook's text
-- keeps them as {{placeholders}}. The plan keys don't change.

update public.sales_playbook set body = $pb$Prices are fixed. Don't discount, don't bundle, don't promise extras: the contract the client signs lists exactly these deliverables.

## Which plan

The plan follows the size of the business, in every industry. Recommend the diagnostic first: it finds what the business actually needs, and the plan that fits it.

- **A business that knows how it runs** and needs its website and system brought up to standard (a tutor, a salon, a sole trader): {{starter_name}}.
- **A business with a team**, more workflows and tools to connect: {{growth_name}}.
- **A company with several departments:** {{company_name}}. Larger organisations get a written quote.

Respect ambition, but sell the step the business can use now, and show the steps after it.

## {{starter_name}}: {{starter_fee}}

{{starter_deliverables}}

## {{growth_name}}: {{growth_fee}}

{{growth_deliverables}}

## {{company_name}}: {{company_fee}}

{{company_deliverables}}

## Every plan

- At least {{min_term}}; or yearly, {{annual}}.
- {{running_costs}}.
- Change requests come through the client's TEBOS channel. When the month's are used, new ones open on the 1st; the system already built keeps working in full.

## International clients

Every plan is available outside South Africa. Clients pay by card on the Paystack page, in Rand; written quotes can be in US dollars, euros or pounds.

## How payment works

- The first month is paid online before anything starts, including the first call.
- Once the payment is confirmed, TEBOS emails the agreement automatically. When the client accepts it, their account is set up and their TEBOS maintainer is assigned.$pb$
 where department = 'sales' and key = 'plans';

update public.sales_playbook set body = replace(replace(body,
  $pb$The {{starter_name}} is month to month: if it's not earning its place, you stop.$pb$,
  $pb$The {{starter_name}} is {{starter_fee}}, with the build included: a website and a system you'd pay far more to have made once.$pb$),
  $pb$the first month is how you try it: month to month, 30 days' notice.$pb$,
  $pb$the diagnostic shows what we'd build before you commit to a plan.$pb$)
 where department = 'sales' and key = 'objections';
