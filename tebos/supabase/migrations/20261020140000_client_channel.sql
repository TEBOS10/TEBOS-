-- The client channel (tebos-service-spec.md §7): a client talks to TEBOS directly, and asks for changes within its plan.
--
-- Two records:
--   client_messages  a conversation between a client organisation and TEBOS. Anyone in the organisation may write;
--                    TEBOS's maintainers (or the server) answer. Messages are never edited or deleted.
--   change_requests  a change the client wants made ("new photos for the gallery"). Each costs units against the
--                    month's allowance, which comes from the organisation's active plan: 5 (Small), 15 (Medium),
--                    40 (Company). Over the allowance, or without an active plan, the request is refused with the
--                    reason; the allowance resets on the 1st of each month (South African time).
-- Private (TEPOS) organisations have neither.

-- ---------------------------------------------------------------------------
-- The allowance per plan, mirrored by PLAN_TERMS[...].changeRequestsPerMonth in src/domain/plans.ts
-- ---------------------------------------------------------------------------
create function tebos_private.plan_change_allowance(p_plan text) returns integer
language sql immutable set search_path = '' as $$
  select case p_plan when 'starter' then 5 when 'growth' then 15 when 'company' then 40 else 0 end
$$;

-- The month a request counts against: its first day, in South African time.
create function tebos_private.allowance_period(p_at timestamptz) returns date
language sql stable set search_path = '' as $$
  select date_trunc('month', p_at at time zone 'Africa/Johannesburg')::date
$$;

-- Read with the definer's rights so the guard sees the plan and the month's use whoever is asking; they return only
-- a plan key and a number.
create function tebos_private.active_plan(p_org uuid) returns text
language sql stable security definer set search_path = '' as $$
  select b.plan from public.billing_accounts b
   where b.org_id = p_org and b.status = 'active' order by b.created_at desc limit 1
$$;

create function tebos_private.change_units_used(p_org uuid, p_period date, p_except uuid) returns integer
language plpgsql stable security definer set search_path = '' as $$
begin
  return (select coalesce(sum(c.units), 0)::integer from public.change_requests c
           where c.org_id = p_org and c.period = p_period and c.status <> 'cancelled' and c.id is distinct from p_except);
end $$;

-- ---------------------------------------------------------------------------
-- Messages
-- ---------------------------------------------------------------------------
create table public.client_messages (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organisations (id) on delete cascade,
  from_tebos  boolean not null default false,
  author_id   uuid references auth.users (id),
  body        text not null check (length(btrim(body)) between 1 and 4000),
  created_at  timestamptz not null default now(),
  check (from_tebos or author_id is not null)
);
create index client_messages_org_idx on public.client_messages (org_id, created_at);

create function tebos_private.guard_client_message() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op <> 'INSERT' then
    raise exception 'a message is kept as it was sent' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;
  if exists (select 1 from public.organisations o where o.id = new.org_id and o.app = 'tepos') then
    raise exception 'the client channel is for TEBOS organisations' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  if tebos_private.looks_secret(new.body) then
    raise exception 'the message looks like it contains a password or key; never send secrets here'
      using errcode = 'P0001', hint = 'TEBOS_SECRET_REFUSED';
  end if;
  new.created_at := now();
  if tebos_private.is_client() then
    if auth.uid() is null then
      raise exception 'sign in to send a message' using errcode = '42501', hint = 'TEBOS_PERMISSION_DENIED';
    end if;
    new.author_id := auth.uid();
    if new.from_tebos then
      if not tebos_private.is_staff(array['maintainer']) then
        raise exception 'only TEBOS''s maintainers answer for TEBOS' using errcode = '42501', hint = 'TEBOS_PERMISSION_DENIED';
      end if;
    elsif not tebos_private.is_member(new.org_id) then
      raise exception 'only the organisation''s people write in its channel' using errcode = '42501', hint = 'TEBOS_PERMISSION_DENIED';
    end if;
  elsif not new.from_tebos then
    raise exception 'the server writes only as TEBOS' using errcode = '42501', hint = 'TEBOS_PERMISSION_DENIED';
  end if;
  return new;
end $$;

create trigger guard_client_message before insert or update or delete on public.client_messages
  for each row execute function tebos_private.guard_client_message();
create trigger audit after insert on public.client_messages
  for each row execute function tebos_private.audit_row();

alter table public.client_messages enable row level security;
revoke all on public.client_messages from anon, authenticated;
grant select on public.client_messages to authenticated;
grant insert (org_id, from_tebos, body) on public.client_messages to authenticated;
grant all on public.client_messages to service_role;
create policy member_or_maintainer_read on public.client_messages for select to authenticated
  using (tebos_private.is_member(org_id) or tebos_private.is_staff(array['maintainer']));
create policy member_or_maintainer_write on public.client_messages for insert to authenticated
  with check (tebos_private.is_member(org_id) or tebos_private.is_staff(array['maintainer']));

-- ---------------------------------------------------------------------------
-- Change requests
-- ---------------------------------------------------------------------------
insert into public.state_transitions (machine, from_state, to_state) values
  ('change_request', '(initial)', 'received'),
  ('change_request', 'received', 'in_progress'),
  ('change_request', 'received', 'declined'),
  ('change_request', 'received', 'cancelled'),
  ('change_request', 'in_progress', 'done'),
  ('change_request', 'in_progress', 'declined');

create table public.change_requests (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organisations (id) on delete cascade,
  requested_by  uuid not null references auth.users (id),
  title         text not null check (length(btrim(title)) between 1 and 120),
  detail        text check (detail is null or length(detail) <= 2000),
  units         smallint not null default 1 check (units between 1 and 20),
  status        text not null default 'received',
  outcome_note  text check (outcome_note is null or length(outcome_note) <= 2000),
  period        date not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  finished_at   timestamptz
);
create index change_requests_org_period_idx on public.change_requests (org_id, period);

create function tebos_private.guard_change_request() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_plan text;
  v_allowance integer;
  v_used integer;
begin
  if tg_op = 'DELETE' then
    raise exception 'a change request stays on the record; cancel it instead' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;

  if tg_op = 'INSERT' then
    if not tebos_private.is_client() or auth.uid() is null
       or not tebos_private.has_role(new.org_id, array['org_admin', 'operator']) then
      raise exception 'a change is asked for by an admin or operator of the organisation'
        using errcode = '42501', hint = 'TEBOS_PERMISSION_DENIED';
    end if;
    if exists (select 1 from public.organisations o where o.id = new.org_id and o.app = 'tepos') then
      raise exception 'change requests are for TEBOS organisations' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
    if tebos_private.looks_secret(concat_ws(' ', new.title, new.detail)) then
      raise exception 'the request looks like it contains a password or key; never put secrets in a request'
        using errcode = 'P0001', hint = 'TEBOS_SECRET_REFUSED';
    end if;
    new.requested_by := auth.uid();
    new.units := 1;
    new.status := 'received';
    new.outcome_note := null;
    new.finished_at := null;
    new.created_at := now();
    new.updated_at := now();
    new.period := tebos_private.allowance_period(now());
  else
    if (new.org_id, new.requested_by, new.title, new.detail, new.period, new.created_at)
       is distinct from (old.org_id, old.requested_by, old.title, old.detail, old.period, old.created_at) then
      raise exception 'what was asked, by whom and when is fixed' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
    end if;
    if tebos_private.is_client() and not tebos_private.is_staff(array['maintainer']) then
      -- the client may only withdraw a request TEBOS hasn't started
      if new.status is distinct from old.status and new.status <> 'cancelled'
         or (new.units, new.outcome_note) is distinct from (old.units, old.outcome_note) then
        raise exception 'TEBOS carries out and closes a request; you can cancel it before work starts'
          using errcode = '42501', hint = 'TEBOS_SERVER_ONLY';
      end if;
    end if;
    if new.units is distinct from old.units and old.status <> 'received' then
      raise exception 'a request''s size is set before work starts' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
    end if;
    if new.status in ('done', 'declined') and new.status is distinct from old.status
       and coalesce(length(btrim(new.outcome_note)), 0) = 0 then
      raise exception 'say what was done, or why the request was declined'
        using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
    if new.status is distinct from old.status and new.status in ('done', 'declined', 'cancelled') then
      new.finished_at := now();
    end if;
    new.updated_at := now();
  end if;

  -- the allowance: checked when a request is made, and again when TEBOS sizes it
  if tg_op = 'INSERT' or new.units > old.units then
    v_plan := tebos_private.active_plan(new.org_id);
    if v_plan is null then
      raise exception 'there is no active TEBOS plan for this organisation, so changes can''t be requested yet'
        using errcode = 'P0001', hint = 'TEBOS_OUT_OF_PLAN';
    end if;
    v_allowance := tebos_private.plan_change_allowance(v_plan);
    v_used := tebos_private.change_units_used(new.org_id, new.period, new.id);
    if v_used + new.units > v_allowance then
      raise exception 'this month''s % change requests are used (% of %); new requests open on %, or a larger plan covers more',
        v_allowance, v_used, v_allowance, to_char((new.period + interval '1 month')::date, 'DD Mon YYYY')
        using errcode = 'P0001', hint = 'TEBOS_OUT_OF_PLAN';
    end if;
  end if;
  return new;
end $$;

create trigger guard_change_request before insert or update or delete on public.change_requests
  for each row execute function tebos_private.guard_change_request();
create trigger enforce_state_machine before insert or update of status on public.change_requests
  for each row execute function tebos_private.guard_status('change_request');
create trigger freeze_tenant_keys before update on public.change_requests
  for each row execute function tebos_private.freeze_tenant_keys();
create trigger audit after insert or update on public.change_requests
  for each row execute function tebos_private.audit_row();

alter table public.change_requests enable row level security;
revoke all on public.change_requests from anon, authenticated;
grant select on public.change_requests to authenticated;
grant insert (org_id, title, detail) on public.change_requests to authenticated;
grant update (status, units, outcome_note) on public.change_requests to authenticated;
grant all on public.change_requests to service_role;
create policy member_or_maintainer_read on public.change_requests for select to authenticated
  using (tebos_private.is_member(org_id) or tebos_private.is_staff(array['maintainer']));
create policy operator_asks on public.change_requests for insert to authenticated
  with check (tebos_private.has_role(org_id, array['org_admin', 'operator']));
create policy operator_cancels_or_maintainer_works on public.change_requests for update to authenticated
  using (tebos_private.has_role(org_id, array['org_admin', 'operator']) or tebos_private.is_staff(array['maintainer']))
  with check (tebos_private.has_role(org_id, array['org_admin', 'operator']) or tebos_private.is_staff(array['maintainer']));

-- The organisation's allowance this month and what is used, for the client's page.
create function public.change_allowance(p_org uuid)
returns table (plan text, allowance integer, used integer, period date, resets_on date)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_plan text := tebos_private.active_plan(p_org);
  v_period date := tebos_private.allowance_period(now());
begin
  if auth.uid() is not null and not (tebos_private.is_member(p_org) or tebos_private.is_staff(array['maintainer'])) then
    raise exception 'only the organisation and its maintainers see its allowance'
      using errcode = '42501', hint = 'TEBOS_PERMISSION_DENIED';
  end if;
  return query select v_plan, tebos_private.plan_change_allowance(v_plan),
    tebos_private.change_units_used(p_org, v_period, null), v_period, (v_period + interval '1 month')::date;
end $$;

revoke all on function public.change_allowance(uuid) from public, anon;
grant execute on function public.change_allowance(uuid) to authenticated, service_role;
