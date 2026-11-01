-- Studio crew (ADR 0018): a booking business runs without its owner on every shoot.
--   * Each booking names the team member who does it (a photographer for Grape Studios), chosen from the
--     business's admins and operators. A booking is confirmed only once someone is assigned.
--   * The shoot day is a checklist the team records: the call sheet sent, releases (or why none were needed),
--     and the files backed up. A shoot is marked done only once its files are backed up and releases are noted.
--   * Delivery: the gallery link is released to the customer only when the shoot is delivered, and a shoot is
--     delivered only with that link and, when a balance is owed, the balance's payment reference.
-- Nothing here is filled in by TEBOS itself: each item is recorded by a signed-in team member and audited.

alter table public.bookings
  add column assignee_id      uuid references auth.users (id),
  add column call_sheet_at    timestamptz,
  add column releases_note    text check (releases_note is null or length(trim(releases_note)) between 5 and 300),
  add column backed_up_at     timestamptz,
  add column balance_ref      text check (balance_ref is null or length(trim(balance_ref)) between 4 and 80),
  add column gallery_url      text check (gallery_url is null or (gallery_url ~ '^https://[^\s]+$' and length(gallery_url) <= 500)),
  add constraint bookings_crew_not_secret check (not tebos_private.looks_secret(releases_note) and not tebos_private.looks_secret(balance_ref)
                                                 and not tebos_private.looks_secret(gallery_url));
create index bookings_assignee_idx on public.bookings (assignee_id) where assignee_id is not null;

-- runs after guard_booking (triggers fire in name order)
create function tebos_private.guard_booking_crew() returns trigger
language plpgsql set search_path = '' as $$
declare v_balance integer;
begin
  if tg_op = 'INSERT' then
    if new.call_sheet_at is not null or new.releases_note is not null or new.backed_up_at is not null
       or new.balance_ref is not null or new.gallery_url is not null then
      raise exception 'a new booking has no shoot-day records yet' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
  else
    -- a closed booking's records are history
    if old.status in ('declined', 'cancelled', 'no_show', 'delivered')
       and (new.assignee_id, new.call_sheet_at, new.releases_note, new.backed_up_at, new.balance_ref, new.gallery_url)
           is distinct from (old.assignee_id, old.call_sheet_at, old.releases_note, old.backed_up_at, old.balance_ref, old.gallery_url) then
      raise exception 'a closed booking''s records are kept as they are' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
    end if;
    -- who does the shoot can change only before it happens
    if new.assignee_id is distinct from old.assignee_id and old.status not in ('requested', 'confirmed') then
      raise exception 'the photographer can change only before the shoot' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
    end if;
  end if;

  if new.assignee_id is not null and not exists (
       select 1 from public.memberships m where m.org_id = new.org_id and m.user_id = new.assignee_id and m.role in ('org_admin', 'operator')) then
    raise exception 'assign someone on the team (an admin or operator)' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;

  -- each record is a fact about the past, stamped when it is first recorded
  if new.call_sheet_at is distinct from (case when tg_op = 'UPDATE' then old.call_sheet_at end) then
    if new.call_sheet_at is null or new.call_sheet_at > now() + interval '1 minute' then
      raise exception 'record the call sheet when it has been sent' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
    if tg_op = 'UPDATE' and old.call_sheet_at is not null then
      raise exception 'the call sheet is already recorded' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
    end if;
    if new.status not in ('requested', 'confirmed') then
      raise exception 'a call sheet goes out before the shoot' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
  end if;
  if new.backed_up_at is distinct from (case when tg_op = 'UPDATE' then old.backed_up_at end) then
    if tg_op = 'UPDATE' and old.backed_up_at is not null then
      raise exception 'the backup is already recorded' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
    end if;
    if new.backed_up_at is null or new.backed_up_at > now() + interval '1 minute' or new.backed_up_at < new.starts_at then
      raise exception 'files are backed up after the shoot has started, and not in the future' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
  end if;
  if tg_op = 'UPDATE' and old.releases_note is not null and new.releases_note is distinct from old.releases_note then
    raise exception 'the releases note is already recorded' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'confirmed' and new.assignee_id is null then
      raise exception 'assign the photographer before confirming' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
    if new.status = 'completed' and (new.backed_up_at is null or new.releases_note is null) then
      raise exception 'a shoot is done once its files are backed up and releases are noted' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
    if new.status = 'delivered' then
      if new.gallery_url is null then
        raise exception 'add the gallery link before delivering' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
      end if;
      v_balance := coalesce(new.price_cents, 0) - coalesce(new.deposit_cents, 0);
      if v_balance > 0 and new.balance_ref is null then
        raise exception 'the gallery is released once the balance is paid: record its reference' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
      end if;
    end if;
  end if;
  if new.gallery_url is not null and new.status not in ('completed', 'delivered') then
    raise exception 'a gallery is added after the shoot' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  if new.balance_ref is not null and new.status not in ('confirmed', 'completed', 'delivered') then
    raise exception 'a balance is paid on a confirmed booking' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  return new;
end $$;

create trigger guard_booking_crew before insert or update on public.bookings
  for each row execute function tebos_private.guard_booking_crew();

-- the customer's view gains the gallery, shown only once delivered (same signature: replaced in place)
create or replace function public.booking_for_token(p_token text)
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
    'balance_due', b.status = 'completed' and coalesce(b.price_cents, 0) > coalesce(b.deposit_cents, 0) and b.balance_ref is null,
    'gallery_url', case when b.status = 'delivered' then b.gallery_url end,
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

-- who on the team can be assigned, with their names; members only
create function public.booking_crew(p_org uuid)
returns table (user_id uuid, display_name text, role text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not tebos_private.is_member(p_org) then
    raise exception 'not yours to see' using errcode = '42501';
  end if;
  return query
    select m.user_id, coalesce(pr.display_name, 'Team member'), m.role
      from public.memberships m left join public.profiles pr on pr.user_id = m.user_id
     where m.org_id = p_org and m.role in ('org_admin', 'operator')
     order by 2;
end $$;
revoke all on function public.booking_crew(uuid) from public;
grant execute on function public.booking_crew(uuid) to authenticated, service_role;
revoke all on function tebos_private.guard_booking_crew() from public;
-- the team records the crew and the shoot day; nothing else on a booking becomes writable
grant update (assignee_id, call_sheet_at, releases_note, backed_up_at, balance_ref, gallery_url) on public.bookings to authenticated;
