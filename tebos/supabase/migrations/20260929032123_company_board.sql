-- TEBOS runs on TEBOS. TEBOS's own company is a business on its own board,
-- and its numbers reach that board the same way a client's do: as readings
-- from a connected system, which objectives are measured against.
--
--   * tebos_private.company_snapshot(): aggregate numbers from TEBOS's own
--     pipeline and payments (counts and Rand totals only, no names, emails
--     or client details). Only TEBOS's server can call it.
--   * The "tebos-company" connector reads that snapshot. Only an
--     organisation listed in tebos_private.company_orgs (TEBOS's own) may
--     hold it, so no client can ever attach it and read TEBOS's revenue.
--   * Objectives can be measured automatically: bound to a reading (metric
--     and path), they gain a measured value with every new reading. The
--     database still reads each value from the evidence; nobody types it.
--     Reading is tier 0, so this is within the autonomy policy.

-- ---------------------------------------------------------------------------
-- Automatic measurement
-- ---------------------------------------------------------------------------
alter table public.objectives
  add column measure_metric text check (measure_metric is null or measure_metric ~ '^[a-z][a-z0-9_.]{1,80}$'),
  add column measure_path   text[] check (measure_path is null or cardinality(measure_path) between 1 and 8),
  add constraint objectives_measure_binding check ((measure_metric is null) = (measure_path is null));

create or replace function tebos_private.guard_objective_binding() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- what an objective is measured by is part of its goalposts: it can be set
  -- once it's active, but not changed
  if old.status <> 'draft' and old.measure_metric is not null
     and (new.measure_metric, new.measure_path) is distinct from (old.measure_metric, old.measure_path) then
    raise exception 'what an active objective is measured by is fixed; retire it and set a new one'
      using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;
  return new;
end $$;

create trigger guard_objective_binding before update on public.objectives
  for each row execute function tebos_private.guard_objective_binding();

-- ---------------------------------------------------------------------------
-- TEBOS's own company, and its snapshot
-- ---------------------------------------------------------------------------
create table tebos_private.company_orgs (
  org_id     uuid primary key references public.organisations (id) on delete cascade,
  created_at timestamptz not null default now()
);

insert into public.connectors (key, provider, name, auth_method, supports_webhooks, supports_polling, rate_limit,
                               data_sensitivity, execution_method)
values ('tebos-company', 'TEBOS', 'TEBOS company numbers (read-only)', 'none', false, true,
        '{"min_interval_minutes": 15}', 'controlled', 'api');

insert into public.connector_capabilities (connector_key, capability_key, operation, risk_tier, required_scopes)
values ('tebos-company', 'operations.read_metrics', 'read', 0, '{operations:read}');

create function tebos_private.guard_company_connector() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.connector_key = 'tebos-company'
     and not exists (select 1 from tebos_private.company_orgs where org_id = new.org_id) then
    raise exception 'only TEBOS''s own organisation can read TEBOS''s company numbers'
      using errcode = '42501', hint = 'TEBOS_PERMISSION_DENIED';
  end if;
  return new;
end $$;

create trigger guard_company_connector before insert or update of connector_key, org_id on public.connection_instances
  for each row execute function tebos_private.guard_company_connector();

-- Aggregates only. Money is in Rand (whole units) so objectives in ZAR read it directly.
create function tebos_private.company_snapshot() returns jsonb
language sql stable security definer set search_path = '' as $$
  with
    o as (select * from public.opportunities),
    paid as (
      select p.opportunity_id, p.amount_cents, p.paid_at from public.payments p where p.status = 'success'
    ),
    first_paid as (select opportunity_id, min(paid_at) as at from paid group by opportunity_id)
  select jsonb_build_object(
    'schema_version', 1,
    'taken_at', now(),
    'leads', jsonb_build_object(
      'total', (select count(*) from public.enquiries),
      'last_7_days', (select count(*) from public.enquiries where created_at > now() - interval '7 days'),
      'last_30_days', (select count(*) from public.enquiries where created_at > now() - interval '30 days'),
      'from_sales_30_days', (select count(*) from public.enquiries where source = 'sales' and created_at > now() - interval '30 days'),
      'from_website_30_days', (select count(*) from public.enquiries where source = 'website' and created_at > now() - interval '30 days')
    ),
    'pipeline', jsonb_build_object(
      'by_status', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) as n from o group by status) s), '{}'::jsonb),
      'to_decide', (select count(*) from o where status = 'screened'),
      'oldest_undecided_days', coalesce((select floor(extract(epoch from now() - min(screened_at)) / 86400)::int from o where status = 'screened'), 0),
      'awaiting_payment', (select count(*) from o where status = 'awaiting_payment'),
      'awaiting_contract', (select count(*) from o where status in ('paid', 'contract_sent'))
    ),
    'sales', jsonb_build_object(
      'won_30_days', (select count(*) from first_paid where at > now() - interval '30 days'),
      'decided_30_days', (select count(*) from o where decided_at > now() - interval '30 days' and status <> 'cancelled'),
      'declined_30_days', (select count(*) from o where status = 'declined' and decided_at > now() - interval '30 days')
    ),
    'revenue', jsonb_build_object(
      'cash_collected_this_month_zar', coalesce((select sum(amount_cents) from paid where paid_at >= date_trunc('month', now())), 0) / 100,
      'cash_collected_last_30_days_zar', coalesce((select sum(amount_cents) from paid where paid_at > now() - interval '30 days'), 0) / 100,
      'cash_collected_total_zar', coalesce((select sum(amount_cents) from paid), 0) / 100,
      'payments_this_month', (select count(*) from paid where paid_at >= date_trunc('month', now()))
    ),
    'clients', jsonb_build_object(
      'active', (select count(*) from o where status = 'onboarded'),
      'contracted_monthly_fees_zar', coalesce((select sum(amount_cents) from o where status = 'onboarded'), 0) / 100,
      'without_maintainer', (select count(*) from o where status in ('contracted', 'onboarded') and maintainer_id is null)
    ),
    'team', jsonb_build_object(
      'sales', (select count(distinct user_id) from public.platform_staff where role = 'sales'),
      'maintainers', (select count(distinct user_id) from public.platform_staff where role = 'maintainer')
    ),
    'delivery', jsonb_build_object(
      'client_emails_failed', (select count(*) from public.outbox_emails where sent_at is null and attempts >= 5),
      'client_emails_waiting', (select count(*) from public.outbox_emails where sent_at is null and attempts < 5)
    )
  )
$$;

revoke all on function tebos_private.company_snapshot() from public;
grant execute on function tebos_private.company_snapshot() to service_role;
