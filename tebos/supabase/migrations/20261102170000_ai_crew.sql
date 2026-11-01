-- AI crew and publishing consent (ADR 0020). Grape Studios' roles are run by AI agents (Grok), in teams with day and
-- night shifts, overseen by Teboho; TEBOS runs the technology. The rules that keep that safe live here:
--   * Agents draft; people decide. An agent's work is a draft. Only a person who is an admin of the business approves
--     it, and a person marks it sent after sending it themselves. TEBOS never sends, pays or publishes on its own.
--   * Each agent belongs to one team (bookings, admin, social) and one shift: day 06:00 to 18:00 South African time,
--     night 18:00 to 06:00. Work goes to the team's agents on shift.
--   * Agents never shoot: a booking's photographer is always a person (assignee_id, migration studio_crew).
--   * Publishing consent is asked at intake: a customer says yes or no to the studio publishing photos from their shoot,
--     after reading what that means. Social work (captions, posts) can only be drafted for a shoot with a yes.
--   * Agents see what the work needs, not the customer's contact details: no email or phone in a brief.

-- ---------------------------------------------------------------------------
-- Publishing consent at intake
-- ---------------------------------------------------------------------------
alter table public.bookings
  add column publish_consent    boolean,
  add column publish_consent_at timestamptz,
  add constraint bookings_publish_consent_stamped check ((publish_consent is null) = (publish_consent_at is null));

-- the intake now asks the publishing question; a customer must answer it either way
drop function public.booking_request(text, uuid, uuid, timestamptz, integer, text, text, text, text, boolean);
create function public.booking_request(p_slug text, p_service uuid, p_package uuid, p_starts timestamptz, p_minutes integer,
  p_name text, p_email text, p_phone text, p_brief text, p_consent boolean, p_publish boolean)
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
  if p_publish is null then
    raise exception 'say whether the studio may publish photos from your shoot' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
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
                               customer_phone, brief, token_hash, consent_at, publish_consent, publish_consent_at)
  values (v_org, p_service, p_package, p_starts, p_starts + make_interval(mins => v_minutes), 'Requested online.',
          trim(p_name), lower(trim(p_email)), nullif(trim(coalesce(p_phone, '')), ''), nullif(trim(coalesce(p_brief, '')), ''),
          tebos_private.hash_token(v_token), now(), p_publish, now())
  returning id, ref into v_id, v_ref;
  return jsonb_build_object('ref', v_ref, 'token', v_token);
end $$;
revoke all on function public.booking_request(text, uuid, uuid, timestamptz, integer, text, text, text, text, boolean, boolean) from public, anon;
grant execute on function public.booking_request(text, uuid, uuid, timestamptz, integer, text, text, text, text, boolean, boolean)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The crew: agents in teams and shifts
-- ---------------------------------------------------------------------------
create table public.ai_agents (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organisations (id),
  name         text not null check (length(trim(name)) between 2 and 60),
  team         text not null check (team in ('bookings', 'admin', 'social')),
  shift        text not null check (shift in ('day', 'night')),
  provider     text not null default 'xai' check (provider in ('xai', 'anthropic', 'gateway')),
  status       text not null default 'active' check (status in ('active', 'paused')),
  instructions text check (instructions is null or length(instructions) <= 2000),
  created_by   uuid references auth.users (id),
  created_at   timestamptz not null default now(),
  unique (id, org_id),
  unique (org_id, name),
  check (not tebos_private.looks_secret(instructions))
);

-- day is 06:00 to 18:00 in South Africa, night the rest
create function tebos_private.ai_shift_at(p_at timestamptz) returns text
language sql immutable set search_path = '' as $$
  select case when extract(hour from (p_at at time zone 'Africa/Johannesburg')) between 6 and 17 then 'day' else 'night' end
$$;

-- who is on duty now, team by team; members only
create function public.ai_on_duty(p_org uuid)
returns table (id uuid, name text, team text, shift text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not tebos_private.is_member(p_org) then
    raise exception 'not yours to see' using errcode = '42501';
  end if;
  return query
    select a.id, a.name, a.team, a.shift from public.ai_agents a
     where a.org_id = p_org and a.status = 'active' and a.shift = tebos_private.ai_shift_at(now())
     order by a.team, a.name;
end $$;

-- ---------------------------------------------------------------------------
-- The work: drafts by agents, decided by people
-- ---------------------------------------------------------------------------
insert into public.state_transitions (machine, from_state, to_state) values
  ('ai_task', '(initial)', 'queued'),
  ('ai_task', 'queued', 'drafted'),
  ('ai_task', 'queued', 'cancelled'),
  ('ai_task', 'drafted', 'approved'),
  ('ai_task', 'drafted', 'rejected'),
  ('ai_task', 'drafted', 'queued'),
  ('ai_task', 'approved', 'sent'),
  ('ai_task', 'approved', 'cancelled');

-- a booking's (id, org_id) pair, so tasks can point at it within the same business
create unique index if not exists bookings_id_org_key on public.bookings (id, org_id);

create table public.ai_tasks (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organisations (id),
  team        text not null check (team in ('bookings', 'admin', 'social')),
  kind        text not null check (kind in ('reply_enquiry', 'call_sheet', 'balance_reminder', 'caption')),
  booking_id  uuid,
  agent_id    uuid,
  brief       text not null check (length(trim(brief)) between 5 and 1000),
  status      text not null default 'queued',
  draft       text check (draft is null or length(trim(draft)) between 5 and 4000),
  decided_by  uuid references auth.users (id),
  decided_at  timestamptz,
  sent_note   text check (sent_note is null or length(trim(sent_note)) between 5 and 300),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (booking_id, org_id) references public.bookings (id, org_id),
  foreign key (agent_id, org_id) references public.ai_agents (id, org_id),
  check (not tebos_private.looks_secret(brief) and not tebos_private.looks_secret(draft) and not tebos_private.looks_secret(sent_note))
);
create index ai_tasks_org_status_idx on public.ai_tasks (org_id, status, created_at);


create function tebos_private.guard_ai_task() returns trigger
language plpgsql set search_path = '' as $$
declare v_team text;
begin
  -- each kind of work belongs to one team
  v_team := case new.kind when 'reply_enquiry' then 'bookings' when 'call_sheet' then 'bookings'
                          when 'balance_reminder' then 'admin' when 'caption' then 'social' end;
  if new.team is distinct from v_team then
    raise exception '% work belongs to the % team', new.kind, v_team using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  if new.kind <> 'caption' and new.booking_id is null then
    raise exception 'this work is about a booking' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  -- social work only for a shoot whose customer said yes to publishing
  if new.kind = 'caption' and (new.booking_id is null or not exists (
       select 1 from public.bookings b where b.id = new.booking_id and b.publish_consent)) then
    raise exception 'the customer hasn''t agreed to publishing photos from this shoot' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  if new.agent_id is not null and not exists (
       select 1 from public.ai_agents a where a.id = new.agent_id and a.team = new.team) then
    raise exception 'the agent isn''t on this team' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;

  if tg_op = 'INSERT' then
    if new.draft is not null or new.agent_id is not null or new.decided_by is not null or new.sent_note is not null then
      raise exception 'new work starts queued' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
    return new;
  end if;
  if (new.org_id, new.team, new.kind, new.booking_id, new.brief) is distinct from (old.org_id, old.team, old.kind, old.booking_id, old.brief) then
    raise exception 'what the work is can''t change' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;
  -- a person may edit a draft before deciding on it, never after
  if new.draft is distinct from old.draft and not (old.status = 'drafted' and new.status = 'drafted')
     and not (old.status = 'queued' and new.status = 'drafted') and not (old.status = 'drafted' and new.status = 'queued') then
    raise exception 'a decided draft is kept as it was' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;
  if new.status is not distinct from old.status then
    new.decided_by := old.decided_by; new.decided_at := old.decided_at; new.sent_note := old.sent_note;
    return new;
  end if;
  if new.status = 'drafted' then
    if new.agent_id is null or new.draft is null then
      raise exception 'a draft names the agent that wrote it' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
  elsif new.status = 'queued' then
    new.draft := null; new.agent_id := null;   -- sent back to be drafted again
  elsif new.status in ('approved', 'rejected') then
    -- only a person who is an admin of the business decides; the worker and agents never do
    if auth.uid() is null or not tebos_private.has_role(new.org_id, array['org_admin']) then
      raise exception 'only an admin of the business approves or rejects an agent''s draft' using errcode = '42501', hint = 'TEBOS_PERMISSION_DENIED';
    end if;
    new.decided_by := auth.uid(); new.decided_at := now();
  elsif new.status = 'sent' then
    -- TEBOS doesn't send: a person sends the approved draft, then records how
    if auth.uid() is null then
      raise exception 'a person marks the work sent, after sending it' using errcode = '42501', hint = 'TEBOS_PERMISSION_DENIED';
    end if;
    if new.sent_note is null then
      raise exception 'say how and to whom it was sent' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
  end if;
  return new;
end $$;

create trigger enforce_state_machine before insert or update of status on public.ai_tasks
  for each row execute function tebos_private.guard_status('ai_task');
create trigger guard_ai_task before insert or update on public.ai_tasks
  for each row execute function tebos_private.guard_ai_task();
create trigger touch before update on public.ai_tasks
  for each row execute function tebos_private.touch_updated_at();
create trigger audit after insert or update or delete on public.ai_tasks
  for each row execute function tebos_private.audit_row();
create trigger audit after insert or update or delete on public.ai_agents
  for each row execute function tebos_private.audit_row();

create function tebos_private.stamp_ai_agent() returns trigger
language plpgsql set search_path = '' as $$
begin new.created_by := auth.uid(); return new; end $$;
create trigger stamp before insert on public.ai_agents
  for each row execute function tebos_private.stamp_ai_agent();

create function tebos_private.guard_ai_agent_delete() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'agents are kept for the record; pause one instead' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
end $$;
create trigger guard_delete before delete on public.ai_agents
  for each row execute function tebos_private.guard_ai_agent_delete();

-- the crew's work arrives by itself: each step of a booking queues the next piece of work for the team that does it,
-- when the business has an active agent on that team. The brief carries what the work needs and no contact details.
create function tebos_private.queue_crew_work() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_kind text; v_team text; v_service text;
begin
  if tg_op = 'INSERT' and new.status = 'requested' then v_kind := 'reply_enquiry';
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    v_kind := case new.status
      when 'confirmed' then 'call_sheet'
      when 'completed' then case when coalesce(new.price_cents, 0) > coalesce(new.deposit_cents, 0) and new.balance_ref is null then 'balance_reminder' end
      when 'delivered' then case when new.publish_consent then 'caption' end
    end;
  end if;
  if v_kind is null then return new; end if;
  v_team := case v_kind when 'reply_enquiry' then 'bookings' when 'call_sheet' then 'bookings' when 'balance_reminder' then 'admin' else 'social' end;
  if not exists (select 1 from public.ai_agents a where a.org_id = new.org_id and a.team = v_team and a.status = 'active') then
    return new;
  end if;
  select s.name into v_service from public.booking_services s where s.id = new.service_id;
  insert into public.ai_tasks (org_id, team, kind, booking_id, brief)
  values (new.org_id, v_team, v_kind, new.id,
          format('%s for %s: %s, %s (SA time). %s', initcap(replace(v_kind, '_', ' ')), new.ref, v_service,
                 to_char(new.starts_at at time zone 'Africa/Johannesburg', 'Dy DD Mon HH24:MI'),
                 left(coalesce('Brief: ' || new.brief, 'No brief.'), 600)));
  return new;
end $$;
create trigger zz_queue_crew_work after insert or update of status on public.bookings
  for each row execute function tebos_private.queue_crew_work();

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
alter table public.ai_agents enable row level security;
alter table public.ai_tasks enable row level security;
revoke all on public.ai_agents from anon, authenticated;
revoke all on public.ai_tasks from anon, authenticated;

create policy read on public.ai_agents for select to authenticated using (tebos_private.is_member(org_id));
create policy admin_insert on public.ai_agents for insert to authenticated with check (tebos_private.has_role(org_id, array['org_admin']));
create policy admin_update on public.ai_agents for update to authenticated
  using (tebos_private.has_role(org_id, array['org_admin'])) with check (tebos_private.has_role(org_id, array['org_admin']));
grant select on public.ai_agents to authenticated;
grant insert (org_id, name, team, shift, provider, instructions) on public.ai_agents to authenticated;
grant update (name, shift, status, instructions) on public.ai_agents to authenticated;

-- tasks carry customers' names: the team reads them, viewers don't
create policy team_read on public.ai_tasks for select to authenticated using (tebos_private.has_role(org_id, array['org_admin', 'operator']));
create policy team_insert on public.ai_tasks for insert to authenticated with check (tebos_private.has_role(org_id, array['org_admin', 'operator']));
create policy team_update on public.ai_tasks for update to authenticated
  using (tebos_private.has_role(org_id, array['org_admin', 'operator'])) with check (tebos_private.has_role(org_id, array['org_admin', 'operator']));
grant select on public.ai_tasks to authenticated;
grant insert (org_id, team, kind, booking_id, brief) on public.ai_tasks to authenticated;
grant update (status, draft, sent_note) on public.ai_tasks to authenticated;

revoke all on function public.ai_on_duty(uuid) from public, anon;
grant execute on function public.ai_on_duty(uuid) to authenticated, service_role;
revoke all on function tebos_private.guard_ai_task(), tebos_private.queue_crew_work(), tebos_private.stamp_ai_agent(),
  tebos_private.guard_ai_agent_delete(), tebos_private.ai_shift_at(timestamptz) from public;
