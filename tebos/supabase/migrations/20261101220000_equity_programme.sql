-- The equity programme (founder, 1 Nov 2026; ADR 0013): a business that can't pay can apply to work with TEBOS for
-- 5% equity and 5.1% voting rights instead of fees, but only if it qualifies, only with the founder's approval and a
-- signed agreement, and only while TEBOS can see the business's sales through the client's own operating system.
-- TEBOS never sees bank accounts: the business records each sale in TEBOS and its owner closes each month.
-- Additive, apart from active_plan, which now also recognises an active equity partner's package.
--
-- The rules (mirrored in src/domain/equity.ts):
--   * An application qualifies only with: a CIPC registration number; at least 6 months of trading; an eligible kind
--     of business; revenue of at least R10,000 a month, with what was seen written down (the statements themselves are
--     not copied or kept); an owner working in it full time; and the owner's consent to record sales in TEBOS.
--   * Only a platform admin (the founder) approves, never the person who screened it, and at most 5 equity partners at
--     a time, so the programme can't swallow TEBOS's capacity.
--   * Nothing is active until the attorney-drafted agreement is signed and the terms are recorded: 5.00% equity and
--     5.10% voting rights, and one package (Small by default). Changing those numbers is a founder decision and a migration.
--   * The partner records every sale, refund and correction; records are never edited or deleted. The owner closes each
--     month; a closed month's totals are fixed, and nothing more can be recorded in it.
--   * TEBOS's staff read a business's sales only when it is an active equity partner. The audit flags overdue closes,
--     months with no sales, heavy corrections and sharp drops.

insert into public.state_transitions (machine, from_state, to_state) values
  ('equity_application', '(initial)', 'applied'),
  ('equity_application', 'applied', 'screening'),
  ('equity_application', 'applied', 'declined'),
  ('equity_application', 'applied', 'withdrawn'),
  ('equity_application', 'screening', 'qualified'),
  ('equity_application', 'screening', 'declined'),
  ('equity_application', 'screening', 'withdrawn'),
  ('equity_application', 'qualified', 'approved'),
  ('equity_application', 'qualified', 'declined'),
  ('equity_application', 'approved', 'agreement_signed'),
  ('equity_application', 'approved', 'withdrawn'),
  ('equity_application', 'agreement_signed', 'active'),
  ('equity_application', 'active', 'exited');

-- ---------------------------------------------------------------------------
-- Applications
-- ---------------------------------------------------------------------------
create table public.equity_applications (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid references public.organisations (id),
  business_name         text not null check (length(trim(business_name)) between 2 and 120),
  registration_number   text check (registration_number is null or registration_number ~ '^[0-9]{4}/[0-9]{6}/[0-9]{2}$'),
  sector                text not null check (sector in ('practice', 'education', 'trades', 'hospitality', 'retail', 'property',
                          'beauty_wellness', 'creative_services', 'logistics', 'other')),
  trading_since         date,
  revenue_band          text not null check (revenue_band in ('none', 'under_10k', '10k_50k', '50k_200k', 'over_200k')),
  employees             integer not null default 0 check (employees between 0 and 10000),
  owner_full_time       boolean not null default false,
  revenue_evidence_note text check (revenue_evidence_note is null or length(revenue_evidence_note) <= 1000),
  reporting_consent     boolean not null default false,
  package               text not null default 'starter' check (package in ('starter', 'growth', 'company')),
  status                text not null default 'applied',
  status_note           text not null check (length(trim(status_note)) between 10 and 1000),
  screened_by           uuid references auth.users (id),
  approved_by           uuid references auth.users (id),
  agreement_ref         text check (agreement_ref is null or length(trim(agreement_ref)) between 5 and 200),
  created_by            uuid references auth.users (id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (not tebos_private.looks_personal(status_note) and not tebos_private.looks_personal(revenue_evidence_note)),
  check (not tebos_private.looks_secret(status_note) and not tebos_private.looks_secret(revenue_evidence_note) and not tebos_private.looks_secret(agreement_ref))
);
create unique index equity_applications_one_open_per_org on public.equity_applications (org_id)
  where org_id is not null and status not in ('declined', 'withdrawn', 'exited');

-- what stops an application qualifying; empty means it qualifies
create function tebos_private.equity_qualification_gaps(a public.equity_applications) returns text[]
language sql stable set search_path = '' as $$
  select array_remove(array[
    case when a.registration_number is null then 'registration: a CIPC registration number (e.g. 2019/123456/07)' end,
    case when a.trading_since is null or a.trading_since > tebos_private.sa_today() - interval '6 months' then 'trading: at least 6 months of trading' end,
    case when a.sector = 'other' then 'sector: an eligible kind of business' end,
    case when a.revenue_band not in ('10k_50k', '50k_200k', 'over_200k') then 'revenue: at least R10,000 a month' end,
    case when length(trim(coalesce(a.revenue_evidence_note, ''))) < 20 then 'evidence: what was seen to confirm the revenue' end,
    case when not a.owner_full_time then 'owner: an owner working in the business full time' end,
    case when not a.reporting_consent then 'consent: the owner agrees to record every sale in TEBOS' end
  ], null)
$$;

create function tebos_private.guard_equity_application() returns trigger
language plpgsql set search_path = '' as $$
declare v_gaps text[];
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid(); new.screened_by := null; new.approved_by := null; new.agreement_ref := null;
    return new;
  end if;
  if new.created_by is distinct from old.created_by then
    raise exception 'who opened an application doesn''t change' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;
  if old.status not in ('applied', 'screening') and (new.business_name, new.registration_number, new.sector, new.trading_since, new.revenue_band,
       new.owner_full_time, new.revenue_evidence_note, new.reporting_consent, new.package) is distinct from
       (old.business_name, old.registration_number, old.sector, old.trading_since, old.revenue_band, old.owner_full_time,
        old.revenue_evidence_note, old.reporting_consent, old.package) then
    raise exception 'the screened facts are fixed once an application qualifies' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;
  new.screened_by := old.screened_by; new.approved_by := old.approved_by;
  if new.status is distinct from old.status then
    if new.status_note is not distinct from old.status_note then
      raise exception 'every change of state says why' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
    if new.status = 'qualified' then
      v_gaps := tebos_private.equity_qualification_gaps(new);
      if cardinality(v_gaps) > 0 then
        raise exception 'does not qualify: %', array_to_string(v_gaps, '; ') using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
      end if;
      new.screened_by := auth.uid();
    elsif new.status = 'approved' then
      if not tebos_private.is_platform_admin() then
        raise exception 'only the founder approves an equity partnership' using errcode = 'P0001', hint = 'TEBOS_NOT_APPROVER';
      end if;
      if auth.uid() = old.screened_by then
        raise exception 'the person who screened it can''t also approve it' using errcode = 'P0001', hint = 'TEBOS_SELF_APPROVAL';
      end if;
      if (select count(*) from public.equity_applications e where e.status in ('approved', 'agreement_signed', 'active') and e.id <> new.id) >= 5 then
        raise exception 'TEBOS already has 5 equity partners in place; the programme is full' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
      end if;
      new.approved_by := auth.uid();
    elsif new.status = 'agreement_signed' then
      if new.agreement_ref is null then
        raise exception 'record where the signed agreement is kept' using errcode = 'P0001', hint = 'TEBOS_CONTRACT_UNSIGNED';
      end if;
    elsif new.status = 'active' then
      if new.org_id is null or not exists (select 1 from public.equity_terms t where t.application_id = new.id and t.ended_on is null) then
        raise exception 'a partnership is active only once its terms are recorded for the client''s organisation' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
      end if;
    end if;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- The terms: fixed by the founder's decision; changing them takes a migration
-- ---------------------------------------------------------------------------
create table public.equity_terms (
  org_id         uuid primary key references public.organisations (id),
  application_id uuid not null unique references public.equity_applications (id),
  equity_pct     numeric(5,2) not null default 5.00 check (equity_pct = 5.00),
  voting_pct     numeric(5,2) not null default 5.10 check (voting_pct = 5.10),
  package        text not null check (package in ('starter', 'growth', 'company')),
  agreement_ref  text not null check (length(trim(agreement_ref)) between 5 and 200),
  starts_on      date not null,
  ended_on       date,
  recorded_by    uuid references auth.users (id),
  created_at     timestamptz not null default now(),
  check (ended_on is null or ended_on >= starts_on)
);

create function tebos_private.guard_equity_terms() returns trigger
language plpgsql set search_path = '' as $$
declare a public.equity_applications;
begin
  if not tebos_private.is_platform_admin() and auth.uid() is not null then
    raise exception 'only the founder records equity terms' using errcode = 'P0001', hint = 'TEBOS_NOT_APPROVER';
  end if;
  if tg_op = 'DELETE' then
    raise exception 'equity terms are kept; end them with a date' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;
  if tg_op = 'UPDATE' then
    if (new.org_id, new.application_id, new.equity_pct, new.voting_pct, new.package, new.agreement_ref, new.starts_on)
       is distinct from (old.org_id, old.application_id, old.equity_pct, old.voting_pct, old.package, old.agreement_ref, old.starts_on) then
      raise exception 'equity terms only change by ending them' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
    end if;
    return new;
  end if;
  select * into a from public.equity_applications where id = new.application_id;
  if a.status <> 'agreement_signed' or a.org_id is distinct from new.org_id then
    raise exception 'terms follow a signed agreement for this client''s organisation' using errcode = 'P0001', hint = 'TEBOS_CONTRACT_UNSIGNED';
  end if;
  new.package := a.package;
  new.agreement_ref := a.agreement_ref;
  new.recorded_by := auth.uid();
  return new;
end $$;

-- an equity partner's package counts as their plan, so its limits and entitlements apply
create or replace function tebos_private.active_plan(p_org uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select b.plan from public.billing_accounts b where b.org_id = p_org and b.status = 'active' order by b.created_at desc limit 1),
    (select t.package from public.equity_terms t where t.org_id = p_org and t.ended_on is null
        and exists (select 1 from public.equity_applications a where a.id = t.application_id and a.status = 'active')))
$$;

create function tebos_private.is_equity_partner(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.equity_terms t join public.equity_applications a on a.id = t.application_id
                  where t.org_id = p_org and t.ended_on is null and a.status = 'active')
$$;

-- ---------------------------------------------------------------------------
-- The partner's sales register and month closes
-- ---------------------------------------------------------------------------
create table public.partner_sales (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organisations (id),
  sold_on      date not null,
  kind         text not null check (kind in ('sale', 'refund', 'correction')),
  amount_cents integer not null,
  reference    text check (reference is null or length(reference) <= 60),
  channel      text not null default 'other' check (channel in ('walk_in', 'phone', 'online', 'referral', 'repeat', 'other')),
  customer_ref text check (customer_ref is null or length(customer_ref) <= 40),
  note         text check (note is null or length(note) <= 500),
  recorded_by  uuid references auth.users (id),
  created_at   timestamptz not null default now(),
  check ((kind = 'sale' and amount_cents > 0) or (kind = 'refund' and amount_cents < 0) or (kind = 'correction' and amount_cents <> 0)),
  check (kind <> 'correction' or length(trim(coalesce(note, ''))) >= 10),
  check (not tebos_private.looks_personal(customer_ref) and not tebos_private.looks_personal(note) and not tebos_private.looks_personal(reference)),
  check (not tebos_private.looks_secret(note))
);
create index partner_sales_org_day_idx on public.partner_sales (org_id, sold_on);

create table public.partner_month_closes (
  org_id            uuid not null references public.organisations (id),
  period            date not null check (extract(day from period) = 1),
  sales_cents       bigint not null default 0,
  refunds_cents     bigint not null default 0,
  corrections_cents bigint not null default 0,
  net_cents         bigint not null default 0,
  sale_count        integer not null default 0,
  attested_by       uuid references auth.users (id),
  attested_at       timestamptz not null default now(),
  note              text check (note is null or length(note) <= 500),
  primary key (org_id, period),
  check (not tebos_private.looks_secret(note))
);

create function tebos_private.guard_partner_sale() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op <> 'INSERT' then
    raise exception 'a recorded sale is never edited or removed; record a correction' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;
  if new.sold_on > tebos_private.sa_today() then
    raise exception 'a sale is recorded once it has happened' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  if exists (select 1 from public.partner_month_closes c where c.org_id = new.org_id and c.period = date_trunc('month', new.sold_on)::date) then
    raise exception 'that month is closed; record a correction in the current month' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;
  new.recorded_by := auth.uid();
  new.created_at := now();
  return new;
end $$;

-- closing a month: after it has ended, by the owner, with totals the database works out and fixes
create function tebos_private.guard_month_close() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op <> 'INSERT' then
    raise exception 'a closed month is fixed' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;
  if (new.period + interval '1 month')::date > tebos_private.sa_today() then
    raise exception 'a month is closed once it has ended' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  select coalesce(sum(amount_cents) filter (where kind = 'sale'), 0), coalesce(sum(amount_cents) filter (where kind = 'refund'), 0),
         coalesce(sum(amount_cents) filter (where kind = 'correction'), 0), coalesce(sum(amount_cents), 0), count(*) filter (where kind = 'sale')
    into new.sales_cents, new.refunds_cents, new.corrections_cents, new.net_cents, new.sale_count
    from public.partner_sales s
   where s.org_id = new.org_id and s.sold_on >= new.period and s.sold_on < (new.period + interval '1 month')::date;
  new.attested_by := auth.uid();
  new.attested_at := now();
  return new;
end $$;

create trigger enforce_state_machine before insert or update of status on public.equity_applications
  for each row execute function tebos_private.guard_status('equity_application');
create trigger guard_equity_application before insert or update on public.equity_applications
  for each row execute function tebos_private.guard_equity_application();
create trigger touch before update on public.equity_applications
  for each row execute function tebos_private.touch_updated_at();
create trigger audit after insert or update or delete on public.equity_applications
  for each row execute function tebos_private.audit_row();
create trigger guard_equity_terms before insert or update or delete on public.equity_terms
  for each row execute function tebos_private.guard_equity_terms();
create trigger audit after insert or update or delete on public.equity_terms
  for each row execute function tebos_private.audit_row();
create trigger guard_partner_sale before insert or update or delete on public.partner_sales
  for each row execute function tebos_private.guard_partner_sale();
create trigger audit after insert or update or delete on public.partner_sales
  for each row execute function tebos_private.audit_row();
create trigger guard_month_close before insert or update or delete on public.partner_month_closes
  for each row execute function tebos_private.guard_month_close();
create trigger audit after insert or update or delete on public.partner_month_closes
  for each row execute function tebos_private.audit_row();

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
alter table public.equity_applications enable row level security;
create policy staff_read on public.equity_applications for select to authenticated
  using (tebos_private.is_staff(array['sales', 'maintainer']) or (org_id is not null and tebos_private.has_role(org_id, array['org_admin'])));
create policy staff_insert on public.equity_applications for insert to authenticated
  with check (tebos_private.is_staff(array['sales', 'maintainer']));
create policy staff_update on public.equity_applications for update to authenticated
  using (tebos_private.is_staff(array['sales', 'maintainer'])) with check (tebos_private.is_staff(array['sales', 'maintainer']));
grant select, insert on public.equity_applications to authenticated;
grant update (org_id, business_name, registration_number, sector, trading_since, revenue_band, employees, owner_full_time,
  revenue_evidence_note, reporting_consent, package, status, status_note, agreement_ref) on public.equity_applications to authenticated;

alter table public.equity_terms enable row level security;
create policy read on public.equity_terms for select to authenticated
  using (tebos_private.is_staff(array['sales', 'maintainer']) or tebos_private.is_member(org_id));
create policy admin_insert on public.equity_terms for insert to authenticated with check (tebos_private.is_platform_admin());
create policy admin_update on public.equity_terms for update to authenticated
  using (tebos_private.is_platform_admin()) with check (tebos_private.is_platform_admin());
grant select, insert on public.equity_terms to authenticated;
grant update (ended_on) on public.equity_terms to authenticated;

alter table public.partner_sales enable row level security;
create policy read on public.partner_sales for select to authenticated
  using (tebos_private.is_member(org_id) or (tebos_private.is_staff(array['maintainer']) and tebos_private.is_equity_partner(org_id)));
create policy record on public.partner_sales for insert to authenticated
  with check (tebos_private.has_role(org_id, array['org_admin', 'operator']));
grant select, insert on public.partner_sales to authenticated;

alter table public.partner_month_closes enable row level security;
create policy read on public.partner_month_closes for select to authenticated
  using (tebos_private.is_member(org_id) or (tebos_private.is_staff(array['maintainer']) and tebos_private.is_equity_partner(org_id)));
create policy owner_closes on public.partner_month_closes for insert to authenticated
  with check (tebos_private.has_role(org_id, array['org_admin']));
grant select, insert (org_id, period, note) on public.partner_month_closes to authenticated;

grant all on public.equity_applications, public.equity_terms, public.partner_sales, public.partner_month_closes to service_role;

-- ---------------------------------------------------------------------------
-- The audit: each month's totals, whether it's closed, and what looks wrong
-- ---------------------------------------------------------------------------
create function public.equity_audit(p_org uuid, p_months integer default 6)
returns table (period date, closed boolean, sales_cents bigint, refunds_cents bigint, corrections_cents bigint, net_cents bigint,
               sale_count integer, flags text[])
language plpgsql stable security definer set search_path = '' as $$
declare
  v_today date := tebos_private.sa_today();
  v_start date := (date_trunc('month', v_today) - make_interval(months => greatest(1, least(coalesce(p_months, 6), 24)) - 1))::date;
begin
  if not (tebos_private.is_member(p_org) or (tebos_private.is_staff(array['maintainer']) and tebos_private.is_equity_partner(p_org))) then
    raise exception 'not yours to see' using errcode = '42501';
  end if;
  return query
  with months as (
    select generate_series(v_start, date_trunc('month', v_today)::date, interval '1 month')::date as p
  ), totals as (
    select m.p,
           c.org_id is not null as is_closed,
           coalesce(c.sales_cents, (select coalesce(sum(s.amount_cents), 0) from public.partner_sales s where s.org_id = p_org and s.kind = 'sale' and s.sold_on >= m.p and s.sold_on < (m.p + interval '1 month')::date)) as sales,
           coalesce(c.refunds_cents, (select coalesce(sum(s.amount_cents), 0) from public.partner_sales s where s.org_id = p_org and s.kind = 'refund' and s.sold_on >= m.p and s.sold_on < (m.p + interval '1 month')::date)) as refunds,
           coalesce(c.corrections_cents, (select coalesce(sum(s.amount_cents), 0) from public.partner_sales s where s.org_id = p_org and s.kind = 'correction' and s.sold_on >= m.p and s.sold_on < (m.p + interval '1 month')::date)) as corrections,
           coalesce(c.sale_count, (select count(*)::integer from public.partner_sales s where s.org_id = p_org and s.kind = 'sale' and s.sold_on >= m.p and s.sold_on < (m.p + interval '1 month')::date)) as n
      from months m left join public.partner_month_closes c on c.org_id = p_org and c.period = m.p
  ), withnet as (
    select t.*, (t.sales + t.refunds + t.corrections) as net,
           avg(t.sales + t.refunds + t.corrections) over (order by t.p rows between 3 preceding and 1 preceding) as prior_avg
      from totals t
  )
  select w.p, w.is_closed, w.sales::bigint, w.refunds::bigint, w.corrections::bigint, w.net::bigint, w.n,
         array_remove(array[
           case when not w.is_closed and (w.p + interval '1 month' + interval '7 days')::date < v_today then 'close_overdue' end,
           case when w.n = 0 and (w.p + interval '1 month')::date <= v_today then 'no_sales' end,
           case when abs(w.corrections) > 0.1 * greatest(w.sales, 1) then 'heavy_corrections' end,
           case when (w.p + interval '1 month')::date <= v_today and w.prior_avg > 0 and w.net < 0.5 * w.prior_avg then 'sharp_drop' end
         ], null)
    from withnet w
   order by w.p desc;
end $$;
revoke all on function public.equity_audit(uuid, integer) from public, anon;
grant execute on function public.equity_audit(uuid, integer) to authenticated, service_role;

-- the client organisations an application can be linked to, for TEBOS's sales and maintainer staff
create function public.equity_client_orgs()
returns table (org_id uuid, org_name text)
language sql stable security definer set search_path = '' as $$
  select o.id, o.name from public.organisations o
   where o.app = 'tebos' and tebos_private.is_staff(array['sales', 'maintainer'])
   order by o.name
$$;
revoke all on function public.equity_client_orgs() from public, anon;
grant execute on function public.equity_client_orgs() to authenticated, service_role;
