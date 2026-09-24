-- TEBOS foundation: tenancy, identity, state machines, audit trail.
--
-- The database is the system of record (dossier §53). Rules that protect
-- trust — tenant isolation, legal state transitions, an append-only audit
-- trail — are enforced here, not only in application code, so no client,
-- agent or future UI can bypass them.

create schema if not exists tebos_private;
revoke all on schema tebos_private from public;

-- ---------------------------------------------------------------------------
-- State machines (dossier §36). Every process-state column is guarded by
-- tebos_private.guard_status(), which only allows transitions listed here.
-- src/domain/states.ts is the application mirror; the DB test suite asserts
-- the two are identical.
-- ---------------------------------------------------------------------------

create table public.state_transitions (
  machine    text not null,
  from_state text not null,   -- '(initial)' marks a legal starting state
  to_state   text not null,
  primary key (machine, from_state, to_state)
);

insert into public.state_transitions (machine, from_state, to_state) values
  -- scans: finish honestly as completed / partial / failed
  ('scan', '(initial)', 'queued'),
  ('scan', 'queued', 'running'),
  ('scan', 'queued', 'failed'),
  ('scan', 'queued', 'cancelled'),
  ('scan', 'running', 'completed'),
  ('scan', 'running', 'partial'),
  ('scan', 'running', 'failed'),
  ('scan', 'running', 'cancelled'),
  -- scan targets: one acquisition attempt each
  ('scan_target', '(initial)', 'pending'),
  ('scan_target', 'pending', 'acquired'),
  ('scan_target', 'pending', 'partially_acquired'),
  ('scan_target', 'pending', 'unavailable'),
  ('scan_target', 'pending', 'blocked'),
  ('scan_target', 'pending', 'skipped'),
  -- findings
  ('finding', '(initial)', 'draft'),
  ('finding', '(initial)', 'active'),
  ('finding', 'draft', 'active'),
  ('finding', 'draft', 'dismissed'),
  ('finding', 'active', 'superseded'),
  ('finding', 'active', 'dismissed'),
  -- actions (dossier §16/§17)
  ('action', '(initial)', 'proposed'),
  ('action', 'proposed', 'ready'),
  ('action', 'proposed', 'blocked'),
  ('action', 'proposed', 'cancelled'),
  ('action', 'ready', 'awaiting_approval'),
  ('action', 'ready', 'queued'),
  ('action', 'ready', 'blocked'),
  ('action', 'ready', 'cancelled'),
  ('action', 'awaiting_approval', 'approved'),
  ('action', 'awaiting_approval', 'ready'),
  ('action', 'awaiting_approval', 'cancelled'),
  ('action', 'approved', 'queued'),
  ('action', 'approved', 'cancelled'),
  ('action', 'queued', 'running'),
  ('action', 'queued', 'blocked'),
  ('action', 'queued', 'cancelled'),
  ('action', 'running', 'completed'),
  ('action', 'running', 'failed'),
  ('action', 'running', 'blocked'),
  ('action', 'blocked', 'ready'),
  ('action', 'blocked', 'cancelled'),
  ('action', 'completed', 'verified'),
  ('action', 'completed', 'failed'),
  ('action', 'failed', 'ready'),
  ('action', 'failed', 'cancelled'),
  -- action runs (one execution attempt)
  ('action_run', '(initial)', 'queued'),
  ('action_run', 'queued', 'running'),
  ('action_run', 'queued', 'cancelled'),
  ('action_run', 'running', 'succeeded'),
  ('action_run', 'running', 'failed'),
  ('action_run', 'running', 'cancelled'),
  -- approvals (dossier §23)
  ('approval', '(initial)', 'pending'),
  ('approval', 'pending', 'approved'),
  ('approval', 'pending', 'rejected'),
  ('approval', 'pending', 'expired'),
  ('approval', 'pending', 'cancelled'),
  ('approval', 'approved', 'consumed'),
  ('approval', 'approved', 'expired'),
  ('approval', 'approved', 'revoked'),
  -- connection instances (dossier §19/§36). "available" is a property of a
  -- connector in the registry; an instance starts at "configured".
  ('connection', '(initial)', 'configured'),
  ('connection', 'configured', 'connected'),
  ('connection', 'configured', 'authentication_required'),
  ('connection', 'configured', 'unavailable'),
  ('connection', 'configured', 'disabled'),
  ('connection', 'authentication_required', 'configured'),
  ('connection', 'authentication_required', 'disabled'),
  ('connection', 'connected', 'degraded'),
  ('connection', 'connected', 'expired'),
  ('connection', 'connected', 'authentication_required'),
  ('connection', 'connected', 'unavailable'),
  ('connection', 'connected', 'disabled'),
  ('connection', 'degraded', 'connected'),
  ('connection', 'degraded', 'expired'),
  ('connection', 'degraded', 'authentication_required'),
  ('connection', 'degraded', 'unavailable'),
  ('connection', 'degraded', 'disabled'),
  ('connection', 'expired', 'authentication_required'),
  ('connection', 'expired', 'disabled'),
  ('connection', 'unavailable', 'configured'),
  ('connection', 'unavailable', 'disabled'),
  ('connection', 'disabled', 'configured'),
  -- agent runs / tool calls
  ('agent_run', '(initial)', 'running'),
  ('agent_run', 'running', 'succeeded'),
  ('agent_run', 'running', 'failed'),
  ('agent_run', 'running', 'cancelled');

-- Generic guard. Attach with: execute function tebos_private.guard_status('<machine>')
create function tebos_private.guard_status() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_machine text := tg_argv[0];
  from_s  text;
begin
  if tg_op = 'INSERT' then
    from_s := '(initial)';
  elsif new.status is distinct from old.status then
    from_s := old.status;
  else
    return new;
  end if;

  if not exists (
    select 1 from public.state_transitions t
    where t.machine = v_machine and t.from_state = from_s and t.to_state = new.status
  ) then
    raise exception 'illegal % transition: % -> %', v_machine, from_s, new.status
      using errcode = 'P0001', hint = 'TEBOS_ILLEGAL_TRANSITION';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Actor context. For user sessions the actor is always auth.uid() and cannot
-- be overridden. Trusted server code running without a user session (workers,
-- agents via the service role) identifies itself with
--   set local tebos.actor_type = 'agent'; set local tebos.actor_id = '<run id>';
-- ---------------------------------------------------------------------------

create function tebos_private.actor_type() returns text
language sql stable as $$
  select case
    when auth.uid() is not null then 'user'
    else coalesce(nullif(current_setting('tebos.actor_type', true), ''), 'system')
  end
$$;

create function tebos_private.actor_id() returns text
language sql stable as $$
  select coalesce(auth.uid()::text, nullif(current_setting('tebos.actor_id', true), ''))
$$;

-- ---------------------------------------------------------------------------
-- Identity & tenancy (dossier §33/§34)
-- ---------------------------------------------------------------------------

create table public.organisations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) > 0),
  slug       text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  created_at timestamptz not null default now()
);

create table public.platform_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.memberships (
  org_id     uuid not null references public.organisations (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null check (role in ('org_admin', 'operator', 'approver', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index memberships_user_idx on public.memberships (user_id);

create function tebos_private.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid())
$$;

create function tebos_private.is_member(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships where org_id = p_org and user_id = auth.uid())
$$;

create function tebos_private.has_role(p_org uuid, p_roles text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships
    where org_id = p_org and user_id = auth.uid() and role = any (p_roles)
  )
$$;

-- Organisations are created through this function so the creator always
-- becomes the first org_admin (no orphaned tenants, no self-granted access
-- to someone else's tenant).
create function public.create_organisation(p_name text, p_slug text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  insert into public.organisations (name, slug) values (p_name, p_slug) returning id into new_id;
  insert into public.memberships (org_id, user_id, role) values (new_id, auth.uid(), 'org_admin');
  return new_id;
end $$;

-- ---------------------------------------------------------------------------
-- Audit trail (dossier §22/§47). Append-only and hash-chained per tenant so
-- tampering is detectable. Rows are written by tebos_private.audit(), never
-- directly by clients.
-- ---------------------------------------------------------------------------

create table public.audit_events (
  id          bigint generated always as identity primary key,
  org_id      uuid references public.organisations (id) on delete restrict,
  occurred_at timestamptz not null default clock_timestamp(),
  actor_type  text not null check (actor_type in ('user', 'agent', 'system', 'connector')),
  actor_id    text,
  action      text not null,          -- e.g. 'actions.transition', 'evidence.insert'
  entity_type text not null,
  entity_id   uuid,
  before      jsonb,
  after       jsonb,
  request_id  text,
  prev_hash   text,
  hash        text not null
);
create index audit_events_org_time_idx on public.audit_events (org_id, occurred_at desc);
create index audit_events_entity_idx on public.audit_events (entity_type, entity_id);

create function tebos_private.audit_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'audit_events is append-only' using errcode = '42501';
end $$;

create trigger audit_events_no_update before update or delete on public.audit_events
  for each row execute function tebos_private.audit_append_only();
create trigger audit_events_no_truncate before truncate on public.audit_events
  for each statement execute function tebos_private.audit_append_only();

create function tebos_private.write_audit(
  p_org uuid, p_action text, p_entity_type text, p_entity_id uuid, p_before jsonb, p_after jsonb
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_prev text;
  v_time timestamptz := clock_timestamp();
  v_actor_type text := tebos_private.actor_type();
  v_actor_id text := tebos_private.actor_id();
  v_request text := nullif(current_setting('tebos.request_id', true), '');
begin
  -- serialise appends per tenant so the chain is linear
  perform pg_advisory_xact_lock(hashtextextended(coalesce(p_org::text, 'platform'), 0));
  select hash into v_prev from public.audit_events
    where org_id is not distinct from p_org order by id desc limit 1;

  insert into public.audit_events
    (org_id, occurred_at, actor_type, actor_id, action, entity_type, entity_id, before, after, request_id, prev_hash, hash)
  values
    (p_org, v_time, v_actor_type, v_actor_id, p_action, p_entity_type, p_entity_id, p_before, p_after, v_request, v_prev,
     encode(sha256(convert_to(concat_ws('|', v_prev, v_time::text, v_actor_type, v_actor_id, p_action,
       p_entity_type, p_entity_id::text, p_before::text, p_after::text), 'UTF8')), 'hex'));
end $$;

-- Row-level audit trigger for every table holding business or governance
-- state. Status changes are recorded as '<table>.transition'.
create function tebos_private.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_verb text := lower(tg_op);
begin
  if tg_op = 'UPDATE' and v_row ? 'status' and (v_row ->> 'status') is distinct from (v_old ->> 'status') then
    v_verb := 'transition';
  end if;
  perform tebos_private.write_audit(
    case when tg_table_name = 'organisations' then (v_row ->> 'id')::uuid else (v_row ->> 'org_id')::uuid end,
    tg_table_name || '.' || v_verb,
    tg_table_name,
    case when v_row ? 'id' then (v_row ->> 'id')::uuid else null end,
    v_old,
    case when tg_op = 'DELETE' then null else v_row end
  );
  return null;
end $$;

create trigger audit after insert or update or delete on public.organisations
  for each row execute function tebos_private.audit_row();
create trigger audit after insert or update or delete on public.memberships
  for each row execute function tebos_private.audit_row();

-- Shared helper for updated_at columns.
create function tebos_private.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
