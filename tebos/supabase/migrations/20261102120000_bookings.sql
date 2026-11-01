-- Bookings (founder, 1 Nov 2026: "Build Grape Studios' booking platform, stage 1 and create a schedule that both the
-- client and the Grape Studios team can view"; ADR 0016). A reusable TEBOS capability for any business that sells
-- time: a studio, a salon, a tutor. Grape Studios is the first. Additive only.
--
-- The rules (mirrored in src/domain/bookings.ts):
--   * A business lists its services (categories) and their packages (a length and a price). A custom rate is a booking
--     without a package: it is quoted before it is confirmed.
--   * A booking must fall inside the business's working hours, outside its time off, at least a day ahead and within
--     six months, and must not overlap another booking that is requested or confirmed: one photographer, one shoot.
--   * requested -> confirmed | declined | cancelled; confirmed -> completed | cancelled | no_show; completed -> delivered.
--     Every change says why. Confirming needs the price (quoted for a custom rate) and the reference of the deposit
--     received: half the price, non-refundable. TEBOS never takes or holds the money; the team records what arrived.
--     A shoot is completed only once it has ended.
--   * Anyone may request a booking through public.booking_request (throttled), and gets a private link to follow it.
--     The link shows their booking and the business's busy times, never anyone else's details.
--   * The team (the organisation's admin and operators) sees and runs every booking; viewers see the schedule.

insert into public.state_transitions (machine, from_state, to_state) values
  ('booking', '(initial)', 'requested'),
  ('booking', 'requested', 'confirmed'),
  ('booking', 'requested', 'declined'),
  ('booking', 'requested', 'cancelled'),
  ('booking', 'confirmed', 'completed'),
  ('booking', 'confirmed', 'cancelled'),
  ('booking', 'confirmed', 'no_show'),
  ('booking', 'completed', 'delivered');

alter table tebos_private.public_submissions drop constraint public_submissions_kind_check;
alter table tebos_private.public_submissions add constraint public_submissions_kind_check
  check (kind in ('enquiry', 'self_check', 'booking'));

-- ---------------------------------------------------------------------------
-- What the business sells
-- ---------------------------------------------------------------------------
create table public.booking_services (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organisations (id),
  key           text not null check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  name          text not null check (length(trim(name)) between 2 and 60),
  cover_path    text check (cover_path is null or cover_path ~ '^/[a-z0-9/_.-]+\.(jpg|jpeg|png|webp)$'),
  pictures_note text check (pictures_note is null or length(pictures_note) <= 120),
  delivery_days int4range,
  travel_min    integer check (travel_min is null or travel_min >= 0),
  travel_max    integer check (travel_max is null or travel_max >= travel_min),
  at_studio     boolean not null default false,
  sort          integer not null default 0,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (org_id, key),
  unique (id, org_id)
);

create table public.booking_packages (
  id          uuid primary key default gen_random_uuid(),
  service_id  uuid not null,
  org_id      uuid not null,
  label       text not null check (length(trim(label)) between 2 and 40),
  minutes     integer not null check (minutes between 30 and 720),
  price_cents integer not null check (price_cents > 0),
  note        text check (note is null or length(note) <= 80),
  sort        integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  foreign key (service_id, org_id) references public.booking_services (id, org_id),
  unique (id, org_id)
);

-- Working hours, per weekday (1 Monday … 7 Sunday), in South African time
create table public.booking_hours (
  org_id  uuid not null references public.organisations (id),
  weekday integer not null check (weekday between 1 and 7),
  opens   time not null,
  closes  time not null,
  primary key (org_id, weekday),
  check (closes > opens)
);

create table public.booking_time_off (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organisations (id),
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  reason     text check (reason is null or length(reason) <= 120),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (not tebos_private.looks_personal(reason))
);

-- What a customer sees once the deposit is due: how to pay, set by the business. Shown only through a booking's link.
create table public.booking_settings (
  org_id               uuid primary key references public.organisations (id),
  public_name          text not null check (length(trim(public_name)) between 2 and 80),
  contact_email        text check (contact_email is null or contact_email ~* '^[^@\s]+@[^@\s]+\.[a-z]{2,}$'),
  deposit_instructions text check (deposit_instructions is null or length(deposit_instructions) <= 1000),
  accepting            boolean not null default false,
  updated_at           timestamptz not null default now(),
  check (not tebos_private.looks_secret(deposit_instructions))
);

-- ---------------------------------------------------------------------------
-- Bookings
-- ---------------------------------------------------------------------------
create sequence public.booking_ref_seq;
create table public.bookings (
  id             uuid primary key default gen_random_uuid(),
  ref            text not null unique default 'BK-' || lpad(nextval('public.booking_ref_seq')::text, 5, '0'),
  org_id         uuid not null references public.organisations (id),
  service_id     uuid not null,
  package_id     uuid,
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  status         text not null default 'requested',
  status_note    text not null check (length(trim(status_note)) between 5 and 500),
  customer_name  text not null check (length(trim(customer_name)) between 2 and 80),
  customer_email text not null check (customer_email ~* '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' and length(customer_email) <= 120),
  customer_phone text check (customer_phone is null or customer_phone ~ '^\+?[0-9 ]{9,16}$'),
  brief          text check (brief is null or length(brief) <= 1000),
  price_cents    integer check (price_cents is null or price_cents > 0),
  deposit_cents  integer,
  deposit_ref    text check (deposit_ref is null or length(trim(deposit_ref)) between 4 and 80),
  delivered_note text check (delivered_note is null or length(delivered_note) <= 300),
  token_hash     text not null unique,
  consent_at     timestamptz not null,
  created_by     uuid references auth.users (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  foreign key (service_id, org_id) references public.booking_services (id, org_id),
  foreign key (package_id, org_id) references public.booking_packages (id, org_id),
  check (ends_at > starts_at and ends_at - starts_at <= interval '12 hours'),
  check (not tebos_private.looks_secret(brief) and not tebos_private.looks_secret(status_note) and not tebos_private.looks_secret(deposit_ref))
);
create index bookings_org_time_idx on public.bookings (org_id, starts_at);

-- Why a time can't be booked; null means it can
create function tebos_private.booking_slot_problem(p_org uuid, p_starts timestamptz, p_ends timestamptz, p_ignore uuid default null)
returns text language sql stable security definer set search_path = '' as $$
  with local as (
    select (p_starts at time zone 'Africa/Johannesburg') as s, (p_ends at time zone 'Africa/Johannesburg') as e
  )
  select case
    when p_starts < now() + interval '24 hours' then 'a booking is made at least a day ahead'
    when p_starts > now() + interval '6 months' then 'bookings open up to six months ahead'
    when (select s::date <> e::date from local) then 'a booking starts and ends on the same day'
    when not exists (select 1 from public.booking_hours h, local
                      where h.org_id = p_org and h.weekday = extract(isodow from local.s)
                        and local.s::time >= h.opens and local.e::time <= h.closes)
      then 'that is outside working hours'
    when exists (select 1 from public.booking_time_off t where t.org_id = p_org and t.starts_at < p_ends and t.ends_at > p_starts)
      then 'the studio is closed then'
    when exists (select 1 from public.bookings b where b.org_id = p_org and b.status in ('requested', 'confirmed')
                  and b.id is distinct from p_ignore and b.starts_at < p_ends and b.ends_at > p_starts)
      then 'that time is already taken'
  end
$$;

create function tebos_private.guard_booking() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_problem text; v_pkg public.booking_packages; v_staff boolean;
begin
  v_staff := tebos_private.has_role(new.org_id, array['org_admin', 'operator']);
  if tg_op = 'INSERT' then
    -- one booking at a time per business, so two people can't take the same slot
    perform pg_advisory_xact_lock(hashtext('booking:' || new.org_id::text));
    if new.package_id is not null then
      select * into v_pkg from public.booking_packages where id = new.package_id;
      if v_pkg.service_id <> new.service_id or not v_pkg.active then
        raise exception 'that rate isn''t offered for this service' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
      end if;
      new.ends_at := new.starts_at + make_interval(mins => v_pkg.minutes);
      new.price_cents := v_pkg.price_cents;
    else
      new.price_cents := null;
    end if;
    if not exists (select 1 from public.booking_services s where s.id = new.service_id and s.active) then
      raise exception 'that service isn''t offered' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
    v_problem := tebos_private.booking_slot_problem(new.org_id, new.starts_at, new.ends_at);
    if v_problem is not null then
      raise exception '%', v_problem using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
    new.status := 'requested'; new.deposit_cents := null; new.deposit_ref := null; new.delivered_note := null;
    new.created_by := auth.uid(); new.created_at := now();
    return new;
  end if;

  -- updates: only the team
  if not v_staff and auth.uid() is not null then
    raise exception 'only the team changes a booking' using errcode = '42501';
  end if;
  if (new.org_id, new.service_id, new.package_id, new.customer_name, new.customer_email, new.customer_phone, new.token_hash, new.consent_at, new.created_by)
     is distinct from (old.org_id, old.service_id, old.package_id, old.customer_name, old.customer_email, old.customer_phone, old.token_hash, old.consent_at, old.created_by) then
    raise exception 'who booked and what was asked for don''t change' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;
  if (new.starts_at, new.ends_at) is distinct from (old.starts_at, old.ends_at) then
    if old.status not in ('requested', 'confirmed') then
      raise exception 'only an open booking moves' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
    end if;
    perform pg_advisory_xact_lock(hashtext('booking:' || new.org_id::text));
    if old.package_id is not null then
      new.ends_at := new.starts_at + (old.ends_at - old.starts_at);
    end if;
    v_problem := tebos_private.booking_slot_problem(new.org_id, new.starts_at, new.ends_at, new.id);
    if v_problem is not null then
      raise exception '%', v_problem using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
  end if;
  if old.package_id is not null and new.price_cents is distinct from old.price_cents then
    raise exception 'a listed rate''s price is fixed; use a custom rate to quote' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;
  if old.status <> 'requested' and new.price_cents is distinct from old.price_cents then
    raise exception 'the price is fixed once confirmed' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;
  if new.status is not distinct from old.status then
    new.deposit_ref := old.deposit_ref; new.deposit_cents := old.deposit_cents;
    return new;
  end if;
  if new.status_note is not distinct from old.status_note then
    raise exception 'every change of state says why' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  if new.status = 'confirmed' then
    if new.price_cents is null then
      raise exception 'quote the price before confirming' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
    if new.deposit_ref is null then
      raise exception 'confirm once the deposit has arrived: record its reference' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
    new.deposit_cents := round(new.price_cents * 0.5);
  else
    new.deposit_ref := old.deposit_ref; new.deposit_cents := old.deposit_cents;
  end if;
  if new.status in ('completed', 'no_show') and old.ends_at > now() then
    raise exception 'a shoot is completed once it has ended' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  if new.status = 'delivered' and length(trim(coalesce(new.delivered_note, ''))) < 5 then
    raise exception 'say how the images were sent' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  return new;
end $$;

create function tebos_private.guard_booking_delete() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'bookings are kept; cancel or decline instead' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
end $$;

create trigger enforce_state_machine before insert or update of status on public.bookings
  for each row execute function tebos_private.guard_status('booking');
create trigger guard_booking before insert or update on public.bookings
  for each row execute function tebos_private.guard_booking();
create trigger guard_booking_delete before delete on public.bookings
  for each row execute function tebos_private.guard_booking_delete();
create trigger touch before update on public.bookings
  for each row execute function tebos_private.touch_updated_at();
create trigger audit after insert or update or delete on public.bookings
  for each row execute function tebos_private.audit_row();
create trigger audit after insert or update or delete on public.booking_time_off
  for each row execute function tebos_private.audit_row();
create trigger audit after insert or update or delete on public.booking_packages
  for each row execute function tebos_private.audit_row();

create function tebos_private.stamp_time_off() returns trigger
language plpgsql set search_path = '' as $$
begin new.created_by := auth.uid(); return new; end $$;
create trigger stamp before insert on public.booking_time_off
  for each row execute function tebos_private.stamp_time_off();

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
alter table public.booking_services enable row level security;
alter table public.booking_packages enable row level security;
alter table public.booking_hours enable row level security;
alter table public.booking_time_off enable row level security;
alter table public.booking_settings enable row level security;
alter table public.bookings enable row level security;

create policy read on public.booking_services for select to authenticated using (tebos_private.is_member(org_id));
create policy team_write on public.booking_services for all to authenticated
  using (tebos_private.has_role(org_id, array['org_admin'])) with check (tebos_private.has_role(org_id, array['org_admin']));
create policy read on public.booking_packages for select to authenticated using (tebos_private.is_member(org_id));
create policy team_write on public.booking_packages for all to authenticated
  using (tebos_private.has_role(org_id, array['org_admin'])) with check (tebos_private.has_role(org_id, array['org_admin']));
create policy read on public.booking_hours for select to authenticated using (tebos_private.is_member(org_id));
create policy team_write on public.booking_hours for all to authenticated
  using (tebos_private.has_role(org_id, array['org_admin'])) with check (tebos_private.has_role(org_id, array['org_admin']));
create policy read on public.booking_time_off for select to authenticated using (tebos_private.is_member(org_id));
create policy team_write on public.booking_time_off for all to authenticated
  using (tebos_private.has_role(org_id, array['org_admin', 'operator'])) with check (tebos_private.has_role(org_id, array['org_admin', 'operator']));
create policy read on public.booking_settings for select to authenticated using (tebos_private.is_member(org_id));
create policy team_write on public.booking_settings for all to authenticated
  using (tebos_private.has_role(org_id, array['org_admin'])) with check (tebos_private.has_role(org_id, array['org_admin']));

-- the team runs bookings; a viewer sees the schedule without the customers' contact details (booking_schedule)
create policy team_read on public.bookings for select to authenticated using (tebos_private.has_role(org_id, array['org_admin', 'operator']));
create policy team_insert on public.bookings for insert to authenticated with check (tebos_private.has_role(org_id, array['org_admin', 'operator']));
create policy team_update on public.bookings for update to authenticated
  using (tebos_private.has_role(org_id, array['org_admin', 'operator'])) with check (tebos_private.has_role(org_id, array['org_admin', 'operator']));

grant select, insert, update, delete on public.booking_services, public.booking_packages, public.booking_hours,
  public.booking_time_off, public.booking_settings to authenticated;
grant select, insert on public.bookings to authenticated;
grant update (starts_at, ends_at, status, status_note, price_cents, deposit_ref, delivered_note) on public.bookings to authenticated;
grant all on public.booking_services, public.booking_packages, public.booking_hours, public.booking_time_off,
  public.booking_settings, public.bookings to service_role;
grant usage on sequence public.booking_ref_seq to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Public: the catalogue, free times, requesting, and following a booking by its link
-- ---------------------------------------------------------------------------
create function public.booking_catalogue(p_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'name', s.public_name, 'accepting', s.accepting,
    'services', coalesce((select jsonb_agg(jsonb_build_object(
        'id', v.id, 'key', v.key, 'name', v.name, 'cover', v.cover_path, 'pictures', v.pictures_note,
        'delivery_min', lower(v.delivery_days), 'delivery_max', upper(v.delivery_days) - 1,
        'travel_min', v.travel_min, 'travel_max', v.travel_max, 'at_studio', v.at_studio,
        'packages', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'label', p.label, 'minutes', p.minutes,
            'price_cents', p.price_cents, 'note', p.note) order by p.sort, p.price_cents)
          from public.booking_packages p where p.service_id = v.id and p.active), '[]'::jsonb))
        order by v.sort, v.name)
      from public.booking_services v where v.org_id = o.id and v.active), '[]'::jsonb))
  from public.organisations o join public.booking_settings s on s.org_id = o.id
  where o.slug = p_slug
$$;

-- free start times on one day for a booking of p_minutes, every half hour
create function public.booking_free_times(p_slug text, p_day date, p_minutes integer)
returns table (starts_at timestamptz) language sql stable security definer set search_path = '' as $$
  select t from public.organisations o
    join public.booking_hours h on h.org_id = o.id and h.weekday = extract(isodow from p_day)
    cross join lateral generate_series(
      (p_day + h.opens) at time zone 'Africa/Johannesburg',
      (p_day + h.closes) at time zone 'Africa/Johannesburg' - make_interval(mins => greatest(30, least(p_minutes, 720))),
      interval '30 minutes') as t
   where o.slug = p_slug and p_minutes between 30 and 720
     and tebos_private.booking_slot_problem(o.id, t, t + make_interval(mins => p_minutes)) is null
   order by t
$$;

create function public.booking_request(p_slug text, p_service uuid, p_package uuid, p_starts timestamptz, p_minutes integer,
  p_name text, p_email text, p_phone text, p_brief text, p_consent boolean)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_org uuid; v_token text; v_id uuid; v_ref text; v_minutes integer;
begin
  select o.id into v_org from public.organisations o join public.booking_settings s on s.org_id = o.id
   where o.slug = p_slug and s.accepting;
  if v_org is null then
    raise exception 'this business isn''t taking bookings online yet' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  if not coalesce(p_consent, false) then
    raise exception 'agree to the booking terms and to your details being used for this booking' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  if p_package is null and length(trim(coalesce(p_brief, ''))) < 10 then
    raise exception 'for a custom rate, say what you need' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  perform tebos_private.throttle('booking', 3, 40);
  if (select count(*) from public.bookings b where b.org_id = v_org and lower(b.customer_email) = lower(trim(p_email)) and b.status = 'requested') >= 2 then
    raise exception 'you already have two requests waiting; the team will reply first' using errcode = 'P0001', hint = 'TEBOS_RATE_LIMITED';
  end if;
  v_minutes := greatest(30, least(coalesce(p_minutes, 60), 720));
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.bookings (org_id, service_id, package_id, starts_at, ends_at, status_note, customer_name, customer_email,
                               customer_phone, brief, token_hash, consent_at)
  values (v_org, p_service, p_package, p_starts, p_starts + make_interval(mins => v_minutes), 'Requested online.',
          trim(p_name), lower(trim(p_email)), nullif(trim(coalesce(p_phone, '')), ''), nullif(trim(coalesce(p_brief, '')), ''),
          tebos_private.hash_token(v_token), now())
  returning id, ref into v_id, v_ref;
  return jsonb_build_object('ref', v_ref, 'token', v_token);
end $$;

-- the customer's view: their booking, how to pay the deposit once it's due, and the business's busy times that week
create function public.booking_for_token(p_token text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'ref', b.ref, 'status', b.status, 'status_note', case when b.status in ('declined', 'cancelled') then b.status_note end,
    'business', s.public_name, 'contact_email', s.contact_email,
    'service', v.name, 'package', p.label, 'starts_at', b.starts_at, 'ends_at', b.ends_at,
    'price_cents', b.price_cents, 'deposit_cents', coalesce(b.deposit_cents, round(b.price_cents * 0.5)),
    'deposit_paid', b.deposit_ref is not null,
    'deposit_instructions', case when b.status = 'requested' and b.price_cents is not null then s.deposit_instructions end,
    'delivery_min', lower(v.delivery_days), 'delivery_max', upper(v.delivery_days) - 1,
    'travel_min', v.travel_min, 'travel_max', v.travel_max, 'delivered_note', b.delivered_note,
    'week_busy', coalesce((select jsonb_agg(jsonb_build_object('starts_at', x.starts_at, 'ends_at', x.ends_at, 'yours', x.id = b.id) order by x.starts_at)
       from public.bookings x where x.org_id = b.org_id and x.status in ('requested', 'confirmed', 'completed', 'delivered')
        and x.starts_at >= date_trunc('week', b.starts_at at time zone 'Africa/Johannesburg') at time zone 'Africa/Johannesburg'
        and x.starts_at < (date_trunc('week', b.starts_at at time zone 'Africa/Johannesburg') + interval '7 days') at time zone 'Africa/Johannesburg'), '[]'::jsonb))
  from public.bookings b
  join public.booking_services v on v.id = b.service_id
  left join public.booking_packages p on p.id = b.package_id
  join public.booking_settings s on s.org_id = b.org_id
  where b.token_hash = tebos_private.hash_token(p_token)
$$;

-- the team's schedule for a range: viewers see when and what; admins and operators also see who
create function public.booking_schedule(p_org uuid, p_from date, p_days integer default 7)
returns table (id uuid, ref text, starts_at timestamptz, ends_at timestamptz, status text, service text, package text,
               customer_name text, price_cents integer, deposit_paid boolean, kind text)
language plpgsql stable security definer set search_path = '' as $$
declare v_team boolean := tebos_private.has_role(p_org, array['org_admin', 'operator']);
        v_from timestamptz := p_from::timestamp at time zone 'Africa/Johannesburg';
        v_to timestamptz := (p_from + greatest(1, least(p_days, 42)))::timestamp at time zone 'Africa/Johannesburg';
begin
  if not tebos_private.is_member(p_org) then
    raise exception 'not yours to see' using errcode = '42501';
  end if;
  return query
    select b.id, b.ref, b.starts_at, b.ends_at, b.status, v.name, p.label,
           case when v_team then b.customer_name end, b.price_cents, b.deposit_ref is not null, 'booking'::text
      from public.bookings b join public.booking_services v on v.id = b.service_id
      left join public.booking_packages p on p.id = b.package_id
     where b.org_id = p_org and b.starts_at < v_to and b.ends_at > v_from and b.status not in ('declined')
    union all
    select t.id, null, t.starts_at, t.ends_at, 'time_off', null, null, null, null, null, 'time_off'
      from public.booking_time_off t where t.org_id = p_org and t.starts_at < v_to and t.ends_at > v_from
    order by 3;
end $$;

revoke all on function public.booking_catalogue(text), public.booking_free_times(text, date, integer),
  public.booking_request(text, uuid, uuid, timestamptz, integer, text, text, text, text, boolean),
  public.booking_for_token(text), public.booking_schedule(uuid, date, integer) from public;
grant execute on function public.booking_catalogue(text), public.booking_free_times(text, date, integer),
  public.booking_request(text, uuid, uuid, timestamptz, integer, text, text, text, text, boolean),
  public.booking_for_token(text) to anon, authenticated, service_role;
grant execute on function public.booking_schedule(uuid, date, integer) to authenticated, service_role;
revoke all on function tebos_private.booking_slot_problem(uuid, timestamptz, timestamptz, uuid) from public;
