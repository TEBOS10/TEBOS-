-- REEDS, the request ledger (master build directive, phase 2; docs/audit/2026-10-14-platform-audit.md).
--
-- A person asks for something; TEBOS plans it into tasks, runs each task,
-- verifies each result independently, and reports back. The ledger makes the
-- difference between "asked", "planned", "running" and "done" a database fact:
--
--   * A request comes from a signed-in person who is an admin or operator of the
--     organisation it is for. Nothing else can create one: the server, an
--     agent or a task can't, so delegation can never loop.
--   * Only the server plans and runs. A task is added only while the request is
--     being planned, never more than the request's own limit, and for the same
--     organisation.
--   * A task is retried at most max_attempts times.
--   * A task is "verified" only with its result and a passing verification
--     recorded. A request is "completed" only when it has at least one task,
--     every task is verified, and its report is written. Issuing work is never
--     the same as finishing it.
--   * Members see their organisation's requests and tasks; nobody sees another
--     organisation's.

insert into public.state_transitions (machine, from_state, to_state) values
  ('work_request', '(initial)', 'received'),
  ('work_request', 'received', 'planned'),
  ('work_request', 'received', 'failed'),
  ('work_request', 'received', 'cancelled'),
  ('work_request', 'planned', 'running'),
  ('work_request', 'planned', 'cancelled'),
  ('work_request', 'running', 'verifying'),
  ('work_request', 'running', 'failed'),
  ('work_request', 'running', 'cancelled'),
  ('work_request', 'verifying', 'completed'),
  ('work_request', 'verifying', 'failed'),
  ('work_task', '(initial)', 'queued'),
  ('work_task', 'queued', 'running'),
  ('work_task', 'queued', 'cancelled'),
  ('work_task', 'running', 'queued'),
  ('work_task', 'running', 'done'),
  ('work_task', 'running', 'failed'),
  ('work_task', 'done', 'verified'),
  ('work_task', 'done', 'rejected');

create table public.work_requests (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organisations (id) on delete cascade,
  kind           text not null check (kind in ('attention_today')),
  note           text check (note is null or length(note) <= 2000),
  status         text not null,
  requested_by   uuid not null references auth.users (id),
  max_tasks      smallint not null default 12 check (max_tasks between 1 and 25),
  report         jsonb check (report is null or jsonb_typeof(report) = 'object'),
  failure_detail text check (failure_detail is null or length(failure_detail) <= 2000),
  planned_at     timestamptz,
  finished_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (id, org_id),
  check (status <> 'failed' or failure_detail is not null),
  check (status <> 'completed' or report is not null),
  check ((status in ('completed', 'failed', 'cancelled')) = (finished_at is not null))
);
create index work_requests_org_idx on public.work_requests (org_id, created_at desc);
create index work_requests_open_idx on public.work_requests (created_at) where status in ('received', 'planned', 'running', 'verifying');

create table public.work_tasks (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null,
  org_id       uuid not null,
  position     smallint not null check (position between 1 and 25),
  key          text not null check (key ~ '^[a-z][a-z0-9_.]{1,60}$'),
  title        text not null check (length(trim(title)) between 1 and 200),
  executor     text not null check (executor ~ '^[a-z][a-z0-9_.]{1,60}$'),
  acceptance   text not null check (length(trim(acceptance)) between 10 and 1000),
  input        jsonb not null default '{}'::jsonb check (jsonb_typeof(input) = 'object'),
  status       text not null,
  attempts     smallint not null default 0,
  max_attempts smallint not null default 3 check (max_attempts between 1 and 5),
  result       jsonb,
  verification jsonb check (verification is null or jsonb_typeof(verification -> 'ok') = 'boolean'),
  error        text check (error is null or length(error) <= 2000),
  started_at   timestamptz,
  finished_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (request_id, key),
  foreign key (request_id, org_id) references public.work_requests (id, org_id) on delete cascade,
  check (attempts between 0 and max_attempts),
  check (status not in ('done', 'verified', 'rejected') or result is not null),
  check (status not in ('verified', 'rejected') or verification is not null),
  check (status <> 'verified' or (verification ->> 'ok') = 'true'),
  check (status <> 'rejected' or (verification ->> 'ok') = 'false'),
  check (status <> 'failed' or error is not null)
);
create index work_tasks_request_idx on public.work_tasks (request_id, position);
create index work_tasks_open_idx on public.work_tasks (created_at) where status in ('queued', 'running', 'done');

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------
create function tebos_private.guard_work_request() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_tasks integer;
  v_unverified integer;
begin
  if tg_op = 'INSERT' then
    -- only a signed-in admin or operator of the organisation asks for work
    if not tebos_private.is_client() or auth.uid() is null
       or not tebos_private.has_role(new.org_id, array['org_admin', 'operator']) then
      raise exception 'a request comes from an admin or operator of its organisation'
        using errcode = '42501', hint = 'TEBOS_PERMISSION_DENIED';
    end if;
    new.requested_by := auth.uid();
    new.report := null;
    new.failure_detail := null;
    new.planned_at := null;
    new.finished_at := null;
    return new;
  end if;

  if (new.org_id, new.kind, new.note, new.requested_by, new.max_tasks, new.created_at)
     is distinct from (old.org_id, old.kind, old.note, old.requested_by, old.max_tasks, old.created_at) then
    raise exception 'what was asked, by whom and for which organisation is fixed'
      using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;

  if tebos_private.is_client() then
    -- a person can only cancel; planning, running and reporting are the server's
    if new.status is distinct from old.status and new.status <> 'cancelled'
       or (new.report, new.failure_detail) is distinct from (old.report, old.failure_detail) then
      raise exception 'only TEBOS plans, runs and reports a request; you can cancel it'
        using errcode = '42501', hint = 'TEBOS_SERVER_ONLY';
    end if;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'planned' then
      new.planned_at := now();
      if not exists (select 1 from public.work_tasks where request_id = new.id) then
        raise exception 'a request is planned only once it has tasks' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
      end if;
    end if;
    if new.status = 'completed' then
      select count(*), count(*) filter (where status <> 'verified') into v_tasks, v_unverified
        from public.work_tasks where request_id = new.id;
      if v_tasks = 0 or v_unverified > 0 then
        raise exception 'a request is complete only when every task is verified (% of % are not)', v_unverified, v_tasks
          using errcode = 'P0001', hint = 'TEBOS_WORK_UNVERIFIED';
      end if;
    end if;
    if new.status in ('completed', 'failed', 'cancelled') then
      new.finished_at := now();
    end if;
  end if;
  return new;
end $$;

create function tebos_private.guard_work_task() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_request public.work_requests;
  v_count integer;
begin
  if tebos_private.is_client() then
    raise exception 'tasks are planned and run by TEBOS' using errcode = '42501', hint = 'TEBOS_SERVER_ONLY';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if tg_op = 'INSERT' then
    select * into v_request from public.work_requests where id = new.request_id for update;
    if v_request.status <> 'received' then
      raise exception 'tasks are added only while a request is being planned'
        using errcode = 'P0001', hint = 'TEBOS_ILLEGAL_TRANSITION';
    end if;
    select count(*) into v_count from public.work_tasks where request_id = new.request_id;
    if v_count >= v_request.max_tasks then
      raise exception 'a request has at most % tasks', v_request.max_tasks using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
    new.attempts := 0;
    new.result := null;
    new.verification := null;
    new.error := null;
    return new;
  end if;
  if (new.request_id, new.org_id, new.position, new.key, new.title, new.executor, new.acceptance, new.input, new.max_attempts, new.created_at)
     is distinct from
     (old.request_id, old.org_id, old.position, old.key, old.title, old.executor, old.acceptance, old.input, old.max_attempts, old.created_at) then
    raise exception 'a task''s definition and acceptance test are fixed once planned'
      using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;
  if new.status = 'running' and old.status is distinct from 'running' then
    new.attempts := old.attempts + 1;
    new.started_at := now();
    if new.attempts > new.max_attempts then
      raise exception 'this task has used its % attempts', new.max_attempts using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
  end if;
  if new.status in ('done', 'failed') and old.status = 'running' then
    new.finished_at := now();
  end if;
  return new;
end $$;

create trigger enforce_state_machine before insert or update of status on public.work_requests
  for each row execute function tebos_private.guard_status('work_request');
create trigger guard_work_request before insert or update on public.work_requests
  for each row execute function tebos_private.guard_work_request();
create trigger touch before update on public.work_requests
  for each row execute function tebos_private.touch_updated_at();
create trigger freeze_tenant_keys before update on public.work_requests
  for each row execute function tebos_private.freeze_tenant_keys();
create trigger audit after insert or update or delete on public.work_requests
  for each row execute function tebos_private.audit_row();

create trigger enforce_state_machine before insert or update of status on public.work_tasks
  for each row execute function tebos_private.guard_status('work_task');
create trigger guard_work_task before insert or update or delete on public.work_tasks
  for each row execute function tebos_private.guard_work_task();
create trigger touch before update on public.work_tasks
  for each row execute function tebos_private.touch_updated_at();
create trigger freeze_tenant_keys before update on public.work_tasks
  for each row execute function tebos_private.freeze_tenant_keys();
create trigger audit after insert or update or delete on public.work_tasks
  for each row execute function tebos_private.audit_row();

-- ---------------------------------------------------------------------------
-- Access: members read their own organisation's work; admins and operators ask
-- for it and may cancel it; everything else is the server's.
-- ---------------------------------------------------------------------------
alter table public.work_requests enable row level security;
alter table public.work_tasks enable row level security;
revoke all on public.work_requests, public.work_tasks from anon, authenticated;

create policy member_read on public.work_requests for select to authenticated
  using (tebos_private.is_member(org_id));
create policy operator_ask on public.work_requests for insert to authenticated
  with check (tebos_private.has_role(org_id, array['org_admin', 'operator']));
create policy operator_cancel on public.work_requests for update to authenticated
  using (tebos_private.has_role(org_id, array['org_admin', 'operator']))
  with check (tebos_private.has_role(org_id, array['org_admin', 'operator']));
create policy member_read on public.work_tasks for select to authenticated
  using (tebos_private.is_member(org_id));

grant select on public.work_requests, public.work_tasks to authenticated;
grant insert (org_id, kind, note, status) on public.work_requests to authenticated;
grant update (status) on public.work_requests to authenticated;
grant all on public.work_requests, public.work_tasks to service_role;
