-- The Board and the Objective (ADR 0003: business operating architecture).
--
-- TEBOS diagnoses a business from evidence. To make the business structurally
-- capable of its intended outcomes it also needs a model of:
--
--   * the Objective: what the business is trying to achieve, in numbers,
--     with an owner and a date. A target can't be moved once it is active,
--     and it counts as achieved only on a value TEBOS read from a connected
--     system. Nobody can type in a number and call it achieved;
--   * the Board: the pieces (tools, providers, channels, teams, roles, data)
--     and the flows the work moves through, step by step, with who performs
--     each step and whether the step is written down anywhere. Steps the
--     founder performs from memory are where the founder is the middleware.
--
-- The Board is what the business says it is (basis 'stated') until evidence
-- shows it (basis 'observed'), exactly like the rest of TEBOS.
--
-- This migration also closes a provenance gap the Objective depends on: only
-- TEBOS's server may create connected-system or system sources, record
-- system-generated evidence, or say who created evidence or a finding.

-- ---------------------------------------------------------------------------
-- Provenance
-- ---------------------------------------------------------------------------
create function tebos_private.guard_source_origin() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not tebos_private.is_client() then
    return new;
  end if;
  if new.source_type in ('connected_system', 'system')
     or tg_op = 'UPDATE' and old.source_type in ('connected_system', 'system') then
    raise exception 'only TEBOS''s server records connected-system and system sources'
      using errcode = '42501', hint = 'TEBOS_SERVER_ONLY';
  end if;
  return new;
end $$;

create trigger guard_source_origin before insert or update on public.sources
  for each row execute function tebos_private.guard_source_origin();

-- Who created a row is TEBOS's to record, not the client's to claim.
create function tebos_private.guard_created_by_actor() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not tebos_private.is_client() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.created_by_actor := tebos_private.actor_type();
    if tg_table_name = 'evidence' then
      if to_jsonb(new) ->> 'state' = 'system_generated' then
        raise exception 'only TEBOS''s server records system-generated evidence'
          using errcode = '42501', hint = 'TEBOS_SERVER_ONLY';
      end if;
    end if;
  elsif new.created_by_actor is distinct from old.created_by_actor then
    raise exception 'the creator of a % row cannot be changed', tg_table_name
      using errcode = '42501', hint = 'TEBOS_SERVER_ONLY';
  end if;
  return new;
end $$;

create trigger guard_created_by_actor before insert or update on public.evidence
  for each row execute function tebos_private.guard_created_by_actor();
create trigger guard_created_by_actor before insert or update on public.findings
  for each row execute function tebos_private.guard_created_by_actor();

-- ---------------------------------------------------------------------------
-- Objectives
-- ---------------------------------------------------------------------------
insert into public.state_transitions (machine, from_state, to_state) values
  ('objective', '(initial)', 'draft'),
  ('objective', '(initial)', 'active'),
  ('objective', 'draft', 'active'),
  ('objective', 'draft', 'cancelled'),
  ('objective', 'active', 'achieved'),
  ('objective', 'active', 'missed'),
  ('objective', 'active', 'retired');

create table public.objectives (
  id                      uuid primary key default gen_random_uuid(),
  org_id                  uuid not null,
  business_id             uuid not null,
  title                   text not null check (length(trim(title)) between 1 and 200),
  metric                  text not null check (metric in ('revenue', 'gross_margin', 'recurring_revenue_share',
                            'founder_hours', 'lead_response_time', 'client_retention', 'custom')),
  unit                    text not null check (unit in ('ZAR', 'percent', 'hours_per_week', 'hours', 'days', 'count')),
  direction               text not null check (direction in ('at_least', 'at_most')),
  target_value            numeric not null check (target_value >= 0),
  period                  text not null check (period in ('week', 'month', 'quarter', 'year', 'point_in_time')),
  due_on                  date not null,
  owner_id                uuid not null references auth.users (id),
  status                  text not null default 'draft',
  achieved_measurement_id uuid,
  status_reason           text check (status_reason is null or length(status_reason) <= 2000),
  created_by              uuid references auth.users (id),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (id, org_id),
  unique (id, business_id),
  foreign key (business_id, org_id) references public.businesses (id, org_id) on delete cascade,
  check (unit <> 'percent' or target_value <= 100),
  check ((status = 'achieved') = (achieved_measurement_id is not null)),
  check (status not in ('retired', 'cancelled') or coalesce(length(trim(status_reason)), 0) > 0)
);
create index objectives_business_idx on public.objectives (business_id, status);

-- A value toward an objective. 'measured' values are read by the database
-- from connected-system evidence (value_path points into its structured
-- value); 'stated' values are what the owner said, cite their statement and
-- never count toward achieving the objective. Measurements are never edited.
create table public.objective_measurements (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null,
  business_id    uuid not null,
  objective_id   uuid not null,
  basis          text not null check (basis in ('measured', 'stated')),
  value          numeric not null,
  value_path     text[],
  evidence_id    uuid not null,
  measured_at    timestamptz not null,
  recorded_by    uuid references auth.users (id),
  created_at     timestamptz not null default now(),
  unique (id, objective_id),
  foreign key (business_id, org_id) references public.businesses (id, org_id) on delete cascade,
  foreign key (objective_id, business_id) references public.objectives (id, business_id) on delete cascade,
  foreign key (evidence_id, business_id) references public.evidence (id, business_id),
  check ((basis = 'measured') = (value_path is not null)),
  check (value_path is null or cardinality(value_path) between 1 and 8)
);
create index objective_measurements_objective_idx on public.objective_measurements (objective_id, measured_at desc);

alter table public.objectives
  add constraint objectives_achieved_measurement_fk
  foreign key (achieved_measurement_id, id) references public.objective_measurements (id, objective_id);

create function tebos_private.guard_measurement() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_state text;
  v_source text;
  v_structured jsonb;
  v_retrieved timestamptz;
  v_created timestamptz;
  v_raw text;
  v_value numeric;
begin
  if tg_op = 'UPDATE' then
    raise exception 'measurements are never edited; record a new one'
      using errcode = 'P0001', hint = 'TEBOS_EVIDENCE_IMMUTABLE';
  end if;

  select e.state, s.source_type, e.structured_value, e.retrieved_at, e.created_at
    into v_state, v_source, v_structured, v_retrieved, v_created
    from public.evidence e join public.sources s on s.id = e.source_id
   where e.id = new.evidence_id and e.business_id = new.business_id;
  if not found or v_state in ('unavailable', 'unsupported') then
    raise exception 'a measurement must cite evidence that was obtained'
      using errcode = 'P0001', hint = 'TEBOS_MEASUREMENT_UNSUPPORTED';
  end if;

  if new.basis = 'measured' then
    if v_source not in ('connected_system', 'system')
       or v_state not in ('acquired', 'partially_acquired', 'system_generated') then
      raise exception 'a measured value must come from a connected system''s evidence'
        using errcode = 'P0001', hint = 'TEBOS_MEASUREMENT_UNSUPPORTED';
    end if;
    v_raw := v_structured #>> new.value_path;
    if v_raw is null or v_raw !~ '^-?[0-9]+(\.[0-9]+)?$' then
      raise exception 'the evidence holds no number at %', array_to_string(new.value_path, '.')
        using errcode = 'P0001', hint = 'TEBOS_MEASUREMENT_UNSUPPORTED';
    end if;
    v_value := v_raw::numeric;
    if new.value is not null and new.value <> v_value then
      raise exception 'a measured value is read from the evidence, not typed in'
        using errcode = 'P0001', hint = 'TEBOS_MEASUREMENT_UNSUPPORTED';
    end if;
    new.value := v_value;
    new.measured_at := v_retrieved;
  else
    if v_source <> 'user_statement' then
      raise exception 'a stated value must cite the owner''s own statement'
        using errcode = 'P0001', hint = 'TEBOS_MEASUREMENT_UNSUPPORTED';
    end if;
    new.measured_at := coalesce(v_retrieved, v_created);
  end if;

  if tebos_private.is_client() then
    new.recorded_by := auth.uid();
  end if;
  return new;
end $$;

create trigger guard_measurement before insert or update on public.objective_measurements
  for each row execute function tebos_private.guard_measurement();

create function tebos_private.meets_target(p_direction text, p_target numeric, p_value numeric) returns boolean
language sql immutable set search_path = '' as $$
  select case p_direction when 'at_least' then p_value >= p_target when 'at_most' then p_value <= p_target end
$$;

create function tebos_private.guard_objective() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_basis text;
  v_value numeric;
begin
  -- the owner is someone in the organisation
  if (tg_op = 'INSERT' or new.owner_id is distinct from old.owner_id)
     and not exists (select 1 from public.memberships m where m.org_id = new.org_id and m.user_id = new.owner_id) then
    raise exception 'an objective''s owner must be a member of the organisation'
      using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;

  if tg_op = 'INSERT' then
    if new.status = 'active' and new.due_on < current_date then
      raise exception 'an objective''s due date must not be in the past'
        using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
    if tebos_private.is_client() then
      new.created_by := auth.uid();
    end if;
    return new;
  end if;

  -- goalposts don't move: once active, a target is fixed. Retire it and set a new one.
  if old.status <> 'draft'
     and (new.title, new.metric, new.unit, new.direction, new.target_value, new.period, new.due_on)
         is distinct from (old.title, old.metric, old.unit, old.direction, old.target_value, old.period, old.due_on) then
    raise exception 'an active objective''s target is fixed; retire it and set a new one'
      using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;
  if new.created_by is distinct from old.created_by then
    raise exception 'the creator of an objective cannot be changed' using errcode = '42501', hint = 'TEBOS_SERVER_ONLY';
  end if;

  if new.status is distinct from old.status then
    if new.status = 'active' and new.due_on < current_date then
      raise exception 'an objective''s due date must not be in the past'
        using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
    if new.status = 'achieved' then
      select m.basis, m.value into v_basis, v_value
        from public.objective_measurements m
       where m.id = new.achieved_measurement_id and m.objective_id = new.id;
      if v_basis is distinct from 'measured'
         or not tebos_private.meets_target(new.direction, new.target_value, v_value) then
        raise exception 'an objective is achieved only on a measured value that meets its target'
          using errcode = 'P0001', hint = 'TEBOS_OBJECTIVE_UNMEASURED';
      end if;
    end if;
    if new.status = 'missed' and new.due_on >= current_date then
      raise exception 'an objective can be missed only after its due date'
        using errcode = 'P0001', hint = 'TEBOS_OBJECTIVE_NOT_DUE';
    end if;
  elsif new.achieved_measurement_id is distinct from old.achieved_measurement_id then
    raise exception 'the measurement that achieved an objective cannot be changed'
      using errcode = 'P0001', hint = 'TEBOS_OBJECTIVE_UNMEASURED';
  end if;
  return new;
end $$;

create trigger guard_status before insert or update on public.objectives
  for each row execute function tebos_private.guard_status('objective');
create trigger guard_objective before insert or update on public.objectives
  for each row execute function tebos_private.guard_objective();
create trigger touch_updated_at before update on public.objectives
  for each row execute function tebos_private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- The Board
-- ---------------------------------------------------------------------------
create table public.board_components (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null,
  business_id    uuid not null,
  name           text not null check (length(trim(name)) between 1 and 120),
  kind           text not null check (kind in ('software', 'provider', 'channel', 'team', 'role', 'data_store',
                                              'document', 'other')),
  description    text check (description is null or length(description) <= 2000),
  supplier       text check (supplier is null or length(supplier) <= 200),     -- who provides it, e.g. the web studio
  owner_role     text check (owner_role is null or length(owner_role) <= 120),
  connection_id  uuid,
  basis          text not null default 'stated' check (basis in ('stated', 'observed')),
  evidence_id    uuid,
  created_by     uuid references auth.users (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  retired_at     timestamptz,
  unique (id, business_id),
  foreign key (business_id, org_id) references public.businesses (id, org_id) on delete cascade,
  foreign key (connection_id, org_id) references public.connection_instances (id, org_id),
  foreign key (evidence_id, business_id) references public.evidence (id, business_id),
  check (basis <> 'observed' or evidence_id is not null)
);
create unique index board_components_name_idx on public.board_components (business_id, lower(name)) where retired_at is null;

create table public.board_flows (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null,
  business_id    uuid not null,
  name           text not null check (length(trim(name)) between 1 and 120),
  starts_when    text not null check (length(trim(starts_when)) between 1 and 500),  -- the trigger
  done_when      text not null check (length(trim(done_when)) between 1 and 500),    -- the outcome
  objective_id   uuid,
  owner_role     text check (owner_role is null or length(owner_role) <= 120),
  created_by     uuid references auth.users (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  retired_at     timestamptz,
  unique (id, org_id),
  unique (id, business_id),
  foreign key (business_id, org_id) references public.businesses (id, org_id) on delete cascade,
  foreign key (objective_id, business_id) references public.objectives (id, business_id)
);
create unique index board_flows_name_idx on public.board_flows (business_id, lower(name)) where retired_at is null;

create table public.board_steps (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null,
  business_id    uuid not null,
  flow_id        uuid not null,
  position       integer not null check (position between 1 and 200),
  name           text not null check (length(trim(name)) between 1 and 200),
  performer      text not null check (performer in ('founder', 'staff', 'automation', 'provider', 'client')),
  performer_role text check (performer_role is null or length(performer_role) <= 120),
  component_id   uuid,
  decision_rule  text check (decision_rule is null or length(decision_rule) <= 2000),
  documented     boolean not null default false,  -- written down somewhere other than someone's memory
  basis          text not null default 'stated' check (basis in ('stated', 'observed')),
  evidence_id    uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  retired_at     timestamptz,
  foreign key (business_id, org_id) references public.businesses (id, org_id) on delete cascade,
  foreign key (flow_id, business_id) references public.board_flows (id, business_id) on delete cascade,
  foreign key (component_id, business_id) references public.board_components (id, business_id),
  foreign key (evidence_id, business_id) references public.evidence (id, business_id),
  -- an automation runs on something
  check (performer <> 'automation' or component_id is not null),
  check (basis <> 'observed' or evidence_id is not null)
);
create unique index board_steps_position_idx on public.board_steps (flow_id, position) where retired_at is null;

-- Observed pieces cite evidence that was actually obtained.
create function tebos_private.guard_board_basis() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.basis = 'observed' and not exists (
    select 1 from public.evidence e
     where e.id = new.evidence_id and e.state not in ('unavailable', 'unsupported')
  ) then
    raise exception 'an observed piece of the board must cite evidence that was obtained'
      using errcode = 'P0001', hint = 'TEBOS_EVIDENCE_REQUIRED';
  end if;
  return new;
end $$;

create trigger guard_board_basis before insert or update on public.board_components
  for each row execute function tebos_private.guard_board_basis();
create trigger guard_board_basis before insert or update on public.board_steps
  for each row execute function tebos_private.guard_board_basis();

-- created_by is the signed-in user, never a claim.
create function tebos_private.stamp_created_by() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not tebos_private.is_client() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  elsif new.created_by is distinct from old.created_by then
    raise exception 'the creator of a % row cannot be changed', tg_table_name
      using errcode = '42501', hint = 'TEBOS_SERVER_ONLY';
  end if;
  return new;
end $$;

create trigger stamp_created_by before insert or update on public.board_components
  for each row execute function tebos_private.stamp_created_by();
create trigger stamp_created_by before insert or update on public.board_flows
  for each row execute function tebos_private.stamp_created_by();

-- ---------------------------------------------------------------------------
-- Findings attach to the flow and objective they concern
-- ---------------------------------------------------------------------------
alter table public.findings
  add column flow_id      uuid,
  add column objective_id uuid,
  add constraint findings_flow_fk foreign key (flow_id, business_id) references public.board_flows (id, business_id),
  add constraint findings_objective_fk foreign key (objective_id, business_id) references public.objectives (id, business_id);

-- ---------------------------------------------------------------------------
-- Housekeeping shared by every new table: audit, frozen tenant keys,
-- updated_at, and access (members read; operators and org admins write;
-- nothing is deleted — pieces are retired, objectives are closed).
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['objectives', 'objective_measurements', 'board_components', 'board_flows', 'board_steps'] loop
    execute format('create trigger audit after insert or update or delete on public.%I
                      for each row execute function tebos_private.audit_row()', t);
    execute format('create trigger freeze_tenant_keys before update on public.%I
                      for each row execute function tebos_private.freeze_tenant_keys()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy member_read on public.%I for select to authenticated using (tebos_private.is_member(org_id))', t);
    execute format('create policy operator_insert on public.%I for insert to authenticated
                      with check (tebos_private.has_role(org_id, array[''org_admin'', ''operator'']))', t);
    -- Supabase grants new tables to anon and authenticated by default: start from nothing
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
  foreach t in array array['objectives', 'board_components', 'board_flows', 'board_steps'] loop
    execute format('create policy operator_update on public.%I for update to authenticated
                      using (tebos_private.has_role(org_id, array[''org_admin'', ''operator'']))
                      with check (tebos_private.has_role(org_id, array[''org_admin'', ''operator'']))', t);
    execute format('grant update on public.%I to authenticated', t);
  end loop;
  foreach t in array array['board_components', 'board_flows', 'board_steps'] loop
    execute format('create trigger touch_updated_at before update on public.%I
                      for each row execute function tebos_private.touch_updated_at()', t);
  end loop;
end $$;
