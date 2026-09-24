-- TEBOS execution core: actions, approvals, runs, outcomes (dossier §16/§17/§23/§58).
--
-- Finding -> action proposal -> risk classification -> required capability
-- -> approval check -> execution -> verification -> outcome.
-- Every step is a row; every step change is a guarded, audited transition.

create table public.actions (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null,
  business_id          uuid not null,
  finding_id           uuid not null,          -- no action without a finding
  title                text not null check (length(trim(title)) > 0),
  objective            text not null,
  expected_outcome     text,
  owner_user_id        uuid references auth.users (id),
  capability_key       text references public.capabilities (key),
  priority             smallint not null default 3 check (priority between 1 and 5),   -- 1 = highest
  risk_tier            smallint not null check (risk_tier between 0 and 3),
  approval_required    boolean not null,
  execution_method     text not null default 'manual' check (execution_method in ('manual', 'internal', 'api', 'mcp',
                         'automation', 'browser', 'specialist')),
  evidence_requirement text,                     -- what must be true to call it verified
  status               text not null default 'proposed' check (status in ('proposed', 'ready', 'awaiting_approval',
                         'approved', 'queued', 'running', 'blocked', 'completed', 'verified', 'failed', 'cancelled')),
  blocked_reason       text,
  result               text,
  verification_status  text not null default 'not_verified'
                         check (verification_status in ('not_verified', 'verified', 'verification_failed')),
  idempotency_key      text,
  due_at               timestamptz,
  created_by           uuid references auth.users (id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (id, org_id),
  unique (id, business_id),
  unique (org_id, idempotency_key),
  foreign key (business_id, org_id) references public.businesses (id, org_id) on delete cascade,
  foreign key (finding_id, business_id) references public.findings (id, business_id),
  -- tier 2 (external) and tier 3 (consequential) always need approval
  check (risk_tier < 2 or approval_required),
  check (status <> 'blocked' or blocked_reason is not null),
  check (status <> 'verified' or verification_status = 'verified')
);
create index actions_business_status_idx on public.actions (business_id, status);
create index actions_finding_idx on public.actions (finding_id);

create table public.action_dependencies (
  org_id               uuid not null,
  business_id          uuid not null,
  action_id            uuid not null,
  depends_on_action_id uuid not null,
  created_at           timestamptz not null default now(),
  primary key (action_id, depends_on_action_id),
  check (action_id <> depends_on_action_id),
  foreign key (business_id, org_id) references public.businesses (id, org_id) on delete cascade,
  foreign key (action_id, business_id) references public.actions (id, business_id) on delete cascade,
  foreign key (depends_on_action_id, business_id) references public.actions (id, business_id) on delete cascade
);

create table public.approvals (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null,
  action_id           uuid not null,
  requested_operation text not null,
  risk_tier           smallint not null check (risk_tier between 0 and 3),
  data_scope          text,
  proposed_action     jsonb not null default '{}'::jsonb,   -- exact operation being approved
  requested_by        uuid references auth.users (id),
  requested_by_actor  text not null default tebos_private.actor_type(),
  status              text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired',
                        'cancelled', 'consumed', 'revoked')),
  decided_by          uuid references auth.users (id),
  decision_note       text,
  requested_at        timestamptz not null default now(),
  decided_at          timestamptz,
  expires_at          timestamptz,
  single_use          boolean not null default true,
  consumed_at         timestamptz,
  unique (id, org_id),
  foreign key (action_id, org_id) references public.actions (id, org_id) on delete cascade,
  check (status not in ('approved', 'rejected') or (decided_by is not null and decided_at is not null)),
  check (expires_at is null or expires_at > requested_at)
);
create index approvals_action_idx on public.approvals (action_id, status);

create table public.action_runs (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null,
  action_id              uuid not null,
  approval_id            uuid,
  connection_instance_id uuid,
  capability_key         text references public.capabilities (key),
  execution_method       text not null check (execution_method in ('manual', 'internal', 'api', 'mcp',
                           'automation', 'browser', 'specialist')),
  status                 text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  idempotency_key        text not null,
  request_summary        jsonb,
  response_summary       jsonb,
  error_class            text check (error_class in ('integration', 'permission', 'validation', 'dependency', 'internal')),
  error_detail           text,
  started_at             timestamptz,
  finished_at            timestamptz,
  verified               boolean not null default false,
  verified_at            timestamptz,
  verification_method    text,
  created_at             timestamptz not null default now(),
  unique (id, org_id),
  unique (org_id, idempotency_key),        -- the same execution can never run twice
  foreign key (action_id, org_id) references public.actions (id, org_id) on delete cascade,
  foreign key (approval_id, org_id) references public.approvals (id, org_id),
  foreign key (connection_instance_id, org_id) references public.connection_instances (id, org_id),
  -- only a run that succeeded can be verified, and verification says how
  check (not verified or (status = 'succeeded' and verified_at is not null and verification_method is not null)),
  check (status <> 'failed' or error_class is not null)
);
create index action_runs_action_idx on public.action_runs (action_id);

create table public.outcomes (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null,
  action_id           uuid not null,
  metric              text not null,
  unit                text,
  baseline_value      numeric,
  expected_value      numeric,
  observed_value      numeric,
  observed_at         timestamptz,
  evidence_id         uuid,
  verified_at         timestamptz,
  verification_method text,
  note                text,
  created_at          timestamptz not null default now(),
  foreign key (action_id, org_id) references public.actions (id, org_id) on delete cascade,
  foreign key (evidence_id, org_id) references public.evidence (id, org_id),
  check (verified_at is null or (observed_value is not null and verification_method is not null))
);

-- ---------------------------------------------------------------------------
-- Action guards: these are the business rules that make "never claim an
-- action happened without verification" and "human approval for
-- consequential operations" structural rather than aspirational.
-- ---------------------------------------------------------------------------

create function tebos_private.valid_approval(p_action uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select a.id from public.approvals a
  where a.action_id = p_action and a.status = 'approved'
    and (a.expires_at is null or a.expires_at > now())
  order by a.decided_at desc
  limit 1
$$;

create function tebos_private.guard_action() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_approval uuid;
  v_unmet int;
  v_finding_status text;
  v_cap_tier smallint;
begin
  -- an action is never rated below the capability it relies on
  if new.capability_key is not null then
    select default_risk_tier into v_cap_tier from public.capabilities where key = new.capability_key;
    if new.risk_tier < v_cap_tier then
      raise exception 'action risk tier % is below capability % tier %', new.risk_tier, new.capability_key, v_cap_tier
        using errcode = 'P0001', hint = 'TEBOS_CAPABILITY_TIER';
    end if;
  end if;

  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  if tg_op = 'INSERT' then
    select status into v_finding_status from public.findings where id = new.finding_id;
    if v_finding_status is distinct from 'active' then
      raise exception 'actions can only be proposed from an active finding (finding is %)', v_finding_status
        using errcode = 'P0001', hint = 'TEBOS_FINDING_NOT_ACTIVE';
    end if;
    return new;
  end if;

  if new.status = 'ready' and new.owner_user_id is null and new.capability_key is null then
    raise exception 'action % needs an owner or a capability before it is ready', new.id
      using errcode = 'P0001', hint = 'TEBOS_ACTION_UNASSIGNED';
  end if;

  if new.status = 'queued' and old.status = 'ready' and new.approval_required then
    raise exception 'action % requires approval before it can be queued', new.id
      using errcode = 'P0001', hint = 'TEBOS_APPROVAL_REQUIRED';
  end if;

  if new.status = 'approved' or (new.status in ('queued', 'running') and new.approval_required) then
    v_approval := tebos_private.valid_approval(new.id);
    if v_approval is null then
      raise exception 'action % has no valid approval', new.id
        using errcode = 'P0001', hint = 'TEBOS_APPROVAL_REQUIRED';
    end if;
  end if;

  if new.status in ('queued', 'running') then
    select count(*) into v_unmet
      from public.action_dependencies d join public.actions a on a.id = d.depends_on_action_id
      where d.action_id = new.id and a.status not in ('completed', 'verified');
    if v_unmet > 0 then
      raise exception 'action % has % unmet dependenc(ies)', new.id, v_unmet
        using errcode = 'P0001', hint = 'TEBOS_DEPENDENCY_UNMET';
    end if;
  end if;

  -- a single-use approval is spent the moment execution starts
  if new.status = 'running' and new.approval_required then
    update public.approvals set status = 'consumed', consumed_at = now()
      where id = v_approval and single_use;
  end if;

  if new.status = 'completed' and not exists (
    select 1 from public.action_runs r where r.action_id = new.id and r.status = 'succeeded'
  ) then
    raise exception 'action % cannot be completed without a succeeded run', new.id
      using errcode = 'P0001', hint = 'TEBOS_ACTION_UNPROVEN';
  end if;

  if new.status = 'verified' then
    if not exists (select 1 from public.action_runs r where r.action_id = new.id and r.verified)
       and not exists (select 1 from public.outcomes o where o.action_id = new.id and o.verified_at is not null) then
      raise exception 'action % cannot be verified without a verified run or outcome', new.id
        using errcode = 'P0001', hint = 'TEBOS_ACTION_UNVERIFIED';
    end if;
    new.verification_status := 'verified';
  end if;

  return new;
end $$;

-- Approval decisions: made by a real approver, recorded as themselves, and
-- consequential (tier 3) operations need a second person.
create function tebos_private.guard_approval() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_action record;
begin
  if tg_op = 'INSERT' then
    select risk_tier, approval_required into v_action from public.actions where id = new.action_id;
    if new.risk_tier < v_action.risk_tier then
      raise exception 'approval risk tier % is below the action''s tier %', new.risk_tier, v_action.risk_tier
        using errcode = 'P0001', hint = 'TEBOS_APPROVAL_TIER';
    end if;
    if auth.uid() is not null then
      new.requested_by := auth.uid();
    end if;
    return new;
  end if;

  if new.status is not distinct from old.status then
    if (new.decided_by, new.proposed_action, new.risk_tier, new.action_id)
       is distinct from (old.decided_by, old.proposed_action, old.risk_tier, old.action_id) then
      raise exception 'approval records cannot be rewritten'
        using errcode = 'P0001', hint = 'TEBOS_APPROVAL_IMMUTABLE';
    end if;
    return new;
  end if;

  if new.status in ('approved', 'rejected') then
    if auth.uid() is not null then
      new.decided_by := auth.uid();
    end if;
    new.decided_at := now();
    if new.decided_by is null or not exists (
      select 1 from public.memberships m
      where m.org_id = new.org_id and m.user_id = new.decided_by and m.role in ('approver', 'org_admin')
    ) then
      raise exception 'approval decisions require an approver or org admin'
        using errcode = '42501', hint = 'TEBOS_NOT_APPROVER';
    end if;
    if new.risk_tier >= 3 and new.decided_by is not distinct from new.requested_by then
      raise exception 'tier 3 operations cannot be self-approved'
        using errcode = '42501', hint = 'TEBOS_SELF_APPROVAL';
    end if;
  end if;
  return new;
end $$;

create function tebos_private.guard_action_run() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'running' then new.started_at := coalesce(new.started_at, now()); end if;
    if new.status in ('succeeded', 'failed', 'cancelled') then new.finished_at := coalesce(new.finished_at, now()); end if;
  end if;
  if new.verified and (tg_op = 'INSERT' or not old.verified) then
    new.verified_at := coalesce(new.verified_at, now());
  end if;
  return new;
end $$;

create trigger enforce_state_machine before insert or update of status on public.actions
  for each row execute function tebos_private.guard_status('action');
create trigger guard_action before insert or update on public.actions
  for each row execute function tebos_private.guard_action();
create trigger touch before update on public.actions
  for each row execute function tebos_private.touch_updated_at();

create trigger enforce_state_machine before insert or update of status on public.approvals
  for each row execute function tebos_private.guard_status('approval');
create trigger guard_approval before insert or update on public.approvals
  for each row execute function tebos_private.guard_approval();

create trigger enforce_state_machine before insert or update of status on public.action_runs
  for each row execute function tebos_private.guard_status('action_run');
create trigger guard_run before insert or update on public.action_runs
  for each row execute function tebos_private.guard_action_run();

create trigger audit after insert or update or delete on public.actions
  for each row execute function tebos_private.audit_row();
create trigger audit after insert or update or delete on public.action_dependencies
  for each row execute function tebos_private.audit_row();
create trigger audit after insert or update or delete on public.approvals
  for each row execute function tebos_private.audit_row();
create trigger audit after insert or update or delete on public.action_runs
  for each row execute function tebos_private.audit_row();
create trigger audit after insert or update or delete on public.outcomes
  for each row execute function tebos_private.audit_row();
