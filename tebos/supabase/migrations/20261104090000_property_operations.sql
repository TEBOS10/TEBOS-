-- Tidy Property Operations, Release 1: rental operations control (founder's master build directive, 4 Nov 2026;
-- docs/property-operations/, ADR 0023). A property-management product distributed through TEBOS: its own app
-- (organisations.app = 'ops'), on TEBOS's organisations, roles, row-level security and audit trail. Additive only.
--
-- The rules (mirrored in src/domain/opsLedger.ts and src/domain/states.ts):
--   * Money is integer cents (ZAR). Dates are Africa/Johannesburg calendar dates. Nothing is floating point.
--   * The platform records and reconciles; it never holds or moves money.
--   * Occupancy is derived: a unit is let when a lease covers the date. A unit has at most one lease covering any day.
--   * The ledger is append-only. A mistake is corrected by a reversal that names the entry and says why; an entry is
--     reversed at most once and a reversal is never reversed. Each lease has two accounts: rent (everything the tenant
--     owes and pays) and deposit (held for the tenant, never income).
--   * Rent is charged once per lease per month (pro-rated for a part month, rounded half up to the cent). Payments and
--     credits settle the oldest charge first; balances, arrears and ageing are computed, never typed.
--   * Maintenance: reported -> quoted -> approved -> in progress -> done, or declined / cancelled. Quoted needs a
--     supplier and an amount; only an owner or approver approves or declines; done needs the actual cost and date.
--   * Owners (org_admin) and property managers (operator) write; approvers approve maintenance; viewers read. A
--     suspended account reads but doesn't write. Each account has a subscription (plan, status, unit and user limits)
--     that only Tidy's platform staff change; a new account starts as a free manual pilot.
--   * Tenants' personal details stay out of the append-only audit trail: it records which fields changed, not values.

alter table public.organisations drop constraint organisations_app_check,
  add constraint organisations_app_check check (app in ('tebos', 'tepos', 'pra', 'ops'));

insert into public.state_transitions (machine, from_state, to_state) values
  ('ops_maintenance', '(initial)', 'reported'),
  ('ops_maintenance', 'reported', 'quoted'),
  ('ops_maintenance', 'reported', 'cancelled'),
  ('ops_maintenance', 'quoted', 'approved'),
  ('ops_maintenance', 'quoted', 'declined'),
  ('ops_maintenance', 'quoted', 'cancelled'),
  ('ops_maintenance', 'declined', 'quoted'),
  ('ops_maintenance', 'declined', 'cancelled'),
  ('ops_maintenance', 'approved', 'in_progress'),
  ('ops_maintenance', 'approved', 'cancelled'),
  ('ops_maintenance', 'in_progress', 'done'),
  ('ops_maintenance', 'in_progress', 'cancelled');

-- ---------------------------------------------------------------------------
-- Subscription: the commercial frame (manual pilots first; no price is set here)
-- ---------------------------------------------------------------------------
create table public.ops_subscriptions (
  org_id         uuid primary key references public.organisations (id) on delete cascade,
  plan           text not null default 'pilot' check (plan in ('pilot', 'starter', 'growth', 'portfolio')),
  status         text not null default 'trial' check (status in ('trial', 'active', 'suspended', 'cancelled')),
  unit_limit     integer not null default 60 check (unit_limit between 1 and 100000),
  user_limit     integer not null default 5 check (user_limit between 1 and 1000),
  trial_ends_on  date,
  note           text check (note is null or length(note) <= 500),
  updated_at     timestamptz not null default now()
);

-- may this person change this account's records?
create function tebos_private.ops_writable(p_org uuid, p_roles text[] default array['org_admin', 'operator']) returns boolean
language sql stable security definer set search_path = '' as $$
  select tebos_private.has_role(p_org, p_roles)
     and exists (select 1 from public.ops_subscriptions s where s.org_id = p_org and s.status in ('trial', 'active'))
$$;

-- the audit trail is append-only and tenants' details are personal: record which fields changed, never their values
create function tebos_private.audit_fields_only() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_old jsonb := case when tg_op = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
  v_changed jsonb;
begin
  select coalesce(jsonb_agg(k order by k), '[]'::jsonb) into v_changed
    from jsonb_object_keys(v_row) k
   where tg_op <> 'UPDATE' or (v_row -> k) is distinct from (v_old -> k);
  perform tebos_private.write_audit((v_row ->> 'org_id')::uuid, tg_table_name || '.' || lower(tg_op), tg_table_name,
    (v_row ->> 'id')::uuid, null, jsonb_build_object('fields', v_changed));
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- Portfolio
-- ---------------------------------------------------------------------------
create table public.ops_properties (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organisations (id) on delete cascade,
  name         text not null check (length(trim(name)) between 2 and 120),
  street       text check (street is null or length(street) <= 160),
  suburb       text check (suburb is null or length(suburb) <= 80),
  city         text not null check (length(trim(city)) between 2 and 80),
  province     text check (province is null or province in ('Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal',
                 'Limpopo', 'Mpumalanga', 'North West', 'Northern Cape', 'Western Cape')),
  postal_code  text check (postal_code is null or postal_code ~ '^[0-9]{4}$'),
  kind         text not null default 'residential' check (kind in ('residential', 'commercial', 'mixed')),
  archived_at  timestamptz,
  created_by   uuid references auth.users (id),
  created_at   timestamptz not null default now(),
  unique (id, org_id)
);
create index ops_properties_org_idx on public.ops_properties (org_id);

create table public.ops_units (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null,
  property_id        uuid not null,
  label              text not null check (length(trim(label)) between 1 and 40),
  unit_type          text not null default 'other' check (unit_type in ('bachelor', 'one_bed', 'two_bed', 'three_bed_plus',
                       'house', 'room', 'shop', 'office', 'other')),
  market_rent_cents  bigint check (market_rent_cents is null or market_rent_cents between 0 and 100000000000),
  held_back          boolean not null default false,
  held_back_reason   text check (held_back_reason is null or length(held_back_reason) <= 200),
  created_at         timestamptz not null default now(),
  foreign key (property_id, org_id) references public.ops_properties (id, org_id) on delete cascade,
  unique (id, org_id),
  check (not held_back or length(trim(coalesce(held_back_reason, ''))) >= 3)
);
create unique index ops_units_label_idx on public.ops_units (property_id, lower(trim(label)));
create index ops_units_org_idx on public.ops_units (org_id);

-- ---------------------------------------------------------------------------
-- Tenants and leases
-- ---------------------------------------------------------------------------
create table public.ops_tenants (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organisations (id) on delete cascade,
  full_name   text not null check (length(trim(full_name)) between 2 and 120),
  email       text check (email is null or (length(email) <= 254 and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  phone       text check (phone is null or phone ~ '^[0-9 +()-]{7,20}$'),
  notes       text check (notes is null or (length(notes) <= 500 and not tebos_private.looks_personal(notes))),
  created_at  timestamptz not null default now(),
  unique (id, org_id)
);
create index ops_tenants_org_idx on public.ops_tenants (org_id);

create sequence public.ops_lease_ref_seq;
create table public.ops_leases (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null,
  unit_id          uuid not null,
  tenant_id        uuid not null,
  ref              text not null unique default 'L-' || lpad(nextval('public.ops_lease_ref_seq')::text, 4, '0'),
  starts_on        date not null,
  ends_on          date,
  rent_cents       bigint not null check (rent_cents between 1 and 100000000000),
  due_day          smallint not null default 1 check (due_day between 1 and 28),
  deposit_cents    bigint not null default 0 check (deposit_cents between 0 and 100000000000),
  deposit_held_at  text check (deposit_held_at is null or (length(deposit_held_at) <= 120 and deposit_held_at !~ '[0-9]{6,}')),
  status           text not null default 'active' check (status in ('active', 'ended')),
  ended_on         date,
  end_reason       text check (end_reason is null or length(end_reason) <= 300),
  created_by       uuid references auth.users (id),
  created_at       timestamptz not null default now(),
  foreign key (unit_id, org_id) references public.ops_units (id, org_id) on delete cascade,
  foreign key (tenant_id, org_id) references public.ops_tenants (id, org_id) on delete cascade,
  unique (id, org_id),
  check (ends_on is null or ends_on >= starts_on),
  check ((status = 'ended') = (ended_on is not null)),
  check (status <> 'ended' or (ended_on >= starts_on and length(trim(coalesce(end_reason, ''))) >= 5))
);
create index ops_leases_unit_idx on public.ops_leases (unit_id, starts_on);
create index ops_leases_tenant_idx on public.ops_leases (tenant_id);
create index ops_leases_org_idx on public.ops_leases (org_id, status);

-- the days a lease covers: from its start to its end date if ended, else open
create function tebos_private.ops_lease_span(p_start date, p_ended date) returns daterange
language sql immutable set search_path = '' as $$ select daterange(p_start, case when p_ended is null then null else p_ended + 1 end) $$;

-- ---------------------------------------------------------------------------
-- The ledger: append-only, two accounts per lease
-- ---------------------------------------------------------------------------
create table public.ops_ledger (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  lease_id      uuid not null,
  kind          text not null check (kind in ('charge', 'payment', 'credit', 'refund', 'reversal')),
  account       text not null check (account in ('rent', 'deposit')),
  category      text check (category is null or category in ('rent', 'deposit', 'utilities', 'damage', 'other')),
  method        text check (method is null or method in ('eft', 'cash', 'debit_order', 'card', 'other')),
  amount_cents  bigint not null check (amount_cents between 1 and 100000000000),
  effective_on  date not null,
  period        date check (period is null or extract(day from period) = 1),
  reference     text check (reference is null or length(reference) <= 80),
  note          text check (note is null or length(note) <= 300),
  reverses_id   uuid unique references public.ops_ledger (id),
  created_by    uuid references auth.users (id),
  created_at    timestamptz not null default now(),
  foreign key (lease_id, org_id) references public.ops_leases (id, org_id) on delete cascade,
  check ((kind = 'charge') = (category is not null)),
  check (kind <> 'charge' or account = case when category = 'deposit' then 'deposit' else 'rent' end),
  check ((kind = 'payment') = (method is not null) or kind = 'reversal'),
  check (kind <> 'credit' or account = 'rent'),
  check (kind <> 'refund' or account = 'deposit'),
  check ((kind = 'reversal') = (reverses_id is not null)),
  check (kind <> 'reversal' or length(trim(coalesce(note, ''))) >= 5),
  check ((kind = 'charge' and category = 'rent') = (period is not null))
);
create index ops_ledger_lease_idx on public.ops_ledger (lease_id, effective_on, created_at);
create index ops_ledger_org_idx on public.ops_ledger (org_id, effective_on);

-- ---------------------------------------------------------------------------
-- Maintenance
-- ---------------------------------------------------------------------------
create table public.ops_suppliers (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organisations (id) on delete cascade,
  name        text not null check (length(trim(name)) between 2 and 120),
  trade       text check (trade is null or length(trade) <= 80),
  phone       text check (phone is null or phone ~ '^[0-9 +()-]{7,20}$'),
  email       text check (email is null or (length(email) <= 254 and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (id, org_id)
);
create index ops_suppliers_org_idx on public.ops_suppliers (org_id);

create sequence public.ops_maintenance_ref_seq;
create table public.ops_maintenance (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null,
  ref            text not null unique default 'M-' || lpad(nextval('public.ops_maintenance_ref_seq')::text, 4, '0'),
  property_id    uuid not null,
  unit_id        uuid,
  title          text not null check (length(trim(title)) between 3 and 120),
  description    text check (description is null or length(description) <= 2000),
  priority       text not null default 'normal' check (priority in ('low', 'normal', 'urgent')),
  status         text not null default 'reported',
  supplier_id    uuid,
  quote_cents    bigint check (quote_cents is null or quote_cents between 1 and 100000000000),
  quote_ref      text check (quote_ref is null or length(quote_ref) <= 80),
  decided_by     uuid references auth.users (id),
  decided_at     timestamptz,
  cost_cents     bigint check (cost_cents is null or cost_cents between 0 and 100000000000),
  completed_on   date,
  status_note    text check (status_note is null or length(status_note) <= 500),
  reported_on    date not null default ((now() at time zone 'Africa/Johannesburg')::date),
  reported_by    uuid references auth.users (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  foreign key (property_id, org_id) references public.ops_properties (id, org_id) on delete cascade,
  foreign key (unit_id, org_id) references public.ops_units (id, org_id) on delete cascade,
  foreign key (supplier_id, org_id) references public.ops_suppliers (id, org_id),
  unique (id, org_id)
);
create index ops_maintenance_org_idx on public.ops_maintenance (org_id, status);
create index ops_maintenance_property_idx on public.ops_maintenance (property_id, created_at desc);

create table public.ops_maintenance_photos (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  request_id  uuid not null,
  path        text not null unique,
  file_name   text not null check (length(file_name) between 1 and 200),
  created_by  uuid references auth.users (id),
  created_at  timestamptz not null default now(),
  foreign key (request_id, org_id) references public.ops_maintenance (id, org_id) on delete cascade,
  check (path = org_id::text || '/maintenance/' || request_id::text || '/' || id::text)
);
create index ops_photos_request_idx on public.ops_maintenance_photos (request_id, created_at);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ops-files', 'ops-files', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
                               allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------
-- every write needs an owner or property manager on a live (trial or active) account: checked first, so an outsider
-- learns nothing from the other rules
create function tebos_private.guard_ops_write() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    return old;
  end if;
  if not tebos_private.ops_writable(new.org_id) then
    raise exception 'only the account''s owners and property managers make changes, and only while the account is live'
      using errcode = '42501';
  end if;
  return new;
end $$;

create function tebos_private.guard_ops_property() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
  elsif (new.org_id, new.created_by, new.created_at) is distinct from (old.org_id, old.created_by, old.created_at) then
    raise exception 'a property stays in its account' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;
  return new;
end $$;

-- a unit belongs to its property; the account's unit limit applies
create function tebos_private.guard_ops_unit() returns trigger
language plpgsql set search_path = '' as $$
declare v_limit integer;
begin
  if tg_op = 'UPDATE' and (new.org_id, new.property_id) is distinct from (old.org_id, old.property_id) then
    raise exception 'a unit stays in its property' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;
  if tg_op = 'INSERT' then
    select unit_limit into v_limit from public.ops_subscriptions where org_id = new.org_id;
    if (select count(*) from public.ops_units u where u.org_id = new.org_id) >= v_limit then
      raise exception 'this account''s plan allows % units; ask Tidy to raise the limit', v_limit
        using errcode = 'P0001', hint = 'TEBOS_OUT_OF_PLAN';
    end if;
  end if;
  if not new.held_back then
    new.held_back_reason := null;
  end if;
  return new;
end $$;

-- a lease covers its unit alone: no overlapping leases; what was agreed stays as agreed
create function tebos_private.guard_ops_lease() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
    new.status := 'active';
    new.ended_on := null;
    new.end_reason := null;
  else
    if (new.org_id, new.unit_id, new.tenant_id, new.ref, new.starts_on, new.created_by, new.created_at)
       is distinct from (old.org_id, old.unit_id, old.tenant_id, old.ref, old.starts_on, old.created_by, old.created_at) then
      raise exception 'a lease keeps its unit, tenant, start and reference; end it and start a new one'
        using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
    end if;
    if old.status = 'ended' and (new.status, new.ended_on, new.end_reason, new.rent_cents, new.due_day)
       is distinct from (old.status, old.ended_on, old.end_reason, old.rent_cents, old.due_day) then
      raise exception 'an ended lease stays ended' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
    end if;
  end if;
  if exists (select 1 from public.ops_leases l
              where l.unit_id = new.unit_id and l.id <> new.id
                and tebos_private.ops_lease_span(l.starts_on, l.ended_on) && tebos_private.ops_lease_span(new.starts_on, new.ended_on)) then
    raise exception 'this unit already has a lease covering those dates' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  return new;
end $$;

-- the ledger is append-only; each entry is checked against its lease and, for a reversal, against what it reverses
create function tebos_private.guard_ops_ledger() returns trigger
language plpgsql set search_path = '' as $$
declare v_lease public.ops_leases; v_orig public.ops_ledger; v_today date := (now() at time zone 'Africa/Johannesburg')::date;
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.ops_leases l where l.id = old.lease_id) then return old; end if;
    raise exception 'the ledger is kept as written; reverse an entry instead' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;
  if tg_op = 'UPDATE' then
    raise exception 'the ledger is kept as written; reverse an entry instead' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;
  new.created_by := auth.uid();
  new.created_at := now();
  select * into v_lease from public.ops_leases where id = new.lease_id;
  if new.kind = 'reversal' then
    select * into v_orig from public.ops_ledger where id = new.reverses_id;
    if v_orig.id is null or v_orig.lease_id <> new.lease_id then
      raise exception 'a reversal cancels an entry on the same lease' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
    if v_orig.kind = 'reversal' then
      raise exception 'a reversal can''t itself be reversed; record the entry again instead' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
    -- a reversal mirrors what it cancels
    new.account := v_orig.account;
    new.amount_cents := v_orig.amount_cents;
    new.category := null;
    new.method := null;
    new.period := null;
    return new;
  end if;
  if new.kind = 'payment' and new.effective_on > v_today then
    raise exception 'a payment is recorded once it has arrived, not before' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  if new.effective_on > v_today + 62 then
    raise exception 'record entries no more than two months ahead' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  if new.effective_on < v_lease.starts_on - 31 then
    raise exception 'that date is well before the lease started' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  if new.kind = 'charge' and new.category = 'rent' then
    if not tebos_private.ops_lease_span(v_lease.starts_on, v_lease.ended_on)
           && daterange(new.period, (new.period + interval '1 month')::date) then
      raise exception 'the lease doesn''t cover that month' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
    if exists (select 1 from public.ops_ledger x
                where x.lease_id = new.lease_id and x.kind = 'charge' and x.category = 'rent' and x.period = new.period
                  and not exists (select 1 from public.ops_ledger r where r.reverses_id = x.id)) then
      raise exception 'rent for that month is already charged; reverse it first to charge again'
        using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
  end if;
  return new;
end $$;

-- maintenance moves only as the lifecycle allows, and each step has what it needs
create function tebos_private.guard_ops_maintenance() returns trigger
language plpgsql set search_path = '' as $$
declare v_today date := (now() at time zone 'Africa/Johannesburg')::date; v_unit_prop uuid;
begin
  if tg_op = 'INSERT' then
    if not tebos_private.ops_writable(new.org_id) then
      raise exception 'only the account''s owners and property managers report maintenance here' using errcode = '42501';
    end if;
    new.reported_by := auth.uid();
    new.created_at := now();
    new.status := 'reported';
    new.decided_by := null; new.decided_at := null; new.cost_cents := null; new.completed_on := null;
  else
    if (new.org_id, new.ref, new.property_id, new.reported_by, new.reported_on, new.created_at)
       is distinct from (old.org_id, old.ref, old.property_id, old.reported_by, old.reported_on, old.created_at) then
      raise exception 'a request keeps its property, reference and who reported it' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
    end if;
    -- approving or declining a quote is the owner's or an approver's decision; nothing else changes with it
    if new.status in ('approved', 'declined') and old.status is distinct from new.status then
      if not tebos_private.ops_writable(new.org_id, array['org_admin', 'approver']) then
        raise exception 'only the account''s owner or an approver approves or declines a quote' using errcode = '42501';
      end if;
      if (new.supplier_id, new.quote_cents, new.quote_ref, new.unit_id, new.title, new.description, new.priority)
         is distinct from (old.supplier_id, old.quote_cents, old.quote_ref, old.unit_id, old.title, old.description, old.priority) then
        raise exception 'decide on the quote as it stands' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
      end if;
      new.decided_by := auth.uid();
      new.decided_at := now();
    elsif not tebos_private.ops_writable(new.org_id) then
      raise exception 'only the account''s owners and property managers update maintenance' using errcode = '42501';
    else
      new.decided_by := old.decided_by;
      new.decided_at := old.decided_at;
    end if;
    if old.status in ('done', 'cancelled') then
      raise exception 'a finished request stays finished; report a new one' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
    end if;
    if old.status in ('approved', 'in_progress') and (new.supplier_id, new.quote_cents) is distinct from (old.supplier_id, old.quote_cents) then
      raise exception 'the approved quote stays as approved' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
    end if;
  end if;
  new.updated_at := now();
  if new.unit_id is not null then
    select property_id into v_unit_prop from public.ops_units where id = new.unit_id;
    if v_unit_prop is distinct from new.property_id then
      raise exception 'the unit must be in the request''s property' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
  end if;
  if new.status = 'quoted' and (new.supplier_id is null or new.quote_cents is null) then
    raise exception 'a quote needs a supplier and an amount' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  if new.status = 'done' then
    if new.cost_cents is null or new.completed_on is null then
      raise exception 'record the actual cost and the date it was finished' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
    if new.completed_on > v_today or new.completed_on < new.reported_on then
      raise exception 'the completion date must be between the report date and today' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
  elsif tg_op = 'UPDATE' and (new.cost_cents, new.completed_on) is distinct from (old.cost_cents, old.completed_on) then
    raise exception 'cost and completion are recorded when the work is done' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  if new.status in ('declined', 'cancelled') and (tg_op = 'INSERT' or old.status is distinct from new.status)
     and length(trim(coalesce(new.status_note, ''))) < 5 then
    raise exception 'say why' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  return new;
end $$;

create function tebos_private.guard_ops_photo() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not tebos_private.ops_writable(new.org_id) then
    raise exception 'only the account''s owners and property managers add photos' using errcode = '42501';
  end if;
  new.created_by := auth.uid();
  new.created_at := now();
  return new;
end $$;

-- triggers fire in name order: "a_write" (permission) first
create trigger a_write before insert or update on public.ops_properties for each row execute function tebos_private.guard_ops_write();
create trigger guard_ops_property before insert or update on public.ops_properties for each row execute function tebos_private.guard_ops_property();
create trigger a_write before insert or update on public.ops_units for each row execute function tebos_private.guard_ops_write();
create trigger guard_ops_unit before insert or update on public.ops_units for each row execute function tebos_private.guard_ops_unit();
create trigger a_write before insert or update on public.ops_tenants for each row execute function tebos_private.guard_ops_write();
create trigger a_write before insert or update on public.ops_leases for each row execute function tebos_private.guard_ops_write();
create trigger guard_ops_lease before insert or update on public.ops_leases for each row execute function tebos_private.guard_ops_lease();
create trigger a_write before insert on public.ops_ledger for each row execute function tebos_private.guard_ops_write();
create trigger guard_ops_ledger before insert or update or delete on public.ops_ledger for each row execute function tebos_private.guard_ops_ledger();
create trigger a_write before insert or update on public.ops_suppliers for each row execute function tebos_private.guard_ops_write();
create trigger guard_ops_maintenance before insert or update on public.ops_maintenance for each row execute function tebos_private.guard_ops_maintenance();
create trigger guard_status before insert or update on public.ops_maintenance for each row execute function tebos_private.guard_status('ops_maintenance');
create trigger guard_ops_photo before insert on public.ops_maintenance_photos for each row execute function tebos_private.guard_ops_photo();

create trigger audit after insert or update or delete on public.ops_properties for each row execute function tebos_private.audit_row();
create trigger audit after insert or update or delete on public.ops_units for each row execute function tebos_private.audit_row();
create trigger audit after insert or update or delete on public.ops_tenants for each row execute function tebos_private.audit_fields_only();
create trigger audit after insert or update or delete on public.ops_leases for each row execute function tebos_private.audit_fields_only();
create trigger audit after insert or update or delete on public.ops_ledger for each row execute function tebos_private.audit_row();
create trigger audit after insert or update or delete on public.ops_suppliers for each row execute function tebos_private.audit_fields_only();
create trigger audit after insert or update or delete on public.ops_maintenance for each row execute function tebos_private.audit_row();
create trigger audit after insert or update or delete on public.ops_subscriptions for each row execute function tebos_private.audit_row();

-- ---------------------------------------------------------------------------
-- Access: members read their own account; owners and managers write; approvers decide on quotes; nobody deletes
-- ---------------------------------------------------------------------------
alter table public.ops_subscriptions enable row level security;
alter table public.ops_properties enable row level security;
alter table public.ops_units enable row level security;
alter table public.ops_tenants enable row level security;
alter table public.ops_leases enable row level security;
alter table public.ops_ledger enable row level security;
alter table public.ops_suppliers enable row level security;
alter table public.ops_maintenance enable row level security;
alter table public.ops_maintenance_photos enable row level security;

revoke all on public.ops_subscriptions from anon, authenticated;
revoke all on public.ops_properties from anon, authenticated;
revoke all on public.ops_units from anon, authenticated;
revoke all on public.ops_tenants from anon, authenticated;
revoke all on public.ops_leases from anon, authenticated;
revoke all on public.ops_ledger from anon, authenticated;
revoke all on public.ops_suppliers from anon, authenticated;
revoke all on public.ops_maintenance from anon, authenticated;
revoke all on public.ops_maintenance_photos from anon, authenticated;

create policy member_read on public.ops_subscriptions for select to authenticated using (tebos_private.is_member(org_id));
create policy member_read on public.ops_properties for select to authenticated using (tebos_private.is_member(org_id));
create policy member_read on public.ops_units for select to authenticated using (tebos_private.is_member(org_id));
create policy member_read on public.ops_tenants for select to authenticated using (tebos_private.is_member(org_id));
create policy member_read on public.ops_leases for select to authenticated using (tebos_private.is_member(org_id));
create policy member_read on public.ops_ledger for select to authenticated using (tebos_private.is_member(org_id));
create policy member_read on public.ops_suppliers for select to authenticated using (tebos_private.is_member(org_id));
create policy member_read on public.ops_maintenance for select to authenticated using (tebos_private.is_member(org_id));
create policy member_read on public.ops_maintenance_photos for select to authenticated using (tebos_private.is_member(org_id));

create policy manager_insert on public.ops_properties for insert to authenticated with check (tebos_private.ops_writable(org_id));
create policy manager_update on public.ops_properties for update to authenticated using (tebos_private.ops_writable(org_id)) with check (tebos_private.ops_writable(org_id));
create policy manager_insert on public.ops_units for insert to authenticated with check (tebos_private.ops_writable(org_id));
create policy manager_update on public.ops_units for update to authenticated using (tebos_private.ops_writable(org_id)) with check (tebos_private.ops_writable(org_id));
create policy manager_insert on public.ops_tenants for insert to authenticated with check (tebos_private.ops_writable(org_id));
create policy manager_update on public.ops_tenants for update to authenticated using (tebos_private.ops_writable(org_id)) with check (tebos_private.ops_writable(org_id));
create policy manager_insert on public.ops_leases for insert to authenticated with check (tebos_private.ops_writable(org_id));
create policy manager_update on public.ops_leases for update to authenticated using (tebos_private.ops_writable(org_id)) with check (tebos_private.ops_writable(org_id));
create policy manager_insert on public.ops_ledger for insert to authenticated with check (tebos_private.ops_writable(org_id));
create policy manager_insert on public.ops_suppliers for insert to authenticated with check (tebos_private.ops_writable(org_id));
create policy manager_update on public.ops_suppliers for update to authenticated using (tebos_private.ops_writable(org_id)) with check (tebos_private.ops_writable(org_id));
create policy manager_insert on public.ops_maintenance for insert to authenticated with check (tebos_private.ops_writable(org_id));
create policy team_update on public.ops_maintenance for update to authenticated
  using (tebos_private.ops_writable(org_id, array['org_admin', 'operator', 'approver']))
  with check (tebos_private.ops_writable(org_id, array['org_admin', 'operator', 'approver']));
create policy manager_insert on public.ops_maintenance_photos for insert to authenticated with check (tebos_private.ops_writable(org_id));

grant select on public.ops_subscriptions, public.ops_properties, public.ops_units, public.ops_tenants, public.ops_leases,
  public.ops_ledger, public.ops_suppliers, public.ops_maintenance, public.ops_maintenance_photos to authenticated;
grant insert (org_id, name, street, suburb, city, province, postal_code, kind),
      update (name, street, suburb, city, province, postal_code, kind, archived_at) on public.ops_properties to authenticated;
grant insert (org_id, property_id, label, unit_type, market_rent_cents, held_back, held_back_reason),
      update (label, unit_type, market_rent_cents, held_back, held_back_reason) on public.ops_units to authenticated;
grant insert (org_id, full_name, email, phone, notes), update (full_name, email, phone, notes) on public.ops_tenants to authenticated;
grant insert (org_id, unit_id, tenant_id, starts_on, ends_on, rent_cents, due_day, deposit_cents, deposit_held_at),
      update (ends_on, rent_cents, due_day, deposit_cents, deposit_held_at, status, ended_on, end_reason) on public.ops_leases to authenticated;
grant insert (org_id, lease_id, kind, account, category, method, amount_cents, effective_on, period, reference, note, reverses_id)
  on public.ops_ledger to authenticated;
grant insert (org_id, name, trade, phone, email), update (name, trade, phone, email, active) on public.ops_suppliers to authenticated;
grant insert (org_id, property_id, unit_id, title, description, priority),
      update (unit_id, title, description, priority, status, supplier_id, quote_cents, quote_ref, cost_cents, completed_on, status_note)
  on public.ops_maintenance to authenticated;
grant insert (id, org_id, request_id, path, file_name) on public.ops_maintenance_photos to authenticated;
grant all on public.ops_subscriptions, public.ops_properties, public.ops_units, public.ops_tenants, public.ops_leases,
  public.ops_ledger, public.ops_suppliers, public.ops_maintenance, public.ops_maintenance_photos to service_role;
grant usage on sequence public.ops_lease_ref_seq, public.ops_maintenance_ref_seq to authenticated, service_role;

-- photos: uploaded only into a path a photo record already names, by someone who may write; read by members
create function tebos_private.ops_photo_may_upload(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.ops_maintenance_photos p where p.path = p_path and tebos_private.ops_writable(p.org_id))
$$;
create function tebos_private.ops_photo_may_read(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.ops_maintenance_photos p where p.path = p_path and tebos_private.is_member(p.org_id))
$$;
create policy ops_files_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'ops-files' and tebos_private.ops_photo_may_upload(name));
create policy ops_files_read on storage.objects for select to authenticated
  using (bucket_id = 'ops-files' and tebos_private.ops_photo_may_read(name));

-- ---------------------------------------------------------------------------
-- Opening an account, and the subscription (Tidy's staff only)
-- ---------------------------------------------------------------------------
create function public.create_ops_account(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare new_id uuid; v_name text := btrim(coalesce(p_name, ''));
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if length(v_name) < 2 or length(v_name) > 120 then
    raise exception 'give the account a name (2 to 120 characters)' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  if tebos_private.looks_personal(v_name) then
    raise exception 'no phone numbers, email addresses or ID numbers in an account name' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  if exists (select 1 from public.memberships m join public.organisations o on o.id = m.org_id
              where m.user_id = auth.uid() and m.role = 'org_admin' and o.app = 'ops') then
    raise exception 'you already own a Property Operations account; add properties inside it' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  insert into public.organisations (name, slug, app)
    values (v_name, 'ops-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12), 'ops')
    returning id into new_id;
  insert into public.memberships (org_id, user_id, role) values (new_id, auth.uid(), 'org_admin');
  -- a free manual pilot to start: no price is set until it is tested with landlords
  insert into public.ops_subscriptions (org_id, plan, status, trial_ends_on)
    values (new_id, 'pilot', 'trial', ((now() at time zone 'Africa/Johannesburg')::date + 90));
  return new_id;
end $$;
revoke all on function public.create_ops_account(text) from public, anon;
grant execute on function public.create_ops_account(text) to authenticated;

create function public.ops_set_subscription(p_org uuid, p_plan text, p_status text, p_unit_limit integer, p_user_limit integer,
  p_trial_ends_on date, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not tebos_private.is_platform_admin() then
    raise exception 'only Tidy''s platform staff change a subscription' using errcode = '42501';
  end if;
  update public.ops_subscriptions set plan = p_plan, status = p_status, unit_limit = p_unit_limit, user_limit = p_user_limit,
         trial_ends_on = p_trial_ends_on, note = nullif(trim(coalesce(p_note, '')), ''), updated_at = now()
   where org_id = p_org;
  if not found then
    raise exception 'that account has no Property Operations subscription' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
end $$;
revoke all on function public.ops_set_subscription(uuid, text, text, integer, integer, date, text) from public, anon;
grant execute on function public.ops_set_subscription(uuid, text, text, integer, integer, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Rent: charged once per lease per month, pro-rated for a part month (mirrors opsLedger.ts proRata)
-- ---------------------------------------------------------------------------
create function tebos_private.ops_pro_rata(p_rent bigint, p_month date, p_start date, p_ended date) returns bigint
language sql immutable set search_path = '' as $$
  with m as (select p_month as first, (p_month + interval '1 month')::date as next),
       d as (select greatest(m.first, p_start) as a, least(m.next, coalesce(p_ended + 1, m.next)) as b, (m.next - m.first) as dim from m)
  select case when d.b <= d.a then 0
              when (d.b - d.a) = d.dim then p_rent
              else (p_rent * (d.b - d.a) * 2 + d.dim) / (2 * d.dim) end
    from d
$$;

-- charge the month's rent to every lease that covers part of it and isn't charged yet; returns how many were charged.
-- Runs as the signed-in person, so the same permissions and rules apply.
create function public.ops_generate_rent(p_org uuid, p_month date) returns integer
language plpgsql security invoker set search_path = '' as $$
declare v_month date := date_trunc('month', p_month)::date; v_count integer := 0; l record; v_amount bigint;
begin
  if not tebos_private.ops_writable(p_org) then
    raise exception 'only the account''s owners and property managers charge rent' using errcode = '42501';
  end if;
  for l in select * from public.ops_leases x
            where x.org_id = p_org
              and tebos_private.ops_lease_span(x.starts_on, x.ended_on) && daterange(v_month, (v_month + interval '1 month')::date)
              and not exists (select 1 from public.ops_ledger c
                               where c.lease_id = x.id and c.kind = 'charge' and c.category = 'rent' and c.period = v_month
                                 and not exists (select 1 from public.ops_ledger r where r.reverses_id = c.id))
            order by x.ref loop
    v_amount := tebos_private.ops_pro_rata(l.rent_cents, v_month, l.starts_on, l.ended_on);
    if v_amount > 0 then
      insert into public.ops_ledger (org_id, lease_id, kind, account, category, amount_cents, effective_on, period, reference, note)
      values (p_org, l.id, 'charge', 'rent', 'rent', v_amount,
              greatest(v_month + (l.due_day - 1), l.starts_on), v_month, l.ref,
              case when v_amount <> l.rent_cents then 'Pro-rated for part of the month' end);
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end $$;
revoke all on function public.ops_generate_rent(uuid, date) from public, anon;
grant execute on function public.ops_generate_rent(uuid, date) to authenticated;
grant execute on function tebos_private.ops_writable(uuid, text[]), tebos_private.ops_lease_span(date, date),
  tebos_private.ops_pro_rata(bigint, date, date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Balances and ageing: oldest charge settled first (mirrors opsLedger.ts accountPosition)
-- ---------------------------------------------------------------------------
create function public.ops_lease_positions(p_org uuid, p_as_of date default null)
returns table (lease_id uuid, balance_cents bigint, overdue_cents bigint, current_cents bigint, d1_30 bigint, d31_60 bigint,
               d61_90 bigint, d90_plus bigint, deposit_held_cents bigint, last_payment_on date)
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_as_of date := coalesce(p_as_of, (now() at time zone 'Africa/Johannesburg')::date);
  l record; c record; v_pool bigint; v_left bigint; v_age integer;
begin
  for l in select x.id from public.ops_leases x where x.org_id = p_org loop
    lease_id := l.id;
    balance_cents := 0; overdue_cents := 0; current_cents := 0; d1_30 := 0; d31_60 := 0; d61_90 := 0; d90_plus := 0;
    -- what has settled the rent account: payments and credits up to the date, not reversed
    select coalesce(sum(e.amount_cents), 0) into v_pool from public.ops_ledger e
     where e.lease_id = l.id and e.account = 'rent' and e.kind in ('payment', 'credit') and e.effective_on <= v_as_of
       and not exists (select 1 from public.ops_ledger r where r.reverses_id = e.id);
    for c in select e.amount_cents, e.effective_on from public.ops_ledger e
              where e.lease_id = l.id and e.account = 'rent' and e.kind = 'charge' and e.effective_on <= v_as_of
                and not exists (select 1 from public.ops_ledger r where r.reverses_id = e.id)
              order by e.effective_on, e.created_at, e.id loop
      v_left := c.amount_cents - least(v_pool, c.amount_cents);
      v_pool := v_pool - least(v_pool, c.amount_cents);
      if v_left > 0 then
        v_age := v_as_of - c.effective_on;
        if v_age <= 0 then current_cents := current_cents + v_left;
        elsif v_age <= 30 then d1_30 := d1_30 + v_left;
        elsif v_age <= 60 then d31_60 := d31_60 + v_left;
        elsif v_age <= 90 then d61_90 := d61_90 + v_left;
        else d90_plus := d90_plus + v_left; end if;
      end if;
    end loop;
    overdue_cents := d1_30 + d31_60 + d61_90 + d90_plus;
    -- what is left in the pool is a credit in the tenant's favour
    balance_cents := current_cents + overdue_cents - v_pool;
    select coalesce(sum(case when e.kind = 'payment' then e.amount_cents when e.kind = 'refund' then -e.amount_cents else 0 end), 0)
      into deposit_held_cents from public.ops_ledger e
     where e.lease_id = l.id and e.account = 'deposit' and e.effective_on <= v_as_of
       and not exists (select 1 from public.ops_ledger r where r.reverses_id = e.id);
    select max(e.effective_on) into last_payment_on from public.ops_ledger e
     where e.lease_id = l.id and e.kind = 'payment' and e.account = 'rent'
       and not exists (select 1 from public.ops_ledger r where r.reverses_id = e.id);
    return next;
  end loop;
end $$;
revoke all on function public.ops_lease_positions(uuid, date) from public, anon;
grant execute on function public.ops_lease_positions(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- The month at a glance, for the account or one property. Every figure is computed here, from records, and says
-- what it is: expected (from leases), billed (charges), received (payments), estimated (vacant units' market rent).
-- ---------------------------------------------------------------------------
create function public.ops_month_summary(p_org uuid, p_month date, p_property uuid default null)
returns jsonb
language sql stable security invoker set search_path = '' as $$
  with params as (
    select date_trunc('month', p_month)::date as first, (date_trunc('month', p_month) + interval '1 month')::date as next,
           least((now() at time zone 'Africa/Johannesburg')::date, (date_trunc('month', p_month) + interval '1 month - 1 day')::date) as as_of
  ),
  units as (
    select u.*, exists (select 1 from public.ops_leases l, params
                         where l.unit_id = u.id and tebos_private.ops_lease_span(l.starts_on, l.ended_on) @> params.as_of) as let
      from public.ops_units u join public.ops_properties p on p.id = u.property_id
     where u.org_id = p_org and p.archived_at is null and (p_property is null or u.property_id = p_property)
  ),
  leases as (
    select l.* from public.ops_leases l join units u on u.id = l.unit_id
  ),
  live as (
    select e.* from public.ops_ledger e join leases l on l.id = e.lease_id
     where not exists (select 1 from public.ops_ledger r where r.reverses_id = e.id) and e.kind <> 'reversal'
  ),
  positions as (
    select p.* from public.ops_lease_positions(p_org, (select as_of from params)) p join leases l on l.id = p.lease_id
  )
  select jsonb_build_object(
    'month', (select first from params),
    'as_of', (select as_of from params),
    'properties', (select count(*) from public.ops_properties p where p.org_id = p_org and p.archived_at is null
                     and (p_property is null or p.id = p_property)),
    'units', (select count(*) from units),
    'occupied', (select count(*) from units where let),
    'held_back', (select count(*) from units where not let and held_back),
    'vacant', (select count(*) from units where not let and not held_back),
    'expected_cents', (select coalesce(sum(tebos_private.ops_pro_rata(l.rent_cents, params.first, l.starts_on, l.ended_on)), 0)
                         from leases l, params),
    'billed_cents', (select coalesce(sum(e.amount_cents), 0) from live e, params
                      where e.kind = 'charge' and e.account = 'rent' and e.effective_on >= params.first and e.effective_on < params.next),
    'received_cents', (select coalesce(sum(e.amount_cents), 0) from live e, params
                        where e.kind = 'payment' and e.account = 'rent' and e.effective_on >= params.first and e.effective_on < params.next),
    'outstanding_cents', (select coalesce(sum(greatest(p.balance_cents, 0)), 0) from positions p),
    'overdue_cents', (select coalesce(sum(p.overdue_cents), 0) from positions p),
    'deposits_held_cents', (select coalesce(sum(p.deposit_held_cents), 0) from positions p),
    'maintenance_spend_cents', (select coalesce(sum(m.cost_cents), 0) from public.ops_maintenance m, params
                                 where m.org_id = p_org and m.status = 'done' and (p_property is null or m.property_id = p_property)
                                   and m.completed_on >= params.first and m.completed_on < params.next),
    'maintenance_open', (select count(*) from public.ops_maintenance m where m.org_id = p_org
                           and m.status not in ('done', 'cancelled', 'declined') and (p_property is null or m.property_id = p_property)),
    'vacancy_estimate_cents', (select coalesce(sum(u.market_rent_cents), 0) from units u where not u.let and not u.held_back),
    'vacant_without_market_rent', (select count(*) from units u where not u.let and not u.held_back and u.market_rent_cents is null)
  )
$$;
revoke all on function public.ops_month_summary(uuid, date, uuid) from public, anon;
grant execute on function public.ops_month_summary(uuid, date, uuid) to authenticated;
revoke all on function tebos_private.guard_ops_write(), tebos_private.guard_ops_property(), tebos_private.guard_ops_unit(),
  tebos_private.guard_ops_lease(), tebos_private.guard_ops_ledger(), tebos_private.guard_ops_maintenance(),
  tebos_private.guard_ops_photo(), tebos_private.audit_fields_only() from public;
grant execute on function tebos_private.ops_photo_may_upload(text), tebos_private.ops_photo_may_read(text) to authenticated;
